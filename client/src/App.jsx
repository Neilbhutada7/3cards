import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider, useSocket } from './context/SocketContext';
import Login from './pages/Login';
import Lobby from './pages/Lobby';
import GameRoom from './pages/GameRoom';

function Toasts() {
  const { notifications } = useSocket();
  if (!notifications.length) return null;
  return (
    <div className="toast-container">
      {notifications.map(n => (
        <div key={n.id} className={`toast toast-${n.type || 'info'}`}>{n.message}</div>
      ))}
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? children : <Navigate to="/" replace />;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return null;

  return (
    <>
      <Toasts />
      <Routes>
        <Route path="/" element={user ? <Navigate to="/lobby" replace /> : <Login />} />
        <Route path="/lobby" element={<ProtectedRoute><Lobby /></ProtectedRoute>} />
        <Route path="/room/:code" element={<ProtectedRoute><GameRoom /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <AppRoutes />
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
