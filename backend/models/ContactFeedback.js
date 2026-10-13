const mongoose = require('mongoose');

const contactFeedbackSchema = new mongoose.Schema({
  type: { type: String, enum: ['contact', 'feedback'], required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  name: { type: String, trim: true, maxlength: 80, default: '' },
  email: { type: String, lowercase: true, trim: true, maxlength: 254, default: '' },
  subject: { type: String, trim: true, maxlength: 120, default: '' },
  message: { type: String, trim: true, maxlength: 3000, default: '' },
  rating: { type: Number, min: 1, max: 5, default: null },
  feedback: { type: String, trim: true, maxlength: 3000, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('ContactFeedback', contactFeedbackSchema);
