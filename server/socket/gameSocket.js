const jwt = require('jsonwebtoken');
const Room = require('../models/Room');
const Round = require('../models/Round');
const User = require('../models/User');

module.exports = function(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (err) { next(new Error('Invalid token')); }
  });

  io.on('connection', (socket) => {
    socket.on('joinRoom', async ({ roomCode }) => {
      try {
        const room = await Room.findOne({ code: roomCode, isActive: true });
        if (!room) return socket.emit('error', { message: 'Room not found' });
        socket.join(roomCode);
        socket.roomCode = roomCode;
        const player = room.players.find(p => p.userId.toString() === socket.user.id);
        if (player) { player.isConnected = true; await room.save(); }
        const updatedRoom = await Room.findOne({ code: roomCode, isActive: true });
        io.to(roomCode).emit('roomUpdate', { room: updatedRoom });
      } catch (err) { socket.emit('error', { message: 'Failed to join room' }); }
    });

    // START ROUND: Reset pot, collect boot, set first turn
    socket.on('startRound', async ({ roomCode }) => {
      try {
        const room = await Room.findOne({ code: roomCode, isActive: true });
        if (!room || room.adminId.toString() !== socket.user.id) return;

        const activePlayers = room.players.filter(p => p.isActive && p.chips >= room.minBet);
        if (activePlayers.length < 2) return socket.emit('error', { message: 'Need 2+ players with chips for Boot' });

        // Reset Round State
        room.roundNumber += 1;
        room.status = 'playing';
        room.pot = 0;
        room.currentStake = room.minBet || 10; // Ensure stake is set to boot amount

        room.players.forEach(p => {
          if (p.isActive && p.chips >= room.minBet) {
            const bootAmount = room.minBet || 10;
            p.chips -= bootAmount; // Collect Boot
            p.totalBetThisRound = bootAmount;
            p.currentBet = 0;
            p.isFolded = false;
            p.isSeen = false;
            room.pot += bootAmount;
          } else {
            p.isFolded = true;
          }
        });

        console.log(`Round ${room.roundNumber} started. Pot: ${room.pot}, Stake: ${room.currentStake}`);

        // First turn is after dealer
        room.currentTurnIndex = (room.dealerIndex + 1) % room.players.length;
        // Ensure first player isn't folded
        while (room.players[room.currentTurnIndex].isFolded) {
          room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
        }

        await room.save();
        io.to(roomCode).emit('roomUpdate', { room });
        io.to(roomCode).emit('notification', { message: 'Round Started! Boot collected.', type: 'success' });
      } catch (err) { console.error(err); }
    });

    // SEE CARDS
    socket.on('seeCards', async ({ roomCode }) => {
      try {
        const room = await Room.findOne({ code: roomCode, isActive: true });
        const player = room?.players.find(p => p.userId.toString() === socket.user.id);
        if (!player || player.isFolded) return;

        player.isSeen = true;
        await room.save();
        io.to(roomCode).emit('roomUpdate', { room });
      } catch (err) {}
    });

    // CALL / BET
    socket.on('call', async ({ roomCode }) => {
      try {
        const room = await Room.findOne({ code: roomCode, isActive: true });
        if (!room || room.status !== 'playing') return;
        
        const playerIndex = room.currentTurnIndex;
        const player = room.players[playerIndex];
        if (player.userId.toString() !== socket.user.id) return;

        // Rules: Blind pays 1x Stake, Seen pays 2x Stake
        const amount = player.isSeen ? 2 * room.currentStake : room.currentStake;
        
        if (player.chips < amount) return socket.emit('error', { message: 'Not enough chips' });

        player.chips -= amount;
        player.currentBet = amount;
        player.totalBetThisRound += amount;
        room.pot += amount;

        advanceTurn(room);
        await room.save();
        io.to(roomCode).emit('roomUpdate', { room });
        io.to(roomCode).emit('betPlaced', { username: player.username, action: 'call', amount });
      } catch (err) {}
    });

    // RAISE
    socket.on('raise', async ({ roomCode, amount }) => {
      try {
        const room = await Room.findOne({ code: roomCode, isActive: true });
        if (!room || room.status !== 'playing') return;

        const playerIndex = room.currentTurnIndex;
        const player = room.players[playerIndex];
        if (player.userId.toString() !== socket.user.id) return;

        // Validation based on rules:
        // Blind → max 2× currentStake (becomes new currentStake)
        // Seen → max 2× (seen stake = 2*currentStake) -> max 4*currentStake (but updates stake to amount/2)
        
        let newStake = player.isSeen ? amount / 2 : amount;
        
        if (newStake <= room.currentStake) return socket.emit('error', { message: 'Raise must increase stake' });
        if (player.isSeen && amount > 4 * room.currentStake) return socket.emit('error', { message: 'Max raise is 2x of required bet' });
        if (!player.isSeen && amount > 2 * room.currentStake) return socket.emit('error', { message: 'Max raise is 2x of current stake' });

        if (player.chips < amount) return socket.emit('error', { message: 'Not enough chips' });

        player.chips -= amount;
        player.currentBet = amount;
        player.totalBetThisRound += amount;
        room.pot += amount;
        room.currentStake = newStake;

        advanceTurn(room);
        await room.save();
        io.to(roomCode).emit('roomUpdate', { room });
        io.to(roomCode).emit('betPlaced', { username: player.username, action: 'raise', amount });
      } catch (err) {}
    });

    // FOLD
    socket.on('fold', async ({ roomCode }) => {
      try {
        const room = await Room.findOne({ code: roomCode, isActive: true });
        if (!room || room.status !== 'playing') return;

        const player = room.players.find(p => p.userId.toString() === socket.user.id);
        player.isFolded = true;

        const activePlayers = room.players.filter(p => !p.isFolded && p.isActive);
        if (activePlayers.length === 1) {
          handleAutoWin(room, activePlayers[0]);
        } else {
          advanceTurn(room);
        }
        
        await room.save();
        io.to(roomCode).emit('roomUpdate', { room });
        io.to(roomCode).emit('betPlaced', { username: player.username, action: 'fold', amount: 0 });
      } catch (err) {}
    });

    // SHOW (Only if 2 players left)
    socket.on('show', async ({ roomCode }) => {
      try {
        const room = await Room.findOne({ code: roomCode, isActive: true });
        if (!room || room.status !== 'playing') return;

        const activePlayers = room.players.filter(p => !p.isFolded && p.isActive);
        if (activePlayers.length !== 2) return socket.emit('error', { message: 'Show only allowed with 2 players' });

        const player = room.players[room.currentTurnIndex];
        if (player.userId.toString() !== socket.user.id) return;

        // Paying for Show
        const amount = player.isSeen ? 2 * room.currentStake : room.currentStake;
        player.chips -= amount;
        player.totalBetThisRound += amount;
        room.pot += amount;

        room.status = 'show'; // Move to SHOW state for Admin selection
        await room.save();
        io.to(roomCode).emit('roomUpdate', { room });
        io.to(roomCode).emit('notification', { message: 'Show triggered! Admin must pick winner.', type: 'warning' });
      } catch (err) {}
    });

    // SIDESHOW REQUEST
    socket.on('requestSideshow', async ({ roomCode }) => {
      try {
        const room = await Room.findOne({ code: roomCode, isActive: true });
        if (!room || room.status !== 'playing') return;

        const playerIndex = room.currentTurnIndex;
        const requester = room.players[playerIndex];
        if (requester.userId.toString() !== socket.user.id) return;
        if (!requester.isSeen) return socket.emit('error', { message: 'Only "Seen" players can request sideshow' });

        // Find previous active player
        let prevIndex = (playerIndex - 1 + room.players.length) % room.players.length;
        while (room.players[prevIndex].isFolded || !room.players[prevIndex].isActive) {
          prevIndex = (prevIndex - 1 + room.players.length) % room.players.length;
          if (prevIndex === playerIndex) break;
        }

        const target = room.players[prevIndex];
        const amount = 2 * room.currentStake; // Always pays the "Seen" bet amount

        if (requester.chips < amount) return socket.emit('error', { message: 'Not enough chips for sideshow' });

        requester.chips -= amount;
        requester.totalBetThisRound += amount;
        room.pot += amount;

        // Emit request to the target player
        io.to(roomCode).emit('sideshowRequested', {
          from: requester.username,
          fromId: requester.userId.toString(),
          toId: target.userId.toString(),
          amount
        });

        await room.save();
        io.to(roomCode).emit('roomUpdate', { room });
      } catch (err) {}
    });

    // SIDESHOW RESPONSE
    socket.on('respondSideshow', async ({ roomCode, accepted, requesterId }) => {
      try {
        const room = await Room.findOne({ code: roomCode, isActive: true });
        if (!room) return;

        const target = room.players.find(p => p.userId.toString() === socket.user.id);
        const requester = room.players.find(p => p.userId.toString() === requesterId);

        if (accepted) {
          io.to(roomCode).emit('notification', { 
            message: `🤝 ${target.username} accepted ${requester.username}'s sideshow! Compare cards IRL and the loser must fold.`,
            type: 'warning'
          });
        } else {
          io.to(roomCode).emit('notification', { 
            message: `🚫 ${target.username} denied the sideshow.`,
            type: 'info'
          });
          advanceTurn(room); // Turn only advances if denied or after fold
          await room.save();
          io.to(roomCode).emit('roomUpdate', { room });
        }
      } catch (err) {}
    });

    // ADMIN: Declare Winner
    socket.on('declareWinner', async ({ roomCode, winnerId }) => {
      try {
        const room = await Room.findOne({ code: roomCode, isActive: true });
        if (!room || room.adminId.toString() !== socket.user.id) return;

        const winner = room.players.find(p => p.userId.toString() === winnerId);
        const pot = room.pot;
        winner.chips += pot;

        // Save History
        await saveRoundHistory(room, winner);

        // Move to Round End
        room.status = 'roundEnd';
        room.pot = 0;
        room.dealerIndex = (room.dealerIndex + 1) % room.players.length; // Rotate dealer

        await room.save();
        io.to(roomCode).emit('roomUpdate', { room });
        io.to(roomCode).emit('roundWinner', { winner: winner.username, pot });
      } catch (err) {}
    });

    // QUICK REACTIONS
    socket.on('sendReaction', ({ roomCode, emoji }) => {
      io.to(roomCode).emit('reactionReceived', {
        username: socket.user.username,
        emoji,
        id: Date.now()
      });
    });

    // END SESSION
    socket.on('endSession', async ({ roomCode }) => {
      try {
        const room = await Room.findOne({ code: roomCode, isActive: true });
        if (!room || room.adminId.toString() !== socket.user.id) return;

        const summary = room.players.map(p => ({
          username: p.username,
          profit: p.chips - p.startingChips,
          finalChips: p.chips
        }));

        io.to(roomCode).emit('sessionEnded', { summary });
      } catch (err) {}
    });

    socket.on('disconnect', async () => {
      if (socket.roomCode) {
        const room = await Room.findOne({ code: socket.roomCode, isActive: true });
        if (room) {
          const p = room.players.find(p => p.userId.toString() === socket.user.id);
          if (p) { p.isConnected = false; await room.save(); io.to(socket.roomCode).emit('roomUpdate', { room }); }
        }
      }
    });
  });

  function advanceTurn(room) {
    let next = room.currentTurnIndex;
    let count = 0;
    do {
      next = (next + 1) % room.players.length;
      count++;
    } while (room.players[next].isFolded && count < room.players.length);
    room.currentTurnIndex = next;
  }

  function handleAutoWin(room, winner) {
    winner.chips += room.pot;
    saveRoundHistory(room, winner);
    room.status = 'roundEnd';
    room.pot = 0;
    room.dealerIndex = (room.dealerIndex + 1) % room.players.length;
  }

  async function saveRoundHistory(room, winner) {
    const round = new Round({
      roomId: room._id, roomCode: room.code, roundNumber: room.roundNumber,
      players: room.players.filter(p => p.isActive).map(p => ({
        userId: p.userId, username: p.username, avatar: p.avatar,
        betAmount: p.totalBetThisRound, folded: p.isFolded
      })),
      pot: room.pot, winnerId: winner.userId, winnerUsername: winner.username
    });
    await round.save();
  }
};
