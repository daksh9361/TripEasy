const mongoose = require('mongoose');

async function connectDatabase(uri = process.env.MONGODB_URI) {
  if (!uri) return null;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  const User = require('../models/User');
  const models = [
    User,
    require('../models/EmailOtp'),
    require('../models/Trip'),
    require('../models/ChatMessage'),
  ];
  await User.syncIndexes();
  await Promise.all(models.filter((model) => model !== User).map((model) => model.init()));
  return mongoose.connection;
}

module.exports = connectDatabase;
