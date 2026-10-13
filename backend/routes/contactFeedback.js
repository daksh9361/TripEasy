const express = require('express');
const mongoose = require('mongoose');
const ContactFeedback = require('../models/ContactFeedback');
const { requireAuth, optionalAuth } = require('../middleware/requireAuth');

const router = express.Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ADMIN_REQUIRED = 'Admin access is required to view submissions.';

function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

function databaseReady(res) {
  if (mongoose.connection.readyState === 1) return true;
  res.status(503).json({ message: 'Feedback storage is unavailable. Check the MongoDB connection.' });
  return false;
}

function isConfiguredAdmin(user) {
  const configuredEmail = typeof process.env.FEEDBACK_ADMIN_EMAIL === 'string'
    ? process.env.FEEDBACK_ADMIN_EMAIL.trim().toLowerCase()
    : '';
  return Boolean(configuredEmail && user?.email?.toLowerCase() === configuredEmail);
}

router.post('/', optionalAuth, async (req, res) => {
  const type = req.body?.type;
  const user = req.user || null;
  const name = cleanText(req.body?.name || user?.fullName);
  const email = cleanText(req.body?.email || user?.email).toLowerCase();

  if (type === 'contact') {
    const subject = cleanText(req.body?.subject);
    const message = cleanText(req.body?.message);
    if (!name) return res.status(400).json({ message: 'Enter your name.' });
    if (name.length > 80) return res.status(400).json({ message: 'Name must be 80 characters or fewer.' });
    if (email.length > 254) return res.status(400).json({ message: 'Email must be 254 characters or fewer.' });
    if (!email || !EMAIL_PATTERN.test(email)) return res.status(400).json({ message: 'Enter a valid email address.' });
    if (!subject) return res.status(400).json({ message: 'Enter a subject.' });
    if (subject.length > 120) return res.status(400).json({ message: 'Subject must be 120 characters or fewer.' });
    if (!message) return res.status(400).json({ message: 'Enter a message.' });
    if (message.length > 3000) return res.status(400).json({ message: 'Message must be 3000 characters or fewer.' });
    if (!databaseReady(res)) return;
    try {
      await ContactFeedback.create({ type, userId: user?._id || null, name, email, subject, message });
      return res.status(201).json({ message: 'Your message has been sent to the TripEasy team.' });
    } catch (error) {
      console.error('Contact message could not be saved:', error.message);
      return res.status(500).json({ message: 'Could not send your message. Please try again.' });
    }
  }

  if (type === 'feedback') {
    const feedback = cleanText(req.body?.feedback);
    const rating = Number(req.body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ message: 'Choose a rating from 1 to 5 stars.' });
    if (!feedback) return res.status(400).json({ message: 'Enter your feedback before submitting.' });
    if (feedback.length > 3000) return res.status(400).json({ message: 'Feedback must be 3000 characters or fewer.' });
    if (!databaseReady(res)) return;
    try {
      await ContactFeedback.create({ type, userId: user?._id || null, name, email, rating, feedback });
      return res.status(201).json({ message: 'Thank you for sharing your feedback.' });
    } catch (error) {
      console.error('Feedback could not be saved:', error.message);
      return res.status(500).json({ message: 'Could not save your feedback. Please try again.' });
    }
  }

  return res.status(400).json({ message: 'Choose a valid submission type.' });
});

router.get('/admin', requireAuth, async (req, res) => {
  if (!isConfiguredAdmin(req.user)) return res.status(403).json({ message: ADMIN_REQUIRED });
  if (!databaseReady(res)) return;
  try {
    const submissions = await ContactFeedback.find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .select('type userId name email subject message rating feedback createdAt')
      .lean();
    return res.json({ submissions });
  } catch (error) {
    console.error('Admin submissions could not be loaded:', error.message);
    return res.status(500).json({ message: 'Could not load contact and feedback submissions.' });
  }
});

module.exports = { router, isConfiguredAdmin, cleanText };
