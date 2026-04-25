import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API } from '../context/SocketContext';

export default function Lobby() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [roomName, setRoomName] = useState('');
  const [defaultChips, setDefaultChips] = useState(1000);
  const [minBet, setMinBet] = useState(10);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const createRoom = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch(`${API}/api/rooms/create`, {
        method: 'POST', headers,
        body: JSON.stringify({ name: roomName || `${user.username}'s Game`, defaultChips, minBet })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      navigate(`/room/${data.room.code}`);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const joinRoom = async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setError(''); setLoading(true);
    try {
      const res = await fetch(`${API}/api/rooms/join`, {
        method: 'POST', headers,
        body: JSON.stringify({ code: joinCode.toUpperCase() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      navigate(`/room/${data.room.code}`);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="container page-enter">
      <div className="header" style={{ marginBottom: 24, borderRadius: 'var(--radius-lg)', position: 'relative' }}>
        <div className="header-title">🃏 Teen Patti</div>
        <div className="header-actions">
          <span className="badge badge-accent">{user?.avatar} {user?.username}</span>
          <button className="btn btn-secondary btn-sm" onClick={logout}>Logout</button>
        </div>
      </div>

      {/* Join Room */}
      <div className="card mb-2">
        <h2 style={{ fontSize: '1.1rem', marginBottom: 12 }}>🚪 Join a Room</h2>
        <form className="join-form" onSubmit={joinRoom}>
          <input id="join-code-input" placeholder="Enter room code" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} maxLength={6} />
          <button id="join-room-btn" className="btn btn-primary" type="submit" disabled={loading}>Join</button>
        </form>
      </div>

      {/* Create Room */}
      <div className="card">
        <div className="flex items-center justify-between" style={{ marginBottom: showCreate ? 16 : 0 }}>
          <h2 style={{ fontSize: '1.1rem' }}>🎮 Create a Room</h2>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? 'Cancel' : 'New Game'}
          </button>
        </div>
        {showCreate && (
          <form className="flex flex-col gap-1" onSubmit={createRoom}>
            <input id="room-name-input" placeholder="Room name (optional)" value={roomName} onChange={e => setRoomName(e.target.value)} />
            <div className="flex gap-1">
              <div style={{ flex: 1 }}>
                <label className="text-sm text-muted">Starting Chips</label>
                <input id="default-chips-input" type="number" value={defaultChips} onChange={e => setDefaultChips(Number(e.target.value))} min={100} step={100} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="text-sm text-muted">Min Bet</label>
                <input id="min-bet-input" type="number" value={minBet} onChange={e => setMinBet(Number(e.target.value))} min={1} />
              </div>
            </div>
            <button id="create-room-btn" className="btn btn-green btn-full mt-1" type="submit" disabled={loading}>
              Create Room
            </button>
          </form>
        )}
      </div>

      {error && <p className="mt-2" style={{ color: 'var(--red)', fontSize: '0.85rem', textAlign: 'center' }}>{error}</p>}
    </div>
  );
}
