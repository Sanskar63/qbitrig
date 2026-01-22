# Qbitrig - Technical Overview

## Project Architecture

### Tech Stack
- **Frontend Framework**: React 18.3.1 with TypeScript
- **Build Tool**: Vite 5.4.19
- **Routing**: React Router DOM 6.30.1
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS 3.4.17
- **State Management**: React hooks (useState, useRef, useEffect)
- **Animation**: requestAnimationFrame-based game loop
- **Video Export**: FFmpeg.wasm (@ffmpeg/ffmpeg 0.12.10)

### Project Structure
```
qbitrig/
├── src/
│   ├── components/
│   │   ├── QbitAnimator.tsx      # Main animation tool (1404 lines)
│   │   ├── IsometricQbit.tsx     # Isometric character renderer
│   │   └── ui/                    # shadcn/ui components
│   ├── pages/
│   │   ├── Index.tsx              # Landing page (renders QbitAnimator)
│   │   ├── Game.tsx               # Main game component (2476 lines)
│   │   └── NotFound.tsx
│   ├── App.tsx                    # Root component with routing
│   └── main.tsx                   # Entry point
```

---

## Core Components

### 1. QbitAnimator Component (`QbitAnimator.tsx`)

**Purpose**: 2D SVG-based character animation tool for creating and recording Qbit character poses.

**Key Features**:
- **Rig System**: Hierarchical bone system with independent control over:
  - Left/Right arm angles (-160° to 160°)
  - Left/Right leg angles (-60° to 60°)
  - Torso angle (-30° to 30°)
  - Head tilt (-20° to 20°)
  - Coat flap (0 to 40)
  - Root position (X, Y) and body rotation
  - Hip sway for lateral movement

- **Animation Presets**: 10 pre-built animations
  - `idle`: Subtle breathing/swaying
  - `walk`: Alternating leg/arm swing
  - `wave`: Right arm waving motion
  - `floss`: Hip sway dance
  - `cartwheel`: Multi-phase rotation with hand contact points
  - `ophelia`: Dramatic swaying motion
  - `poop`: Squatting animation with emoji
  - `winning`: Jumping celebration
  - `moonwalk`: Backward sliding motion
  - `srk`: Iconic arms-spread pose

- **Expression System**: 8 facial expressions
  - `neutral`, `happy`, `sad`, `anger`, `surprise`, `confusion`, `smirk`, `cry`
  - Dynamic eye/mouth/eyebrow rendering based on expression
  - Auto-blinking system (random intervals)

- **Recording System**:
  - Keyframe-based animation recording
  - Captures pose state at ~60fps during recording
  - Linear interpolation between keyframes for playback
  - Save/load custom animations
  - Duration tracking per animation

- **Export Features**:
  - PNG snapshot export (800x800 canvas)
  - MP4 video export via FFmpeg.wasm (30fps, ~10 seconds max)

**State Management**:
- All animation parameters stored in React state
- `useRef` for animation frame IDs and timers
- `requestAnimationFrame` for smooth 60fps animation loop
- Custom animation playback uses separate RAF loop

**Rendering**:
- SVG-based rendering (400x400 viewBox)
- Transform-based bone hierarchy
- Color palette defined in `COLORS` constant
- Shadow effects via SVG filters

---

### 2. Game Component (`Game.tsx`)

**Purpose**: Top-down survival game "Qbit City" - avoid enemies, collect items, survive as long as possible.

**Game Architecture**:

#### Game Loop
- **Frame Rate**: Variable (requestAnimationFrame-based)
- **Delta Time**: Calculated per frame, clamped to 0.1s max
- **Update Order**: 
  1. Game time increment
  2. Boat movement (perimeter patrol)
  3. Speed boost check (30s threshold)
  4. Immunity expiration
  5. Collectible spawning
  6. Player input processing
  7. Player movement/collision
  8. Enemy AI/updates
  9. Collectible collision checks
  10. Portal logic
  11. Camera smoothing

#### Map System
- **Grid-Based**: 50x50 tile grid (3200x3200 pixels total)
- **Tile Types**:
  - `0`: Road (walkable)
  - `1`: Sidewalk (buildings spawn here)
  - `2`: Grass (trees spawn here)
  - `3`: Water (requires boat)
  - `4`: Lava (instant death, perimeter only)
- **Generation**: Procedural city generation
  - 4x4 block grid pattern
  - Roads every 4 tiles
  - Random building placement on sidewalks
  - Building types: Residential, Shop (purple), Cafe (white windows)
  - Trees on grass tiles (30% chance)
  - 4 permanent portals (random road positions)

#### Player System
```typescript
interface Player {
  x: number;              // World X position
  y: number;              // World Y position
  width: number;          // Collision box (24px)
  height: number;         // Collision box (24px)
  speed: number;          // Pixels/second (300 base, 360 after 30s)
  velX: number;           // Velocity X
  velY: number;           // Velocity Y
  dirX: number;           // Direction X (normalized)
  dirY: number;           // Direction Y (normalized)
  trail: {x, y}[];       // Last 20 positions (for rendering)
  portalCooldown: number; // Seconds until can use portal again
}
```

**Movement**:
- WASD/Arrow keys for input
- Normalized direction vector
- Collision detection via `checkCollision()` (grid-based)
- Boat riding: Player inherits boat velocity when overlapping

**Energy System**:
- Recharges while moving (0.3 energy/second)
- Max 1.0 energy
- Required for portal creation (SPACE key)

#### Enemy System
```typescript
interface Enemy {
  x: number;
  y: number;
  width: number;          // 24px
  height: number;         // 24px
  speed: number;          // 250-280 base, scales with difficulty
  trail: {x, y}[];       // Last 20 positions
  stuckTime: number;      // Time stuck (for flanking AI)
  flankTimer: number;     // Flanking duration
  flankDir: {x, y};       // Flanking direction vector
}
```

**AI Behavior**:
- Direct pathfinding to player (normalized direction)
- Collision avoidance via `attemptMove()` (separate X/Y checks)
- Stuck detection: If movement < 50% intended, increment `stuckTime`
- Flanking: After 0.5s stuck, perform 1s flank maneuver (perpendicular movement)
- Spawn: Every 30 seconds, 2 new enemies spawn far from player (>800px)
- Speed scaling: All enemies get 20% speed boost at 30s game time

**Collision with Player**:
- If player has immunity: Enemy teleported far away (500px+)
- If no immunity: `handleDeath()` called → game over

#### Collectible System

**Coins** (`Coin[]`):
- Golden spinning coins with $ symbol
- Spawn: Every 3-7 seconds, 3-5 coins at a time
- Max 40 active coins
- Collection: Within 25px radius
- Purpose: 5 coins = 1 stored immunity (max 3 stored)

**Immunity Pickups** (`ImmunityPickup[]`):
- Cyan shield icons with electric effects
- Spawn: After 30s game time, in quadrants (1 per quadrant, max 2 per quadrant)
- Respawn: Every 25-40 seconds
- Collection: Within 30px radius
- Purpose: Instant 10-second immunity (doesn't stack with stored)

**Sink Collectibles** (`SinkCollectible[]`):
- Purple vortex/blackhole icons
- Spawn: After 30s, max 2 active
- Respawn: Every 25-35 seconds
- Collection: Within 30px radius
- Purpose: Adds 1 sink trap to inventory (max 3)

#### Power-Up System

**Stored Immunity**:
- Gained: Collect 5 coins
- Storage: Max 3 stored
- Activation: V key
- Effect: 10 seconds of immunity
- Visual: Cyan shield aura around player

**Sink Traps**:
- Gained: Collect sink collectible
- Storage: Max 3 traps
- Deployment: C key (places at current position)
- Effect: Enemies touching trap are teleported far away (1000px+)
- Visual: Red pulsing vortex with danger ring

**Portals**:
- Creation: SPACE key (requires full energy)
- Placement: 1 second ahead of player in movement direction
- Lifetime: 10 seconds
- Teleportation: Entering portal teleports to random other portal
- Cooldown: 2 seconds between teleports
- Visual: Rotating colored rings

#### Rendering System

**Camera**:
- Follows player with smooth interpolation (5x dt factor)
- Viewport: Full window size
- Culling: Only renders tiles/buildings in viewport + 1 tile buffer

**Isometric Rendering**:
- Buildings: Perspective distortion based on distance from screen center
- Trees: Subtle lean effect based on camera position
- Character: Isometric Qbit sprite (from `IsometricQbit.tsx`)

**Minimap**:
- 150x150px canvas overlay
- Shows: Roads (gray), grass (dark green), water (blue), lava (red)
- Player: Cyan dot
- Enemies: Red dots
- Collectibles: Colored dots (gold=coins, cyan=immunity, orange=sinks)
- Boats: Brown squares
- Portals: White dots

**Visual Effects**:
- Screen flash on immunity activation/collection
- Trail rendering for player/enemies (semi-transparent lines)
- Immunity shield aura (pulsing cyan circle)
- Collectible animations (bobbing, spinning, pulsing)

#### Game State Management

**State Variables** (React):
- `gameState`: `'name-entry' | 'playing' | 'game-over'`
- `playerName`: string
- `gameTime`: number (seconds)
- `coinsCollected`: number (0-4, resets on 5th)
- `immunityInventory`: number (0-3)
- `immunityActive`: boolean
- `immunityTimeLeft`: number
- `sinkInventory`: number (0-3)
- `energy`: number (0-1)
- `status`: string (temporary status messages)
- `leaderboard`: LeaderboardEntry[]

**Game Object** (`gameRef.current`):
- All game logic state stored in `useRef` to avoid React re-renders
- Contains: player, enemies, boats, collectibles, map, camera, keys, timers
- Updated every frame in `gameLoop()`
- React state synced periodically (e.g., gameTime every 0.5s)

**Persistence**:
- Leaderboard: localStorage (`qbit-city-leaderboard`)
- Max 20 entries, sorted by time survived

---

## Multiplayer Implementation Strategy

### Architecture Overview

The game is currently **single-player** with all game logic running client-side. To make it multiplayer, you'll need to:

1. **Extract authoritative game state to server**
2. **Synchronize player actions via WebSockets**
3. **Implement client-side prediction/interpolation**
4. **Handle latency and desync**

### Recommended Socket.IO Implementation

#### 1. Server-Side Game State

Create a server-side game loop that maintains authoritative state:

```javascript
// Backend: gameStateManager.js
class GameStateManager {
  constructor() {
    this.rooms = new Map(); // roomCode -> GameRoom
  }

  initializeRoom(roomCode, mapSeed) {
    // Generate map (deterministic based on seed)
    // Spawn all players
    // Initialize collectibles
    // Start game loop
  }

  updateRoom(roomCode, deltaTime) {
    const room = this.rooms.get(roomCode);
    if (!room || !room.isPlaying) return;

    // Update all entities
    room.gameTime += deltaTime;
    this.updatePlayers(room);
    this.updateEnemies(room);
    this.updateCollectibles(room);
    this.updateBoats(room);
    // ... etc
  }
}
```

#### 2. Client-Server Communication

**Client → Server Events**:
```typescript
// Player input
socket.emit('player_input', {
  keys: { w: boolean, a: boolean, s: boolean, d: boolean },
  timestamp: number
});

// Actions
socket.emit('use_portal', { timestamp });
socket.emit('deploy_sink', { x: number, y: number });
socket.emit('activate_immunity', { timestamp });
```

**Server → Client Events**:
```typescript
// Game state snapshot (every 50-100ms)
socket.on('game_state', (state: GameState) => {
  // state.players: Player[]
  // state.enemies: Enemy[]
  // state.collectibles: Collectible[]
  // state.gameTime: number
});

// Player-specific events
socket.on('player_spawned', { playerId, x, y });
socket.on('collectible_collected', { type, id });
socket.on('enemy_spawned', { enemy });
socket.on('game_over', { reason, stats });
```

#### 3. Client-Side Prediction

To reduce perceived latency, implement client-side prediction:

```typescript
// Client: Game.tsx
const predictedState = useRef<GameState>(initialState);
const serverState = useRef<GameState>(initialState);

// Apply player input immediately (prediction)
const handleInput = (keys: KeyState) => {
  // Move player locally
  updatePlayerPosition(predictedState.current.player, keys, deltaTime);
  
  // Send to server
  socket.emit('player_input', { keys, timestamp: Date.now() });
};

// Reconcile with server state when received
socket.on('game_state', (serverState) => {
  // If prediction differs significantly, correct it
  if (distance(predictedState.current.player, serverState.player) > threshold) {
    // Rollback and re-apply inputs
    reconcileState(predictedState.current, serverState);
  }
});
```

#### 4. Entity Interpolation

For smooth rendering of other players/enemies:

```typescript
// Store last two server states
const stateHistory: GameState[] = [];

socket.on('game_state', (newState) => {
  stateHistory.push({ ...newState, timestamp: Date.now() });
  if (stateHistory.length > 2) stateHistory.shift();
});

// In render loop
const render = () => {
  const now = Date.now();
  const [prev, current] = stateHistory;
  
  if (prev && current) {
    const alpha = (now - current.timestamp) / (current.timestamp - prev.timestamp);
    
    // Interpolate positions
    enemies.forEach(enemy => {
      const prevEnemy = prev.enemies.find(e => e.id === enemy.id);
      const currentEnemy = current.enemies.find(e => e.id === enemy.id);
      
      if (prevEnemy && currentEnemy) {
        enemy.renderX = lerp(prevEnemy.x, currentEnemy.x, alpha);
        enemy.renderY = lerp(prevEnemy.y, currentEnemy.y, alpha);
      }
    });
  }
};
```

#### 5. Server-Side Game Loop

```javascript
// Backend: gameLoop.js
setInterval(() => {
  const deltaTime = 0.016; // ~60fps
  
  gameStateManager.getAllRooms().forEach(room => {
    if (room.isPlaying) {
      gameStateManager.updateRoom(room.code, deltaTime);
      
      // Broadcast state to all players in room
      io.to(room.code).emit('game_state', {
        players: room.players,
        enemies: room.enemies,
        collectibles: room.collectibles,
        gameTime: room.gameTime,
        timestamp: Date.now()
      });
    }
  });
}, 16); // ~60fps server tick
```

#### 6. Room Management

```javascript
// Backend: roomManager.js
class RoomManager {
  createRoom(hostSocketId) {
    const roomCode = generateRoomCode();
    const room = {
      code: roomCode,
      host: hostSocketId,
      players: [],
      maxPlayers: 4, // or whatever
      status: 'waiting',
      isPlaying: false
    };
    
    socket.join(roomCode);
    return room;
  }

  joinRoom(socketId, roomCode) {
    const room = this.rooms.get(roomCode);
    if (room.players.length >= room.maxPlayers) {
      throw new Error('Room full');
    }
    
    socket.join(roomCode);
    room.players.push({
      id: socketId,
      name: playerName,
      x: 0, y: 0, // Will be set on game start
      // ... other player state
    });
  }
}
```

#### 7. Key Implementation Steps

1. **Extract game logic to shared module**
   - Move `update()`, `checkCollision()`, `spawnEnemy()`, etc. to server
   - Keep rendering on client

2. **Implement deterministic game logic**
   - Use seeded random number generator
   - Ensure map generation is deterministic
   - Fixed-point math for physics (or consistent rounding)

3. **Add player identification**
   - Each player has unique ID (socket.id)
   - Server tracks which player controls which entity
   - Client only controls their own player

4. **Handle disconnections**
   - Remove player from game on disconnect
   - Optionally: Replace with AI or remove entity

5. **Synchronize collectibles**
   - Server owns collectible spawn/despawn
   - Client only renders what server says exists
   - Collection validated server-side

6. **Enemy AI on server**
   - All enemy movement calculated server-side
   - Client receives enemy positions and renders

7. **Collision detection server-side**
   - Server validates all collisions
   - Client can predict but server is authoritative

### Example Socket.IO Event Flow

```
Client A (Player 1)          Server              Client B (Player 2)
     |                         |                         |
     |-- player_input -------->|                         |
     |                         |-- game_state ---------->|
     |<-- game_state ----------|                         |
     |                         |<-- game_state ----------|
     |                         |-- game_state ---------->|
```

### Performance Considerations

- **Tick Rate**: 20-30 ticks/second is usually sufficient for this game type
- **State Compression**: Only send changed entities, use delta compression
- **Lag Compensation**: Server can rewind time for hit detection
- **Bandwidth**: Estimate ~5-10 KB/s per player for full state updates

### Testing Strategy

1. **Local Testing**: Run server + 2 browser windows
2. **Latency Simulation**: Add artificial delay to socket events
3. **Stress Testing**: Multiple rooms with max players
4. **Desync Detection**: Compare client prediction vs server state

---

## File Dependencies

### QbitAnimator.tsx
- **Dependencies**: React, lucide-react (icons), @ffmpeg/ffmpeg
- **No external game logic dependencies**
- **Standalone component** (can be used independently)

### Game.tsx
- **Dependencies**: React, react-router-dom (Link component)
- **Self-contained game logic** (no shared modules)
- **Uses**: `IsometricQbit.tsx` for character rendering
- **No backend dependencies** (currently)

---

## Key Constants & Configuration

### Game Constants (Game.tsx)
```typescript
TILE_SIZE = 64
MAP_WIDTH = 50
MAP_HEIGHT = 50
BASE_PLAYER_SPEED = 300
BASE_ENEMY_SPEED = 250
IMMUNITY_DURATION = 10 // seconds
COLLECTIBLES_START_TIME = 30 // seconds
COINS_FOR_IMMUNITY = 5
MAX_IMMUNITY_INVENTORY = 3
```

### Animation Constants (QbitAnimator.tsx)
```typescript
// Angle ranges
leftArmAngle: -60 to 160
rightArmAngle: -160 to 60
legAngles: -60 to 60
headTilt: -20 to 20
torsoAngle: -30 to 30
coatFlap: 0 to 40
```

---

## Current Limitations (Single-Player)

1. **No network synchronization**
2. **All game logic client-side** (cheatable)
3. **No persistent sessions**
4. **Leaderboard is local only**
5. **No real-time collaboration**

---

## Multiplayer Benefits

1. **Competitive leaderboards** (server-validated)
2. **Co-op mode** (multiple players vs enemies)
3. **PvP mode** (players can be enemies)
4. **Shared world** (all players see same collectibles)
5. **Social features** (chat, spectating)

---

This technical overview should give you a solid foundation for implementing multiplayer functionality using Socket.IO. The game's architecture is well-suited for extraction to a server-authoritative model.
