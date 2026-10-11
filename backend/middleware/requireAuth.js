const jwt = require('jsonwebtoken');
const User = require('../models/User');

const COOKIE_NAME = 'tripeasy_token';

function getCookie(req, name) {
  const cookies = (req.headers.cookie || '').split(';');
  const match = cookies.map((part) => part.trim()).find((part) => part.startsWith(name + '='));
  if (!match) return null;
  try {
    return decodeURIComponent(match.slice(name.length + 1));
  } catch {
    return null;
  }
}

async function requireAuth(req, res, next) {
  const token = getCookie(req, COOKIE_NAME);
  if (!token) return res.status(401).json({ message: 'Please log in to continue.' });

  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    return res.status(503).json({ message: 'Authentication is not configured on the server.' });
  }

  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: 'TripEasy' });
    if (!payload.sub) return res.status(401).json({ message: 'Your session is invalid. Please log in again.' });
    const user = await User.findById(payload.sub).select('_id fullName email emailVerifiedAt');
    if (!user || !user.emailVerifiedAt) return res.status(401).json({ message: 'Your account needs email verification. Verify your email and log in again.' });
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ message: 'Your session has expired. Please log in again.' });
  }
}

module.exports = { requireAuth, COOKIE_NAME };
