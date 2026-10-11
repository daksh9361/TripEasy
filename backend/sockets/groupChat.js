const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Trip = require('../models/Trip');
const ChatMessage = require('../models/ChatMessage');

const COOKIE_NAME = 'tripeasy_token';
const MAX_MESSAGE_LENGTH = 2000;

function getCookie(header = '', name) {
  const entry = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!entry) return null;
  try { return decodeURIComponent(entry.slice(name.length + 1)); } catch { return null; }
}

function roomName(groupId) { return `group:${groupId}`; }
function userRoomName(userId) { return `user:${userId}`; }
function sendAck(ack, payload) { if (typeof ack === 'function') ack(payload); }

module.exports = function attachGroupChat(io) {
  io.use(async (socket, next) => {
    const secret = process.env.JWT_SECRET;
    if (!secret || Buffer.byteLength(secret) < 32) return next(new Error('Authentication is unavailable.'));
    const token = getCookie(socket.handshake.headers.cookie || '', COOKIE_NAME);
    if (!token) return next(new Error('Please log in to use group chat.'));
    try {
      const payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: 'TripEasy' });
      if (!payload.sub) return next(new Error('Your session is invalid.'));
      const user = await User.findById(payload.sub).select('_id fullName email emailVerifiedAt');
      if (!user || !user.emailVerifiedAt) return next(new Error('A verified account is required.'));
      socket.data.user = user;
      return next();
    } catch {
      return next(new Error('Your session has expired. Please log in again.'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(userRoomName(socket.data.user._id));
    socket.on('group:join', async (payload, ack) => {
      const groupId = typeof payload?.groupId === 'string' ? payload.groupId : '';
      if (!mongoose.Types.ObjectId.isValid(groupId)) return sendAck(ack, { ok: false, error: 'Group not found.' });
      try {
        const group = await Trip.findOne({ _id: groupId, groupCode: { $exists: true }, 'members.userId': socket.data.user._id }).select('_id');
        if (!group) return sendAck(ack, { ok: false, error: 'You are not a member of this group.' });
        await socket.join(roomName(groupId));
        return sendAck(ack, { ok: true });
      } catch (error) {
        console.error('Could not authorize group chat room:', error.message);
        return sendAck(ack, { ok: false, error: 'Could not join group chat.' });
      }
    });

    socket.on('group:message:send', async (payload, ack) => {
      const groupId = typeof payload?.groupId === 'string' ? payload.groupId : '';
      const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
      if (!mongoose.Types.ObjectId.isValid(groupId)) return sendAck(ack, { ok: false, error: 'Group not found.' });
      if (!text || text.length > MAX_MESSAGE_LENGTH) return sendAck(ack, { ok: false, error: 'Messages must contain 1 to 2,000 characters.' });
      const room = roomName(groupId);
      if (!socket.rooms.has(room)) return sendAck(ack, { ok: false, error: 'Join this group chat before sending a message.' });
      try {
        const group = await Trip.findOne({ _id: groupId, groupCode: { $exists: true }, 'members.userId': socket.data.user._id }).select('_id');
        if (!group) {
          await socket.leave(room);
          return sendAck(ack, { ok: false, error: 'You are not a member of this group.' });
        }
        const message = await ChatMessage.create({ groupId: group._id, senderId: socket.data.user._id, senderName: socket.data.user.fullName, text });
        const serialized = {
          id: message._id.toString(), groupId: message.groupId.toString(), senderId: message.senderId.toString(),
          senderName: message.senderName, text: message.text, createdAt: message.createdAt,
        };
        io.to(room).emit('group:message', serialized);
        return sendAck(ack, { ok: true, message: serialized });
      } catch (error) {
        console.error('Could not send group chat message:', error.message);
        return sendAck(ack, { ok: false, error: 'Could not send your message. Please try again.' });
      }
    });
  });

  async function removeFromGroupRoom(groupId, shouldRemove = () => true) {
    const room = roomName(groupId);
    const sockets = await io.in(room).fetchSockets();
    await Promise.all(sockets.filter(shouldRemove).map((socket) => socket.leave(room)));
  }

  return {
    removeMember(groupId, userId) {
      io.to(userRoomName(userId)).emit('group:membership-removed', { groupId });
      return removeFromGroupRoom(groupId, (socket) => String(socket.data.user?._id) === String(userId));
    },
    deleteGroup(groupId, memberUserIds) {
      for (const userId of memberUserIds) io.to(userRoomName(userId)).emit('group:deleted', { groupId });
      return removeFromGroupRoom(groupId);
    },
  };
};

