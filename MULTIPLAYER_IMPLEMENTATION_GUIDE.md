# Multiplayer Implementation Guide - Qbit City

## Quick Start: Socket.IO Integration

### Step 1: Install Dependencies

```bash
cd qbitrig
npm install socket.io-client
```

### Step 2: Create Socket Service

Create `src/services/socket.ts`:

```typescript
import { io, Socket } from 'socket.io-client';

class SocketService {
  private socket: Socket | null = null;
  private isConnected = false;

  connect(serverUrl: string = 'http://localhost:3001') {
    this.socket = io(serverUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      this.isConnected = true;
      console.log('Connected to game server');
    });

    this.socket.on('disconnect', () => {
      this.isConnected = false;
      console.log('Disconnected from game server');
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  getSocket() {
    return this.socket;
  }

  // Game events
  joinRoom(roomCode: string, playerName: string) {
    this.socket?.emit('join_room', { roomCode, playerName });
  }

  sendPlayerInput(keys: Record<string, boolean>) {
    this.socket?.emit('player_input', {
      keys,
      timestamp: Date.now()
    });
  }

  usePortal() {
    this.socket?.emit('use_portal', { timestamp: Date.now() });
  }

  deploySink(x: number, y: number) {
    this.socket?.emit('deploy_sink', { x, y, timestamp: Date.now() });
  }

  activateImmunity() {
    this.socket?.emit('activate_immunity', { timestamp: Date.now() });
  }
}

export const socketService = new SocketService();
```

### Step 3: Modify Game.tsx for Multiplayer

Key changes needed in `Game.tsx`:

#### 3.1 Add Socket Integration

```typescript
import { socketService } from '@/services/socket';
import { useEffect, useRef } from 'react';

// In Game component:
useEffect(() => {
  const socket = socketService.connect();
  
  // Listen for game state updates
  socket.on('game_state', (state: GameState) => {
    // Update gameRef.current with server state
    if (gameRef.current) {
      // Merge server state with local state
      mergeGameState(gameRef.current, state);
    }
  });

  // Listen for player spawn
  socket.on('player_spawned', ({ playerId, x, y }) => {
    if (playerId === socket.id) {
      // This is our player
      gameRef.current!.player.x = x;
      gameRef.current!.player.y = y;
    } else {
      // Other player joined
      // Add to remotePlayers array
    }
  });

  // Listen for collectible updates
  socket.on('collectible_collected', ({ type, id }) => {
    // Remove from local state
    if (type === 'coin') {
      gameRef.current!.coins = gameRef.current!.coins.filter(c => c.id !== id);
    }
    // ... etc
  });

  return () => {
    socketService.disconnect();
  };
}, []);
```

#### 3.2 Send Input to Server

Replace the input handling:

```typescript
// In update() function, after processing keys:
if (game.isPlaying && socketService.getSocket()) {
  socketService.sendPlayerInput({
    ArrowUp: game.keys['ArrowUp'] || game.keys['KeyW'],
    ArrowDown: game.keys['ArrowDown'] || game.keys['KeyS'],
    ArrowLeft: game.keys['ArrowLeft'] || game.keys['KeyA'],
    ArrowRight: game.keys['ArrowRight'] || game.keys['KeyD']
  });
}
```

#### 3.3 Remove Client-Side Game Logic

Move these functions to server:
- Enemy AI (`update()` enemy loop)
- Enemy spawning
- Collectible spawning
- Collision detection (server validates)
- Portal creation validation
- Immunity activation validation

Keep on client:
- Rendering
- Input handling (send to server)
- Camera following
- UI updates

### Step 4: Backend Server Structure

Create backend server (Node.js + Express + Socket.IO):

```
backend/
├── server.js              # Main server entry
├── config/
│   └── constants.js       # Game constants
├── services/
│   ├── RoomManager.js     # Room management
│   ├── GameStateManager.js # Game state authority
│   └── GameLoop.js        # Server game loop
├── handlers/
│   ├── roomHandlers.js    # Room join/leave
│   └── gameHandlers.js    # Game events
└── utils/
    └── collision.js       # Collision detection
```

### Step 5: Server Game Loop

```javascript
// backend/services/GameLoop.js
class GameLoop {
  constructor(io) {
    this.io = io;
    this.tickRate = 20; // 20 ticks/second
    this.tickInterval = null;
  }

  start() {
    this.tickInterval = setInterval(() => {
      this.tick();
    }, 1000 / this.tickRate);
  }

  tick() {
    const deltaTime = 1 / this.tickRate;
    
    // Update all active rooms
    gameStateManager.getAllRooms().forEach(room => {
      if (room.isPlaying) {
        this.updateRoom(room, deltaTime);
        this.broadcastState(room);
      }
    });
  }

  updateRoom(room, deltaTime) {
    // Update players (apply buffered inputs)
    room.players.forEach(player => {
      this.applyPlayerInput(player, deltaTime);
      this.checkPlayerCollisions(player, room);
    });

    // Update enemies
    room.enemies.forEach(enemy => {
      this.updateEnemyAI(enemy, room, deltaTime);
    });

    // Update collectibles
    this.updateCollectibles(room, deltaTime);

    // Update boats
    this.updateBoats(room, deltaTime);

    // Spawn logic
    room.gameTime += deltaTime;
    this.handleSpawning(room, deltaTime);
  }

  broadcastState(room) {
    const state = {
      players: room.players.map(p => ({
        id: p.id,
        x: p.x,
        y: p.y,
        dirX: p.dirX,
        dirY: p.dirY,
        // ... other visible state
      })),
      enemies: room.enemies,
      collectibles: room.collectibles,
      gameTime: room.gameTime,
      timestamp: Date.now()
    };

    this.io.to(room.code).emit('game_state', state);
  }
}
```

### Step 6: Input Buffering

Server needs to buffer inputs to handle network latency:

```javascript
// backend/services/GameStateManager.js
class GameStateManager {
  applyPlayerInput(playerId, input, timestamp) {
    const player = this.getPlayer(playerId);
    if (!player) return;

    // Buffer input with timestamp
    player.inputBuffer.push({
      keys: input.keys,
      timestamp,
      processed: false
    });

    // Sort by timestamp
    player.inputBuffer.sort((a, b) => a.timestamp - b.timestamp);
  }

  processBufferedInputs(player, deltaTime, currentTime) {
    // Process inputs in order, up to current time
    player.inputBuffer.forEach(input => {
      if (!input.processed && input.timestamp <= currentTime) {
        this.applyInputToPlayer(player, input.keys, deltaTime);
        input.processed = true;
      }
    });

    // Remove old processed inputs
    player.inputBuffer = player.inputBuffer.filter(
      input => !input.processed || (currentTime - input.timestamp < 1000)
    );
  }
}
```

### Step 7: Client-Side Prediction

To reduce perceived latency, predict movement locally:

```typescript
// In Game.tsx
const predictedPlayer = useRef({ ...gameRef.current.player });
const lastServerState = useRef<GameState | null>(null);

// Apply input immediately (prediction)
const handleInput = (keys: KeyState, deltaTime: number) => {
  // Predict locally
  const predicted = predictedPlayer.current;
  const dx = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
  const dy = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0);
  
  if (dx !== 0 || dy !== 0) {
    const length = Math.sqrt(dx * dx + dy * dy);
    predicted.x += (dx / length) * predicted.speed * deltaTime;
    predicted.y += (dy / length) * predicted.speed * deltaTime;
  }

  // Render predicted position
  drawPlayer(predicted.x, predicted.y);
};

// When server state arrives, reconcile
socket.on('game_state', (serverState) => {
  const serverPlayer = serverState.players.find(p => p.id === socket.id);
  if (serverPlayer) {
    const distance = Math.hypot(
      predictedPlayer.current.x - serverPlayer.x,
      predictedPlayer.current.y - serverPlayer.y
    );

    // If prediction is too far off, correct it
    if (distance > 50) {
      predictedPlayer.current.x = serverPlayer.x;
      predictedPlayer.current.y = serverPlayer.y;
      // Re-apply any unprocessed inputs
    } else {
      // Smoothly interpolate
      predictedPlayer.current.x = lerp(predictedPlayer.current.x, serverPlayer.x, 0.2);
      predictedPlayer.current.y = lerp(predictedPlayer.current.y, serverPlayer.y, 0.2);
    }
  }

  lastServerState.current = serverState;
});
```

### Step 8: Entity Interpolation

For smooth rendering of other entities:

```typescript
interface EntitySnapshot {
  x: number;
  y: number;
  timestamp: number;
}

const entityHistory = new Map<string, EntitySnapshot[]>();

socket.on('game_state', (state) => {
  const now = Date.now();
  
  // Store snapshots
  state.enemies.forEach(enemy => {
    if (!entityHistory.has(enemy.id)) {
      entityHistory.set(enemy.id, []);
    }
    const history = entityHistory.get(enemy.id)!;
    history.push({ ...enemy, timestamp: now });
    
    // Keep last 2 snapshots
    if (history.length > 2) history.shift();
  });
});

// In render loop
const renderEntity = (entity: Enemy) => {
  const history = entityHistory.get(entity.id);
  if (!history || history.length < 2) {
    // Not enough data, render as-is
    drawEnemy(entity.x, entity.y);
    return;
  }

  const [prev, current] = history;
  const now = Date.now();
  const timeSinceCurrent = now - current.timestamp;
  const timeBetween = current.timestamp - prev.timestamp;
  
  if (timeBetween > 0) {
    const alpha = Math.min(1, timeSinceCurrent / timeBetween);
    const x = lerp(prev.x, current.x, alpha);
    const y = lerp(prev.y, current.y, alpha);
    drawEnemy(x, y);
  } else {
    drawEnemy(current.x, current.y);
  }
};
```

### Step 9: Room Management UI

Add room creation/joining UI:

```typescript
// src/pages/Game.tsx - Add before game starts
const [roomCode, setRoomCode] = useState('');
const [isHost, setIsHost] = useState(false);

const createRoom = () => {
  socketService.getSocket()?.emit('create_room', { playerName });
  setIsHost(true);
};

const joinRoom = (code: string) => {
  socketService.getSocket()?.emit('join_room', { roomCode: code, playerName });
  setRoomCode(code);
};

// Listen for room events
useEffect(() => {
  const socket = socketService.getSocket();
  if (!socket) return;

  socket.on('room_created', ({ roomCode }) => {
    setRoomCode(roomCode);
  });

  socket.on('room_joined', ({ roomCode, players }) => {
    setRoomCode(roomCode);
    // Show player list
  });

  socket.on('game_started', ({ gameState }) => {
    // Initialize game with server state
    initializeGameFromState(gameState);
    setGameState('playing');
  });
}, []);
```

### Step 10: Testing Checklist

- [ ] Server starts and accepts connections
- [ ] Room creation/joining works
- [ ] Player input sent to server
- [ ] Server broadcasts game state
- [ ] Client renders server state
- [ ] Multiple players can join same room
- [ ] Players see each other move
- [ ] Collectibles sync across clients
- [ ] Enemies sync across clients
- [ ] Collision detection works server-side
- [ ] Disconnection handled gracefully
- [ ] Lag compensation works (client prediction)

### Performance Targets

- **Server Tick Rate**: 20-30 Hz (sufficient for this game)
- **Client Update Rate**: 60 Hz (rendering)
- **State Broadcast**: Every server tick (20-30 times/second)
- **Bandwidth per Player**: ~5-10 KB/s
- **Latency**: <100ms is ideal, <200ms acceptable

### Next Steps

1. Set up basic Socket.IO server
2. Implement room management
3. Move enemy AI to server
4. Implement state synchronization
5. Add client-side prediction
6. Test with 2+ clients
7. Optimize bandwidth usage
8. Add reconnection handling

---

For detailed architecture, see `TECHNICAL_OVERVIEW.md`.
