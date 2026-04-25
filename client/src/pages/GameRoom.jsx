import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket, API } from '../context/SocketContext';

export default function GameRoom() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { socket, addNotification } = useSocket();
  const [room, setRoom] = useState(null);
  const [betAmount, setBetAmount] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [winner, setWinner] = useState(null);
  const [lastAction, setLastAction] = useState(null);
  const [chipsFlying, setChipsFlying] = useState([]);
  const [sideshowRequest, setSideshowRequest] = useState(null);
  const [activeReactions, setActiveReactions] = useState([]);
  const [sessionSummary, setSessionSummary] = useState(null);

  // Better, more realistic sounds
  const sounds = useMemo(() => ({
    chip: new Audio('https://www.soundjay.com/buttons/sounds/button-16.mp3'), // Crisp chip clink
    win: new Audio('https://www.myinstants.com/media/sounds/ta-da.mp3'),
    start: new Audio('https://www.soundjay.com/misc/sounds/shuffling-cards-1.mp3') // Card shuffle
  }), []);

  const playSound = (name) => {
    const s = sounds[name];
    if (s) { s.currentTime = 0; s.volume = 0.5; s.play().catch(() => {}); }
  };


  const isAdmin = room && user && String(room.adminId) === String(user.id);
  const me = room?.players?.find(p => String(p.userId) === String(user?.id));
  const isMyTurn = room?.status === 'playing' && room?.currentTurnIndex >= 0 &&
    String(room?.players?.[room.currentTurnIndex]?.userId) === String(user?.id);

  // Reorder players so "Me" is at Seat 0
  const orderedPlayers = useMemo(() => {
    if (!room?.players || !user) return [];
    const players = room.players.filter(p => p.isActive);
    const myIndex = players.findIndex(p => String(p.userId) === String(user.id));
    if (myIndex === -1) return players;
    return [...players.slice(myIndex), ...players.slice(0, myIndex)];
  }, [room?.players, user?.id]);


  useEffect(() => {
    if (!socket || !code) return;
    socket.emit('joinRoom', { roomCode: code });
    socket.on('roomUpdate', (data) => {
      if (room?.status === 'waiting' && data.room.status === 'playing') playSound('start');
      setRoom(data.room);
    });
    socket.on('roundWinner', (data) => { 
      playSound('win');
      setWinner(data); 
      setTimeout(() => setWinner(null), 5000); 
    });
    socket.on('sideshowRequested', (data) => {
      if (data.toId === user?.id) setSideshowRequest(data);
    });
    socket.on('reactionReceived', (data) => {
      setActiveReactions(prev => [...prev, data]);
      setTimeout(() => setActiveReactions(prev => prev.filter(r => r.id !== data.id)), 2000);
    });
    socket.on('sessionEnded', (data) => {
      setSessionSummary(data.summary);
    });
    socket.on('betPlaced', (data) => {
      if (data.action !== 'fold') playSound('chip');
      setLastAction(data);
      if (data.action !== 'fold') triggerChipAnimation(data.username);
      setTimeout(() => setLastAction(null), 2000);
    });
    return () => {
      socket.emit('leaveRoom', { roomCode: code });
      socket.off('roomUpdate'); 
      socket.off('roundWinner'); 
      socket.off('betPlaced'); 
      socket.off('sideshowRequested'); 
      socket.off('reactionReceived'); 
      socket.off('sessionEnded');
      socket.off('notification');
    };
  }, [socket, code, user?.id]);

  const handleEndSession = () => {
    if (window.confirm('Are you sure you want to end the session? This will show the final P/L for everyone.')) {
      emit('endSession');
    }
  };

  const handleReaction = (emoji) => emit('sendReaction', { emoji });

  useEffect(() => {
    if (!token || !code) return;
    fetch(`${API}/api/rooms/${code}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d.room) setRoom(d.room); });
  }, [token, code]);

  const triggerChipAnimation = (username) => {
    const id = Date.now();
    setChipsFlying(prev => [...prev, { id, username }]);
    setTimeout(() => setChipsFlying(prev => prev.filter(c => c.id !== id)), 600);
  };

  const emit = (event, data = {}) => socket?.emit(event, { roomCode: code, ...data });
  
  const handleSideshowResponse = (accepted) => {
    emit('respondSideshow', { accepted, requesterId: sideshowRequest.fromId });
    setSideshowRequest(null);
  };

  const handleRequestSideshow = () => {
    setIsWaitingSideshow(true);
    emit('requestSideshow');
  };

  const currentStake = room?.currentStake || 0;
  const requiredBet = me?.isSeen ? 2 * currentStake : currentStake;
  const maxRaise = me?.isSeen ? 4 * currentStake : 2 * currentStake;

  const handleCall = () => emit('call');
  const handleRaise = () => {
    const amt = parseInt(betAmount);
    if (!amt || amt <= requiredBet || amt > maxRaise) return addNotification(`Range: ${requiredBet+1}-${maxRaise}`, 'error');
    emit('raise', { amount: amt });
    setBetAmount('');
  };
  const handleFold = () => emit('fold');
  const handleSee = () => emit('seeCards');
  const handleShow = () => emit('show');

  if (!room) return <div className="container text-center mt-3">🃏 Loading...</div>;

  const activeInRound = room.players.filter(p => !p.isFolded && p.isActive);

  return (
    <div className="page-enter" style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="header">
        <div className="header-title">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/lobby')}>←</button>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '1rem' }}>{room.name}</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--gold)', letterSpacing: '1px' }}>ID: {code}</span>
          </div>
        </div>
        <div className="header-actions">
          <span className="badge badge-accent">Stake: {currentStake}</span>
          {isAdmin && (
            <button className="btn btn-red btn-sm" onClick={handleEndSession}>End Session</button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => setShowHistory(true)}>📜</button>
        </div>
      </div>

      <div className="table-container">
        <div className="poker-table">
          <div className="table-felt"></div>
          
          <div className="pot-badge-center">
            <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>TOTAL POT</div>
            <div style={{ fontSize: '1.4rem' }}>💰 {room.pot}</div>
          </div>

          {orderedPlayers.map((p, i) => {
            const isTurn = room.currentTurnIndex >= 0 && room.players[room.currentTurnIndex]?.userId === p.userId;
            const seatClass = `seat-${i}`;
            
            return (
              <div key={p.userId} className={`seat ${seatClass} ${isTurn ? 'is-turn' : ''} ${p.isFolded ? 'is-folded' : ''}`}>
                <div className="player-avatar-circle">
                  {p.avatar}
                  {String(p.userId) === String(room.adminId) && <span style={{ position: 'absolute', top: -10, right: -10, fontSize: '1rem' }}>👑</span>}
                  {room.players[room.dealerIndex] && String(room.players[room.dealerIndex].userId) === String(p.userId) && <div className="dealer-puck">D</div>}
                  
                  {/* Floating Reactions */}
                  {activeReactions.filter(r => r.username === p.username).map(r => (
                    <div key={r.id} className="floating-emoji">{r.emoji}</div>
                  ))}
                </div>
                <div className="player-badge-info">
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.username} {p.isSeen ? '👁️' : '🙈'}
                    {String(p.userId) === String(user?.id) && <span style={{ color: 'var(--accent)', marginLeft: '4px' }}>•</span>}
                  </div>
                  <div style={{ color: 'var(--gold)', fontSize: '0.85rem', fontWeight: 800 }}>{p.chips}</div>
                </div>

                {chipsFlying.some(c => c.username === p.username) && (
                  <div className="chip-animation flying-chip"></div>
                )}
                
                {isAdmin && (room.status === 'playing' || room.status === 'show') && !p.isFolded && (
                  <button className="btn btn-yellow btn-sm" style={{ position: 'absolute', bottom: -25, fontSize: '0.6rem', padding: '2px 6px' }} 
                    onClick={() => emit('declareWinner', { winnerId: p.userId })}>WIN</button>
                )}

              </div>
            );
          })}
        </div>
      </div>

      {sideshowRequest && (
        <div className="modal-overlay">
          <div className="modal card text-center">
            <h3>🤝 Sideshow Request</h3>
            <p><strong>{sideshowRequest.from}</strong> wants a sideshow for <strong>{sideshowRequest.amount}</strong> chips.</p>
            <div className="flex gap-1 mt-2">
              <button className="btn btn-green btn-full" onClick={() => handleSideshowResponse(true)}>Accept</button>
              <button className="btn btn-red btn-full" onClick={() => handleSideshowResponse(false)}>Deny</button>
            </div>
          </div>
        </div>
      )}

      {lastAction && (
        <div style={{ position: 'absolute', top: '15%', width: '100%', textAlign: 'center', pointerEvents: 'none', animation: 'fadeUp 0.3s ease-out' }}>
          <span className="badge badge-accent" style={{ fontSize: '1rem', padding: '8px 16px' }}>
            {lastAction.username} {lastAction.action === 'fold' ? 'Folded' : `${lastAction.action}: ${lastAction.amount}`}
          </span>
        </div>
      )}

      {/* Session Summary Modal */}
      {sessionSummary && (
        <div className="modal-overlay">
          <div className="modal card" style={{ maxWidth: '400px' }}>
            <h3 className="text-center">📅 Session Summary</h3>
            <div className="flex flex-col gap-1 mt-2">
              {sessionSummary.sort((a,b) => b.profit - a.profit).map((s, i) => (
                <div key={i} className="flex justify-between items-center p-1 border-bottom" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{i === 0 ? '👑 ' : ''}{s.username}</div>
                    <div className="text-sm text-muted">Final: {s.finalChips}</div>
                  </div>
                  <div style={{ 
                    fontWeight: 800, 
                    color: s.profit >= 0 ? 'var(--green)' : 'var(--red)' 
                  }}>
                    {s.profit >= 0 ? '+' : ''}{s.profit}
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn-primary btn-full mt-3" onClick={() => setSessionSummary(null)}>Close</button>
            <p className="text-sm text-muted text-center mt-2">Screenshot this for the group!</p>
          </div>
        </div>
      )}

      {/* Winner Overlay */}
      {winner && (
        <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.8)' }}>
          <div className="text-center" style={{ animation: 'popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
            <div style={{ fontSize: '4rem' }}>🏆</div>
            <h2 style={{ color: 'var(--gold)', fontSize: '2rem', marginBottom: '10px' }}>{winner.winner} WINS!</h2>
            <div style={{ fontSize: '1.5rem' }}>💰 {winner.pot} chips</div>
          </div>
        </div>
      )}

      <div className="betting-controls glass">
        {/* Quick Reactions Bar */}
        <div className="reaction-bar">
          {['😂', '🔥', '🤨', '🤡', '💸', '👑'].map(emoji => (
            <button key={emoji} className="reaction-btn" onClick={() => handleReaction(emoji)}>{emoji}</button>
          ))}
        </div>

        {isMyTurn ? (
          <>
            <div className="bet-quick-amounts">
              <button onClick={handleSee} disabled={me.isSeen}>👁️ See Cards</button>
              {me.isSeen && activeInRound.length > 2 && (
                <button onClick={handleRequestSideshow} disabled={isWaitingSideshow}>
                  {isWaitingSideshow ? '⏳ Waiting...' : '🤝 Sideshow'} ({requiredBet})
                </button>
              )}
              {activeInRound.length === 2 && (
                <button className="btn-yellow" onClick={handleShow}>🤝 Show ({requiredBet})</button>
              )}
            </div>
            <div className="bet-input-row mt-1">
              <input type="number" placeholder={`Raise (max ${maxRaise})`} value={betAmount} onChange={e => setBetAmount(e.target.value)} />
            </div>
            <div className="bet-actions">
              <button className="btn btn-primary" onClick={handleCall}>
                {me.isSeen ? '📞 Seen' : '🙈 Blind'} ({requiredBet})
              </button>
              <button className="btn btn-yellow" onClick={handleRaise} disabled={!betAmount}>Raise</button>
              <button className="btn btn-red" onClick={handleFold}>Fold</button>
            </div>
          </>
        ) : (
          <div className="text-center p-1">
            {room.status === 'playing' ? (
              <p className="text-muted">Waiting for turn...</p>
            ) : isAdmin ? (
              <button className="btn btn-green btn-full" onClick={() => emit('startRound')}>
                {room.status === 'waiting' ? 'Start Game' : 'Next Round'}
              </button>
            ) : (
              <p className="text-muted">Waiting for admin...</p>
            )}
          </div>
        )}
      </div>

      {showHistory && (
        <div className="modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-2">
              <h3>📜 History</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowHistory(false)}>✕</button>
            </div>
            {/* Round History list here... */}
            <p className="text-sm text-muted">Recent rounds will appear here.</p>
          </div>
        </div>
      )}
    </div>
  );
}
