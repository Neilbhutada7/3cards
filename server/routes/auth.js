const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

const AVATARS = ['🃏', '♠️', '♥️', '♦️', '♣️', '🎴', '🎰', '🎲', '👑', '💎', '🔥', '⚡'];

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (username.length < 2 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 2-20 characters' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    const existing = await User.findOne({ username: username.toLowerCase() });
    if (existing) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
    const user = new User({ 
      username: username.toLowerCase(), 
      password, 
      avatar 
    });
    await user.save();

    const token = jwt.sign(
      { id: user._id, username: user.username, avatar: user.avatar },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ 
      token, 
      user: { 
        id: user._id, 
        username: user.username, 
        avatar: user.avatar,
        isGuest: false 
      } 
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    if (user.isGuest) {
      return res.status(400).json({ error: 'This is a guest account. Please use guest login.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, username: user.username, avatar: user.avatar },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ 
      token, 
      user: { 
        id: user._id, 
        username: user.username, 
        avatar: user.avatar,
        isGuest: false 
      } 
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Guest login
router.post('/guest', async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    if (username.length < 2 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 2-20 characters' });
    }

    // Check if non-guest user with this name exists
    const existing = await User.findOne({ username: username.toLowerCase(), isGuest: false });
    if (existing) {
      return res.status(400).json({ error: 'Username already taken by a registered user' });
    }

    // Remove old guest with same name if exists
    await User.deleteOne({ username: username.toLowerCase(), isGuest: true });

    const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
    const user = new User({ 
      username: username.toLowerCase(), 
      isGuest: true, 
      avatar 
    });
    await user.save();

    const token = jwt.sign(
      { id: user._id, username: user.username, avatar: user.avatar, isGuest: true },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({ 
      token, 
      user: { 
        id: user._id, 
        username: user.username, 
        avatar: user.avatar,
        isGuest: true 
      } 
    });
  } catch (err) {
    console.error('Guest login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
