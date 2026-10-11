const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const Trip = require('../models/Trip');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();
const CURRENCY_PATTERN = /^\d+(?:\.\d{1,2})?$/;

function toCents(value) {
  const text = String(value ?? '').trim();
  if (!CURRENCY_PATTERN.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

function serializeExpense(expense) {
  return {
    id: expense._id.toString(),
    paidByMemberId: expense.paidByMemberId.toString(),
    paidByName: expense.paidByName || '',
    amount: (expense.amountCents / 100).toFixed(2),
    description: expense.description,
    location: expense.location || '',
  };
}

function calculateSettlementSuggestions(trip) {
  const members = [...(trip.formerMembers || []), ...(trip.members || [])];
  if (!members.length) return [];

  const paidByMember = new Map(members.map((member) => [member._id.toString(), 0]));
  let totalCents = 0;
  for (const expense of trip.expenses || []) {
    const amountCents = Number(expense.amountCents) || 0;
    totalCents += amountCents;
    const memberId = expense.paidByMemberId.toString();
    if (paidByMember.has(memberId)) paidByMember.set(memberId, paidByMember.get(memberId) + amountCents);
  }

  const count = members.length;
  const balances = members.map((member, index) => {
    const paidCents = paidByMember.get(member._id.toString()) || 0;
    const numerator = paidCents * count - totalCents;
    const balanceCents = Math.floor(numerator / count);
    return { member, index, balanceCents, remainder: numerator - balanceCents * count };
  });
  const floorTotal = balances.reduce((sum, item) => sum + item.balanceCents, 0);
  const byRemainder = [...balances].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; i < -floorTotal; i += 1) byRemainder[i].balanceCents += 1;

  const snapshot = JSON.stringify({
    members: members.map((member) => member._id.toString()),
    expenses: (trip.expenses || []).map((expense) => [expense._id.toString(), expense.paidByMemberId.toString(), expense.amountCents]),
  });
  const snapshotKey = crypto.createHash('sha256').update(snapshot).digest('hex');
  const settledByKey = new Map((trip.settlementRecords || []).map((record) => [record.paymentKey, record]));
  const debtors = balances.filter((item) => item.balanceCents < 0).map((item) => ({ member: item.member, remaining: -item.balanceCents }));
  const creditors = balances.filter((item) => item.balanceCents > 0).map((item) => ({ member: item.member, remaining: item.balanceCents }));
  const suggestions = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amountCents = Math.min(debtor.remaining, creditor.remaining);
    if (amountCents > 0) {
      const fromMemberId = debtor.member._id.toString();
      const toMemberId = creditor.member._id.toString();
      const paymentKey = crypto.createHash('sha256').update(`${snapshotKey}:${fromMemberId}:${toMemberId}:${amountCents}`).digest('hex');
      const record = settledByKey.get(paymentKey);
      suggestions.push({
        paymentKey,
        fromMemberId,
        toMemberId,
        from: debtor.member.name,
        to: creditor.member.name,
        amountCents,
        status: record ? 'settled' : 'pending',
        settledAt: record?.settledAt || null,
      });
      debtor.remaining -= amountCents;
      creditor.remaining -= amountCents;
    }
    if (debtor.remaining === 0) debtorIndex += 1;
    if (creditor.remaining === 0) creditorIndex += 1;
  }
  return suggestions;
}

function serializeTrip(trip, viewerId) {
  const isGroup = Boolean(trip.groupCode);
  const participants = [...(trip.formerMembers || []), ...trip.members];
  const viewerMember = trip.members.find((member) => member.userId && member.userId.toString() === String(viewerId));
  const adminMember = trip.members.find((member) => member.role === 'admin')
    || trip.members.find((member) => member.userId && member.userId.toString() === trip.owner.toString());
  return {
    id: trip._id.toString(),
    name: trip.name,
    members: trip.members.map((member) => ({ id: member._id.toString(), name: member.name, ...(isGroup ? { role: member.role || 'member' } : {}) })),
    settlementMembers: participants.map((member) => ({ id: member._id.toString(), name: member.name, active: !trip.formerMembers?.some((former) => former._id.toString() === member._id.toString()), ...(isGroup ? { role: member.role || 'member' } : {}) })),
    expenses: trip.expenses.map((expense) => ({ ...serializeExpense(expense), paidByName: expense.paidByName || participants.find((member) => member._id.toString() === expense.paidByMemberId.toString())?.name || '' })),
    isGroup,
    ...(isGroup ? { adminName: adminMember?.name || 'Unknown' } : {}),
    isAdmin: isGroup ? viewerMember?.role === 'admin' : trip.owner.toString() === String(viewerId),
    status: trip.status || 'active',
    completedAt: trip.completedAt || null,
    settlementSuggestions: calculateSettlementSuggestions(trip),
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  };
}

function validObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

async function findOwnedTrip(tripId, userId) {
  if (!validObjectId(tripId)) return null;
  return Trip.findOne({ _id: tripId, $or: [{ owner: userId }, { 'members.userId': userId }] });
}

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const trips = await Trip.find({ $or: [{ owner: req.user._id }, { 'members.userId': req.user._id }] }).sort({ updatedAt: -1 });
    res.json({ trips: trips.map((trip) => serializeTrip(trip, req.user._id)) });
  } catch (error) {
    console.error('Could not list trips:', error.message);
    res.status(500).json({ message: 'Could not load your trips.' });
  }
});

router.post('/', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const rawMembers = Array.isArray(req.body?.members) ? req.body.members : [];
  const members = [];
  const seen = new Set();
  for (const item of rawMembers) {
    const memberName = typeof item === 'string' ? item.trim() : '';
    const key = memberName.toLocaleLowerCase();
    if (memberName && !seen.has(key)) {
      seen.add(key);
      members.push({ name: memberName });
    }
  }
  if (!name || name.length > 100) return res.status(400).json({ message: 'Enter a trip name up to 100 characters.' });
  if (!members.length || members.length > 100 || members.some((member) => member.name.length > 80)) {
    return res.status(400).json({ message: 'Add between 1 and 100 valid member names.' });
  }
  try {
    const trip = await Trip.create({ owner: req.user._id, name, members, expenses: [] });
    res.status(201).json({ trip: serializeTrip(trip, req.user._id) });
  } catch (error) {
    console.error('Could not create trip:', error.message);
    res.status(500).json({ message: 'Could not create this trip.' });
  }
});

router.get('/:tripId', async (req, res) => {
  try {
    const trip = await findOwnedTrip(req.params.tripId, req.user._id);
    if (!trip) return res.status(404).json({ message: 'Trip not found.' });
    res.json({ trip: serializeTrip(trip, req.user._id) });
  } catch (error) {
    console.error('Could not load trip:', error.message);
    res.status(500).json({ message: 'Could not load this trip.' });
  }
});

router.post('/:tripId/settlements/:paymentKey/settle', async (req, res) => {
  const { tripId, paymentKey } = req.params;
  if (!validObjectId(tripId) || !/^[a-f0-9]{64}$/.test(paymentKey)) return res.status(400).json({ message: 'That settlement is invalid.' });
  try {
    const trip = await findOwnedTrip(tripId, req.user._id);
    if (!trip) return res.status(404).json({ message: 'Trip not found.' });

    const suggestion = calculateSettlementSuggestions(trip).find((item) => item.paymentKey === paymentKey);
    if (!suggestion) return res.status(409).json({ message: 'This payment suggestion has changed. Refresh the trip and try again.' });
    const existing = trip.settlementRecords.find((record) => record.paymentKey === paymentKey);
    if (existing) return res.json({ message: 'This payment is already settled.', trip: serializeTrip(trip, req.user._id) });

    const settledAt = new Date();
    const updatedTrip = await Trip.findOneAndUpdate(
      {
        _id: trip._id,
        $or: [{ owner: req.user._id }, { 'members.userId': req.user._id }],
        updatedAt: trip.updatedAt,
        'settlementRecords.paymentKey': { $ne: paymentKey },
      },
      {
        $push: {
          settlementRecords: {
            paymentKey,
            fromMemberId: suggestion.fromMemberId,
            toMemberId: suggestion.toMemberId,
            fromName: suggestion.from,
            toName: suggestion.to,
            amountCents: suggestion.amountCents,
            status: 'settled',
            settledAt,
          },
        },
      },
      { new: true, runValidators: true },
    );
    if (updatedTrip) return res.json({ message: 'Payment marked as settled.', trip: serializeTrip(updatedTrip, req.user._id) });

    const latestTrip = await findOwnedTrip(tripId, req.user._id);
    if (!latestTrip) return res.status(404).json({ message: 'Trip not found.' });
    if (latestTrip.settlementRecords.some((record) => record.paymentKey === paymentKey)) {
      return res.json({ message: 'This payment is already settled.', trip: serializeTrip(latestTrip, req.user._id) });
    }
    return res.status(409).json({ message: 'Trip expenses changed. Refresh the trip before settling this payment.' });
  } catch (error) {
    console.error('Could not mark settlement as paid:', error.message);
    return res.status(500).json({ message: 'Could not update this settlement. Please try again.' });
  }
});

router.patch('/:tripId/end', async (req, res) => {
  if (!validObjectId(req.params.tripId)) return res.status(404).json({ message: 'Trip not found.' });
  try {
    const completedAt = new Date();
    const trip = await Trip.findOneAndUpdate(
      {
        _id: req.params.tripId,
        owner: req.user._id,
        $or: [{ status: 'active' }, { status: { $exists: false } }],
      },
      { $set: { status: 'completed', completedAt } },
      { new: true, runValidators: true },
    );
    if (trip) return res.json({ trip: serializeTrip(trip, req.user._id) });

    const existingTrip = await findOwnedTrip(req.params.tripId, req.user._id);
    if (!existingTrip) return res.status(404).json({ message: 'Trip not found.' });
    if (existingTrip.status === 'completed') return res.status(409).json({ message: 'This trip has already been completed.' });
    return res.status(403).json({ message: 'Only the group admin can end this trip.' });
  } catch (error) {
    console.error('Could not end trip:', error.message);
    return res.status(500).json({ message: 'Could not end this trip. Please try again.' });
  }
});

router.post('/:tripId/expenses', async (req, res) => {
  const paidByMemberId = req.body?.paidByMemberId;
  const amountCents = toCents(req.body?.amount);
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  const location = typeof req.body?.location === 'string' ? req.body.location.trim() : '';
  if (!validObjectId(paidByMemberId)) return res.status(400).json({ message: 'Choose a trip member who paid.' });
  if (amountCents === null || amountCents < 1) return res.status(400).json({ message: 'Enter an amount greater than zero, up to two decimal places.' });
  if (!description || description.length > 160 || location.length > 120) return res.status(400).json({ message: 'Enter a description and a location up to 120 characters.' });
  try {
    const trip = await findOwnedTrip(req.params.tripId, req.user._id);
    if (!trip) return res.status(404).json({ message: 'Trip not found.' });
    if (trip.status === 'completed') return res.status(409).json({ message: 'This trip is completed. New expenses cannot be added.' });
    const member = trip.members.id(paidByMemberId);
    if (!member) return res.status(400).json({ message: 'That member does not belong to this trip.' });
    const updatedTrip = await Trip.findOneAndUpdate(
      {
        _id: trip._id,
        $or: [{ owner: req.user._id }, { 'members.userId': req.user._id }],
        $or: [{ status: 'active' }, { status: { $exists: false } }],
      },
      { $push: { expenses: { paidByMemberId: member._id, amountCents, description, location } } },
      { new: true, runValidators: true },
    );
    if (!updatedTrip) return res.status(409).json({ message: 'This trip is completed. New expenses cannot be added.' });
    res.status(201).json({ trip: serializeTrip(updatedTrip, req.user._id) });
  } catch (error) {
    console.error('Could not add expense:', error.message);
    res.status(500).json({ message: 'Could not add this expense.' });
  }
});

router.patch('/:tripId/expenses/:expenseId', async (req, res) => {
  const paidByMemberId = req.body?.paidByMemberId;
  const amountCents = toCents(req.body?.amount);
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  const location = typeof req.body?.location === 'string' ? req.body.location.trim() : '';
  if (!validObjectId(paidByMemberId)) return res.status(400).json({ message: 'Choose a trip member who paid.' });
  if (amountCents === null || amountCents < 1) return res.status(400).json({ message: 'Enter an amount greater than zero, up to two decimal places.' });
  if (!description || description.length > 160 || location.length > 120) return res.status(400).json({ message: 'Enter a description and a location up to 120 characters.' });
  try {
    const trip = await findOwnedTrip(req.params.tripId, req.user._id);
    if (!trip) return res.status(404).json({ message: 'Trip not found.' });
    const member = trip.members.id(paidByMemberId);
    const expense = trip.expenses.id(req.params.expenseId);
    if (!member || !expense) return res.status(404).json({ message: 'Expense or trip member not found.' });
    expense.paidByMemberId = member._id;
    expense.amountCents = amountCents;
    expense.description = description;
    expense.location = location;
    await trip.save();
    res.json({ trip: serializeTrip(trip, req.user._id) });
  } catch (error) {
    console.error('Could not update expense:', error.message);
    res.status(500).json({ message: 'Could not update this expense.' });
  }
});

router.delete('/:tripId/expenses/:expenseId', async (req, res) => {
  try {
    const trip = await findOwnedTrip(req.params.tripId, req.user._id);
    if (!trip) return res.status(404).json({ message: 'Trip not found.' });
    const expense = trip.expenses.id(req.params.expenseId);
    if (!expense) return res.status(404).json({ message: 'Expense not found.' });
    expense.deleteOne();
    await trip.save();
    res.json({ trip: serializeTrip(trip, req.user._id) });
  } catch (error) {
    console.error('Could not delete expense:', error.message);
    res.status(500).json({ message: 'Could not delete this expense.' });
  }
});

module.exports = router;
module.exports.serializeTrip = serializeTrip;
