import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:5000';

let socket = null;
let currentToken = null;
const joinedRooms = new Set();

export const getSocket = (token) => {
    if (token && token !== currentToken) {
        if (socket) {
            console.log('🔌 Token changed. Reconnecting socket...');
            socket.disconnect();
            socket = null;
            joinedRooms.clear();
        }
        currentToken = token;
    }

    if (!socket && token) {
        socket = io(SOCKET_URL, {
            auth: { token },
            transports: ['websocket', 'polling'],
            withCredentials: true
        });

        socket.on('connect', () => {
            console.log('🔌 Connected to socket server');
            // Rejoin all active rooms on connection / reconnection
            joinedRooms.forEach((room) => {
                socket.emit('join', room);
                console.log(`🔌 Rejoined room: ${room}`);
            });
        });

        socket.on('disconnect', () => {
            console.log('🔌 Disconnected from socket server');
        });

        socket.on('error', (err) => {
            console.error('🔌 Socket error:', err);
        });
    }
    return socket;
};

export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect();
        socket = null;
        currentToken = null;
        joinedRooms.clear();
    }
};

export const joinRoom = (room) => {
    const roomStr = String(room || '').trim();
    if (!roomStr) return;
    joinedRooms.add(roomStr);
    if (socket) {
        socket.emit('join', roomStr);
        console.log(`🔌 Joined room: ${roomStr}`);
    }
};

export const leaveRoom = (room) => {
    const roomStr = String(room || '').trim();
    if (!roomStr) return;
    joinedRooms.delete(roomStr);
    if (socket) {
        socket.emit('leave', roomStr);
        console.log(`🔌 Left room: ${roomStr}`);
    }
};
