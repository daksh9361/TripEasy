const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const connectDatabase = require('./config/database');
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const tripRoutes = require('./routes/trips');
const groupRoutes = require('./routes/groups');

const app = express();
const httpServer = http.createServer(app);
const port = process.env.PORT || 5000;
const localDevelopmentOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const configuredClientOrigins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set([...configuredClientOrigins, ...localDevelopmentOrigins]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/groups', groupRoutes);

const io = new Server(httpServer, { cors: { origin: [...allowedOrigins], credentials: true } });
const groupChatActions = require('./sockets/groupChat')(io);
groupRoutes.setSocketActions(groupChatActions);

if (process.env.MONGODB_URI) {
  connectDatabase()
    .then(() => console.log('MongoDB connected.'))
    .catch((error) => console.error('MongoDB connection failed:', error.message));
} else {
  console.warn('MONGODB_URI is not configured. Account endpoints will be unavailable.');
}

httpServer.listen(port, () => {
  console.log('TripEasy API listening on http://localhost:' + port);
});

