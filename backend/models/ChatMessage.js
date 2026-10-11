const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderName: { type: String, required: true, trim: true, maxlength: 80 },
  text: { type: String, required: true, trim: true, maxlength: 2000 },
}, { timestamps: true });

chatMessageSchema.index({ groupId: 1, createdAt: 1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
