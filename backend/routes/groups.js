const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const Trip = require('../models/Trip');
const ChatMessage = require('../models/ChatMessage');
const { requireAuth } = require('../middleware/requireAuth');
const { serializeTrip } = require('./trips');

const router = express.Router();
const CODE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let socketActions = null;

function setSocketActions(actions) {
  socketActions = actions;
}

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function createGroupCode() {
  return Array.from({ length: 6 }, () => CODE_CHARACTERS[crypto.randomInt(CODE_CHARACTERS.length)]).join('');
}

async function findMemberGroup(groupId, userId) {
  if (!isObjectId(groupId)) return null;
  return Trip.findOne({ _id: groupId, groupCode: { $exists: true }, 'members.userId': userId });
}

function serializeMessage(message) {
  return {
    id: message._id.toString(),
    groupId: message.groupId.toString(),
    senderId: message.senderId.toString(),
    senderName: message.senderName,
    text: message.text,
    createdAt: message.createdAt,
  };
}

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const groups = await Trip.find({ groupCode: { $exists: true }, 'members.userId': req.user._id }).sort({ updatedAt: -1 });
    res.json({ groups: groups.map((group) => serializeTrip(group, req.user._id)) });
  } catch (error) {
    console.error('Could not list groups:', error.message);
    res.status(500).json({ message: 'Could not load your groups.' });
  }
});

router.post('/', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name || name.length > 100) return res.status(400).json({ message: 'Enter a group name up to 100 characters.' });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const group = await Trip.create({
        owner: req.user._id,
        name,
        groupCode: createGroupCode(),
        members: [{ name: req.user.fullName, userId: req.user._id, role: 'admin' }],
        expenses: [],
      });
      return res.status(201).json({ group: serializeTrip(group, req.user._id), groupCode: group.groupCode });
    } catch (error) {
      if (error?.code === 11000 && attempt < 4) continue;
      console.error('Could not create group:', error.message);
      return res.status(500).json({ message: 'Could not create this group.' });
    }
  }
  return res.status(503).json({ message: 'Could not generate a unique group code. Please try again.' });
});

router.post('/join', async (req, res) => {
  const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{6}$/.test(code)) return res.status(400).json({ message: 'Enter a valid 6-character group code.' });
  try {
    const group = await Trip.findOne({ groupCode: code });
    if (!group) return res.status(404).json({ message: 'No group was found with that code.' });
    if (group.status === 'completed') return res.status(409).json({ message: 'This group is completed and is no longer accepting members.' });
    if (group.members.some((member) => member.userId && member.userId.toString() === req.user._id.toString())) {
      return res.status(409).json({ message: 'You are already a member of this group.' });
    }
    const updated = await Trip.findOneAndUpdate(
      { _id: group._id, groupCode: code, 'members.userId': { $ne: req.user._id } },
      { $push: { members: { name: req.user.fullName, userId: req.user._id, role: 'member' } } },
      { new: true, runValidators: true },
    );
    if (!updated) return res.status(409).json({ message: 'You are already a member of this group.' });
    return res.status(200).json({ group: serializeTrip(updated, req.user._id) });
  } catch (error) {
    console.error('Could not join group:', error.message);
    return res.status(500).json({ message: 'Could not join this group.' });
  }
});

router.get('/:groupId', async (req, res) => {
  try {
    const group = await findMemberGroup(req.params.groupId, req.user._id);
    if (!group) return res.status(404).json({ message: 'Group not found.' });
    return res.json({ group: serializeTrip(group, req.user._id) });
  } catch (error) {
    console.error('Could not load group:', error.message);
    return res.status(500).json({ message: 'Could not load this group.' });
  }
});

router.delete('/:groupId', async (req, res) => {
  if (!isObjectId(req.params.groupId)) return res.status(404).json({ message: 'Group not found.' });
  try {
    const group = await findMemberGroup(req.params.groupId, req.user._id);
    if (!group) return res.status(404).json({ message: 'Group not found.' });
    const admin = group.members.find((member) => member.userId?.toString() === req.user._id.toString());
    if (admin?.role !== 'admin') return res.status(403).json({ message: 'Only the group admin can delete this group.' });

    const memberUserIds = group.members.map((member) => member.userId?.toString()).filter(Boolean);
    const deletion = await Trip.deleteOne({
      _id: group._id,
      groupCode: { $exists: true },
      members: { $elemMatch: { userId: req.user._id, role: 'admin' } },
    });
    if (!deletion.deletedCount) return res.status(409).json({ message: 'This group changed. Refresh and try again.' });

    try { await ChatMessage.deleteMany({ groupId: group._id }); }
    catch (cleanupError) { console.error('Could not remove deleted group messages:', cleanupError.message); }
    await socketActions?.deleteGroup(group._id.toString(), memberUserIds);
    return res.json({ message: 'Group deleted.' });
  } catch (error) {
    console.error('Could not delete group:', error.message);
    return res.status(500).json({ message: 'Could not delete this group.' });
  }
});

router.delete('/:groupId/members/:memberId', async (req, res) => {
  if (!isObjectId(req.params.groupId) || !isObjectId(req.params.memberId)) return res.status(404).json({ message: 'Group member not found.' });
  try {
    const group = await findMemberGroup(req.params.groupId, req.user._id);
    if (!group) return res.status(404).json({ message: 'Group not found.' });
    const admin = group.members.find((member) => member.userId?.toString() === req.user._id.toString());
    if (admin?.role !== 'admin') return res.status(403).json({ message: 'Only the group admin can remove members.' });

    const member = group.members.id(req.params.memberId);
    if (!member) return res.status(404).json({ message: 'Group member not found.' });
    if (member.role === 'admin') return res.status(409).json({ message: 'The group admin cannot be removed. Delete the group instead.' });

    const removedUserId = member.userId?.toString();
    for (const expense of group.expenses) {
      if (expense.paidByMemberId.toString() === member._id.toString()) expense.paidByName = member.name;
    }
    group.formerMembers.push({ _id: member._id, name: member.name, role: 'member', userId: null });
    member.deleteOne();
    await group.save();
    if (removedUserId) await socketActions?.removeMember(group._id.toString(), removedUserId);
    return res.json({ group: serializeTrip(group, req.user._id), message: 'Member removed from the group.' });
  } catch (error) {
    console.error('Could not remove group member:', error.message);
    return res.status(500).json({ message: 'Could not remove this group member.' });
  }
});

router.get('/:groupId/messages', async (req, res) => {
  try {
    const group = await findMemberGroup(req.params.groupId, req.user._id);
    if (!group) return res.status(404).json({ message: 'Group not found.' });
    const messages = await ChatMessage.find({ groupId: group._id }).sort({ createdAt: -1 }).limit(100).lean();
    return res.json({ messages: messages.reverse().map(serializeMessage) });
  } catch (error) {
    console.error('Could not load group messages:', error.message);
    return res.status(500).json({ message: 'Could not load group chat.' });
  }
});

module.exports = router;
module.exports.setSocketActions = setSocketActions;

