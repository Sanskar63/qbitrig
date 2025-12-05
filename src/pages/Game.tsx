import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';

const TILE_SIZE = 64;
const MAP_WIDTH = 50;
const MAP_HEIGHT = 50;
const PERSPECTIVE_STRENGTH = 0.4;
const ENERGY_MAX = 100;
const ENERGY_GAIN_PER_PIXEL = 0.05;

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
  energy: number;
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

const Game: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState('');
  const [statusColor, setStatusColor] = useState('#fff');
  const [energy, setEnergy] = useState(0);
  const gameRef = useRef<{
    player: Player;
    enemies: Enemy[];
    boats: Boat[];
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
    lastTime: number;
    animationId: number | null;
  } | null>(null);

  const showStatus = (text: string, color: string = '#fff', duration: number = 2000) => {
    setStatus(text);
    setStatusColor(color);
    setTimeout(() => setStatus(''), duration);
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
        speed: 300,
        velX: 0,
        velY: 0,
        dirX: 0,
        dirY: 1,
        trail: [] as { x: number; y: number }[],
        portalCooldown: 0,
        energy: 0,
      },
      enemies: [] as Enemy[],
      boats: [] as Boat[],
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
      lastTime: 0,
      animationId: null as number | null,
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
              // Lake
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
      let ex = 0,
        ey = 0;
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
        game.enemies.push({
          x: ex,
          y: ey,
          width: 24,
          height: 24,
          speed: 250 + Math.random() * 30,
          trail: [],
          stuckTime: 0,
          flankTimer: 0,
          flankDir: { x: 0, y: 0 },
        });
      }
    };

    const init = () => {
      generateCity();
      initBoats();
      findSafeSpawn(game.player);
      game.player.trail = [];
      game.player.portalCooldown = 0;
      game.player.energy = 0;
      game.player.dirX = 0;
      game.player.dirY = 1;
      setEnergy(0);

      game.enemies = [];
      game.enemySpawnTimer = 0;
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
      const halfW = w / 2,
        halfH = h / 2;
      const l = x - halfW,
        r = x + halfW,
        t = y - halfH,
        b = y + halfH;
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
        let nx = 0,
          ny = 0;

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
      if (game.player.energy >= ENERGY_MAX) {
        const spawnDist = 60;
        const px = game.player.x + game.player.dirX * spawnDist;
        const py = game.player.y + game.player.dirY * spawnDist;

        game.map.portals.push({
          x: px,
          y: py,
          color: '#ff00ff',
          angle: 0,
          life: 10.0,
        });

        game.player.energy = 0;
        setEnergy(0);
        showStatus('>> NEW PORTAL STABILIZED <<', '#d0f');
        game.player.portalCooldown = 1.0;
      } else {
        showStatus('NOT ENOUGH ENERGY!', '#888', 1000);
      }
    };

    const update = (dt: number) => {
      game.gameTime += dt;
      updateBoats(dt);

      let dx = 0,
        dy = 0;
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

      const riddenBoat = getBoatUnderPlayer();
      if (riddenBoat) {
        riddenBoat.life -= dt;
        game.player.x += riddenBoat.velX * dt;
        game.player.y += riddenBoat.velY * dt;
      }

      game.boats.forEach((b) => {
        if (b !== riddenBoat) b.life = b.maxLife;
      });

      const moved = attemptMove(
        game.player,
        game.player.velX * dt,
        game.player.velY * dt,
        true
      );

      if (checkLavaDeath()) {
        init();
        return;
      }

      if (moved > 0 && game.player.energy < ENERGY_MAX) {
        game.player.energy += moved * ENERGY_GAIN_PER_PIXEL;
        if (game.player.energy > ENERGY_MAX) game.player.energy = ENERGY_MAX;
        setEnergy(game.player.energy);
      }

      game.player.trail.push({ x: game.player.x, y: game.player.y });
      if (game.player.trail.length > 20) game.player.trail.shift();

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
            showStatus('PORTAL TRAVEL SEQUENCE INITIATED', '#0ff');
            break;
          }
        }
      }

      // Enemy logic
      game.enemies.forEach((enemy) => {
        let moveX = 0,
          moveY = 0;

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
            init();
            return;
          }
        }

        let actualX = 0,
          actualY = 0;
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

      // Spawner
      game.enemySpawnTimer += dt;
      if (game.enemySpawnTimer >= 30) {
        game.enemySpawnTimer = 0;
        spawnEnemy();
        spawnEnemy();
        showStatus('WARNING: HEAVY ENEMY REINFORCEMENTS!', '#f00', 3000);
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
            const dx = x * TILE_SIZE,
              dy = y * TILE_SIZE;

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

      // Trees (bottom)
      ctx.fillStyle = '#3e2723';
      game.map.trees.forEach((t) => {
        ctx.beginPath();
        ctx.arc(t.x, t.y, 4, 0, Math.PI * 2);
        ctx.fill();
      });

      // Entities - Draw trails
      const isPlayerWalking = game.player.velX !== 0 || game.player.velY !== 0;

      // Player trail
      ctx.lineWidth = game.player.width * 0.8;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.2)';
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
          const rx = b.x + leanX,
            ry = b.y + leanY;

          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1;

          const drawQuad = (
            x1: number,
            y1: number,
            x2: number,
            y2: number,
            x3: number,
            y3: number,
            x4: number,
            y4: number,
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
            drawQuad(
              b.x,
              b.y + b.h,
              b.x + b.w,
              b.y + b.h,
              rx + b.w,
              ry + b.h,
              rx,
              ry + b.h,
              '#000'
            );
          if (leanX < 0)
            drawQuad(b.x, b.y, b.x, b.y + b.h, rx, ry + b.h, rx, ry, '#1a1a1a');
          if (leanX > 0)
            drawQuad(
              b.x + b.w,
              b.y,
              b.x + b.w,
              b.y + b.h,
              rx + b.w,
              ry + b.h,
              rx + b.w,
              ry,
              '#0a0a0a'
            );

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
        draw();
      }
      game.animationId = requestAnimationFrame(gameLoop);
    };

    // Input handlers
    const handleKeyDown = (e: KeyboardEvent) => {
      game.keys[e.code] = true;
      if (e.code === 'Space') {
        trySpawnPortal();
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
      
      // Re-init
      const game = gameRef.current;
      game.map.tiles = [];
      game.map.buildings = [];
      game.map.trees = [];
      game.map.portals = [];

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
      game.player.energy = 0;
      game.player.dirX = 0;
      game.player.dirY = 1;
      setEnergy(0);

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
        if (valid) game.enemies.push({ x: ex, y: ey, width: 24, height: 24, speed: 250 + Math.random() * 30, trail: [], stuckTime: 0, flankTimer: 0, flankDir: { x: 0, y: 0 } });
      }

      game.camera.x = game.player.x - canvas.width / 2;
      game.camera.y = game.player.y - canvas.height / 2;
    }
  };

  return (
    <div className="relative w-full h-screen bg-background overflow-hidden">
      <canvas ref={canvasRef} className="block" />
      
      {/* UI Overlay */}
      <div className="absolute top-5 left-5 text-foreground pointer-events-none w-72">
        <h1 className="m-0 text-2xl text-cyan-400 uppercase tracking-widest font-bold drop-shadow-lg">
          Qbit City
        </h1>
        <p className="text-sm text-muted-foreground mt-1">WASD / Arrows to Move</p>
        <p className="text-sm text-muted-foreground">
          Spacebar to <span className="text-fuchsia-500">Create Portal</span>
        </p>
        <p className="text-sm text-muted-foreground">
          Ride <span className="text-amber-700">Boats</span> (They sink in 10s!)
        </p>

        {/* Energy Bar */}
        <div className="mt-3 w-48 h-2.5 bg-muted border-2 border-border rounded">
          <div
            className="h-full transition-all duration-100 rounded"
            style={{
              width: `${Math.min(100, (energy / ENERGY_MAX) * 100)}%`,
              backgroundColor: energy >= ENERGY_MAX ? '#fff' : '#d0f',
              boxShadow: energy >= ENERGY_MAX ? '0 0 10px #fff' : '0 0 10px #d0f',
            }}
          />
        </div>
        <p
          className="text-xs mt-1"
          style={{ color: energy >= ENERGY_MAX ? '#fff' : '#d0f' }}
        >
          {energy >= ENERGY_MAX ? 'READY (PRESS SPACE)' : 'Move to Charge Energy'}
        </p>

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

      {/* Minimap */}
      <canvas
        ref={minimapRef}
        width={150}
        height={150}
        className="absolute top-5 right-5 border-2 border-border bg-black/80 rounded"
      />

      {/* Back Button */}
      <Link
        to="/"
        className="absolute bottom-5 left-5 flex items-center gap-2 px-4 py-2 bg-secondary/90 hover:bg-secondary text-secondary-foreground rounded-lg transition-all pointer-events-auto"
      >
        <ArrowLeft size={18} />
        <span>Back to Animator</span>
      </Link>

      {/* Restart Button */}
      <button
        onClick={handleRestart}
        className="absolute bottom-5 right-5 flex items-center gap-2 px-4 py-2 bg-secondary/90 hover:bg-secondary text-secondary-foreground rounded-lg transition-all pointer-events-auto"
      >
        <RefreshCw size={18} />
        <span>Restart</span>
      </button>
    </div>
  );
};

export default Game;
