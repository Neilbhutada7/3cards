const mongoose = require('mongoose');

const roundSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  roomCode: {
    type: String,
    required: true
  },
  roundNumber: {
    type: Number,
    required: true
  },
  players: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: String,
    avatar: String,
    betAmount: Number,
    chipsBeforeRound: Number,
    chipsAfterRound: Number,
    folded: Boolean
  }],
  pot: {
    type: Number,
    required: true
  },
  winnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  winnerUsername: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient querying
roundSchema.index({ roomId: 1, roundNumber: -1 });

module.exports = mongoose.model('Round', roundSchema);
