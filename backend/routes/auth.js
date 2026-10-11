const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const User = require('../models/User');
const EmailOtp = require('../models/EmailOtp');
const { requireAuth, COOKIE_NAME } = require('../middleware/requireAuth');

const router = express.Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const COOKIE_MAX_AGE = 60 * 60 * 1000;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_MS = 60 * 1000;
const OTP_WINDOW_MS = 60 * 60 * 1000;
const MAX_OTP_REQUESTS = 5;
const MAX_OTP_ATTEMPTS = 5;

function databaseReady(res) {
  if (mongoose.connection.readyState === 1) return true;
  res.status(503).json({ message: 'TripEasy account storage is unavailable. Check the MongoDB connection.' });
  return false;
}

function publicUser(user) {
  return { id: user._id.toString(), fullName: user.fullName, email: user.email };
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  };
}

function setSessionCookie(res, userId) {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('JWT_SECRET must contain at least 32 bytes.');
  const token = jwt.sign({ sub: userId.toString() }, secret, { algorithm: 'HS256', expiresIn: '1h', issuer: 'TripEasy' });
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validPassword(value) {
  return typeof value === 'string' && value.length >= 8 && Buffer.byteLength(value, 'utf8') <= 72;
}

function otpHash(email, purpose, code) {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('JWT_SECRET must contain at least 32 bytes.');
  return crypto.createHmac('sha256', secret).update(`${purpose}:${email}:${code}`).digest('hex');
}

function tokenHash(token) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update(`reset-grant:${token}`).digest('hex');
}

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function createMailer() {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const host = process.env.SMTP_HOST?.trim() || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT?.trim() || 587);
  const secureSetting = process.env.SMTP_SECURE?.trim().toLowerCase();
  const from = process.env.SMTP_FROM?.trim() || user;

  if (!user || !pass) {
    return { error: 'Email delivery needs the project SMTP sender settings. Set SMTP_USER and SMTP_PASS in backend/.env, then restart the backend.' };
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !['', 'true', 'false'].includes(secureSetting)) {
    return { error: 'SMTP settings are invalid. Check SMTP_HOST, SMTP_PORT, and SMTP_SECURE in backend/.env.' };
  }

  const secure = secureSetting ? secureSetting === 'true' : port === 465;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: { user, pass },
  });
  return { transporter, from };
}

function logMailFailure(context, error) {
  const details = {};
  if (typeof error?.code === 'string') details.code = error.code;
  if (typeof error?.command === 'string') details.command = error.command;
  if (Number.isInteger(error?.responseCode)) details.responseCode = error.responseCode;
  console.error(`[TripEasy] ${context}`, details);
}

async function sendOtp({ email, purpose, signupData = null }) {
  const existing = await EmailOtp.findOne({ email, purpose }).select('+codeHash +grantHash +signupData.passwordHash');
  const now = new Date();
  const windowStart = existing?.requestWindowStartedAt;
  const requestCount = windowStart && now.getTime() - windowStart.getTime() < OTP_WINDOW_MS ? existing.requestCount : 0;
  if (existing?.lastSentAt && now.getTime() - existing.lastSentAt.getTime() < OTP_RESEND_MS) {
    return { error: { status: 429, message: 'Wait one minute before requesting another code.' } };
  }
  if (requestCount >= MAX_OTP_REQUESTS) {
    return { error: { status: 429, message: 'Too many code requests. Try again in an hour.' } };
  }

  const mailer = createMailer();
  if (mailer.error) {
    console.warn('[TripEasy] OTP email service is unavailable:', mailer.error);
    return { error: { status: 503, message: mailer.error } };
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const subject = purpose === 'signup' ? 'Verify your TripEasy email' : 'Reset your TripEasy password';
  const purposeText = purpose === 'signup' ? 'verify your email and finish creating your account' : 'reset your TripEasy password';
  await mailer.transporter.sendMail({
    from: mailer.from,
    to: email,
    subject,
    text: `Your TripEasy verification code is ${code}. Use it to ${purposeText}. This code expires in 5 minutes. If you did not request this email, you can ignore it.`,
    html: `<p>Your TripEasy verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>Use it to ${purposeText}. It expires in 5 minutes. If you did not request this email, you can ignore it.</p>`,
  });

  const nextValues = {
    codeHash: otpHash(email, purpose, code),
    expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    attempts: 0,
    requestCount: requestCount + 1,
    requestWindowStartedAt: requestCount ? windowStart : now,
    lastSentAt: now,
    verifiedAt: null,
    grantHash: undefined,
    signupData: signupData || undefined,
  };
  if (existing) {
    Object.assign(existing, nextValues);
    await existing.save();
  } else {
    await EmailOtp.create({ email, purpose, ...nextValues });
  }
  return { ok: true };
}

async function verifyOtp(email, purpose, code) {
  const challenge = await EmailOtp.findOne({ email, purpose }).select('+codeHash +grantHash');
  if (!challenge || challenge.expiresAt <= new Date() || challenge.verifiedAt) return { error: { status: 400, message: 'That code has expired or is invalid. Request a new code.' } };
  if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
    await challenge.deleteOne();
    return { error: { status: 429, message: 'Too many incorrect attempts. Request a new code.' } };
  }
  const matches = safeEqual(challenge.codeHash, otpHash(email, purpose, code));
  if (!matches) {
    challenge.attempts += 1;
    if (challenge.attempts >= MAX_OTP_ATTEMPTS) await challenge.deleteOne();
    else await challenge.save();
    return { error: { status: challenge.attempts >= MAX_OTP_ATTEMPTS ? 429 : 400, message: challenge.attempts >= MAX_OTP_ATTEMPTS ? 'Too many incorrect attempts. Request a new code.' : 'The verification code is incorrect.' } };
  }
  return { challenge };
}

function emailAndOtp(body) {
  const email = normalizeEmail(body?.email);
  const code = typeof body?.otp === 'string' ? body.otp.trim() : '';
  return { email, code };
}

router.post('/signup/send-otp', async (req, res) => {
  if (!databaseReady(res)) return;
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const confirmPassword = typeof req.body?.confirmPassword === 'string' ? req.body.confirmPassword : '';
  if (!fullName || fullName.length > 80) return res.status(400).json({ message: 'Enter your full name (up to 80 characters).' });
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) return res.status(400).json({ message: 'Enter a valid email address.' });
  if (!validPassword(password)) return res.status(400).json({ message: 'Password must be at least 8 characters and at most 72 bytes.' });
  if (password !== confirmPassword) return res.status(400).json({ message: 'Passwords do not match.' });
  try {
    const existingUser = await User.findOne({ email }).select('+passwordHash');
    if (existingUser?.emailVerifiedAt) return res.status(409).json({ message: 'An account with this email already exists.' });
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await sendOtp({ email, purpose: 'signup', signupData: { fullName, passwordHash } });
    if (result.error) return res.status(result.error.status).json({ message: result.error.message });
    return res.json({ message: 'Verification code sent. Check your email.' });
  } catch (error) {
    logMailFailure('signup OTP delivery failed', error);
    return res.status(502).json({ message: 'Could not send the verification email. Check SMTP settings and try again.' });
  }
});

router.post('/signup/verify-otp', async (req, res) => {
  if (!databaseReady(res)) return;
  const { email, code } = emailAndOtp(req.body);
  if (!EMAIL_PATTERN.test(email) || !/^\d{6}$/.test(code)) return res.status(400).json({ message: 'Enter your email and the 6-digit code.' });
  try {
    const result = await verifyOtp(email, 'signup', code);
    if (result.error) return res.status(result.error.status).json({ message: result.error.message });
    result.challenge.verifiedAt = new Date();
    await result.challenge.save();
    return res.json({ message: 'Email verified. You can create your account now.' });
  } catch (error) {
    console.error('Signup OTP verification failed:', error.message);
    return res.status(500).json({ message: 'Could not verify the code. Please try again.' });
  }
});

router.post('/signup/complete', async (req, res) => {
  if (!databaseReady(res)) return;
  const email = normalizeEmail(req.body?.email);
  if (!EMAIL_PATTERN.test(email)) return res.status(400).json({ message: 'Enter a valid email address.' });
  try {
    const challenge = await EmailOtp.findOne({ email, purpose: 'signup', verifiedAt: { $ne: null }, expiresAt: { $gt: new Date() } }).select('+signupData.passwordHash');
    if (!challenge?.signupData?.passwordHash) return res.status(400).json({ message: 'Verify your email code before creating your account.' });
    let user = await User.findOne({ email }).select('+passwordHash');
    if (user?.emailVerifiedAt) {
      await challenge.deleteOne();
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }
    if (user) {
      user.fullName = challenge.signupData.fullName;
      user.passwordHash = challenge.signupData.passwordHash;
      user.emailVerifiedAt = challenge.verifiedAt;
      await user.save();
    } else {
      user = await User.create({ fullName: challenge.signupData.fullName, email, passwordHash: challenge.signupData.passwordHash, emailVerifiedAt: challenge.verifiedAt });
    }
    await challenge.deleteOne();
    setSessionCookie(res, user._id);
    return res.status(201).json({ message: 'Your account is ready.', user: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'An account with this email already exists.' });
    console.error('Account creation failed:', error.message);
    return res.status(500).json({ message: 'Could not create your account. Please try again.' });
  }
});

router.post('/login', async (req, res) => {
  if (!databaseReady(res)) return;
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!EMAIL_PATTERN.test(email) || !password) return res.status(400).json({ message: 'Enter your email address and password.' });
  try {
    const user = await User.findOne({ email }).select('+passwordHash');
    const passwordMatches = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !user.emailVerifiedAt || !passwordMatches) return res.status(401).json({ message: 'Invalid email or password. Verify your email before logging in.' });
    setSessionCookie(res, user._id);
    return res.json({ message: 'Logged in.', user: publicUser(user) });
  } catch (error) {
    console.error('Login failed:', error.message);
    return res.status(500).json({ message: 'Could not log in. Please try again.' });
  }
});

router.post('/password/forgot/send-otp', async (req, res) => {
  if (!databaseReady(res)) return;
  const email = normalizeEmail(req.body?.email);
  if (!EMAIL_PATTERN.test(email)) return res.status(400).json({ message: 'Enter a valid email address.' });
  try {
    const user = await User.exists({ email, emailVerifiedAt: { $ne: null } });
    if (user) {
      const result = await sendOtp({ email, purpose: 'password-reset' });
      if (result.error) return res.status(result.error.status).json({ message: result.error.message });
    }
    return res.json({ message: 'If a verified account exists, a password reset code has been sent.' });
  } catch (error) {
    logMailFailure('password reset email failed', error);
    return res.status(502).json({ message: 'Could not send the reset email. Check SMTP settings and try again.' });
  }
});

router.post('/password/forgot/verify-otp', async (req, res) => {
  if (!databaseReady(res)) return;
  const { email, code } = emailAndOtp(req.body);
  if (!EMAIL_PATTERN.test(email) || !/^\d{6}$/.test(code)) return res.status(400).json({ message: 'Enter your email and the 6-digit code.' });
  try {
    const result = await verifyOtp(email, 'password-reset', code);
    if (result.error) return res.status(result.error.status).json({ message: result.error.message });
    const grant = crypto.randomBytes(32).toString('hex');
    result.challenge.codeHash = 'consumed';
    result.challenge.verifiedAt = new Date();
    result.challenge.grantHash = tokenHash(grant);
    result.challenge.expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await result.challenge.save();
    return res.json({ message: 'Code verified. Choose a new password.', resetGrant: grant });
  } catch (error) {
    console.error('Password reset code verification failed:', error.message);
    return res.status(500).json({ message: 'Could not verify the code. Please try again.' });
  }
});

router.post('/password/forgot/reset', async (req, res) => {
  if (!databaseReady(res)) return;
  const email = normalizeEmail(req.body?.email);
  const grant = typeof req.body?.resetGrant === 'string' ? req.body.resetGrant : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const confirmPassword = typeof req.body?.confirmPassword === 'string' ? req.body.confirmPassword : '';
  if (!EMAIL_PATTERN.test(email) || grant.length !== 64) return res.status(400).json({ message: 'Verify a reset code first.' });
  if (!validPassword(password)) return res.status(400).json({ message: 'Password must be at least 8 characters and at most 72 bytes.' });
  if (password !== confirmPassword) return res.status(400).json({ message: 'Passwords do not match.' });
  try {
    const challenge = await EmailOtp.findOne({ email, purpose: 'password-reset', verifiedAt: { $ne: null }, expiresAt: { $gt: new Date() } }).select('+grantHash');
    if (!challenge?.grantHash || !safeEqual(challenge.grantHash, tokenHash(grant))) return res.status(400).json({ message: 'Your reset verification expired. Request another code.' });
    const user = await User.findOne({ email, emailVerifiedAt: { $ne: null } });
    if (!user) return res.status(400).json({ message: 'This account could not be found.' });
    user.passwordHash = await bcrypt.hash(password, 12);
    await user.save();
    await challenge.deleteOne();
    return res.json({ message: 'Password reset. Log in with your new password.' });
  } catch (error) {
    console.error('Password reset failed:', error.message);
    return res.status(500).json({ message: 'Could not reset your password. Please try again.' });
  }
});

router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

router.patch('/profile', requireAuth, async (req, res) => {
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
  if (!fullName || fullName.length > 80) return res.status(400).json({ message: 'Enter your name (up to 80 characters).' });
  try {
    req.user.fullName = fullName;
    await req.user.save();
    res.json({ message: 'Profile updated.', user: publicUser(req.user) });
  } catch (error) {
    console.error('Profile update failed:', error.message);
    res.status(500).json({ message: 'Could not update your profile.' });
  }
});

router.post('/password/change', requireAuth, async (req, res) => {
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  const confirmPassword = typeof req.body?.confirmPassword === 'string' ? req.body.confirmPassword : '';
  if (!validPassword(newPassword)) return res.status(400).json({ message: 'New password must be at least 8 characters and at most 72 bytes.' });
  if (newPassword !== confirmPassword) return res.status(400).json({ message: 'New passwords do not match.' });
  try {
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!user || !await bcrypt.compare(currentPassword, user.passwordHash)) return res.status(401).json({ message: 'Current password is incorrect.' });
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();
    res.json({ message: 'Password changed.' });
  } catch (error) {
    console.error('Password change failed:', error.message);
    res.status(500).json({ message: 'Could not change your password.' });
  }
});

router.post('/logout', (_req, res) => {
  const options = cookieOptions();
  delete options.maxAge;
  res.clearCookie(COOKIE_NAME, options);
  res.json({ message: 'Logged out.' });
});

module.exports = router;
