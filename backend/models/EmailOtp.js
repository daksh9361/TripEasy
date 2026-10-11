const mongoose = require('mongoose');

const emailOtpSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  purpose: { type: String, enum: ['signup', 'password-reset'], required: true },
  codeHash: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  attempts: { type: Number, default: 0 },
  requestCount: { type: Number, default: 1 },
  requestWindowStartedAt: { type: Date, required: true },
  lastSentAt: { type: Date, required: true },
  verifiedAt: { type: Date, default: null },
  grantHash: { type: String, select: false },
  signupData: {
    fullName: { type: String, maxlength: 80 },
    passwordHash: { type: String, select: false },
  },
}, { timestamps: true });

emailOtpSchema.index({ email: 1, purpose: 1 }, { unique: true });

module.exports = mongoose.model('EmailOtp', emailOtpSchema);
