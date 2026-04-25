require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const gameSocket = require('./socket/gameSocket');

const app = express();
const server = http.createServer(app);

// CORS
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));

app.use(express.json());

// Socket.io
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Initialize Socket
gameSocket(io);

// MongoDB Connection - try local first, fallback to in-memory
async function startServer() {
  const PORT = process.env.PORT || 5000;
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/teenpatti';

  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
    console.log('✅ Connected to MongoDB (local)');
  } catch (err) {
    console.log('⚠️  Local MongoDB not available, starting in-memory server...');
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongod = new MongoMemoryServer();
      await mongod.start();
      const uri = mongod.getUri();
      await mongoose.connect(uri);
      console.log('✅ Connected to MongoDB (in-memory)');
      console.log('⚠️  Data will be lost when server restarts');
    } catch (memErr) {
      console.error('❌ Failed to start any MongoDB:', memErr.message);
      process.exit(1);
    }
  }

  server.listen(PORT, () => {
    console.log(`🃏 Teen Patti Server running on port ${PORT}`);
  });
}

startServer();
