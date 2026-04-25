import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);
const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export function SocketProvider({ children }) {
  const { token } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const notifId = useRef(0);

  useEffect(() => {
    if (!token) { setSocket(null); setConnected(false); return; }

    const s = io(API, { auth: { token }, reconnection: true, reconnectionDelay: 1000 });

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('notification', (data) => {
      const id = ++notifId.current;
      setNotifications(prev => [...prev, { ...data, id }]);
      setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);
    });
    s.on('error', (data) => {
      const id = ++notifId.current;
      setNotifications(prev => [...prev, { message: data.message, type: 'error', id }]);
      setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);
    });

    setSocket(s);
    return () => { s.disconnect(); };
  }, [token]);

  const addNotification = (message, type = 'info') => {
    const id = ++notifId.current;
    setNotifications(prev => [...prev, { message, type, id }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);
  };

  return (
    <SocketContext.Provider value={{ socket, connected, notifications, addNotification }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
export { API };
