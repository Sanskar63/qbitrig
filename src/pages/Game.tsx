import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Trophy, X } from 'lucide-react';

const TILE_SIZE = 64;
const MAP_WIDTH = 50;
const MAP_HEIGHT = 50;
const PERSPECTIVE_STRENGTH = 0.4;
const BASE_PLAYER_SPEED = 300;
const BASE_ENEMY_SPEED = 250;
const SPEED_BOOST_DURATION = 5; // seconds
const COLLECTIBLES_START_TIME = 30; // seconds before collectibles appear

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

interface SpeedBoostCoin {
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

type GameState = 'name-entry' | 'playing' | 'game-over';

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
  const [speedBoostActive, setSpeedBoostActive] = useState(false);
  const [speedBoostTimeLeft, setSpeedBoostTimeLeft] = useState(0);
  const [energy, setEnergy] = useState(0);
  const [gameTime, setGameTime] = useState(0);
  
  // Game state management
  const [gameState, setGameState] = useState<GameState>('name-entry');
  const [playerName, setPlayerName] = useState('');
  const playerNameRef = useRef('');
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [finalStats, setFinalStats] = useState({ time: 0 });
  
  const gameRef = useRef<{
    player: Player;
    enemies: Enemy[];
    boats: Boat[];
    speedBoostCoins: SpeedBoostCoin[];
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
    speedCoinSpawnTimer: number;
    sinkSpawnTimer: number;
    speedBoostApplied: boolean;
    speedBoostActive: boolean;
    speedBoostEndTime: number;
    playerSinkInventory: number;
    energy: number;
    lastTime: number;
    animationId: number | null;
    isPlaying: boolean;
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

  // Draw speed boost coin with electric effect
  const drawSpeedBoostCoin = (ctx: CanvasRenderingContext2D, coin: SpeedBoostCoin) => {
    const time = Date.now() * 0.005 + coin.spawnTime;
    const pulse = 0.8 + Math.sin(time * 3) * 0.2;
    const bob = Math.sin(time * 2) * 4;
    
    ctx.save();
    ctx.translate(coin.x, coin.y + bob);
    
    // Electric glow
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 25 * pulse;
    
    // Outer ring
    ctx.fillStyle = '#00ccff';
    ctx.beginPath();
    ctx.arc(0, 0, 14 * pulse, 0, Math.PI * 2);
    ctx.fill();
    
    // Inner ring
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0088cc';
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    
    // Lightning bolt
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-3, -8);
    ctx.lineTo(2, -2);
    ctx.lineTo(-1, -2);
    ctx.lineTo(3, 8);
    ctx.lineTo(-2, 1);
    ctx.lineTo(1, 1);
    ctx.closePath();
    ctx.fill();
    
    // Sparkles
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) {
      const angle = time * 2 + (i * Math.PI / 2);
      const dist = 18 + Math.sin(time * 4 + i) * 3;
      const sx = Math.cos(angle) * dist;
      const sy = Math.sin(angle) * dist;
      ctx.beginPath();
      ctx.arc(sx, sy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  };

  // Draw sink collectible
  const drawSinkCollectible = (ctx: CanvasRenderingContext2D, sink: SinkCollectible) => {
    const time = Date.now() * 0.004 + sink.spawnTime;
    const pulse = 0.9 + Math.sin(time * 2) * 0.1;
    const bob = Math.sin(time * 1.5) * 3;
    
    ctx.save();
    ctx.translate(sink.x, sink.y + bob);
    
    // Glow
    ctx.shadowColor = '#ff6600';
    ctx.shadowBlur = 20 * pulse;
    
    // Outer hexagon
    ctx.fillStyle = '#ff4400';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * 14 * pulse;
      const y = Math.sin(angle) * 14 * pulse;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    
    // Inner circle (hole)
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#220000';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // Spiral inside
    ctx.strokeStyle = '#ff8800';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 4 + time * 3;
      const r = (i / 20) * 6;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    
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

  // Draw isometric Qbit
  const drawQbitIsometric = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    isPlayer: boolean,
    isWalking: boolean
  ) => {
    ctx.save();
    ctx.translate(x, y);

    const angle = Math.atan2(dirY, dirX);
    ctx.rotate(angle + Math.PI / 2);

    const walkBob = isWalking ? Math.sin(Date.now() * 0.01) * 2 : 0;
    const coatPulse = isWalking ? Math.sin(Date.now() * 0.02) * 2 : 0;

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

  const startGame = () => {
    if (!playerName.trim()) return;
    playerNameRef.current = playerName.trim();
    setGameState('playing');
    setSinkInventory(0);
    setSpeedBoostActive(false);
    setSpeedBoostTimeLeft(0);
    setGameTime(0);
    
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    
    if (gameRef.current) {
      const game = gameRef.current;
      game.isPlaying = true;
      game.gameTime = 0;
      game.speedBoostApplied = false;
      game.speedBoostActive = false;
      game.speedBoostEndTime = 0;
      game.playerSinkInventory = 0;
      game.speedCoinSpawnTimer = 0;
      game.sinkSpawnTimer = 0;
      game.player.speed = BASE_PLAYER_SPEED;
    }
  };

  const handleDeath = () => {
    if (!gameRef.current) return;
    
    const time = gameRef.current.gameTime;
    
    setFinalStats({ time });
    const nameToSave = playerNameRef.current || playerName;
    if (nameToSave.trim()) {
      saveToLeaderboard(nameToSave, time);
    }
    setGameState('game-over');
    gameRef.current.isPlaying = false;
  };

  const handlePlayAgain = () => {
    setGameState('playing');
    setSinkInventory(0);
    setSpeedBoostActive(false);
    setSpeedBoostTimeLeft(0);
    setEnergy(0);
    
    if (gameRef.current) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      gameRef.current.keys = {}; // Reset stuck keys
      gameRef.current.isPlaying = true;
      gameRef.current.gameTime = 0;
      gameRef.current.speedBoostApplied = false;
      gameRef.current.speedBoostActive = false;
      gameRef.current.speedBoostEndTime = 0;
      gameRef.current.playerSinkInventory = 0;
      gameRef.current.energy = 0;
      gameRef.current.speedBoostCoins = [];
      gameRef.current.sinkCollectibles = [];
      gameRef.current.deployedSinks = [];
      gameRef.current.speedCoinSpawnTimer = 0;
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
      speedBoostCoins: [] as SpeedBoostCoin[],
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
      speedCoinSpawnTimer: 0,
      sinkSpawnTimer: 0,
      speedBoostApplied: false,
      speedBoostActive: false,
      speedBoostEndTime: 0,
      playerSinkInventory: 0,
      energy: 0,
      lastTime: 0,
      animationId: null as number | null,
      isPlaying: false,
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

    // Spawn speed boost coin in a specific quadrant
    const spawnSpeedBoostCoinInQuadrant = (quadrant: number) => {
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
          
          game.speedBoostCoins.push({
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
      game.speedCoinSpawnTimer = 0;
      game.sinkSpawnTimer = 0;
      game.speedBoostApplied = false;
      game.speedBoostActive = false;
      game.speedBoostEndTime = 0;
      game.playerSinkInventory = 0;
      game.speedBoostCoins = [];
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
      if (game.energy < 1) {
        showStatus('ENERGY NOT FULL! Keep moving!', '#888', 500);
        return;
      }
      
      // Clear any existing portals - only one portal allowed
      game.map.portals = [];
      
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
      });

      game.energy = 0; // Consume energy
      setEnergy(0);
      showStatus('>> PORTAL CREATED <<', '#d0f');
    };

    const deploySink = () => {
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

    const update = (dt: number) => {
      if (!game.isPlaying) return;
      
      game.gameTime += dt;
      
      // Sync game time to React state
      if (Math.floor(game.gameTime * 2) !== Math.floor((game.gameTime - dt) * 2)) {
        setGameTime(game.gameTime);
      }
      
      updateBoats(dt);

      // Speed boost at 30 seconds (game difficulty)
      if (!game.speedBoostApplied && game.gameTime >= 30) {
        game.speedBoostApplied = true;
        if (!game.speedBoostActive) {
          game.player.speed = BASE_PLAYER_SPEED * 1.2;
        }
        game.enemies.forEach(enemy => {
          enemy.speed = enemy.speed * 1.2;
        });
        showStatus('⚡ DIFFICULTY UP! Everything is 20% faster!', '#ffcc00', 3000);
      }

      // Handle speed boost power-up expiration
      if (game.speedBoostActive && game.gameTime >= game.speedBoostEndTime) {
        game.speedBoostActive = false;
        game.player.speed = game.speedBoostApplied ? BASE_PLAYER_SPEED * 1.2 : BASE_PLAYER_SPEED;
        setSpeedBoostActive(false);
        showStatus('Speed boost ended!', '#888', 1000);
      }
      
      // Update speed boost time left for UI
      if (game.speedBoostActive) {
        setSpeedBoostTimeLeft(Math.max(0, game.speedBoostEndTime - game.gameTime));
      }

      // Spawn speed boost coins after 60 seconds (quadrant system)
      if (game.gameTime >= COLLECTIBLES_START_TIME) {
        game.speedCoinSpawnTimer += dt;
        if (game.speedCoinSpawnTimer >= 20 + Math.random() * 10) {
          game.speedCoinSpawnTimer = 0;
          
          // Count coins per quadrant
          const quadrantCounts = [0, 0, 0, 0];
          game.speedBoostCoins.forEach(c => {
            if (!c.collected) quadrantCounts[c.quadrant]++;
          });
          
          // Spawn in quadrants with < 2 coins
          for (let q = 0; q < 4; q++) {
            if (quadrantCounts[q] < 2) {
              spawnSpeedBoostCoinInQuadrant(q);
            }
          }
        }
        
        // Spawn sink collectibles after 60 seconds
        game.sinkSpawnTimer += dt;
        if (game.sinkSpawnTimer >= 25 + Math.random() * 10) {
          game.sinkSpawnTimer = 0;
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

      game.player.velX = dx * game.player.speed;
      game.player.velY = dy * game.player.speed;

      // Energy recharge based on movement
      if (dx !== 0 || dy !== 0) {
        game.energy = Math.min(1, game.energy + dt * 0.3); // Full energy in ~3.3 seconds of movement
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

      attemptMove(
        game.player,
        game.player.velX * dt,
        game.player.velY * dt,
        true
      );

      if (checkLavaDeath()) {
        handleDeath();
        return;
      }

      game.player.trail.push({ x: game.player.x, y: game.player.y });
      if (game.player.trail.length > 20) game.player.trail.shift();

      // Speed boost coin collection
      game.speedBoostCoins.forEach(coin => {
        if (coin.collected) return;
        const d = Math.hypot(game.player.x - coin.x, game.player.y - coin.y);
        if (d < 30) {
          coin.collected = true;
          game.speedBoostActive = true;
          game.speedBoostEndTime = game.gameTime + SPEED_BOOST_DURATION;
          game.player.speed = (game.speedBoostApplied ? BASE_PLAYER_SPEED * 1.2 : BASE_PLAYER_SPEED) * 2;
          setSpeedBoostActive(true);
          showStatus('⚡ 2X SPEED ACTIVATED!', '#00ffff', 2000);
        }
      });
      game.speedBoostCoins = game.speedBoostCoins.filter(c => !c.collected);

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

      // Portal logic
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
            let destIndex = i;
            if (game.map.portals.length > 1) {
              while (destIndex === i) {
                destIndex = Math.floor(Math.random() * game.map.portals.length);
              }
            }
            const dest = game.map.portals[destIndex];
            game.player.x = dest.x;
            game.player.y = dest.y;
            game.player.portalCooldown = 2.0;
            game.player.trail = [];
            showStatus('PORTAL TRAVEL!', '#0ff');
            break;
          }
        }
      }

      // Enemy logic
      game.enemies.forEach((enemy) => {
        // Check collision with deployed sinks
        for (let i = game.deployedSinks.length - 1; i >= 0; i--) {
          const sink = game.deployedSinks[i];
          const d = Math.hypot(enemy.x - sink.x, enemy.y - sink.y);
          if (d < 25) {
            // Enemy hit the sink - respawn far away
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

          if (dist < (game.player.width / 2 + enemy.width / 2)) {
            handleDeath();
            return;
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
          ctx.ellipse(0, 0, 20 - i * 5, 10 - i * 2, i + p.angle, 0, Math.PI * 2);
        }
        ctx.stroke();
        ctx.restore();
      });

      // Deployed sinks
      game.deployedSinks.forEach(sink => {
        drawDeployedSink(ctx, sink, game.gameTime);
      });

      // Trees (bottom)
      ctx.fillStyle = '#3e2723';
      game.map.trees.forEach((t) => {
        ctx.beginPath();
        ctx.arc(t.x, t.y, 4, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw speed boost coins
      game.speedBoostCoins.forEach(coin => {
        if (!coin.collected) {
          drawSpeedBoostCoin(ctx, coin);
        }
      });

      // Draw sink collectibles
      game.sinkCollectibles.forEach(sink => {
        if (!sink.collected) {
          drawSinkCollectible(ctx, sink);
        }
      });

      // Entities - Draw trails
      const isPlayerWalking = game.player.velX !== 0 || game.player.velY !== 0;

      // Player trail
      ctx.lineWidth = game.player.width * 0.8;
      ctx.lineCap = 'round';
      ctx.strokeStyle = game.speedBoostActive ? 'rgba(0, 255, 255, 0.5)' : 'rgba(0, 255, 255, 0.2)';
      ctx.beginPath();
      if (game.player.trail.length > 0) {
        ctx.moveTo(game.player.trail[0].x, game.player.trail[0].y);
        for (const p of game.player.trail) ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();

      // Draw player with isometric Qbit
      drawQbitIsometric(
        ctx,
        game.player.x,
        game.player.y,
        game.player.dirX,
        game.player.dirY,
        true,
        isPlayerWalking
      );

      // Speed boost effect around player
      if (game.speedBoostActive) {
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.5 + Math.sin(Date.now() * 0.01) * 0.3;
        ctx.beginPath();
        ctx.arc(game.player.x, game.player.y, 30, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
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

        drawQbitIsometric(ctx, e.x, e.y, dirX, dirY, false, true);
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

      // Speed boost coins on minimap
      minimapCtx.fillStyle = '#00ffff';
      game.speedBoostCoins.forEach((c) => {
        if (!c.collected) {
          minimapCtx.beginPath();
          minimapCtx.arc((c.x * sc) / TILE_SIZE, (c.y * sc) / TILE_SIZE, 3, 0, Math.PI * 2);
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
  }, []);

  const handleRestart = () => {
    if (gameRef.current) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const game = gameRef.current;
      game.keys = {}; // Reset stuck keys
      game.map.tiles = [];
      game.map.buildings = [];
      game.map.trees = [];
      game.map.portals = [];
      game.speedBoostCoins = [];
      game.sinkCollectibles = [];
      game.deployedSinks = [];
      game.speedCoinSpawnTimer = 0;
      game.sinkSpawnTimer = 0;
      game.speedBoostApplied = false;
      game.speedBoostActive = false;
      game.speedBoostEndTime = 0;
      game.playerSinkInventory = 0;
      game.gameTime = 0;
      game.player.speed = BASE_PLAYER_SPEED;
      setSinkInventory(0);
      setSpeedBoostActive(false);
      setSpeedBoostTimeLeft(0);

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
      
      {/* Name Entry Screen */}
      {gameState === 'name-entry' && (
        <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50">
          <div className="bg-card p-8 rounded-xl border border-border max-w-md w-full mx-4">
            <h2 className="text-4xl font-bold text-cyan-400 mb-2 text-center tracking-wider">
              QBIT CITY
            </h2>
            <p className="text-muted-foreground text-center mb-6">Survive as long as you can!</p>
            
            <input
              type="text"
              placeholder="Enter your name..."
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value.slice(0, 15))}
              onKeyDown={(e) => e.key === 'Enter' && startGame()}
              className="w-full px-4 py-3 bg-background border border-border rounded-lg 
                         text-foreground text-lg mb-4 focus:outline-none focus:ring-2 
                         focus:ring-cyan-400"
              autoFocus
            />
            
            <button
              onClick={startGame}
              disabled={!playerName.trim()}
              className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 
                         text-white font-bold rounded-lg disabled:opacity-50 
                         disabled:cursor-not-allowed hover:from-cyan-400 hover:to-blue-500
                         transition-all"
            >
              Start Game
            </button>
            
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

      {/* Game Over Screen */}
      {gameState === 'game-over' && (
        <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50">
          <div className="bg-card p-8 rounded-xl border border-border max-w-md w-full mx-4 text-center">
            <h2 className="text-3xl font-bold text-red-500 mb-4">GAME OVER</h2>
            
            <p className="text-xl text-foreground mb-2">{playerName}</p>
            
            <div className="my-6">
              <div className="bg-background p-4 rounded-lg">
                <p className="text-muted-foreground text-sm">Time Survived</p>
                <p className="text-3xl font-bold text-cyan-400">{formatTime(finalStats.time)}</p>
              </div>
            </div>
            
            <button
              onClick={handlePlayAgain}
              className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 
                         text-white font-bold rounded-lg hover:from-cyan-400 hover:to-blue-500
                         transition-all mb-3"
            >
              Play Again
            </button>
            
            <button
              onClick={() => setShowLeaderboard(true)}
              className="w-full py-2 text-amber-400 hover:text-amber-300 
                         flex items-center justify-center gap-2 transition-colors"
            >
              <Trophy size={18} />
              View Leaderboard
            </button>
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
            <h1 className="m-0 text-2xl text-cyan-400 uppercase tracking-widest font-bold drop-shadow-lg">
              Qbit City
            </h1>
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

          {/* Speed Boost Indicator */}
          {speedBoostActive && (
            <div className="mt-2 bg-cyan-500/20 border border-cyan-400 rounded-lg px-3 py-2 animate-pulse">
              <span className="text-cyan-400 font-bold">⚡ 2X SPEED! {speedBoostTimeLeft.toFixed(1)}s</span>
            </div>
          )}

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
              Ride <span className="text-amber-700">Boats</span> (They sink in 10s!)
            </p>
          </div>

          {/* Collectibles info - only after 60 seconds */}
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
