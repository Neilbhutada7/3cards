const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: { type: String, required: true },
  avatar: { type: String, default: '🃏' },
  chips: { type: Number, default: 0 },
  startingChips: { type: Number, default: 0 }, // Track initial amount
  currentBet: { type: Number, default: 0 }, // Bet in current turn
  totalBetThisRound: { type: Number, default: 0 },
  isFolded: { type: Boolean, default: false },
  isSeen: { type: Boolean, default: false }, // New: Track if player has seen cards
  isActive: { type: Boolean, default: true },
  isConnected: { type: Boolean, default: true }
});

const roomSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  adminUsername: {
    type: String,
    required: true
  },
  players: [playerSchema],
  pot: {
    type: Number,
    default: 0
  },
  currentStake: { // New: The base bet amount (Blind stake)
    type: Number,
    default: 10
  },
  minBet: { // Used as Boot amount
    type: Number,
    default: 10
  },
  defaultChips: {
    type: Number,
    default: 1000
  },
  status: {
    type: String,
    enum: ['waiting', 'playing', 'roundEnd', 'show'], // Added 'show'
    default: 'waiting'
  },
  currentTurnIndex: {
    type: Number,
    default: -1
  },
  dealerIndex: { // New: Track dealer to determine turn order
    type: Number,
    default: 0
  },
  roundNumber: {
    type: Number,
    default: 0
  },
  maxPlayers: {
    type: Number,
    default: 10
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Generate a unique room code
roomSchema.statics.generateCode = function() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

module.exports = mongoose.model('Room', roomSchema);
