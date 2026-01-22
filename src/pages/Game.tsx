import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Trophy, X, Shield, Users, Globe } from 'lucide-react';
import { socketService } from '@/services/socket';

const TILE_SIZE = 64;
const MAP_WIDTH = 50;
const MAP_HEIGHT = 50;
const PERSPECTIVE_STRENGTH = 0.4;
const BASE_PLAYER_SPEED = 300;
const BASE_ENEMY_SPEED = 250;
const IMMUNITY_DURATION = 10; // seconds
const COLLECTIBLES_START_TIME = 30; // seconds before collectibles appear
const COINS_FOR_IMMUNITY = 5; // coins needed for 1 stored immunity
const MAX_IMMUNITY_INVENTORY = 3; // max stored immunities

// Colors
const C_ROAD = '#2a2a2a';
const C_SIDEWALK = '#3a3a3a';
const C_WATER = '#004466';
const C_LAVA = '#cf1020';
const C_LAVA_HOT = '#ff4500';
const C_BOAT = '#8B4513';
const C_BOAT_DECK = '#A0522D';
const C_GRASS = '#1e281e';
const C_TREE = '#1e551e';

const TYPE_RESIDENTIAL = 0;
const TYPE_SHOP = 1;
const TYPE_CAFE = 2;

interface Player {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  velX: number;
  velY: number;
  dirX: number;
  dirY: number;
  trail: { x: number; y: number }[];
  portalCooldown: number;
}

interface Enemy {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  trail: { x: number; y: number }[];
  stuckTime: number;
  flankTimer: number;
  flankDir: { x: number; y: number };
}

interface Boat {
  dist: number;
  x: number;
  y: number;
  w: number;
  h: number;
  velX: number;
  velY: number;
  life: number;
  maxLife: number;
}

interface Portal {
  x: number;
  y: number;
  color: string;
  angle: number;
  life?: number;
  isPlayerCreated?: boolean;
}

interface Building {
  gridX: number;
  gridY: number;
  x: number;
  y: number;
  w: number;
  h: number;
  height: number;
  color: string;
  wallColor: string;
  type: number;
}

interface Tree {
  x: number;
  y: number;
  r: number;
}

// New Coin interface
interface Coin {
  x: number;
  y: number;
  collected: boolean;
  spawnTime: number;
}

// Immunity pickup (direct 10s immunity when collected)
interface ImmunityPickup {
  x: number;
  y: number;
  collected: boolean;
  quadrant: number;
  spawnTime: number;
}

interface SinkCollectible {
  x: number;
  y: number;
  collected: boolean;
  spawnTime: number;
}

interface DeployedSink {
  x: number;
  y: number;
  deployTime: number;
}

interface LeaderboardEntry {
  name: string;
  timeSurvived: number;
  date: string;
}

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

// Quiz question pool
const QUIZ_QUESTIONS: QuizQuestion[] = [
  { question: "What is 7 x 8?", options: ["54", "56", "58", "64"], correctIndex: 1 },
  { question: "Which planet is known as the Red Planet?", options: ["Venus", "Jupiter", "Mars", "Saturn"], correctIndex: 2 },
  { question: "What is the capital of Japan?", options: ["Seoul", "Beijing", "Tokyo", "Bangkok"], correctIndex: 2 },
  { question: "How many sides does a hexagon have?", options: ["5", "6", "7", "8"], correctIndex: 1 },
  { question: "What is the largest ocean on Earth?", options: ["Atlantic", "Indian", "Arctic", "Pacific"], correctIndex: 3 },
  { question: "What year did World War II end?", options: ["1943", "1944", "1945", "1946"], correctIndex: 2 },
  { question: "What is 15% of 200?", options: ["20", "25", "30", "35"], correctIndex: 2 },
  { question: "Which element has the chemical symbol 'O'?", options: ["Gold", "Oxygen", "Iron", "Silver"], correctIndex: 1 },
  { question: "How many continents are there?", options: ["5", "6", "7", "8"], correctIndex: 2 },
  { question: "What is the square root of 144?", options: ["10", "11", "12", "14"], correctIndex: 2 },
  { question: "Which animal is known as the King of the Jungle?", options: ["Tiger", "Elephant", "Lion", "Bear"], correctIndex: 2 },
  { question: "What is the boiling point of water in Celsius?", options: ["90°C", "100°C", "110°C", "120°C"], correctIndex: 1 },
  { question: "How many bones are in the adult human body?", options: ["186", "206", "226", "246"], correctIndex: 1 },
  { question: "What is 9 squared?", options: ["72", "81", "90", "99"], correctIndex: 1 },
  { question: "Which planet is closest to the Sun?", options: ["Venus", "Mercury", "Mars", "Earth"], correctIndex: 1 },
  { question: "What is the smallest prime number?", options: ["0", "1", "2", "3"], correctIndex: 2 },
  { question: "How many degrees are in a circle?", options: ["180", "270", "360", "420"], correctIndex: 2 },
  { question: "What gas do plants absorb from the air?", options: ["Oxygen", "Nitrogen", "Carbon Dioxide", "Hydrogen"], correctIndex: 2 },
  { question: "What is 17 + 28?", options: ["43", "44", "45", "46"], correctIndex: 2 },
  { question: "Which is the longest river in the world?", options: ["Amazon", "Nile", "Yangtze", "Mississippi"], correctIndex: 1 },
];

type GameState = 'name-entry' | 'playing' | 'game-over';
type MultiplayerMode = 'single' | 'multiplayer';

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Quadrant helper: 0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right
const getQuadrant = (x: number, y: number): number => {
  const midX = (MAP_WIDTH * TILE_SIZE) / 2;
  const midY = (MAP_HEIGHT * TILE_SIZE) / 2;
  if (x < midX && y < midY) return 0;
  if (x >= midX && y < midY) return 1;
  if (x < midX && y >= midY) return 2;
  return 3;
};

const Game: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState('');
  const [statusColor, setStatusColor] = useState('#fff');
  const [sinkInventory, setSinkInventory] = useState(0);
  const [coinsCollected, setCoinsCollected] = useState(0);
  const [immunityInventory, setImmunityInventory] = useState(0);
  const [immunityActive, setImmunityActive] = useState(false);
  const [immunityTimeLeft, setImmunityTimeLeft] = useState(0);
  const [energy, setEnergy] = useState(0);
  const [gameTime, setGameTime] = useState(0);
  const [screenFlash, setScreenFlash] = useState<{ color: string; opacity: number } | null>(null);
  
  // Game state management
  const [gameState, setGameState] = useState<GameState>('name-entry');
  const [playerName, setPlayerName] = useState('');
  const playerNameRef = useRef('');
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [finalStats, setFinalStats] = useState({ time: 0 });
  
  // Quiz state
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answerFeedback, setAnswerFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [wrongAnswerCount, setWrongAnswerCount] = useState(0);
  
  // Multiplayer state
  const [multiplayerMode, setMultiplayerMode] = useState<MultiplayerMode>('single');
  const [roomCode, setRoomCode] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [roomPlayers, setRoomPlayers] = useState<Array<{ id: string; name: string }>>([]);
  const [isConnected, setIsConnected] = useState(false);
  const socketIdRef = useRef<string | null>(null);
  const lastServerStateRef = useRef<any>(null);
  
  const gameRef = useRef<{
    player: Player;
    enemies: Enemy[];
    boats: Boat[];
    coins: Coin[];
    immunityPickups: ImmunityPickup[];
    sinkCollectibles: SinkCollectible[];
    deployedSinks: DeployedSink[];
    map: {
      width: number;
      height: number;
      tiles: number[][];
      buildings: Building[];
      trees: Tree[];
      portals: Portal[];
    };
    camera: { x: number; y: number };
    keys: Record<string, boolean>;
    gameTime: number;
    enemySpawnTimer: number;
    coinSpawnTimer: number;
    immunityPickupSpawnTimer: number;
    sinkSpawnTimer: number;
    nextCoinSpawnTime: number;
    nextImmunityPickupSpawnTime: number;
    nextSinkSpawnTime: number;
    collectiblesInitialized: boolean;
    coinsInitialized: boolean;
    speedBoostApplied: boolean;
    immunityActive: boolean;
    immunityEndTime: number;
    coinsCollected: number;
    immunityInventory: number;
    playerSinkInventory: number;
      energy: number;
      lastTime: number;
      lastInputTime?: number;
      animationId: number | null;
      isPlaying: boolean;
      otherPlayers?: Array<{ id: string; x: number; y: number; dirX: number; dirY: number; trail: Array<{ x: number; y: number }> }>;
      // For smooth interpolation in multiplayer
      serverPosition?: { x: number; y: number; timestamp: number };
      predictedPosition?: { x: number; y: number };
      positionHistory?: Array<{ x: number; y: number; timestamp: number }>;
      lastServerUpdateTime?: number;
  } | null>(null);

  // Load leaderboard from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('qbit-city-leaderboard');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Convert old format if needed
        const converted = parsed.map((e: any) => ({
          name: e.name,
          timeSurvived: e.timeSurvived,
          date: e.date
        }));
        setLeaderboard(converted);
      } catch {
        setLeaderboard([]);
      }
    }
  }, []);

  // Socket connection and multiplayer setup
  useEffect(() => {
    if (multiplayerMode === 'multiplayer') {
      const socket = socketService.connect();
      socketIdRef.current = socket.id;

      socket.on('connect', () => {
        setIsConnected(true);
        socketIdRef.current = socket.id;
        console.log('Connected to multiplayer server');
      });

      socket.on('disconnect', () => {
        setIsConnected(false);
        console.log('Disconnected from multiplayer server');
      });

      // Room events
      socket.on('room_created', ({ room }: any) => {
        setRoomCode(room.code);
        setIsHost(true);
        setRoomPlayers(room.players);
        showStatus('Room created! Share code: ' + room.code, '#00ff00', 3000);
      });

      socket.on('room_joined', ({ room, player }: any) => {
        setRoomCode(room.code);
        setIsHost(room.hostId === socket.id);
        setRoomPlayers(room.players);
        showStatus(`Joined room ${room.code}`, '#00ff00', 2000);
      });

      socket.on('player_joined', ({ player, room }: any) => {
        setRoomPlayers(room.players);
        showStatus(`${player.name} joined`, '#00ff00', 2000);
      });

      socket.on('player_left', ({ playerId, room }: any) => {
        setRoomPlayers(room.players);
      });

      // Game events
      socket.on('game_started', ({ gameState: serverGameState }: any) => {
        if (!gameRef.current) return;
        
        // Initialize game with server state
        const game = gameRef.current;
        game.map = serverGameState.map;
        game.enemies = serverGameState.enemies || [];
        game.boats = serverGameState.boats || [];
        game.coins = serverGameState.coins || [];
        game.immunityPickups = serverGameState.immunityPickups || [];
        game.sinkCollectibles = serverGameState.sinkCollectibles || [];
        game.deployedSinks = serverGameState.deployedSinks || [];
        game.map.portals = serverGameState.portals || [];

        // Find our player
        const ourPlayer = serverGameState.players.find((p: any) => p.id === socket.id);
        if (ourPlayer) {
          game.player.x = ourPlayer.x;
          game.player.y = ourPlayer.y;
          game.player.dirX = ourPlayer.dirX || 0;
          game.player.dirY = ourPlayer.dirY || 1;
          game.player.speed = BASE_PLAYER_SPEED; // Ensure speed is set correctly
          game.coinsCollected = ourPlayer.coinsCollected || 0;
          game.immunityInventory = ourPlayer.immunityInventory || 0;
          game.playerSinkInventory = ourPlayer.sinkInventory || 0;
          game.energy = ourPlayer.energy || 0;
          game.immunityActive = ourPlayer.immunityActive || false;
          game.immunityEndTime = ourPlayer.immunityEndTime || 0;
          // Initialize trail with starting position
          game.player.trail = [{ x: game.player.x, y: game.player.y }];
        }

        game.isPlaying = true;
        game.gameTime = 0;
        setGameState('playing');
        setCoinsCollected(game.coinsCollected);
        setImmunityInventory(game.immunityInventory);
        setSinkInventory(game.playerSinkInventory);
        setEnergy(game.energy);
        setImmunityActive(game.immunityActive);
      });

      socket.on('game_state', (serverState: any) => {
        if (!gameRef.current || !gameRef.current.isPlaying) return;
        
        lastServerStateRef.current = serverState;
        const game = gameRef.current;

        // Update enemies, boats, collectibles from server
        game.enemies = serverState.enemies || [];
        game.boats = serverState.boats || [];
        game.coins = serverState.coins || [];
        game.immunityPickups = serverState.immunityPickups || [];
        game.sinkCollectibles = serverState.sinkCollectibles || [];
        game.deployedSinks = serverState.deployedSinks || [];
        game.map.portals = serverState.portals || [];

        // Update game time
        game.gameTime = serverState.gameTime || 0;
        setGameTime(game.gameTime);

        // Update our player state from server (with smooth reconciliation)
        const serverPlayer = serverState.players.find((p: any) => p.id === socket.id);
        if (serverPlayer) {
          const serverTimestamp = serverState.timestamp || Date.now();
          
          // Initialize position history if needed
          if (!game.positionHistory) {
            game.positionHistory = [];
          }
          
          // Add server position to history (keep last 3 positions for interpolation)
          game.positionHistory.push({
            x: serverPlayer.x,
            y: serverPlayer.y,
            timestamp: serverTimestamp
          });
          
          // Keep only last 3 positions
          if (game.positionHistory.length > 3) {
            game.positionHistory.shift();
          }
          
          // Store latest server position
          game.serverPosition = {
            x: serverPlayer.x,
            y: serverPlayer.y,
            timestamp: serverTimestamp
          };
          game.lastServerUpdateTime = serverTimestamp;
          
          // Ensure speed is correct (server might have applied speed boost)
          if (serverPlayer.speed) {
            game.player.speed = serverPlayer.speed;
          } else {
            game.player.speed = BASE_PLAYER_SPEED;
          }
          
          // Reconcile position if needed
          const dist = Math.hypot(
            game.player.x - serverPlayer.x,
            game.player.y - serverPlayer.y
          );
          
          // Simple reconciliation: snap if too far, otherwise blend gently
          if (dist > 100) {
            // Large desync - snap to server position
            console.warn(`Large desync detected: ${dist.toFixed(1)}px, snapping to server`);
            game.player.x = serverPlayer.x;
            game.player.y = serverPlayer.y;
            game.player.trail = [];
            game.predictedPosition = { x: game.player.x, y: game.player.y };
          } else if (dist > 20) {
            // Medium desync - blend towards server
            const lerpFactor = 0.15;
            game.player.x += (serverPlayer.x - game.player.x) * lerpFactor;
            game.player.y += (serverPlayer.y - game.player.y) * lerpFactor;
          }
          // Small desyncs (< 20px) - trust client prediction

          game.player.dirX = serverPlayer.dirX;
          game.player.dirY = serverPlayer.dirY;
          game.coinsCollected = serverPlayer.coinsCollected;
          game.immunityInventory = serverPlayer.immunityInventory;
          game.playerSinkInventory = serverPlayer.sinkInventory;
          game.energy = serverPlayer.energy;
          game.immunityActive = serverPlayer.immunityActive;
          game.immunityEndTime = serverPlayer.immunityEndTime;

          // Update React state
          setCoinsCollected(game.coinsCollected);
          setImmunityInventory(game.immunityInventory);
          setSinkInventory(game.playerSinkInventory);
          setEnergy(game.energy);
          setImmunityActive(game.immunityActive);
          
          if (game.immunityActive) {
            setImmunityTimeLeft(Math.max(0, game.immunityEndTime - game.gameTime));
          }
        }

      // Update other players (for rendering)
      // Store in gameRef for rendering later
      (game as any).otherPlayers = serverState.players
        .filter((p: any) => p.id !== socket.id)
        .map((p: any) => ({
          ...p,
          trail: p.trail || []
        }));
      });

      socket.on('player_death', ({ playerId }: any) => {
        if (playerId === socket.id) {
          handleDeath();
        }
      });

      socket.on('portal_created', ({ portal }: any) => {
        if (gameRef.current) {
          gameRef.current.map.portals.push(portal);
        }
      });

      socket.on('sink_deployed', ({ sink }: any) => {
        if (gameRef.current) {
          gameRef.current.deployedSinks.push(sink);
        }
      });

      socket.on('immunity_activated', ({ playerId }: any) => {
        if (playerId === socket.id) {
          showStatus('🛡️ IMMUNITY ACTIVATED!', '#00ffff', 2000);
          setScreenFlash({ color: '#00ffff', opacity: 0.3 });
          setTimeout(() => setScreenFlash(null), 200);
        }
      });

      socket.on('action_error', ({ message }: any) => {
        showStatus(message, '#ff0000', 2000);
      });

      socket.on('start_error', ({ message }: any) => {
        showStatus('Error: ' + message, '#ff0000', 3000);
      });

      // Player respawned (Play Again in multiplayer)
      socket.on('player_respawned', ({ player, gameState: serverGameState }: any) => {
        if (!gameRef.current) return;
        
        const game = gameRef.current;
        
        // Reset local game state
        game.isPlaying = true;
        game.gameTime = serverGameState.gameTime || 0;
        game.speedBoostApplied = false;
        game.immunityActive = false;
        game.immunityEndTime = 0;
        game.coinsCollected = 0;
        game.immunityInventory = 0;
        game.playerSinkInventory = 0;
        game.energy = 0;
        game.keys = {};
        
        // Update player position from server
        game.player.x = player.x;
        game.player.y = player.y;
        game.player.velX = 0;
        game.player.velY = 0;
        game.player.dirX = 0;
        game.player.dirY = 1;
        game.player.trail = [];
        game.player.speed = player.speed || BASE_PLAYER_SPEED;
        
        // Reset server position tracking
        (game as any).serverPosition = { x: player.x, y: player.y };
        (game as any).predictedPosition = { x: player.x, y: player.y };
        (game as any).positionHistory = [];
        (game as any).lastServerUpdateTime = Date.now();
        
        // Reset UI state
        setSinkInventory(0);
        setCoinsCollected(0);
        setImmunityInventory(0);
        setImmunityActive(false);
        setImmunityTimeLeft(0);
        setEnergy(0);
        
        // Reset quiz state
        setQuizQuestions([]);
        setCurrentQuestionIndex(0);
        setQuizCompleted(false);
        setSelectedAnswer(null);
        setAnswerFeedback(null);
        setWrongAnswerCount(0);
        
        setGameState('playing');
        
        showStatus('Respawned!', '#00ff00', 2000);
        console.log('Player respawned at:', player.x, player.y);
      });

      return () => {
        socketService.disconnect();
      };
    }
  }, [multiplayerMode]);

  const saveToLeaderboard = (name: string, time: number) => {
    const stored = localStorage.getItem('qbit-city-leaderboard');
    let lb: LeaderboardEntry[] = [];
    if (stored) {
      try {
        lb = JSON.parse(stored).map((e: any) => ({
          name: e.name,
          timeSurvived: e.timeSurvived,
          date: e.date
        }));
      } catch {
        lb = [];
      }
    }
    
    lb.push({
      name,
      timeSurvived: time,
      date: new Date().toISOString()
    });
    
    lb.sort((a, b) => b.timeSurvived - a.timeSurvived);
    const trimmed = lb.slice(0, 20);
    
    localStorage.setItem('qbit-city-leaderboard', JSON.stringify(trimmed));
    setLeaderboard(trimmed);
  };

  const showStatus = (text: string, color: string = '#fff', duration: number = 2000) => {
    setStatus(text);
    setStatusColor(color);
    setTimeout(() => setStatus(''), duration);
  };

  // Draw coin - Golden spinning coin
  const drawCoin = (ctx: CanvasRenderingContext2D, coin: Coin) => {
    const time = Date.now() * 0.005 + coin.spawnTime;
    const bob = Math.sin(time * 2) * 3;
    const spin = Math.cos(time * 3);
    
    ctx.save();
    ctx.translate(coin.x, coin.y + bob);
    
    // Golden glow
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 15;
    
    // Coin body (ellipse for 3D spin effect)
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 12);
    gradient.addColorStop(0, '#fff7a0');
    gradient.addColorStop(0.3, '#ffd700');
    gradient.addColorStop(0.7, '#daa520');
    gradient.addColorStop(1, '#b8860b');
    ctx.fillStyle = gradient;
    
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.abs(spin) * 12 + 2, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Coin shine
    ctx.shadowBlur = 0;
    if (spin > 0.3) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.beginPath();
      ctx.ellipse(-3, -3, 3, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // $ symbol
    if (Math.abs(spin) > 0.5) {
      ctx.fillStyle = '#8b6914';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 1);
    }
    
    ctx.restore();
  };

  // Draw immunity pickup - Lightning bolt with shield icon
  const drawImmunityPickup = (ctx: CanvasRenderingContext2D, pickup: ImmunityPickup) => {
    const time = Date.now() * 0.005 + pickup.spawnTime;
    const pulse = 0.8 + Math.sin(time * 3) * 0.2;
    const bob = Math.sin(time * 2) * 4;
    
    ctx.save();
    ctx.translate(pickup.x, pickup.y + bob);
    
    // Electric glow effect
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 30 * pulse;
    
    // Outer glowing circle
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 20 * pulse);
    gradient.addColorStop(0, 'rgba(0, 255, 255, 0.9)');
    gradient.addColorStop(0.5, 'rgba(0, 200, 255, 0.6)');
    gradient.addColorStop(1, 'rgba(0, 100, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, 20 * pulse, 0, Math.PI * 2);
    ctx.fill();
    
    // Core circle
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#001133';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    
    // Shield icon
    ctx.fillStyle = '#00ffff';
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(8, -5);
    ctx.lineTo(8, 2);
    ctx.quadraticCurveTo(8, 9, 0, 12);
    ctx.quadraticCurveTo(-8, 9, -8, 2);
    ctx.lineTo(-8, -5);
    ctx.closePath();
    ctx.fill();
    
    // Inner shield highlight
    ctx.fillStyle = '#001133';
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(4, -3);
    ctx.lineTo(4, 1);
    ctx.quadraticCurveTo(4, 5, 0, 7);
    ctx.quadraticCurveTo(-4, 5, -4, 1);
    ctx.lineTo(-4, -3);
    ctx.closePath();
    ctx.fill();
    
    // Electric arcs around
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const angle = time * 3 + (i * Math.PI * 2 / 3);
      const dist = 18;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * dist, Math.sin(angle) * dist, 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    ctx.restore();
  };

  // Draw sink collectible - Blackhole vortex icon
  const drawSinkCollectible = (ctx: CanvasRenderingContext2D, sink: SinkCollectible) => {
    const time = Date.now() * 0.004 + sink.spawnTime;
    const pulse = 0.9 + Math.sin(time * 2) * 0.1;
    const bob = Math.sin(time * 1.5) * 3;
    
    ctx.save();
    ctx.translate(sink.x, sink.y + bob);
    
    // Outer vortex glow
    ctx.shadowColor = '#9900ff';
    ctx.shadowBlur = 25 * pulse;
    
    // Swirling vortex rings
    for (let ring = 3; ring >= 0; ring--) {
      const ringRadius = 6 + ring * 5;
      const ringAngle = time * (2 + ring * 0.5);
      const alpha = 0.3 + (3 - ring) * 0.2;
      
      ctx.strokeStyle = `rgba(150, 0, 255, ${alpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius * pulse, ringAngle, ringAngle + Math.PI * 1.5);
      ctx.stroke();
    }
    
    // Black hole center
    ctx.shadowBlur = 0;
    const centerGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 10);
    centerGradient.addColorStop(0, '#000000');
    centerGradient.addColorStop(0.7, '#220033');
    centerGradient.addColorStop(1, '#440066');
    ctx.fillStyle = centerGradient;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    
    // Inner swirl
    ctx.strokeStyle = '#cc00ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * Math.PI * 3 + time * 4;
      const r = (i / 30) * 8;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    
    // Particles being sucked in
    ctx.fillStyle = '#ff00ff';
    for (let i = 0; i < 4; i++) {
      const angle = time * 2 + (i * Math.PI / 2);
      const dist = 20 + Math.sin(time * 5 + i) * 5;
      const px = Math.cos(angle) * dist;
      const py = Math.sin(angle) * dist;
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  };

  // Draw deployed sink trap
  const drawDeployedSink = (ctx: CanvasRenderingContext2D, sink: DeployedSink, gameTime: number) => {
    const age = gameTime - sink.deployTime;
    const pulse = 1 + Math.sin(age * 8) * 0.15;
    
    ctx.save();
    ctx.translate(sink.x, sink.y);
    
    // Warning glow
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 30 * pulse;
    
    // Outer danger ring
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 25 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    
    // Inner trap
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#330000';
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    
    // Vortex effect
    ctx.strokeStyle = '#ff4400';
    ctx.lineWidth = 2;
    for (let ring = 0; ring < 3; ring++) {
      ctx.beginPath();
      const ringOffset = age * 5 + ring * 2;
      for (let i = 0; i < 30; i++) {
        const angle = (i / 30) * Math.PI * 2 + ringOffset;
        const r = 5 + ring * 5 - (i / 30) * 3;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    
    ctx.restore();
  };

  // Draw isometric Qbit with immunity effect
  const drawQbitIsometric = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    isPlayer: boolean,
    isWalking: boolean,
    hasImmunity: boolean = false
  ) => {
    ctx.save();
    ctx.translate(x, y);

    const angle = Math.atan2(dirY, dirX);
    ctx.rotate(angle + Math.PI / 2);

    const walkBob = isWalking ? Math.sin(Date.now() * 0.01) * 2 : 0;
    const coatPulse = isWalking ? Math.sin(Date.now() * 0.02) * 2 : 0;

    // Immunity shield effect
    if (hasImmunity && isPlayer) {
      ctx.save();
      ctx.rotate(-(angle + Math.PI / 2)); // Counter-rotate for screen-aligned shield
      const shieldPulse = 0.8 + Math.sin(Date.now() * 0.01) * 0.2;
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.6 + Math.sin(Date.now() * 0.008) * 0.3;
      ctx.beginPath();
      ctx.arc(0, 0, 35 * shieldPulse, 0, Math.PI * 2);
      ctx.stroke();
      
      // Inner shield glow
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#00ffff';
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Shadow
    ctx.fillStyle = isPlayer ? 'rgba(0, 255, 255, 0.3)' : 'rgba(255, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 10, 16, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Coat dark
    ctx.fillStyle = isPlayer ? '#0369a1' : '#991b1b';
    ctx.beginPath();
    ctx.ellipse(0, 3 + walkBob, 14 + coatPulse, 12 + coatPulse, 0, 0, Math.PI * 2);
    ctx.fill();

    // Coat
    ctx.fillStyle = isPlayer ? '#0284c7' : '#dc2626';
    ctx.beginPath();
    ctx.ellipse(0, 2 + walkBob, 12 + coatPulse * 0.5, 10 + coatPulse * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Orange shirt
    ctx.fillStyle = isPlayer ? '#f97316' : '#fca5a5';
    ctx.beginPath();
    ctx.ellipse(0, -1 + walkBob, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hat brim
    ctx.fillStyle = isPlayer ? '#fbbf24' : '#fca5a5';
    ctx.beginPath();
    ctx.ellipse(0, -3 + walkBob, 13, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hat top
    ctx.fillStyle = isPlayer ? '#0ea5e9' : '#ef4444';
    ctx.beginPath();
    ctx.ellipse(0, -5 + walkBob, 10, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Badge
    ctx.fillStyle = isPlayer ? '#fbbf24' : '#fca5a5';
    ctx.beginPath();
    ctx.arc(0, -5 + walkBob, 4, 0, Math.PI * 2);
    ctx.fill();

    // Badge face
    ctx.fillStyle = '#5D4037';
    ctx.beginPath();
    ctx.arc(-1.2, -6 + walkBob, 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(1.2, -6 + walkBob, 0.8, 0, Math.PI * 2);
    ctx.fill();

    // Smile
    ctx.beginPath();
    ctx.strokeStyle = '#5D4037';
    ctx.lineWidth = 0.8;
    ctx.arc(0, -4.5 + walkBob, 1.5, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();

    ctx.restore();
  };

  const createRoom = () => {
    if (!playerName.trim()) {
      showStatus('Please enter your name', '#ff0000', 2000);
      return;
    }
    socketService.createRoom(playerName.trim());
  };

  const joinRoom = () => {
    if (!playerName.trim()) {
      showStatus('Please enter your name', '#ff0000', 2000);
      return;
    }
    if (!roomCodeInput.trim()) {
      showStatus('Please enter room code', '#ff0000', 2000);
      return;
    }
    socketService.joinRoom(roomCodeInput.trim().toUpperCase(), playerName.trim());
  };

  const startGame = () => {
    if (!playerName.trim()) return;
    playerNameRef.current = playerName.trim();
    
    if (multiplayerMode === 'multiplayer') {
      // In multiplayer, host starts the game via socket
      if (isHost) {
        socketService.startGame();
      } else {
        showStatus('Only host can start the game', '#ff0000', 2000);
      }
      return;
    }
    
    // Single-player mode
    setGameState('playing');
    setSinkInventory(0);
    setCoinsCollected(0);
    setImmunityInventory(0);
    setImmunityActive(false);
    setImmunityTimeLeft(0);
    setGameTime(0);
    
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    
    if (gameRef.current) {
      const game = gameRef.current;
      game.keys = {}; // Reset all keys to prevent stuck movement
      game.isPlaying = true;
      game.gameTime = 0;
      game.speedBoostApplied = false;
      game.immunityActive = false;
      game.immunityEndTime = 0;
      game.coinsCollected = 0;
      game.immunityInventory = 0;
      game.playerSinkInventory = 0;
      game.coinSpawnTimer = 0;
      game.immunityPickupSpawnTimer = 0;
      game.sinkSpawnTimer = 0;
      game.nextCoinSpawnTime = 10 + Math.random() * 5;
      game.nextImmunityPickupSpawnTime = 20 + Math.random() * 10;
      game.nextSinkSpawnTime = 25 + Math.random() * 10;
      game.collectiblesInitialized = false;
      game.coinsInitialized = false;
      game.player.speed = BASE_PLAYER_SPEED;
      game.player.velX = 0;
      game.player.velY = 0;
    }
  };

  const initializeQuiz = () => {
    // Randomly select 3 unique questions from the pool
    const shuffled = [...QUIZ_QUESTIONS].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 3);
    setQuizQuestions(selected);
    setCurrentQuestionIndex(0);
    setQuizCompleted(false);
    setSelectedAnswer(null);
    setAnswerFeedback(null);
    setWrongAnswerCount(0);
  };

  const handleDeath = () => {
    if (!gameRef.current) return;
    
    // Prevent multiple death triggers
    if (!gameRef.current.isPlaying) return;
    
    // Mark as not playing immediately to prevent re-entry
    gameRef.current.isPlaying = false;
    
    const time = gameRef.current.gameTime;
    
    setFinalStats({ time });
    const nameToSave = playerNameRef.current || playerName;
    if (nameToSave.trim()) {
      saveToLeaderboard(nameToSave, time);
    }
    
    // Initialize quiz for respawn
    initializeQuiz();
    
    setGameState('game-over');
  };
  
  const handleQuizAnswer = (answerIndex: number) => {
    if (answerFeedback !== null) return; // Already answered
    
    setSelectedAnswer(answerIndex);
    const currentQuestion = quizQuestions[currentQuestionIndex];
    const isCorrect = answerIndex === currentQuestion.correctIndex;
    
    setAnswerFeedback(isCorrect ? 'correct' : 'wrong');
    
    if (!isCorrect) {
      setWrongAnswerCount(prev => prev + 1);
    }
    
    // Move to next question or complete quiz after a delay
    setTimeout(() => {
      if (currentQuestionIndex < 2) {
        setCurrentQuestionIndex(prev => prev + 1);
        setSelectedAnswer(null);
        setAnswerFeedback(null);
      } else {
        // Quiz completed
        setQuizCompleted(true);
      }
    }, 1000);
  };
  
  const handleRetryQuiz = () => {
    initializeQuiz();
  };

  const handlePlayAgain = () => {
    // In multiplayer mode, request respawn from server
    if (multiplayerMode === 'multiplayer') {
      socketService.respawn();
      showStatus('Respawning...', '#ffff00', 1500);
      return;
    }
    
    // Single player mode: reset locally
    setGameState('playing');
    setSinkInventory(0);
    setCoinsCollected(0);
    setImmunityInventory(0);
    setImmunityActive(false);
    setImmunityTimeLeft(0);
    setEnergy(0);
    
    // Reset quiz state
    setQuizQuestions([]);
    setCurrentQuestionIndex(0);
    setQuizCompleted(false);
    setSelectedAnswer(null);
    setAnswerFeedback(null);
    setWrongAnswerCount(0);
    
    if (gameRef.current) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      gameRef.current.keys = {}; // Reset stuck keys
      gameRef.current.isPlaying = true;
      gameRef.current.gameTime = 0;
      gameRef.current.speedBoostApplied = false;
      gameRef.current.immunityActive = false;
      gameRef.current.immunityEndTime = 0;
      gameRef.current.coinsCollected = 0;
      gameRef.current.immunityInventory = 0;
      gameRef.current.playerSinkInventory = 0;
      gameRef.current.energy = 0;
      gameRef.current.coins = [];
      gameRef.current.immunityPickups = [];
      gameRef.current.sinkCollectibles = [];
      gameRef.current.deployedSinks = [];
      gameRef.current.coinSpawnTimer = 0;
      gameRef.current.immunityPickupSpawnTimer = 0;
      gameRef.current.sinkSpawnTimer = 0;
      gameRef.current.player.speed = BASE_PLAYER_SPEED;
      
      handleRestart();
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const minimapCanvas = minimapRef.current;
    if (!canvas || !minimapCanvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    const minimapCtx = minimapCanvas.getContext('2d');
    if (!ctx || !minimapCtx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Initialize game state
    const game = {
      player: {
        x: 0,
        y: 0,
        width: 24,
        height: 24,
        speed: BASE_PLAYER_SPEED,
        velX: 0,
        velY: 0,
        dirX: 0,
        dirY: 1,
        trail: [] as { x: number; y: number }[],
        portalCooldown: 0,
      },
      enemies: [] as Enemy[],
      boats: [] as Boat[],
      coins: [] as Coin[],
      immunityPickups: [] as ImmunityPickup[],
      sinkCollectibles: [] as SinkCollectible[],
      deployedSinks: [] as DeployedSink[],
      map: {
        width: MAP_WIDTH * TILE_SIZE,
        height: MAP_HEIGHT * TILE_SIZE,
        tiles: [] as number[][],
        buildings: [] as Building[],
        trees: [] as Tree[],
        portals: [] as Portal[],
      },
      camera: { x: 0, y: 0 },
      keys: {} as Record<string, boolean>,
      gameTime: 0,
      enemySpawnTimer: 0,
      coinSpawnTimer: 0,
      immunityPickupSpawnTimer: 0,
      sinkSpawnTimer: 0,
      nextCoinSpawnTime: 10 + Math.random() * 5,
      nextImmunityPickupSpawnTime: 20 + Math.random() * 10,
      nextSinkSpawnTime: 25 + Math.random() * 10,
      collectiblesInitialized: false,
      coinsInitialized: false,
      speedBoostApplied: false,
      immunityActive: false,
      immunityEndTime: 0,
      coinsCollected: 0,
      immunityInventory: 0,
      playerSinkInventory: 0,
      energy: 0,
      lastTime: 0,
      lastInputTime: 0,
      animationId: null as number | null,
      isPlaying: false,
      otherPlayers: [],
      serverPosition: undefined,
      predictedPosition: undefined,
      positionHistory: [],
      lastServerUpdateTime: undefined,
    };
    gameRef.current = game;

    // Generate city
    const generateCity = () => {
      game.map.tiles = [];
      game.map.buildings = [];
      game.map.trees = [];
      game.map.portals = [];

      for (let y = 0; y < MAP_HEIGHT; y++) {
        const row: number[] = [];
        for (let x = 0; x < MAP_WIDTH; x++) {
          row.push(1);
        }
        game.map.tiles.push(row);
      }

      const blockSize = 4;
      for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
          const isRoadRow = y % blockSize === 0;
          const isRoadCol = x % blockSize === 0;

          if (isRoadRow || isRoadCol) {
            game.map.tiles[y][x] = 0;
          } else {
            const rand = Math.random();
            if (rand < 0.05) {
              for (let ly = y - 1; ly <= y + 1; ly++) {
                for (let lx = x - 1; lx <= x + 1; lx++) {
                  if (ly >= 0 && ly < MAP_HEIGHT && lx >= 0 && lx < MAP_WIDTH) {
                    if (game.map.tiles[ly][lx] !== 0) {
                      game.map.tiles[ly][lx] = 3;
                    }
                  }
                }
              }
            } else if (rand < 0.15) {
              game.map.tiles[y][x] = 2;
            }
          }
        }
      }

      for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
          if (x === 0 || x === MAP_WIDTH - 1 || y === 0 || y === MAP_HEIGHT - 1) {
            game.map.tiles[y][x] = 4;
            continue;
          }

          const tile = game.map.tiles[y][x];
          const px = x * TILE_SIZE;
          const py = y * TILE_SIZE;

          if (tile === 1) {
            const rand = Math.random();
            let type = TYPE_RESIDENTIAL;
            let height = 40 + Math.random() * 60;
            let color = '#252525';
            let wallColor = '#151515';

            if (rand > 0.9) {
              type = TYPE_SHOP;
              height = 30 + Math.random() * 20;
              color = '#331133';
              wallColor = '#220022';
            } else if (rand > 0.8) {
              type = TYPE_CAFE;
              height = 25 + Math.random() * 15;
              color = '#2e3b2e';
              wallColor = '#1a221a';
            }

            game.map.buildings.push({
              gridX: x,
              gridY: y,
              x: px,
              y: py,
              w: TILE_SIZE,
              h: TILE_SIZE,
              height,
              color,
              wallColor,
              type,
            });
          } else if (tile === 2) {
            if (Math.random() > 0.3) {
              game.map.trees.push({
                x: px + TILE_SIZE / 2 + (Math.random() * 20 - 10),
                y: py + TILE_SIZE / 2 + (Math.random() * 20 - 10),
                r: 10 + Math.random() * 10,
              });
            }
          }
        }
      }

      let portalsCreated = 0;
      while (portalsCreated < 4) {
        const px = Math.floor(Math.random() * (MAP_WIDTH - 2)) + 1;
        const py = Math.floor(Math.random() * (MAP_HEIGHT - 2)) + 1;
        if (game.map.tiles[py][px] === 0) {
          game.map.portals.push({
            x: px * TILE_SIZE + TILE_SIZE / 2,
            y: py * TILE_SIZE + TILE_SIZE / 2,
            color: `hsl(${portalsCreated * 90}, 100%, 50%)`,
            angle: 0,
          });
          portalsCreated++;
        }
      }
    };

    const initBoats = () => {
      game.boats = [];
      const perimeter = (MAP_WIDTH * 2 + MAP_HEIGHT * 2) * TILE_SIZE;
      const boatCount = 10;
      const spacing = perimeter / boatCount;

      for (let i = 0; i < boatCount; i++) {
        game.boats.push({
          dist: i * spacing,
          x: 0,
          y: 0,
          w: 48,
          h: 48,
          velX: 0,
          velY: 0,
          life: 10.0,
          maxLife: 10.0,
        });
      }
    };

    const findSafeSpawn = (entity: { x: number; y: number }) => {
      let spawnFound = false;
      while (!spawnFound) {
        const x = Math.floor(Math.random() * (MAP_WIDTH - 2)) + 1;
        const y = Math.floor(Math.random() * (MAP_HEIGHT - 2)) + 1;
        if (game.map.tiles[y][x] === 0) {
          entity.x = x * TILE_SIZE + TILE_SIZE / 2;
          entity.y = y * TILE_SIZE + TILE_SIZE / 2;
          spawnFound = true;
        }
      }
    };

    const spawnEnemy = () => {
      let ex = 0, ey = 0;
      let valid = false;
      let attempts = 0;

      while (!valid && attempts < 100) {
        attempts++;
        const rx = Math.floor(Math.random() * (MAP_WIDTH - 2)) + 1;
        const ry = Math.floor(Math.random() * (MAP_HEIGHT - 2)) + 1;

        if (game.map.tiles[ry][rx] === 0) {
          const candidateX = rx * TILE_SIZE + TILE_SIZE / 2;
          const candidateY = ry * TILE_SIZE + TILE_SIZE / 2;
          const d = Math.hypot(candidateX - game.player.x, candidateY - game.player.y);
          if (d > 800) {
            ex = candidateX;
            ey = candidateY;
            valid = true;
          }
        }
      }

      if (valid) {
        const baseSpeed = BASE_ENEMY_SPEED + Math.random() * 30;
        const speed = game.speedBoostApplied ? baseSpeed * 1.2 : baseSpeed;
        
        game.enemies.push({
          x: ex,
          y: ey,
          width: 24,
          height: 24,
          speed,
          trail: [],
          stuckTime: 0,
          flankTimer: 0,
          flankDir: { x: 0, y: 0 },
        });
      }
    };

    // Spawn enemy far from player (for sink trap respawn)
    const spawnEnemyFarFrom = (avoidX: number, avoidY: number, minDist: number) => {
      let ex = 0, ey = 0;
      let valid = false;
      let attempts = 0;

      while (!valid && attempts < 200) {
        attempts++;
        const rx = Math.floor(Math.random() * (MAP_WIDTH - 2)) + 1;
        const ry = Math.floor(Math.random() * (MAP_HEIGHT - 2)) + 1;

        if (game.map.tiles[ry][rx] === 0) {
          const candidateX = rx * TILE_SIZE + TILE_SIZE / 2;
          const candidateY = ry * TILE_SIZE + TILE_SIZE / 2;
          const d = Math.hypot(candidateX - avoidX, candidateY - avoidY);
          if (d > minDist) {
            ex = candidateX;
            ey = candidateY;
            valid = true;
          }
        }
      }

      return valid ? { x: ex, y: ey } : null;
    };

    // Spawn coin on road
    const spawnCoin = () => {
      if (game.coins.filter(c => !c.collected).length >= 40) return;
      
      let attempts = 0;
      while (attempts < 100) {
        attempts++;
        const rx = Math.floor(Math.random() * (MAP_WIDTH - 2)) + 1;
        const ry = Math.floor(Math.random() * (MAP_HEIGHT - 2)) + 1;
        
        if (game.map.tiles[ry]?.[rx] === 0) {
          const cx = rx * TILE_SIZE + TILE_SIZE / 2;
          const cy = ry * TILE_SIZE + TILE_SIZE / 2;
          const d = Math.hypot(cx - game.player.x, cy - game.player.y);
          if (d > 200) {
            game.coins.push({
              x: cx,
              y: cy,
              collected: false,
              spawnTime: Date.now() * 0.001,
            });
            return;
          }
        }
      }
    };

    // Spawn immunity pickup in a specific quadrant
    const spawnImmunityPickupInQuadrant = (quadrant: number) => {
      const midX = MAP_WIDTH / 2;
      const midY = MAP_HEIGHT / 2;
      
      let minX = 1, maxX = midX - 1, minY = 1, maxY = midY - 1;
      if (quadrant === 1) { minX = midX; maxX = MAP_WIDTH - 2; }
      if (quadrant === 2) { minY = midY; maxY = MAP_HEIGHT - 2; }
      if (quadrant === 3) { minX = midX; maxX = MAP_WIDTH - 2; minY = midY; maxY = MAP_HEIGHT - 2; }
      
      let attempts = 0;
      while (attempts < 100) {
        attempts++;
        const rx = Math.floor(minX + Math.random() * (maxX - minX));
        const ry = Math.floor(minY + Math.random() * (maxY - minY));
        
        if (game.map.tiles[ry]?.[rx] === 0) {
          const cx = rx * TILE_SIZE + TILE_SIZE / 2;
          const cy = ry * TILE_SIZE + TILE_SIZE / 2;
          
          game.immunityPickups.push({
            x: cx,
            y: cy,
            collected: false,
            quadrant,
            spawnTime: Date.now() * 0.001,
          });
          return;
        }
      }
    };

    // Spawn sink collectible
    const spawnSinkCollectible = () => {
      if (game.sinkCollectibles.filter(s => !s.collected).length >= 2) return;
      
      let attempts = 0;
      while (attempts < 100) {
        attempts++;
        const rx = Math.floor(Math.random() * (MAP_WIDTH - 2)) + 1;
        const ry = Math.floor(Math.random() * (MAP_HEIGHT - 2)) + 1;
        
        if (game.map.tiles[ry]?.[rx] === 0) {
          const cx = rx * TILE_SIZE + TILE_SIZE / 2;
          const cy = ry * TILE_SIZE + TILE_SIZE / 2;
          const d = Math.hypot(cx - game.player.x, cy - game.player.y);
          if (d > 300) {
            game.sinkCollectibles.push({
              x: cx,
              y: cy,
              collected: false,
              spawnTime: Date.now() * 0.001,
            });
            return;
          }
        }
      }
    };

    const init = () => {
      generateCity();
      initBoats();
      findSafeSpawn(game.player);
      game.player.trail = [];
      game.player.portalCooldown = 0;
      game.player.dirX = 0;
      game.player.dirY = 1;
      game.player.speed = BASE_PLAYER_SPEED;

      game.enemies = [];
      game.enemySpawnTimer = 0;
      game.coinSpawnTimer = 0;
      game.immunityPickupSpawnTimer = 0;
      game.sinkSpawnTimer = 0;
      game.nextCoinSpawnTime = 10 + Math.random() * 5;
      game.nextImmunityPickupSpawnTime = 20 + Math.random() * 10;
      game.nextSinkSpawnTime = 25 + Math.random() * 10;
      game.collectiblesInitialized = false;
      game.coinsInitialized = false;
      game.speedBoostApplied = false;
      game.immunityActive = false;
      game.immunityEndTime = 0;
      game.coinsCollected = 0;
      game.immunityInventory = 0;
      game.playerSinkInventory = 0;
      game.coins = [];
      game.immunityPickups = [];
      game.sinkCollectibles = [];
      game.deployedSinks = [];
      
      for (let i = 0; i < 3; i++) {
        spawnEnemy();
      }

      game.camera.x = game.player.x - canvas.width / 2;
      game.camera.y = game.player.y - canvas.height / 2;
    };

    const checkCollision = (
      x: number,
      y: number,
      w: number,
      h: number,
      isPlayer: boolean
    ): boolean => {
      const halfW = w / 2, halfH = h / 2;
      const l = x - halfW, r = x + halfW, t = y - halfH, b = y + halfH;
      const gridX = Math.floor(x / TILE_SIZE);
      const gridY = Math.floor(y / TILE_SIZE);

      for (let gy = gridY - 1; gy <= gridY + 1; gy++) {
        for (let gx = gridX - 1; gx <= gridX + 1; gx++) {
          if (gy >= 0 && gy < MAP_HEIGHT && gx >= 0 && gx < MAP_WIDTH) {
            const tile = game.map.tiles[gy][gx];
            let solid = tile === 1 || tile === 3;
            if (tile === 4 && !isPlayer) solid = true;

            if (solid) {
              const bx = gx * TILE_SIZE;
              const by = gy * TILE_SIZE;
              if (l < bx + TILE_SIZE && r > bx && t < by + TILE_SIZE && b > by) {
                return true;
              }
            }
          }
        }
      }
      return false;
    };

    const getBoatUnderPlayer = (): Boat | null => {
      for (const b of game.boats) {
        if (b.life <= 0) continue;
        if (
          Math.abs(game.player.x - b.x) < b.w / 2 + game.player.width / 2 &&
          Math.abs(game.player.y - b.y) < b.h / 2 + game.player.height / 2
        ) {
          return b;
        }
      }
      return null;
    };

    const checkLavaDeath = (): boolean => {
      if (getBoatUnderPlayer()) return false;
      const gridX = Math.floor(game.player.x / TILE_SIZE);
      const gridY = Math.floor(game.player.y / TILE_SIZE);
      if (gridY >= 0 && gridY < MAP_HEIGHT && gridX >= 0 && gridX < MAP_WIDTH) {
        if (game.map.tiles[gridY][gridX] === 4) return true;
      }
      return false;
    };

    const attemptMove = (
      entity: { x: number; y: number; width: number; height: number },
      dx: number,
      dy: number,
      isPlayer: boolean
    ): number => {
      let actualDist = 0;
      if (!checkCollision(entity.x + dx, entity.y, entity.width, entity.height, isPlayer)) {
        entity.x += dx;
        actualDist += Math.abs(dx);
      }
      if (!checkCollision(entity.x, entity.y + dy, entity.width, entity.height, isPlayer)) {
        entity.y += dy;
        actualDist += Math.abs(dy);
      }
      return actualDist;
    };

    const updateBoats = (dt: number) => {
      const speed = 150;
      const totalDist = (MAP_WIDTH - 1 + MAP_HEIGHT - 1) * 2 * TILE_SIZE;

      game.boats.forEach((b) => {
        b.dist = (b.dist + speed * dt) % totalDist;

        const topLen = (MAP_WIDTH - 1) * TILE_SIZE;
        const rightLen = (MAP_HEIGHT - 1) * TILE_SIZE;
        const bottomLen = (MAP_WIDTH - 1) * TILE_SIZE;

        let currentDist = b.dist;
        let nx = 0, ny = 0;

        if (currentDist < topLen) {
          nx = currentDist;
          ny = 0;
          b.velX = speed;
          b.velY = 0;
        } else if (currentDist < topLen + rightLen) {
          currentDist -= topLen;
          nx = (MAP_WIDTH - 1) * TILE_SIZE;
          ny = currentDist;
          b.velX = 0;
          b.velY = speed;
        } else if (currentDist < topLen + rightLen + bottomLen) {
          currentDist -= topLen + rightLen;
          nx = (MAP_WIDTH - 1) * TILE_SIZE - currentDist;
          ny = (MAP_HEIGHT - 1) * TILE_SIZE;
          b.velX = -speed;
          b.velY = 0;
        } else {
          currentDist -= topLen + rightLen + bottomLen;
          nx = 0;
          ny = (MAP_HEIGHT - 1) * TILE_SIZE - currentDist;
          b.velX = 0;
          b.velY = -speed;
        }

        b.x = nx + TILE_SIZE / 2;
        b.y = ny + TILE_SIZE / 2;
      });
    };

    const trySpawnPortal = () => {
      if (multiplayerMode === 'multiplayer') {
        socketService.usePortal();
        return;
      }
      
      if (game.energy < 1) {
        showStatus('ENERGY NOT FULL! Keep moving!', '#888', 500);
        return;
      }
      
      // Remove only player-created portals (keep permanent ones)
      game.map.portals = game.map.portals.filter(p => !p.isPlayerCreated);
      
      // Spawn portal 1 second ahead of player based on current speed
      const spawnDist = game.player.speed * 1;
      const px = game.player.x + game.player.dirX * spawnDist;
      const py = game.player.y + game.player.dirY * spawnDist;

      game.map.portals.push({
        x: px,
        y: py,
        color: '#ff00ff',
        angle: 0,
        life: 10.0,
        isPlayerCreated: true,
      });

      game.energy = 0; // Consume energy
      setEnergy(0);
      showStatus('>> PORTAL CREATED <<', '#d0f');
    };

    const deploySink = () => {
      if (multiplayerMode === 'multiplayer') {
        socketService.deploySink();
        return;
      }
      
      if (game.playerSinkInventory <= 0) {
        showStatus('NO SINK TRAPS!', '#888', 500);
        return;
      }
      
      game.playerSinkInventory--;
      setSinkInventory(game.playerSinkInventory);
      
      game.deployedSinks.push({
        x: game.player.x,
        y: game.player.y,
        deployTime: game.gameTime,
      });
      
      showStatus('SINK TRAP DEPLOYED!', '#ff6600');
    };

    const activateImmunity = () => {
      if (multiplayerMode === 'multiplayer') {
        socketService.activateImmunity();
        return;
      }
      
      if (game.immunityInventory <= 0) {
        showStatus('NO IMMUNITY STORED! Collect 5 coins', '#888', 500);
        return;
      }
      if (game.immunityActive) {
        showStatus('IMMUNITY ALREADY ACTIVE!', '#888', 500);
        return;
      }
      
      game.immunityInventory--;
      setImmunityInventory(game.immunityInventory);
      game.immunityActive = true;
      game.immunityEndTime = game.gameTime + IMMUNITY_DURATION;
      setImmunityActive(true);
      showStatus('🛡️ IMMUNITY ACTIVATED! 10 seconds', '#00ffff', 2000);
      
      // Screen flash effect
      setScreenFlash({ color: '#00ffff', opacity: 0.3 });
      setTimeout(() => setScreenFlash(null), 200);
    };

    const update = (dt: number) => {
      if (!game.isPlaying) return;
      
      // In multiplayer mode, send input to server and do client-side prediction
      if (multiplayerMode === 'multiplayer' && socketService.isConnected()) {
        // Client-side prediction: apply movement locally for immediate feedback
        let dx = 0, dy = 0;
        if (game.keys['ArrowUp'] || game.keys['KeyW']) dy = -1;
        if (game.keys['ArrowDown'] || game.keys['KeyS']) dy = 1;
        if (game.keys['ArrowLeft'] || game.keys['KeyA']) dx = -1;
        if (game.keys['ArrowRight'] || game.keys['KeyD']) dx = 1;

        // Send input to server (throttle to avoid spam) - send even when stopped
        const now = Date.now();
        if (!game.lastInputTime || now - game.lastInputTime > 16) { // ~60fps max
          socketService.sendPlayerInput({
            ArrowUp: game.keys['ArrowUp'] || game.keys['KeyW'],
            ArrowDown: game.keys['ArrowDown'] || game.keys['KeyS'],
            ArrowLeft: game.keys['ArrowLeft'] || game.keys['KeyA'],
            ArrowRight: game.keys['ArrowRight'] || game.keys['KeyD']
          });
          game.lastInputTime = now;
        }

        // Normalize direction for movement
        if (dx !== 0 || dy !== 0) {
          const length = Math.sqrt(dx * dx + dy * dy);
          dx /= length;
          dy /= length;
          game.player.dirX = dx;
          game.player.dirY = dy;
        }

        // Set velocity directly (like original single-player, no interpolation lag)
        game.player.velX = dx * game.player.speed;
        game.player.velY = dy * game.player.speed;

        // Apply movement with collision (client prediction)
        const moveX = game.player.velX * dt;
        const moveY = game.player.velY * dt;
        
        if (!checkCollision(game.player.x + moveX, game.player.y, game.player.width, game.player.height, game.map, true)) {
          game.player.x += moveX;
        }
        if (!checkCollision(game.player.x, game.player.y + moveY, game.player.width, game.player.height, game.map, true)) {
          game.player.y += moveY;
        }

        // Store predicted position for reconciliation
        game.predictedPosition = { x: game.player.x, y: game.player.y };

        // Update trail (like original)
        if (dx !== 0 || dy !== 0) {
          game.player.trail.push({ x: game.player.x, y: game.player.y });
          if (game.player.trail.length > 20) game.player.trail.shift();
        }

        // Client-side lava death check for immediate feedback
        const gridX = Math.floor(game.player.x / TILE_SIZE);
        const gridY = Math.floor(game.player.y / TILE_SIZE);
        if (gridY >= 0 && gridY < MAP_HEIGHT && gridX >= 0 && gridX < MAP_WIDTH) {
          if (game.map.tiles[gridY][gridX] === 4) {
            // Check if on a boat
            const onBoat = game.boats.some((boat: any) => {
              const bx = boat.x;
              const by = boat.y;
              return Math.abs(game.player.x - bx) < (boat.w || 48) / 2 + game.player.width / 2 &&
                     Math.abs(game.player.y - by) < (boat.h || 48) / 2 + game.player.height / 2;
            });
            
            if (!onBoat) {
              handleDeath();
              return;
            }
          }
        }

        // Update camera to follow player (smooth camera)
        const targetCamX = game.player.x - canvas.width / 2;
        const targetCamY = game.player.y - canvas.height / 2;
        game.camera.x += (targetCamX - game.camera.x) * 8 * dt;
        game.camera.y += (targetCamY - game.camera.y) * 8 * dt;

        // Update boats locally for visual smoothness
        updateBoats(dt);
        
        return; // Skip rest of update logic in multiplayer
      }
      
      // Single-player mode - full local game logic
      game.gameTime += dt;
      
      // Sync game time to React state
      if (Math.floor(game.gameTime * 2) !== Math.floor((game.gameTime - dt) * 2)) {
        setGameTime(game.gameTime);
      }
      
      updateBoats(dt);

      // Speed boost at 30 seconds (game difficulty)
      if (!game.speedBoostApplied && game.gameTime >= 30) {
        game.speedBoostApplied = true;
        game.player.speed = BASE_PLAYER_SPEED * 1.2;
        game.enemies.forEach(enemy => {
          enemy.speed = enemy.speed * 1.2;
        });
        showStatus('⚡ DIFFICULTY UP! Everything is 20% faster!', '#ffcc00', 3000);
      }

      // Handle immunity expiration
      if (game.immunityActive && game.gameTime >= game.immunityEndTime) {
        game.immunityActive = false;
        setImmunityActive(false);
        showStatus('Immunity ended!', '#888', 1000);
      }
      
      // Update immunity time left for UI
      if (game.immunityActive) {
        setImmunityTimeLeft(Math.max(0, game.immunityEndTime - game.gameTime));
      }

      // Spawn coins from the start of the game
      if (!game.coinsInitialized) {
        game.coinsInitialized = true;
        // Spawn initial batch of coins
        for (let i = 0; i < 20; i++) {
          spawnCoin();
        }
      }
      
      // Regular spawn timer for coins (always active)
      game.coinSpawnTimer += dt;
      if (game.coinSpawnTimer >= game.nextCoinSpawnTime) {
        game.coinSpawnTimer = 0;
        game.nextCoinSpawnTime = 3 + Math.random() * 4;
        // Spawn 3-5 coins at a time
        const numCoins = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < numCoins; i++) {
          spawnCoin();
        }
      }
      
      // Spawn other collectibles after 30 seconds
      if (game.gameTime >= COLLECTIBLES_START_TIME) {
        // First time crossing threshold - spawn initial batch with screen flash
        if (!game.collectiblesInitialized) {
          game.collectiblesInitialized = true;
          // Spawn initial immunity pickups in all quadrants
          for (let q = 0; q < 4; q++) {
            spawnImmunityPickupInQuadrant(q);
          }
          // Spawn initial sink
          spawnSinkCollectible();
          showStatus('⚡ POWER-UPS NOW AVAILABLE!', '#00ff00', 2000);
          
          // Screen flash effect
          setScreenFlash({ color: '#00ff00', opacity: 0.4 });
          setTimeout(() => setScreenFlash(null), 300);
        }
        
        // Regular spawn timer for immunity pickups
        game.immunityPickupSpawnTimer += dt;
        if (game.immunityPickupSpawnTimer >= game.nextImmunityPickupSpawnTime) {
          game.immunityPickupSpawnTimer = 0;
          game.nextImmunityPickupSpawnTime = 25 + Math.random() * 15;
          
          // Count pickups per quadrant
          const quadrantCounts = [0, 0, 0, 0];
          game.immunityPickups.forEach(p => {
            if (!p.collected) quadrantCounts[p.quadrant]++;
          });
          
          // Spawn in quadrants with < 2 pickups
          for (let q = 0; q < 4; q++) {
            if (quadrantCounts[q] < 2) {
              spawnImmunityPickupInQuadrant(q);
            }
          }
        }
        
        // Regular spawn timer for sink collectibles
        game.sinkSpawnTimer += dt;
        if (game.sinkSpawnTimer >= game.nextSinkSpawnTime) {
          game.sinkSpawnTimer = 0;
          game.nextSinkSpawnTime = 25 + Math.random() * 10;
          spawnSinkCollectible();
        }
      }

      let dx = 0, dy = 0;
      if (game.keys['ArrowUp'] || game.keys['KeyW']) dy = -1;
      if (game.keys['ArrowDown'] || game.keys['KeyS']) dy = 1;
      if (game.keys['ArrowLeft'] || game.keys['KeyA']) dx = -1;
      if (game.keys['ArrowRight'] || game.keys['KeyD']) dx = 1;

      if (dx !== 0 || dy !== 0) {
        const length = Math.sqrt(dx * dx + dy * dy);
        dx /= length;
        dy /= length;
        game.player.dirX = dx;
        game.player.dirY = dy;
      }

      // Smooth velocity interpolation for single-player
      const targetVelX = dx * game.player.speed;
      const targetVelY = dy * game.player.speed;
      game.player.velX += (targetVelX - game.player.velX) * 10 * dt; // Smooth velocity change
      game.player.velY += (targetVelY - game.player.velY) * 10 * dt;

      // Energy recharge based on movement
      if (dx !== 0 || dy !== 0) {
        game.energy = Math.min(1, game.energy + dt * 0.3);
        setEnergy(game.energy);
      }

      const riddenBoat = getBoatUnderPlayer();
      if (riddenBoat) {
        riddenBoat.life -= dt;
        game.player.x += riddenBoat.velX * dt;
        game.player.y += riddenBoat.velY * dt;
      }

      game.boats.forEach((b) => {
        if (b !== riddenBoat) b.life = b.maxLife;
      });

      // Smooth movement application
      const moveX = game.player.velX * dt;
      const moveY = game.player.velY * dt;
      attemptMove(
        game.player,
        moveX,
        moveY,
        true
      );

      if (checkLavaDeath()) {
        handleDeath();
        return;
      }

      game.player.trail.push({ x: game.player.x, y: game.player.y });
      if (game.player.trail.length > 20) game.player.trail.shift();

      // Coin collection
      game.coins.forEach(coin => {
        if (coin.collected) return;
        const d = Math.hypot(game.player.x - coin.x, game.player.y - coin.y);
        if (d < 25) {
          coin.collected = true;
          game.coinsCollected++;
          setCoinsCollected(game.coinsCollected);
          
          // Check if we've collected 5 coins
          if (game.coinsCollected >= COINS_FOR_IMMUNITY) {
            if (game.immunityInventory < MAX_IMMUNITY_INVENTORY) {
              game.immunityInventory++;
              setImmunityInventory(game.immunityInventory);
              game.coinsCollected = 0;
              setCoinsCollected(0);
              showStatus('🛡️ IMMUNITY STORED! Press V to use', '#ffd700', 2000);
              // Flash effect
              setScreenFlash({ color: '#ffd700', opacity: 0.3 });
              setTimeout(() => setScreenFlash(null), 200);
            } else {
              game.coinsCollected = COINS_FOR_IMMUNITY - 1; // Keep at max-1, can't store more
              setCoinsCollected(game.coinsCollected);
              showStatus('IMMUNITY FULL! (Max 3)', '#888', 1000);
            }
          }
        }
      });
      game.coins = game.coins.filter(c => !c.collected);

      // Immunity pickup collection (direct immunity)
      game.immunityPickups.forEach(pickup => {
        if (pickup.collected) return;
        const d = Math.hypot(game.player.x - pickup.x, game.player.y - pickup.y);
        if (d < 30) {
          pickup.collected = true;
          game.immunityActive = true;
          game.immunityEndTime = game.gameTime + IMMUNITY_DURATION;
          setImmunityActive(true);
          showStatus('🛡️ INSTANT IMMUNITY! 10 seconds', '#00ffff', 2000);
          // Flash effect
          setScreenFlash({ color: '#00ffff', opacity: 0.3 });
          setTimeout(() => setScreenFlash(null), 200);
        }
      });
      game.immunityPickups = game.immunityPickups.filter(p => !p.collected);

      // Sink collectible collection
      game.sinkCollectibles.forEach(sink => {
        if (sink.collected) return;
        const d = Math.hypot(game.player.x - sink.x, game.player.y - sink.y);
        if (d < 30) {
          if (game.playerSinkInventory < 3) {
            sink.collected = true;
            game.playerSinkInventory++;
            setSinkInventory(game.playerSinkInventory);
            showStatus('SINK TRAP COLLECTED! Press C to deploy', '#ff6600', 2000);
          } else {
            showStatus('INVENTORY FULL! (Max 3 traps)', '#888', 1000);
          }
        }
      });
      game.sinkCollectibles = game.sinkCollectibles.filter(s => !s.collected);

      // Portal logic (only in single-player)
      if (multiplayerMode === 'single') {
        if (game.player.portalCooldown > 0) game.player.portalCooldown -= dt;

        for (let i = game.map.portals.length - 1; i >= 0; i--) {
          const p = game.map.portals[i];
          p.angle += 2 * dt;
          if (p.life !== undefined) {
            p.life -= dt;
            if (p.life <= 0) {
              game.map.portals.splice(i, 1);
              continue;
            }
          }
        }

        if (game.player.portalCooldown <= 0) {
          for (let i = 0; i < game.map.portals.length; i++) {
            const p = game.map.portals[i];
            const d = Math.hypot(game.player.x - p.x, game.player.y - p.y);
            if (d < 20) {
              const otherPortals = game.map.portals.filter((_, idx) => idx !== i);
              if (otherPortals.length > 0) {
                const dest = otherPortals[Math.floor(Math.random() * otherPortals.length)];
                game.player.x = dest.x;
                game.player.y = dest.y;
                game.player.portalCooldown = 2.0;
                game.player.trail = [];
                showStatus('PORTAL TRAVEL!', '#0ff');
              }
              break;
            }
          }
        }
      } else {
        // In multiplayer, just animate portals
        game.map.portals.forEach(p => {
          p.angle += 2 * dt;
          if (p.life !== undefined) {
            p.life -= dt;
          }
        });
        game.map.portals = game.map.portals.filter(p => !p.life || p.life > 0);
      }

      // Enemy logic
      game.enemies.forEach((enemy) => {
        // Check collision with deployed sinks
        for (let i = game.deployedSinks.length - 1; i >= 0; i--) {
          const sink = game.deployedSinks[i];
          const d = Math.hypot(enemy.x - sink.x, enemy.y - sink.y);
          if (d < 25) {
            game.deployedSinks.splice(i, 1);
            const newPos = spawnEnemyFarFrom(game.player.x, game.player.y, 1000);
            if (newPos) {
              enemy.x = newPos.x;
              enemy.y = newPos.y;
              enemy.trail = [];
              showStatus('ENEMY TRAPPED & RESPAWNED!', '#ff4400', 1500);
            }
            break;
          }
        }

        let moveX = 0, moveY = 0;

        if (enemy.flankTimer > 0) {
          enemy.flankTimer -= dt;
          moveX = enemy.flankDir.x * enemy.speed * dt;
          moveY = enemy.flankDir.y * enemy.speed * dt;
          if (enemy.flankTimer <= 0) enemy.stuckTime = 0;
        } else {
          let edx = game.player.x - enemy.x;
          let edy = game.player.y - enemy.y;
          const dist = Math.hypot(edx, edy);

          if (dist > 0) {
            moveX = (edx / dist) * enemy.speed * dt;
            moveY = (edy / dist) * enemy.speed * dt;
          }

          // Enemy collision - check immunity
          if (dist < (game.player.width / 2 + enemy.width / 2)) {
            if (!game.immunityActive) {
              handleDeath();
              return;
            } else {
              // Push enemy away when immune
              const pushDist = 50;
              const newPos = spawnEnemyFarFrom(game.player.x, game.player.y, 500);
              if (newPos) {
                enemy.x = newPos.x;
                enemy.y = newPos.y;
                enemy.trail = [];
              }
            }
          }
        }

        let actualX = 0, actualY = 0;
        if (!checkCollision(enemy.x + moveX, enemy.y, enemy.width, enemy.height, false)) {
          enemy.x += moveX;
          actualX = moveX;
        }
        if (!checkCollision(enemy.x, enemy.y + moveY, enemy.width, enemy.height, false)) {
          enemy.y += moveY;
          actualY = moveY;
        }

        if (enemy.flankTimer <= 0) {
          const intended = enemy.speed * dt;
          const actual = Math.hypot(actualX, actualY);
          if (actual < intended * 0.5) {
            enemy.stuckTime += dt;
            if (enemy.stuckTime > 0.5) {
              enemy.flankTimer = 1.0;
              let edx = game.player.x - enemy.x;
              let edy = game.player.y - enemy.y;
              const dist = Math.hypot(edx, edy);
              if (dist > 0) {
                edx /= dist;
                edy /= dist;
              }
              if (Math.random() < 0.5) enemy.flankDir = { x: -edy, y: edx };
              else enemy.flankDir = { x: edy, y: -edx };
            }
          } else {
            enemy.stuckTime = Math.max(0, enemy.stuckTime - dt);
          }
        }

        enemy.trail.push({ x: enemy.x, y: enemy.y });
        if (enemy.trail.length > 20) enemy.trail.shift();
      });

      // Camera
      const targetCamX = game.player.x - canvas.width / 2;
      const targetCamY = game.player.y - canvas.height / 2;
      game.camera.x += (targetCamX - game.camera.x) * 5 * dt;
      game.camera.y += (targetCamY - game.camera.y) * 5 * dt;

      // Enemy spawner
      game.enemySpawnTimer += dt;
      if (game.enemySpawnTimer >= 30) {
        game.enemySpawnTimer = 0;
        spawnEnemy();
        spawnEnemy();
        showStatus('WARNING: ENEMY REINFORCEMENTS!', '#f00', 3000);
      }
    };

    const draw = () => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(-game.camera.x, -game.camera.y);

      const startCol = Math.floor(game.camera.x / TILE_SIZE) - 1;
      const endCol = startCol + Math.ceil(canvas.width / TILE_SIZE) + 2;
      const startRow = Math.floor(game.camera.y / TILE_SIZE) - 1;
      const endRow = startRow + Math.ceil(canvas.height / TILE_SIZE) + 2;

      // Ground
      for (let y = startRow; y < endRow; y++) {
        for (let x = startCol; x < endCol; x++) {
          if (y >= 0 && y < MAP_HEIGHT && x >= 0 && x < MAP_WIDTH) {
            const type = game.map.tiles[y][x];
            const dx = x * TILE_SIZE, dy = y * TILE_SIZE;

            if (type === 0) {
              ctx.fillStyle = C_ROAD;
              ctx.fillRect(dx, dy, TILE_SIZE, TILE_SIZE);
              ctx.strokeStyle = '#444';
              ctx.lineWidth = 2;
              ctx.setLineDash([10, 10]);
              ctx.beginPath();
              ctx.moveTo(dx + TILE_SIZE / 2, dy);
              ctx.lineTo(dx + TILE_SIZE / 2, dy + TILE_SIZE);
              ctx.moveTo(dx, dy + TILE_SIZE / 2);
              ctx.lineTo(dx + TILE_SIZE, dy + TILE_SIZE / 2);
              ctx.stroke();
              ctx.setLineDash([]);
            } else if (type === 2) {
              ctx.fillStyle = C_GRASS;
              ctx.fillRect(dx, dy, TILE_SIZE, TILE_SIZE);
            } else if (type === 3) {
              ctx.fillStyle = C_WATER;
              ctx.fillRect(dx, dy, TILE_SIZE, TILE_SIZE);
              ctx.fillStyle = 'rgba(255,255,255,0.1)';
              if ((Date.now() + x * 100) % 1000 < 100) {
                ctx.fillRect(dx + 10, dy + 10, TILE_SIZE - 20, 4);
              }
            } else if (type === 4) {
              ctx.fillStyle = C_LAVA;
              ctx.fillRect(dx, dy, TILE_SIZE, TILE_SIZE);
              ctx.fillStyle = C_LAVA_HOT;
              let offset = 0;
              if (y === 0) offset = dx;
              else if (x === MAP_WIDTH - 1) offset = dy;
              else if (y === MAP_HEIGHT - 1) offset = -dx;
              else if (x === 0) offset = -dy;
              const pulse = (Math.sin(game.gameTime * 2 + offset * 0.05) + 1) / 2;
              ctx.globalAlpha = 0.5 * pulse;
              ctx.fillRect(dx, dy, TILE_SIZE, TILE_SIZE);
              ctx.globalAlpha = 1.0;
            } else {
              ctx.fillStyle = C_SIDEWALK;
              ctx.fillRect(dx, dy, TILE_SIZE, TILE_SIZE);
            }
          }
        }
      }

      // Boats
      game.boats.forEach((b) => {
        if (b.life <= 0) return;
        ctx.globalAlpha = b.life / b.maxLife;
        ctx.fillStyle = C_BOAT;
        ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
        ctx.fillStyle = C_BOAT_DECK;
        ctx.fillRect(b.x - b.w / 2 + 4, b.y - b.h / 2 + 4, b.w - 8, b.h - 8);
        ctx.globalAlpha = 1.0;
      });

      // Portals
      game.map.portals.forEach((p) => {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 4;
        if (p.life !== undefined && p.life < 2.0) {
          const scale = p.life / 2.0;
          ctx.scale(scale, scale);
        }
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const r = 20 - i * 5;
          ctx.arc(0, 0, r, 0, Math.PI * 2);
        }
        ctx.stroke();
        ctx.restore();
      });

      // Deployed sinks
      game.deployedSinks.forEach((s) => {
        drawDeployedSink(ctx, s, game.gameTime);
      });

      // Tree trunks
      ctx.fillStyle = '#3e2723';
      game.map.trees.forEach((t) => {
        ctx.beginPath();
        ctx.arc(t.x, t.y, 4, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw coins
      game.coins.forEach(coin => {
        if (!coin.collected) {
          drawCoin(ctx, coin);
        }
      });

      // Draw immunity pickups
      game.immunityPickups.forEach(pickup => {
        if (!pickup.collected) {
          drawImmunityPickup(ctx, pickup);
        }
      });

      // Draw sink collectibles
      game.sinkCollectibles.forEach(sink => {
        if (!sink.collected) {
          drawSinkCollectible(ctx, sink);
        }
      });

      // Entities - Draw trails
      const isPlayerWalking = multiplayerMode === 'multiplayer' 
        ? (game.keys['ArrowUp'] || game.keys['KeyW'] || game.keys['ArrowDown'] || game.keys['KeyS'] || 
           game.keys['ArrowLeft'] || game.keys['KeyA'] || game.keys['ArrowRight'] || game.keys['KeyD'])
        : (game.player.velX !== 0 || game.player.velY !== 0);

      // Player trail - changes color when immune
      ctx.lineWidth = game.player.width * 0.8;
      ctx.lineCap = 'round';
      ctx.strokeStyle = game.immunityActive ? 'rgba(0, 255, 255, 0.5)' : 'rgba(0, 255, 255, 0.2)';
      ctx.beginPath();
      if (game.player.trail && game.player.trail.length > 0) {
        ctx.moveTo(game.player.trail[0].x, game.player.trail[0].y);
        for (const p of game.player.trail) ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();

      // Draw player with isometric Qbit (with immunity effect)
      drawQbitIsometric(
        ctx,
        game.player.x,
        game.player.y,
        game.player.dirX,
        game.player.dirY,
        true,
        isPlayerWalking,
        game.immunityActive
      );

      // Draw other players in multiplayer mode
      if (multiplayerMode === 'multiplayer' && (game as any).otherPlayers) {
        (game as any).otherPlayers.forEach((otherPlayer: any) => {
          const isWalking = Math.abs(otherPlayer.dirX) > 0.1 || Math.abs(otherPlayer.dirY) > 0.1;
          drawQbitIsometric(
            ctx,
            otherPlayer.x,
            otherPlayer.y,
            otherPlayer.dirX || 0,
            otherPlayer.dirY || 1,
            true,
            isWalking,
            otherPlayer.immunityActive || false
          );
          
          // Draw other player's trail
          ctx.lineWidth = 24 * 0.8;
          ctx.strokeStyle = 'rgba(0, 255, 255, 0.2)';
          ctx.beginPath();
          if (otherPlayer.trail && otherPlayer.trail.length > 0) {
            ctx.moveTo(otherPlayer.trail[0].x, otherPlayer.trail[0].y);
            otherPlayer.trail.forEach((p: any) => ctx.lineTo(p.x, p.y));
          }
          ctx.stroke();
        });
      }

      // Enemies
      game.enemies.forEach((e) => {
        ctx.lineWidth = e.width * 0.8;
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.2)';
        ctx.beginPath();
        if (e.trail.length > 0) {
          ctx.moveTo(e.trail[0].x, e.trail[0].y);
          for (const p of e.trail) ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();

        const edx = game.player.x - e.x;
        const edy = game.player.y - e.y;
        const dist = Math.hypot(edx, edy);
        const dirX = dist > 0 ? edx / dist : 0;
        const dirY = dist > 0 ? edy / dist : 1;

        drawQbitIsometric(ctx, e.x, e.y, dirX, dirY, false, true, false);
      });

      // Trees (top)
      ctx.fillStyle = C_TREE;
      game.map.trees.forEach((t) => {
        const cx = game.camera.x + canvas.width / 2;
        const cy = game.camera.y + canvas.height / 2;
        const leanX = (t.x - cx) * 0.2;
        const leanY = (t.y - cy) * 0.2;
        ctx.beginPath();
        ctx.arc(t.x + leanX, t.y + leanY, t.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2e7d32';
        ctx.beginPath();
        ctx.arc(t.x + leanX - 2, t.y + leanY - 2, t.r * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C_TREE;
      });

      // Buildings
      const screenCX = game.camera.x + canvas.width / 2;
      const screenCY = game.camera.y + canvas.height / 2;

      game.map.buildings
        .filter(
          (b) =>
            b.gridX >= startCol &&
            b.gridX <= endCol &&
            b.gridY >= startRow &&
            b.gridY <= endRow
        )
        .forEach((b) => {
          const bCX = b.x + b.w / 2;
          const bCY = b.y + b.h / 2;
          const leanX = (bCX - screenCX) * PERSPECTIVE_STRENGTH * (b.height / 100);
          const leanY = (bCY - screenCY) * PERSPECTIVE_STRENGTH * (b.height / 100);
          const rx = b.x + leanX, ry = b.y + leanY;

          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1;

          const drawQuad = (
            x1: number, y1: number,
            x2: number, y2: number,
            x3: number, y3: number,
            x4: number, y4: number,
            shade: string
          ) => {
            ctx.fillStyle = shade;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.lineTo(x3, y3);
            ctx.lineTo(x4, y4);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          };

          if (leanY < 0)
            drawQuad(b.x, b.y, b.x + b.w, b.y, rx + b.w, ry, rx, ry, '#111');
          if (leanY > 0)
            drawQuad(b.x, b.y + b.h, b.x + b.w, b.y + b.h, rx + b.w, ry + b.h, rx, ry + b.h, '#000');
          if (leanX < 0)
            drawQuad(b.x, b.y, b.x, b.y + b.h, rx, ry + b.h, rx, ry, '#1a1a1a');
          if (leanX > 0)
            drawQuad(b.x + b.w, b.y, b.x + b.w, b.y + b.h, rx + b.w, ry + b.h, rx + b.w, ry, '#0a0a0a');

          ctx.fillStyle = b.color;
          ctx.fillRect(rx, ry, b.w, b.h);
          ctx.strokeRect(rx, ry, b.w, b.h);

          if (b.type === TYPE_SHOP) {
            ctx.fillStyle = '#ff00ff';
            ctx.shadowColor = '#ff00ff';
            ctx.shadowBlur = 10;
            ctx.fillRect(rx + 5, ry + 5, b.w - 10, 5);
            ctx.shadowBlur = 0;
          } else if (b.type === TYPE_CAFE) {
            ctx.fillStyle = '#ffffff';
            for (let i = 0; i < b.w; i += 10) ctx.fillRect(rx + i, ry + b.h - 10, 5, 10);
          }
        });

      ctx.restore();

      // Minimap
      minimapCtx.fillStyle = '#000';
      minimapCtx.fillRect(0, 0, 150, 150);
      const sc = 150 / game.map.width;

      for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
          const t = game.map.tiles[y][x];
          if (t === 0) minimapCtx.fillStyle = '#444';
          else if (t === 2) minimapCtx.fillStyle = '#242';
          else if (t === 3) minimapCtx.fillStyle = '#00f';
          else if (t === 4) minimapCtx.fillStyle = '#f00';
          else continue;
          minimapCtx.fillRect(
            x * TILE_SIZE * sc,
            y * TILE_SIZE * sc,
            TILE_SIZE * sc,
            TILE_SIZE * sc
          );
        }
      }

      // Coins on minimap
      minimapCtx.fillStyle = '#ffd700';
      game.coins.forEach((c) => {
        if (!c.collected) {
          minimapCtx.beginPath();
          minimapCtx.arc((c.x * sc) / TILE_SIZE, (c.y * sc) / TILE_SIZE, 2, 0, Math.PI * 2);
          minimapCtx.fill();
        }
      });

      // Immunity pickups on minimap
      minimapCtx.fillStyle = '#00ffff';
      game.immunityPickups.forEach((p) => {
        if (!p.collected) {
          minimapCtx.beginPath();
          minimapCtx.arc((p.x * sc) / TILE_SIZE, (p.y * sc) / TILE_SIZE, 3, 0, Math.PI * 2);
          minimapCtx.fill();
        }
      });

      // Sink collectibles on minimap
      minimapCtx.fillStyle = '#ff6600';
      game.sinkCollectibles.forEach((s) => {
        if (!s.collected) {
          minimapCtx.beginPath();
          minimapCtx.arc((s.x * sc) / TILE_SIZE, (s.y * sc) / TILE_SIZE, 3, 0, Math.PI * 2);
          minimapCtx.fill();
        }
      });

      // Deployed sinks on minimap
      minimapCtx.fillStyle = '#ff0000';
      game.deployedSinks.forEach((s) => {
        minimapCtx.beginPath();
        minimapCtx.arc((s.x * sc) / TILE_SIZE, (s.y * sc) / TILE_SIZE, 4, 0, Math.PI * 2);
        minimapCtx.fill();
      });

      game.boats.forEach((b) => {
        if (b.life <= 0) return;
        minimapCtx.fillStyle = '#8B4513';
        minimapCtx.fillRect((b.x * sc) / TILE_SIZE - 2, (b.y * sc) / TILE_SIZE - 2, 4, 4);
      });

      game.map.portals.forEach((p) => {
        minimapCtx.fillStyle = '#fff';
        minimapCtx.beginPath();
        minimapCtx.arc((p.x * sc) / TILE_SIZE, (p.y * sc) / TILE_SIZE, 3, 0, Math.PI * 2);
        minimapCtx.fill();
      });

      minimapCtx.fillStyle = '#0ff';
      minimapCtx.fillRect(
        (game.player.x * sc) / TILE_SIZE - 2,
        (game.player.y * sc) / TILE_SIZE - 2,
        4,
        4
      );
      
      // Other players on minimap (multiplayer)
      if (multiplayerMode === 'multiplayer' && (game as any).otherPlayers) {
        minimapCtx.fillStyle = '#00ffff';
        (game as any).otherPlayers.forEach((p: any) =>
          minimapCtx.fillRect((p.x * sc) / TILE_SIZE - 2, (p.y * sc) / TILE_SIZE - 2, 4, 4)
        );
      }
      
      minimapCtx.fillStyle = '#f00';
      game.enemies.forEach((e) =>
        minimapCtx.fillRect((e.x * sc) / TILE_SIZE - 2, (e.y * sc) / TILE_SIZE - 2, 4, 4)
      );
    };

    const gameLoop = (timestamp: number) => {
      const dt = (timestamp - game.lastTime) / 1000;
      game.lastTime = timestamp;
      if (dt < 0.1) {
        update(dt);
      }
      draw();
      game.animationId = requestAnimationFrame(gameLoop);
    };

    // Input handlers
    const handleKeyDown = (e: KeyboardEvent) => {
      game.keys[e.code] = true;
      if (e.code === 'Space' && game.isPlaying) {
        trySpawnPortal();
      }
      if (e.code === 'KeyC' && game.isPlaying) {
        deploySink();
      }
      if (e.code === 'KeyV' && game.isPlaying) {
        activateImmunity();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      game.keys[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    init();
    game.animationId = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (game.animationId) cancelAnimationFrame(game.animationId);
    };
  }, [multiplayerMode, roomCode]);

  const handleRestart = () => {
    if (gameRef.current) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const game = gameRef.current;
      game.keys = {};
      game.map.tiles = [];
      game.map.buildings = [];
      game.map.trees = [];
      game.map.portals = [];
      game.coins = [];
      game.immunityPickups = [];
      game.sinkCollectibles = [];
      game.deployedSinks = [];
      game.coinSpawnTimer = 0;
      game.immunityPickupSpawnTimer = 0;
      game.sinkSpawnTimer = 0;
      game.speedBoostApplied = false;
      game.immunityActive = false;
      game.immunityEndTime = 0;
      game.coinsCollected = 0;
      game.immunityInventory = 0;
      game.playerSinkInventory = 0;
      game.gameTime = 0;
      game.player.speed = BASE_PLAYER_SPEED;
      setSinkInventory(0);
      setCoinsCollected(0);
      setImmunityInventory(0);
      setImmunityActive(false);
      setImmunityTimeLeft(0);

      for (let y = 0; y < MAP_HEIGHT; y++) {
        const row: number[] = [];
        for (let x = 0; x < MAP_WIDTH; x++) row.push(1);
        game.map.tiles.push(row);
      }

      const blockSize = 4;
      for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
          const isRoadRow = y % blockSize === 0;
          const isRoadCol = x % blockSize === 0;
          if (isRoadRow || isRoadCol) game.map.tiles[y][x] = 0;
          else {
            const rand = Math.random();
            if (rand < 0.05) {
              for (let ly = y - 1; ly <= y + 1; ly++) {
                for (let lx = x - 1; lx <= x + 1; lx++) {
                  if (ly >= 0 && ly < MAP_HEIGHT && lx >= 0 && lx < MAP_WIDTH) {
                    if (game.map.tiles[ly][lx] !== 0) game.map.tiles[ly][lx] = 3;
                  }
                }
              }
            } else if (rand < 0.15) game.map.tiles[y][x] = 2;
          }
        }
      }

      for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
          if (x === 0 || x === MAP_WIDTH - 1 || y === 0 || y === MAP_HEIGHT - 1) {
            game.map.tiles[y][x] = 4;
            continue;
          }
          const tile = game.map.tiles[y][x];
          const px = x * TILE_SIZE, py = y * TILE_SIZE;
          if (tile === 1) {
            const rand = Math.random();
            let type = TYPE_RESIDENTIAL, height = 40 + Math.random() * 60, color = '#252525', wallColor = '#151515';
            if (rand > 0.9) { type = TYPE_SHOP; height = 30 + Math.random() * 20; color = '#331133'; wallColor = '#220022'; }
            else if (rand > 0.8) { type = TYPE_CAFE; height = 25 + Math.random() * 15; color = '#2e3b2e'; wallColor = '#1a221a'; }
            game.map.buildings.push({ gridX: x, gridY: y, x: px, y: py, w: TILE_SIZE, h: TILE_SIZE, height, color, wallColor, type });
          } else if (tile === 2 && Math.random() > 0.3) {
            game.map.trees.push({ x: px + TILE_SIZE / 2 + (Math.random() * 20 - 10), y: py + TILE_SIZE / 2 + (Math.random() * 20 - 10), r: 10 + Math.random() * 10 });
          }
        }
      }

      let portalsCreated = 0;
      while (portalsCreated < 4) {
        const px = Math.floor(Math.random() * (MAP_WIDTH - 2)) + 1;
        const py = Math.floor(Math.random() * (MAP_HEIGHT - 2)) + 1;
        if (game.map.tiles[py][px] === 0) {
          game.map.portals.push({ x: px * TILE_SIZE + TILE_SIZE / 2, y: py * TILE_SIZE + TILE_SIZE / 2, color: `hsl(${portalsCreated * 90}, 100%, 50%)`, angle: 0 });
          portalsCreated++;
        }
      }

      game.boats = [];
      const perimeter = (MAP_WIDTH * 2 + MAP_HEIGHT * 2) * TILE_SIZE;
      const boatCount = 10;
      const spacing = perimeter / boatCount;
      for (let i = 0; i < boatCount; i++) game.boats.push({ dist: i * spacing, x: 0, y: 0, w: 48, h: 48, velX: 0, velY: 0, life: 10.0, maxLife: 10.0 });

      let spawnFound = false;
      while (!spawnFound) {
        const x = Math.floor(Math.random() * (MAP_WIDTH - 2)) + 1;
        const y = Math.floor(Math.random() * (MAP_HEIGHT - 2)) + 1;
        if (game.map.tiles[y][x] === 0) {
          game.player.x = x * TILE_SIZE + TILE_SIZE / 2;
          game.player.y = y * TILE_SIZE + TILE_SIZE / 2;
          spawnFound = true;
        }
      }

      game.player.trail = [];
      game.player.portalCooldown = 0;
      game.player.dirX = 0;
      game.player.dirY = 1;

      game.enemies = [];
      game.enemySpawnTimer = 0;
      for (let i = 0; i < 3; i++) {
        let ex = 0, ey = 0, valid = false, attempts = 0;
        while (!valid && attempts < 100) {
          attempts++;
          const rx = Math.floor(Math.random() * (MAP_WIDTH - 2)) + 1;
          const ry = Math.floor(Math.random() * (MAP_HEIGHT - 2)) + 1;
          if (game.map.tiles[ry][rx] === 0) {
            const candidateX = rx * TILE_SIZE + TILE_SIZE / 2;
            const candidateY = ry * TILE_SIZE + TILE_SIZE / 2;
            const d = Math.hypot(candidateX - game.player.x, candidateY - game.player.y);
            if (d > 800) { ex = candidateX; ey = candidateY; valid = true; }
          }
        }
        if (valid) game.enemies.push({ x: ex, y: ey, width: 24, height: 24, speed: BASE_ENEMY_SPEED + Math.random() * 30, trail: [], stuckTime: 0, flankTimer: 0, flankDir: { x: 0, y: 0 } });
      }

      game.camera.x = game.player.x - canvas.width / 2;
      game.camera.y = game.player.y - canvas.height / 2;
      
      game.isPlaying = true;
    }
  };

  return (
    <div className="relative w-full h-screen bg-background overflow-hidden">
      <canvas ref={canvasRef} className="block" />
      
      {/* Screen flash overlay */}
      {screenFlash && (
        <div 
          className="absolute inset-0 pointer-events-none z-40 transition-opacity duration-300"
          style={{ 
            backgroundColor: screenFlash.color, 
            opacity: screenFlash.opacity 
          }}
        />
      )}
      {/* Name Entry Screen */}
      {gameState === 'name-entry' && (
        <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50">
          <div className="bg-card p-8 rounded-xl border border-border max-w-md w-full mx-4">
            <h2 className="text-4xl font-bold text-cyan-400 mb-2 text-center tracking-wider">
              QBIT CITY
            </h2>
            <p className="text-muted-foreground text-center mb-6">Survive as long as you can!</p>
            
            {/* Game Mode Selection */}
            <div className="mb-4 flex gap-2">
              <button
                onClick={() => {
                  setMultiplayerMode('single');
                  setRoomCode('');
                  setRoomCodeInput('');
                  setIsHost(false);
                  setRoomPlayers([]);
                }}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                  multiplayerMode === 'single'
                    ? 'bg-cyan-500 text-white'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                <Globe size={18} className="inline mr-2" />
                Single Player
              </button>
              <button
                onClick={() => {
                  setMultiplayerMode('multiplayer');
                  socketService.connect();
                }}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                  multiplayerMode === 'multiplayer'
                    ? 'bg-cyan-500 text-white'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                <Users size={18} className="inline mr-2" />
                Multiplayer
              </button>
            </div>

            {/* Connection Status (Multiplayer) */}
            {multiplayerMode === 'multiplayer' && (
              <div className="mb-4 p-3 rounded-lg bg-secondary/50 border border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Connection:</span>
                  <span className={`text-sm font-medium ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                    {isConnected ? '● Connected' : '○ Disconnected'}
                  </span>
                </div>
                {roomCode && (
                  <div className="mt-2">
                    <div className="text-xs text-muted-foreground mb-1">Room Code:</div>
                    <div className="text-lg font-mono font-bold text-cyan-400">{roomCode}</div>
                    {isHost && (
                      <div className="text-xs text-amber-400 mt-1">You are the host</div>
                    )}
                  </div>
                )}
                {roomPlayers.length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs text-muted-foreground mb-1">Players ({roomPlayers.length}):</div>
                    <div className="flex flex-wrap gap-1">
                      {roomPlayers.map((p) => (
                        <span key={p.id} className="text-xs bg-background px-2 py-1 rounded">
                          {p.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            <input
              type="text"
              placeholder="Enter your name..."
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value.slice(0, 15))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (multiplayerMode === 'multiplayer' && !roomCode) {
                    createRoom();
                  } else {
                    startGame();
                  }
                }
              }}
              className="w-full px-4 py-3 bg-background border border-border rounded-lg 
                         text-foreground text-lg mb-4 focus:outline-none focus:ring-2 
                         focus:ring-cyan-400"
              autoFocus
            />

            {/* Multiplayer Room Actions */}
            {multiplayerMode === 'multiplayer' && !roomCode && (
              <div className="space-y-2 mb-4">
                <button
                  onClick={createRoom}
                  disabled={!playerName.trim() || !isConnected}
                  className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 
                             text-white font-bold rounded-lg disabled:opacity-50 
                             disabled:cursor-not-allowed hover:from-cyan-400 hover:to-blue-500
                             transition-all"
                >
                  Create Room
                </button>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Room Code"
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase().slice(0, 6))}
                    onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
                    className="flex-1 px-4 py-3 bg-background border border-border rounded-lg 
                               text-foreground text-lg focus:outline-none focus:ring-2 
                               focus:ring-cyan-400 uppercase"
                  />
                  <button
                    onClick={joinRoom}
                    disabled={!playerName.trim() || !roomCodeInput.trim() || !isConnected}
                    className="px-6 py-3 bg-secondary text-secondary-foreground font-bold rounded-lg 
                               disabled:opacity-50 disabled:cursor-not-allowed hover:bg-secondary/80
                               transition-all"
                  >
                    Join
                  </button>
                </div>
              </div>
            )}

            {/* Start Game Button */}
            {(!multiplayerMode || roomCode) && (
              <button
                onClick={startGame}
                disabled={!playerName.trim() || (multiplayerMode === 'multiplayer' && !isConnected)}
                className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 
                           text-white font-bold rounded-lg disabled:opacity-50 
                           disabled:cursor-not-allowed hover:from-cyan-400 hover:to-blue-500
                           transition-all"
              >
                {multiplayerMode === 'multiplayer' 
                  ? (isHost ? 'Start Game (Host)' : 'Waiting for host...')
                  : 'Start Game'}
              </button>
            )}
            
            <button
              onClick={() => setShowLeaderboard(true)}
              className="w-full py-2 mt-3 text-amber-400 hover:text-amber-300 
                         flex items-center justify-center gap-2 transition-colors"
            >
              <Trophy size={18} />
              View Leaderboard
            </button>
          </div>
        </div>
      )}

      {/* Game Over Screen with Quiz */}
      {gameState === 'game-over' && (
        <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50">
          <div className="bg-card p-8 rounded-xl border border-border max-w-lg w-full mx-4 text-center">
            <h2 className="text-3xl font-bold text-red-500 mb-2">GAME OVER</h2>
            
            <p className="text-lg text-foreground mb-1">{playerName}</p>
            
            <div className="mb-4">
              <div className="bg-background p-3 rounded-lg inline-block">
                <p className="text-muted-foreground text-xs">Time Survived</p>
                <p className="text-2xl font-mono text-cyan-400">{formatTime(finalStats.time)}</p>
              </div>
            </div>
            
            {/* Quiz Section */}
            {!quizCompleted && quizQuestions.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <span className="text-amber-400 font-bold">Answer 3 Questions to Respawn</span>
                </div>
                
                <div className="text-sm text-muted-foreground mb-3">
                  Question {currentQuestionIndex + 1} of 3
                  {wrongAnswerCount > 0 && (
                    <span className="text-red-400 ml-2">({wrongAnswerCount} wrong)</span>
                  )}
                </div>
                
                <div className="bg-background p-4 rounded-lg mb-4">
                  <p className="text-lg text-foreground font-medium mb-4">
                    {quizQuestions[currentQuestionIndex]?.question}
                  </p>
                  
                  <div className="grid grid-cols-2 gap-2">
                    {quizQuestions[currentQuestionIndex]?.options.map((option, index) => {
                      let buttonClass = "py-2 px-3 rounded-lg font-medium transition-all text-sm ";
                      
                      if (answerFeedback !== null) {
                        if (index === quizQuestions[currentQuestionIndex].correctIndex) {
                          buttonClass += "bg-green-500 text-white ";
                        } else if (index === selectedAnswer && answerFeedback === 'wrong') {
                          buttonClass += "bg-red-500 text-white ";
                        } else {
                          buttonClass += "bg-muted text-muted-foreground ";
                        }
                      } else {
                        buttonClass += "bg-muted hover:bg-muted/80 text-foreground cursor-pointer ";
                      }
                      
                      return (
                        <button
                          key={index}
                          onClick={() => handleQuizAnswer(index)}
                          disabled={answerFeedback !== null}
                          className={buttonClass}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </div>
                
                {answerFeedback && (
                  <p className={`text-sm font-bold ${answerFeedback === 'correct' ? 'text-green-400' : 'text-red-400'}`}>
                    {answerFeedback === 'correct' ? 'Correct!' : 'Wrong!'}
                  </p>
                )}
              </div>
            )}
            
            {/* Quiz Completed */}
            {quizCompleted && (
              <div className="mb-6">
                <div className="bg-green-500/20 border border-green-400 p-4 rounded-lg mb-4">
                  <p className="text-green-400 font-bold text-lg">Quiz Complete!</p>
                  <p className="text-green-300 text-sm">
                    You got {3 - wrongAnswerCount}/3 correct
                  </p>
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={handlePlayAgain}
                    className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 
                               text-white font-bold rounded-lg hover:from-cyan-400 hover:to-blue-500
                               transition-all"
                  >
                    Play Again
                  </button>
                  <button
                    onClick={() => setShowLeaderboard(true)}
                    className="px-4 py-3 bg-amber-500/20 border border-amber-400 
                               text-amber-400 font-bold rounded-lg hover:bg-amber-500/30
                               transition-all"
                  >
                    <Trophy size={20} />
                  </button>
                </div>
              </div>
            )}
            
            {/* Show leaderboard button during quiz */}
            {!quizCompleted && (
              <button
                onClick={() => setShowLeaderboard(true)}
                className="text-sm text-muted-foreground hover:text-amber-400 transition-colors"
              >
                View Leaderboard
              </button>
            )}
          </div>
        </div>
      )}

      {/* Leaderboard Popup */}
      {showLeaderboard && (
        <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-xl border border-border max-w-lg w-full mx-4 max-h-[80vh]">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-amber-400 flex items-center gap-2">
                <Trophy size={28} /> Leaderboard
              </h2>
              <button 
                onClick={() => setShowLeaderboard(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            
            {leaderboard.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No scores yet. Be the first!</p>
            ) : (
              <div className="overflow-y-auto max-h-[50vh]">
                <table className="w-full">
                  <thead>
                    <tr className="text-muted-foreground text-sm border-b border-border">
                      <th className="py-2 text-left">#</th>
                      <th className="py-2 text-left">Name</th>
                      <th className="py-2 text-right">Time Survived</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((entry, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-2 text-muted-foreground">{i + 1}</td>
                        <td className="py-2 text-foreground">{entry.name}</td>
                        <td className="py-2 text-right text-cyan-400">{formatTime(entry.timeSurvived)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* UI Overlay - Only show when playing */}
      {gameState === 'playing' && (
        <div className="absolute top-5 left-5 text-foreground pointer-events-none w-80">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="m-0 text-2xl text-cyan-400 uppercase tracking-widest font-bold drop-shadow-lg">
                Qbit City
              </h1>
              {multiplayerMode === 'multiplayer' && roomCode && (
                <div className="text-xs text-muted-foreground mt-1">
                  Room: {roomCode} • {roomPlayers.length} player{roomPlayers.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
            <button
              onClick={() => setShowLeaderboard(true)}
              className="pointer-events-auto p-2 text-amber-400 hover:text-amber-300 transition-colors"
            >
              <Trophy size={24} />
            </button>
          </div>
          
          {/* Timer */}
          <div className="flex items-center gap-4 mt-2 text-lg">
            <span className="text-cyan-400 font-mono text-xl">
              ⏱ {formatTime(gameTime)}
            </span>
          </div>

          {/* Immunity Indicator */}
          {immunityActive && (
            <div className="mt-2 bg-cyan-500/20 border border-cyan-400 rounded-lg px-3 py-2 animate-pulse">
              <span className="text-cyan-400 font-bold flex items-center gap-2">
                <Shield size={18} /> IMMUNE! {immunityTimeLeft.toFixed(1)}s
              </span>
            </div>
          )}

          {/* Coin Counter */}
          <div className="mt-3 flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Coins:</span>
            <div className="flex gap-1">
              {[0, 1, 2, 3, 4].map(i => (
                <div
                  key={i}
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs
                    ${i < coinsCollected 
                      ? 'bg-amber-500/50 border-amber-400 text-amber-400' 
                      : 'bg-muted/20 border-muted-foreground/30'
                    }`}
                >
                  {i < coinsCollected ? '$' : ''}
                </div>
              ))}
            </div>
            <span className="text-amber-400 text-xs">({coinsCollected}/5)</span>
          </div>

          {/* Immunity Inventory */}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Stored Immunity:</span>
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className={`w-6 h-6 rounded border-2 flex items-center justify-center
                    ${i < immunityInventory 
                      ? 'bg-cyan-500/30 border-cyan-400 text-cyan-400' 
                      : 'bg-muted/20 border-muted-foreground/30 text-muted-foreground/30'
                    }`}
                >
                  <Shield size={12} />
                </div>
              ))}
            </div>
            {immunityInventory > 0 && (
              <span className="text-cyan-400 text-xs">(Press V)</span>
            )}
          </div>

          {/* Energy Bar */}
          <div className="mt-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-muted-foreground text-sm">Portal Energy:</span>
              <span className={`text-xs ${energy >= 1 ? 'text-fuchsia-400' : 'text-muted-foreground'}`}>
                {energy >= 1 ? 'READY!' : `${Math.floor(energy * 100)}%`}
              </span>
            </div>
            <div className="h-3 bg-muted/30 rounded-full overflow-hidden border border-muted-foreground/30">
              <div 
                className={`h-full transition-all duration-100 ${
                  energy >= 1 ? 'bg-fuchsia-500 animate-pulse' : 'bg-fuchsia-500/60'
                }`}
                style={{ width: `${energy * 100}%` }}
              />
            </div>
          </div>

          {/* Sink Inventory */}
          <div className="mt-3 flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Sink Traps:</span>
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className={`w-6 h-6 rounded border-2 flex items-center justify-center text-xs
                    ${i < sinkInventory 
                      ? 'bg-orange-500/30 border-orange-400 text-orange-400' 
                      : 'bg-muted/20 border-muted-foreground/30 text-muted-foreground/30'
                    }`}
                >
                  🕳️
                </div>
              ))}
            </div>
            {sinkInventory > 0 && (
              <span className="text-orange-400 text-xs">(Press C)</span>
            )}
          </div>
          
          <div className="mt-3 space-y-1">
            <p className="text-sm text-muted-foreground">WASD / Arrows to Move</p>
            <p className="text-sm text-muted-foreground">
              <span className="text-fuchsia-500">SPACE</span>: Create Portal
            </p>
            <p className="text-sm text-muted-foreground">
              <span className="text-orange-400">C</span>: Deploy Sink Trap
            </p>
            <p className="text-sm text-muted-foreground">
              <span className="text-cyan-400">V</span>: Use Stored Immunity
            </p>
            <p className="text-sm text-muted-foreground">
              Ride <span className="text-amber-700">Boats</span> (They sink in 10s!)
            </p>
          </div>

          {/* Collectibles info - only before 30 seconds */}
          {gameTime < COLLECTIBLES_START_TIME && (
            <div className="mt-3 text-xs text-muted-foreground">
              Power-ups appear in {Math.ceil(COLLECTIBLES_START_TIME - gameTime)}s...
            </div>
          )}

          {/* Status */}
          {status && (
            <p
              className="font-bold mt-2 text-sm animate-pulse"
              style={{ color: statusColor }}
            >
              {status}
            </p>
          )}
        </div>
      )}

      {/* Minimap - Always render but hide when not playing */}
      <canvas
        ref={minimapRef}
        width={150}
        height={150}
        className={`absolute top-5 right-5 border-2 border-border bg-black/80 rounded ${
          gameState !== 'playing' ? 'hidden' : ''
        }`}
      />

      {/* Back Button */}
      <Link
        to="/"
        className="absolute bottom-5 left-5 flex items-center gap-2 px-4 py-2 bg-secondary/90 hover:bg-secondary text-secondary-foreground rounded-lg transition-all pointer-events-auto"
      >
        <ArrowLeft size={18} />
        <span>Back to Animator</span>
      </Link>

      {/* Restart Button - Only show when playing */}
      {gameState === 'playing' && (
        <button
          onClick={handleRestart}
          className="absolute bottom-5 right-5 flex items-center gap-2 px-4 py-2 bg-secondary/90 hover:bg-secondary text-secondary-foreground rounded-lg transition-all pointer-events-auto"
        >
          <RefreshCw size={18} />
          <span>Restart</span>
        </button>
      )}
    </div>
  );
};

export default Game;
