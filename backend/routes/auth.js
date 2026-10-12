const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const { requireAuth, COOKIE_NAME } = require('../middleware/requireAuth');

const router = express.Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const COOKIE_MAX_AGE = 60 * 60 * 1000;

function databaseReady(res) {
  if (mongoose.connection.readyState === 1) return true;
  res.status(503).json({ message: 'TripEasy account storage is unavailable. Check the MongoDB connection.' });
  return false;
}

function publicUser(user) {
  return { id: user._id.toString(), fullName: user.fullName, email: user.email };
}

function cookieOptions(req) {
  const forwardedProtocol = req.get('x-forwarded-proto')?.split(',')[0].trim().toLowerCase();
  const isSecureRequest = process.env.NODE_ENV === 'production' || req.secure || forwardedProtocol === 'https';
  return {
    httpOnly: true,
    // The frontend and API use different origins in production (for example Vercel and Render).
    // Cross-site fetch requests need SameSite=None and Secure. Partitioning also allows the
    // session to work when the browser blocks unpartitioned third-party cookies.
    secure: isSecureRequest,
    sameSite: isSecureRequest ? 'none' : 'lax',
    partitioned: isSecureRequest,
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  };
}

function setSessionCookie(req, res, userId) {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('JWT_SECRET must contain at least 32 bytes.');
  const token = jwt.sign({ sub: userId.toString() }, secret, { algorithm: 'HS256', expiresIn: '1h', issuer: 'TripEasy' });
  res.cookie(COOKIE_NAME, token, cookieOptions(req));
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validPassword(value) {
  return typeof value === 'string' && value.length >= 8 && Buffer.byteLength(value, 'utf8') <= 72;
}

router.post('/signup', async (req, res) => {
  if (!databaseReady(res)) return;
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const confirmPassword = typeof req.body?.confirmPassword === 'string' ? req.body.confirmPassword : '';

  if (!fullName || fullName.length > 80) return res.status(400).json({ message: 'Enter your name (up to 80 characters).' });
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) return res.status(400).json({ message: 'Enter a valid email address.' });
  if (!validPassword(password)) return res.status(400).json({ message: 'Password must be at least 8 characters and at most 72 bytes.' });
  if (password !== confirmPassword) return res.status(400).json({ message: 'Passwords do not match.' });

  try {
    if (await User.exists({ email })) return res.status(409).json({ message: 'An account with this email already exists.' });
    const passwordHash = await bcrypt.hash(password, 12);
    await User.create({ fullName, email, passwordHash });
    return res.status(201).json({ message: 'Account created successfully. Please log in.' });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'An account with this email already exists.' });
    console.error('Signup failed:', error.message);
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
    if (!user || !passwordMatches) return res.status(401).json({ message: 'Invalid email or password. Check your details and try again.' });
    setSessionCookie(req, res, user._id);
    return res.json({ message: 'Logged in.', user: publicUser(user) });
  } catch (error) {
    console.error('Login failed:', error.message);
    return res.status(500).json({ message: 'Could not log in. Please try again.' });
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

router.post('/logout', (req, res) => {
  const options = cookieOptions(req);
  delete options.maxAge;
  res.clearCookie(COOKIE_NAME, options);
  res.json({ message: 'Logged out.' });
});

module.exports = router;
