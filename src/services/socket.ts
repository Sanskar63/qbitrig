/**
 * Socket.IO service for Qbit City multiplayer
 */

import { io, Socket } from 'socket.io-client';

const SOCKET_URL = 'https://qbit-socket.onrender.com';

class SocketService {
  private socket: Socket | null = null;
  private connected = false;

  connect() {
    if (this.socket && this.socket.connected) {
      return this.socket;
    }

    if (this.socket && !this.socket.connected) {
      this.socket.connect();
      return this.socket;
    }

    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket?.id);
      this.connected = true;
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
      this.connected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  getSocket() {
    if (!this.socket) {
      this.connect();
    }
    return this.socket;
  }

  isConnected() {
    return this.connected && this.socket !== null;
  }

  // Room Management
  createRoom(name?: string, maxPlayers?: number) {
    this.socket?.emit('create_room', { name, maxPlayers });
  }

  joinRoom(roomCode: string, playerName: string) {
    this.socket?.emit('join_room', { roomCode, playerName });
  }

  leaveRoom() {
    this.socket?.emit('leave_room');
  }

  // Game Actions
  startGame() {
    this.socket?.emit('start_game');
  }

  sendPlayerInput(keys: Record<string, boolean>) {
    this.socket?.emit('player_input', {
      keys,
      timestamp: Date.now()
    });
  }

  usePortal() {
    this.socket?.emit('use_portal');
  }

  deploySink() {
    this.socket?.emit('deploy_sink');
  }

  activateImmunity() {
    this.socket?.emit('activate_immunity');
  }

  respawn() {
    this.socket?.emit('respawn_player');
  }

  getGameState() {
    this.socket?.emit('get_game_state');
  }

  // Event Listeners
  on(event: string, callback: (...args: any[]) => void) {
    this.socket?.on(event, callback);
  }

  off(event: string, callback?: (...args: any[]) => void) {
    this.socket?.off(event, callback);
  }
}

export const socketService = new SocketService();
