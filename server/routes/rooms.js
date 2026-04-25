const express = require('express');
const Room = require('../models/Room');
const Round = require('../models/Round');
const auth = require('../middleware/auth');
const router = express.Router();

// Create room
router.post('/create', auth, async (req, res) => {
  try {
    const { name, defaultChips, minBet, maxPlayers } = req.body;

    let code;
    let attempts = 0;
    do {
      code = Room.generateCode();
      const exists = await Room.findOne({ code, isActive: true });
      if (!exists) break;
      attempts++;
    } while (attempts < 10);

    const room = new Room({
      code,
      name: name || `${req.user.username}'s Game`,
      adminId: req.user.id,
      adminUsername: req.user.username,
      defaultChips: defaultChips || 1000,
      minBet: minBet || 10,
      currentStake: minBet || 10, // Initialize stake
      maxPlayers: maxPlayers || 10,
      players: [{
        userId: req.user.id,
        username: req.user.username,
        avatar: req.user.avatar || '🃏',
        chips: defaultChips || 1000,
        startingChips: defaultChips || 1000,
        isActive: true,
        isConnected: true
      }]
    });

    await room.save();
    res.status(201).json({ room });
  } catch (err) {
    console.error('Create room error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Join room
router.post('/join', auth, async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Room code is required' });
    }

    const room = await Room.findOne({ code: code.toUpperCase(), isActive: true });
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Check if player is already in room
    const existingPlayer = room.players.find(p => p.userId.toString() === req.user.id);
    if (existingPlayer) {
      existingPlayer.isConnected = true;
      existingPlayer.isActive = true;
      await room.save();
      return res.json({ room });
    }

    if (room.players.filter(p => p.isActive).length >= room.maxPlayers) {
      return res.status(400).json({ error: 'Room is full' });
    }

    room.players.push({
      userId: req.user.id,
      username: req.user.username,
      avatar: req.user.avatar || '🃏',
      chips: room.defaultChips,
      startingChips: room.defaultChips,
      isActive: true,
      isConnected: true
    });

    await room.save();
    res.json({ room });
  } catch (err) {
    console.error('Join room error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get room details
router.get('/:code', auth, async (req, res) => {
  try {
    const room = await Room.findOne({ code: req.params.code.toUpperCase(), isActive: true });
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    res.json({ room });
  } catch (err) {
    console.error('Get room error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get round history for a room
router.get('/:code/history', auth, async (req, res) => {
  try {
    const rounds = await Round.find({ roomCode: req.params.code.toUpperCase() })
      .sort({ roundNumber: -1 })
      .limit(50);
    res.json({ rounds });
  } catch (err) {
    console.error('Get history error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
