# Qbit City Multiplayer Setup Guide

## Backend Setup

1. **Install dependencies:**
```bash
cd ../backend  # From qbitrig directory, or cd /Users/sans/Game/backend
npm install
```

2. **Start the server:**
```bash
npm run dev  # Development mode with nodemon
# or
npm start    # Production mode
```

The server will run on port 3001 (configurable in `backend/config/constants.js`).

## Frontend Setup

1. **Add environment variable:**
Create a `.env` file in the `qbitrig` root:
```
VITE_SOCKET_URL=http://localhost:3001
```

2. **Install socket.io-client (if not already installed):**
```bash
cd qbitrig
npm install socket.io-client
```

3. **Start the frontend:**
```bash
npm run dev
```

## Architecture Overview

### Server-Side (Authoritative)
- **Game Loop**: Runs at 20 Hz, updates all game entities
- **Game State Manager**: Maintains authoritative game state per room
- **Room Manager**: Handles room creation, joining, leaving
- **Game Handlers**: Process player inputs, actions (portal, sink, immunity)

### Client-Side (Rendering + Input)
- **Socket Service**: Manages connection and emits inputs/actions
- **Game Component**: Renders server state, sends inputs, handles UI
- **Client Prediction**: Optional - can predict player movement locally

## Key Changes Needed in Game.tsx

1. **Add room management UI** before game starts
2. **Connect to socket** on component mount
3. **Replace game loop** - receive state from server instead of calculating locally
4. **Send player input** to server on every frame
5. **Render server state** - enemies, collectibles, other players come from server
6. **Handle game events** - death, collectible pickup, etc. from server

## Integration Steps

### Step 1: Add Room UI
Add room creation/joining UI in the name-entry screen.

### Step 2: Socket Connection
```typescript
useEffect(() => {
  const socket = socketService.connect();
  
  socket.on('room_created', ({ room }) => {
    setRoomCode(room.code);
  });
  
  socket.on('game_started', ({ gameState }) => {
    // Initialize game with server state
    initializeGameFromServer(gameState);
    setGameState('playing');
  });
  
  socket.on('game_state', (state) => {
    // Update game state from server
    updateGameStateFromServer(state);
  });
  
  return () => {
    socketService.disconnect();
  };
}, []);
```

### Step 3: Send Input
```typescript
// In game loop, send input to server
if (game.isPlaying && socketService.isConnected()) {
  socketService.sendPlayerInput({
    ArrowUp: game.keys['ArrowUp'] || game.keys['KeyW'],
    ArrowDown: game.keys['ArrowDown'] || game.keys['KeyS'],
    ArrowLeft: game.keys['ArrowLeft'] || game.keys['KeyA'],
    ArrowRight: game.keys['ArrowRight'] || game.keys['KeyD']
  });
}
```

### Step 4: Receive State
```typescript
socket.on('game_state', (serverState) => {
  // Update local game state
  if (gameRef.current) {
    gameRef.current.enemies = serverState.enemies;
    gameRef.current.coins = serverState.coins;
    gameRef.current.boats = serverState.boats;
    // ... etc
    
    // Update other players
    serverState.players.forEach(serverPlayer => {
      if (serverPlayer.id !== socket.id) {
        // Update remote player position
      }
    });
    
    // Update own player (with reconciliation if needed)
    const ownPlayer = serverState.players.find(p => p.id === socket.id);
    if (ownPlayer) {
      // Reconcile predicted position with server
      reconcilePlayerPosition(gameRef.current.player, ownPlayer);
    }
  }
});
```

### Step 5: Remove Client-Side Game Logic
Remove or comment out:
- Enemy AI updates (now server-side)
- Enemy spawning (now server-side)
- Collectible spawning (now server-side)
- Collision detection for enemies (server validates)
- Game time updates (server sends)

Keep:
- Rendering logic
- Input handling (but send to server)
- UI updates
- Camera following

## Testing

1. Start backend server
2. Start frontend
3. Open two browser windows
4. Create room in one, join in the other
5. Start game and verify both players see each other
6. Verify enemies, collectibles sync across clients

## Troubleshooting

- **Connection refused**: Check backend is running on correct port
- **CORS errors**: Check SERVER_CONFIG.CORS_ORIGIN in backend
- **State not syncing**: Check socket event names match between client/server
- **Input lag**: Consider client-side prediction
- **Desync**: Check server tick rate and network latency

## Next Steps

See `MULTIPLAYER_IMPLEMENTATION_GUIDE.md` for detailed code examples.
