const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  role: { type: String, enum: ['admin', 'member'], default: 'member' },
});

const expenseSchema = new mongoose.Schema({
  paidByMemberId: { type: mongoose.Schema.Types.ObjectId, required: true },
  paidByName: { type: String, trim: true, maxlength: 80, default: '' },
  amountCents: { type: Number, required: true, min: 1 },
  description: { type: String, required: true, trim: true, maxlength: 160 },
  location: { type: String, trim: true, maxlength: 120, default: '' },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

const settlementRecordSchema = new mongoose.Schema({
  paymentKey: { type: String, required: true },
  fromMemberId: { type: mongoose.Schema.Types.ObjectId, required: true },
  toMemberId: { type: mongoose.Schema.Types.ObjectId, required: true },
  fromName: { type: String, required: true, trim: true, maxlength: 80 },
  toName: { type: String, required: true, trim: true, maxlength: 80 },
  amountCents: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ['settled'], default: 'settled' },
  settledAt: { type: Date, default: Date.now },
}, { _id: true });

const tripSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  groupCode: { type: String, trim: true, uppercase: true, match: /^[A-Z0-9]{6}$/, unique: true, sparse: true },
  members: { type: [memberSchema], validate: [(items) => items.length > 0, 'A trip needs at least one member.'] },
  formerMembers: { type: [memberSchema], default: [] },
  expenses: { type: [expenseSchema], default: [] },
  settlementRecords: { type: [settlementRecordSchema], default: [] },
  status: { type: String, enum: ['active', 'completed'], default: 'active', index: true },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Trip', tripSchema);
