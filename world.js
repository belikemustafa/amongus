/* VOID CREW — Skeld-Inspired 14-Room Spaceship, 2.5D Pre-Rendered Graphics, Raycast Fog & Security/Admin Systems */
(function () {
  const TILE = 80;
  const COLS = 40;
  const ROWS = 28;
  const MAP_W = COLS * TILE; // 3200
  const MAP_H = ROWS * TILE; // 2240
  const PLAYER_RADIUS = 19;

  const COLORS = [
    { name: 'Red',    hex: '#c51111' },
    { name: 'Blue',   hex: '#132ed1' },
    { name: 'Green',  hex: '#117f2d' },
    { name: 'Pink',   hex: '#ed54ba' },
    { name: 'Orange', hex: '#ef7d0d' },
    { name: 'Yellow', hex: '#f5f557' },
    { name: 'Cyan',   hex: '#38fedc' },
    { name: 'Lime',   hex: '#50ef39' },
    { name: 'Purple', hex: '#6b2fbb' },
    { name: 'White',  hex: '#d6e0f0' }
  ];

  // Room definitions in grid tile coordinates (c1..c2 inclusive, r1..r2 inclusive)
  const ROOM_DEFS = [
    { id: 'upper_engine', name: 'UPPER ENGINE',   c1: 3,  r1: 2,  c2: 8,  r2: 6,  theme: 'engine' },
    { id: 'cafeteria',    name: 'CAFETERIA',      c1: 16, r1: 1,  c2: 24, r2: 8,  theme: 'cafe' },
    { id: 'weapons',      name: 'WEAPONS',        c1: 29, r1: 2,  c2: 34, r2: 6,  theme: 'tech' },
    { id: 'medbay',       name: 'MEDBAY',         c1: 10, r1: 7,  c2: 14, r2: 10, theme: 'medbay' },
    { id: 'reactor',      name: 'REACTOR',        c1: 1,  r1: 9,  c2: 4,  r2: 16, theme: 'reactor' },
    { id: 'security',     name: 'SECURITY',       c1: 9,  r1: 12, c2: 12, r2: 16, theme: 'security' },
    { id: 'admin',        name: 'ADMIN',          c1: 23, r1: 12, c2: 26, r2: 15, theme: 'admin' },
    { id: 'o2',           name: 'O2',             c1: 27, r1: 8,  c2: 29, r2: 10, theme: 'o2' },
    { id: 'navigation',   name: 'NAVIGATION',     c1: 35, r1: 10, c2: 38, r2: 15, theme: 'nav' },
    { id: 'electrical',   name: 'ELECTRICAL',     c1: 14, r1: 14, c2: 17, r2: 18, theme: 'elec' },
    { id: 'lower_engine', name: 'LOWER ENGINE',   c1: 3,  r1: 19, c2: 8,  r2: 23, theme: 'engine' },
    { id: 'storage',      name: 'STORAGE',        c1: 19, r1: 17, c2: 23, r2: 24, theme: 'storage' },
    { id: 'comms',        name: 'COMMUNICATIONS', c1: 25, r1: 23, c2: 28, r2: 25, theme: 'tech' },
    { id: 'shields',      name: 'SHIELDS',        c1: 30, r1: 19, c2: 35, r2: 23, theme: 'shields' }
  ];

  // Corridors & doorways connecting every room into the authentic Skeld loop
  const CORRIDOR_RECTS = [
    { c1: 9,  r1: 4,  c2: 15, r2: 5 },  // Upper Engine <-> Cafeteria
    { c1: 11, r1: 6,  c2: 12, r2: 6 },  // MedBay Doorway
    { c1: 25, r1: 4,  c2: 28, r2: 5 },  // Cafeteria <-> Weapons
    { c1: 6,  r1: 7,  c2: 7,  r2: 18 }, // West Hallway
    { c1: 5,  r1: 12, c2: 5,  r2: 13 }, // Reactor Doorway
    { c1: 8,  r1: 13, c2: 8,  r2: 14 }, // Security Doorway
    { c1: 19, r1: 9,  c2: 21, r2: 16 }, // Center Hallway (Cafe <-> Storage)
    { c1: 22, r1: 13, c2: 22, r2: 14 }, // Admin Doorway
    { c1: 31, r1: 7,  c2: 32, r2: 18 }, // East Hallway
    { c1: 30, r1: 8,  c2: 30, r2: 9 },  // O2 Doorway
    { c1: 33, r1: 12, c2: 34, r2: 13 }, // Navigation Hallway
    { c1: 9,  r1: 20, c2: 18, r2: 21 }, // Lower-Left Hallway
    { c1: 15, r1: 19, c2: 16, r2: 19 }, // Electrical Doorway
    { c1: 24, r1: 20, c2: 29, r2: 21 }, // Lower-Right Hallway
    { c1: 26, r1: 22, c2: 27, r2: 22 }  // Comms Doorway
  ];

  // Build tile map: null = SPACE, 'WALL' = solid hull/wall, string = room/corridor id
  const GRID = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const ROOM_MAP = {};
  for (const r of ROOM_DEFS) {
    ROOM_MAP[r.id] = r;
    for (let row = r.r1; row <= r.r2; row++) {
      for (let col = r.c1; col <= r.c2; col++) GRID[row][col] = r.id;
    }
  }
  for (const c of CORRIDOR_RECTS) {
    for (let row = c.r1; row <= c.r2; row++) {
      for (let col = c.c1; col <= c.c2; col++) {
        if (!GRID[row][col]) GRID[row][col] = 'corridor';
      }
    }
  }

  // Classic Electrical blind-corner interior partition wall
  GRID[16][14] = 'WALL';
  GRID[16][15] = 'WALL';

  // Auto-surround all floor tiles with 1-tile thick ship hull walls
  const isFloor = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS && GRID[r][c] && GRID[r][c] !== 'WALL';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (GRID[r][c] !== null) continue;
      let touches = false;
      for (let dr = -1; dr <= 1 && !touches; dr++) {
        for (let dc = -1; dc <= 1 && !touches; dc++) {
          if (isFloor(r + dr, c + dc)) touches = true;
        }
      }
      if (touches) GRID[r][c] = 'WALL';
    }
  }

  // Merge horizontal wall tiles into AABBs for fast collision & raycasting
  const WALLS = [];
  for (let r = 0; r < ROWS; r++) {
    let start = -1;
    for (let c = 0; c <= COLS; c++) {
      const isW = c < COLS && GRID[r][c] === 'WALL';
      if (isW && start === -1) start = c;
      else if (!isW && start !== -1) {
        WALLS.push({ x: start * TILE, y: r * TILE, w: (c - start) * TILE, h: TILE });
        start = -1;
      }
    }
  }

  const tc = (col, row) => ({ x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 });

  const EMERGENCY_POS = { ...tc(20, 4.4), radius: 56 };

  // Collidable circular tables/furniture (Cafeteria side tables + Admin table + Storage crates)
  const OBSTACLES = [
    { x: 17.4 * TILE, y: 2.6 * TILE, r: 34, kind: 'cafeTable' },
    { x: 23.6 * TILE, y: 2.6 * TILE, r: 34, kind: 'cafeTable' },
    { x: 17.4 * TILE, y: 7.4 * TILE, r: 34, kind: 'cafeTable' },
    { x: 23.6 * TILE, y: 7.4 * TILE, r: 34, kind: 'cafeTable' },
    { x: 22.8 * TILE, y: 23.1 * TILE, r: 36, kind: 'crates' }
  ];

  // 4 Authentic Vent Loops (3 vents each)
  const VENTS = [
    // Loop A: Classic Triangle of Death (Security <-> MedBay <-> Electrical)
    { id: 0, ...tc(9.5, 15.6),  net: 'A', room: 'Security' },
    { id: 1, ...tc(10.6, 9.6),  net: 'A', room: 'MedBay' },
    { id: 2, ...tc(14.5, 14.5), net: 'A', room: 'Electrical' },
    // Loop B: West Wing (Reactor <-> Upper Engine <-> Lower Engine)
    { id: 3, ...tc(3.6, 10.2),  net: 'B', room: 'Reactor' },
    { id: 4, ...tc(4.0, 5.7),   net: 'B', room: 'Upper Engine' },
    { id: 5, ...tc(4.0, 22.6),  net: 'B', room: 'Lower Engine' },
    // Loop C: Center Hub (Cafeteria <-> Admin <-> O2)
    { id: 6, ...tc(23.6, 6.2),  net: 'C', room: 'Cafeteria' },
    { id: 7, ...tc(25.6, 14.6), net: 'C', room: 'Admin' },
    { id: 8, ...tc(28.5, 8.5),  net: 'C', room: 'O2' },
    // Loop D: East Wing (Weapons <-> Navigation <-> Shields)
    { id: 9,  ...tc(33.5, 2.7),  net: 'D', room: 'Weapons' },
    { id: 10, ...tc(36.0, 10.6), net: 'D', room: 'Navigation' },
    { id: 11, ...tc(34.4, 22.6), net: 'D', room: 'Shields' }
  ];

  // 12 Rich Ship Tasks across all wings
  const TASKS = [
    { id: 't_wires_elec',  room: 'Electrical',     label: 'Fix Wiring',           type: 'wires',     ...tc(14.6, 14.3) },
    { id: 't_dist_elec',   room: 'Electrical',     label: 'Calibrate Breaker',    type: 'numbers',   ...tc(16.7, 14.4) },
    { id: 't_nav_chart',   room: 'Navigation',     label: 'Chart Course',         type: 'keypad',    ...tc(37.7, 11.4) },
    { id: 't_nav_steer',   room: 'Navigation',     label: 'Stabilize Steering',   type: 'hold',      ...tc(37.8, 13.5) },
    { id: 't_react_man',   room: 'Reactor',        label: 'Unlock Manifolds',     type: 'numbers',   ...tc(2.2, 10.2) },
    { id: 't_react_core',  room: 'Reactor',        label: 'Start Reactor',        type: 'keypad',    ...tc(2.2, 15.2) },
    { id: 't_med_scan',    room: 'MedBay',         label: 'Submit Bio-Scan',      type: 'hold',      ...tc(12.8, 9.2) },
    { id: 't_weap_ast',    room: 'Weapons',        label: 'Clear Asteroids',      type: 'asteroids', ...tc(32.5, 3.6) },
    { id: 't_admin_card',  room: 'Admin',          label: 'Swipe ID Card',        type: 'card',      ...tc(25.2, 12.6) },
    { id: 't_o2_clean',    room: 'O2',             label: 'Clean O2 Filter',      type: 'clean',     ...tc(27.5, 9.6) },
    { id: 't_shields_on',  room: 'Shields',        label: 'Prime Shields',        type: 'lights',    ...tc(33.8, 20.6) },
    { id: 't_stor_fuel',   room: 'Storage',        label: 'Refuel Canisters',     type: 'hold',      ...tc(19.6, 23.2) },
    { id: 't_eng_align',   room: 'Upper Engine',   label: 'Align Engine Output',  type: 'hold',      ...tc(5.5, 2.5) },
    { id: 't_comms_dl',    room: 'Communications', label: 'Download Data',        type: 'hold',      ...tc(27.4, 24.4) }
  ];

  // Utility Consoles usable by any living player
  const CONSOLES = {
    security: { id: 'security', room: 'Security', label: 'Security Cameras', ...tc(10.5, 12.6) },
    admin:    { id: 'admin',    room: 'Admin',    label: 'Admin Map Table',  ...tc(24.5, 14.2) }
  };

  // Live Security Camera positions
  const CAMERAS = [
    { name: 'CAM 01 • WEST HALL',   ...tc(6.5, 12.8) },
    { name: 'CAM 02 • MEDBAY HALL', ...tc(12.0, 4.5) },
    { name: 'CAM 03 • CENTER HALL', ...tc(20.0, 12.5) },
    { name: 'CAM 04 • NAV HALL',    ...tc(31.5, 12.8) }
  ];

  const SABOTAGES = {
    lights:  { id: 'lights',  room: 'Electrical', label: 'Fix Lights',    ...tc(16.6, 17.5) },
    reactor: { id: 'reactor', room: 'Reactor',    label: 'Reset Reactor', ...tc(1.7, 12.5) }
  };

  // Verified stuck-free navigation graph for bots
  const wp = (id, col, row, adj) => ({ id, x: col * TILE + TILE / 2, y: row * TILE + TILE / 2, adj });
  const WAYPOINTS = [
    wp(0,  4.8,  4.5,  [26]),                  // Upper Engine
    wp(1,  11.5, 4.5,  [26, 2, 3]),            // Upper-Left Hall
    wp(2,  11.5, 8.5,  [1]),                   // MedBay
    wp(3,  17.5, 4.5,  [1, 4]),                // Cafeteria West
    wp(4,  20.0, 7.2,  [3, 5, 11]),            // Cafeteria South
    wp(5,  23.2, 4.5,  [4, 6]),                // Cafeteria East
    wp(6,  27.0, 4.5,  [5, 7]),                // Upper-Right Hall
    wp(7,  31.5, 4.5,  [6, 8]),                // Weapons
    wp(8,  31.5, 8.8,  [7, 9, 10]),            // East Hall Top
    wp(9,  28.2, 8.8,  [8]),                   // O2
    wp(10, 31.5, 12.8, [8, 13, 14]),           // East Hall Mid
    wp(11, 20.0, 13.5, [4, 12, 18]),           // Center Hall
    wp(12, 24.3, 13.5, [11]),                  // Admin
    wp(13, 36.5, 12.8, [10]),                  // Navigation
    wp(14, 31.5, 20.5, [10, 15]),              // Shields
    wp(15, 26.5, 20.5, [14, 16, 17]),          // Lower-Right Hall
    wp(16, 26.5, 24.0, [15]),                  // Comms
    wp(17, 20.5, 20.5, [15, 18, 19]),          // Storage Mid
    wp(18, 20.0, 17.8, [11, 17]),              // Storage North
    wp(19, 15.8, 20.5, [17, 20, 21]),          // Lower-Left Hall
    wp(20, 15.8, 17.6, [19, 25]),              // Electrical Entry
    wp(21, 6.5,  20.5, [19, 22]),              // Lower Engine
    wp(22, 6.5,  13.2, [21, 23, 24, 26]),      // West Hall Mid
    wp(23, 2.8,  12.8, [22]),                  // Reactor
    wp(24, 10.5, 13.5, [22]),                  // Security
    wp(25, 16.5, 14.8, [20]),                  // Electrical Back
    wp(26, 6.5,  4.5,  [0, 1, 22])             // Upper Engine East
  ];

  // Circle vs Walls + Obstacles Collision
  function resolveCollision(x, y, radius, isGhost) {
    let nx = Math.max(TILE + radius, Math.min(MAP_W - TILE - radius, x));
    let ny = Math.max(TILE + radius, Math.min(MAP_H - TILE - radius, y));
    if (isGhost) return { x: nx, y: ny };

    for (let iter = 0; iter < 2; iter++) {
      for (const w of WALLS) {
        const cx = Math.max(w.x, Math.min(nx, w.x + w.w));
        const cy = Math.max(w.y, Math.min(ny, w.y + w.h));
        const dx = nx - cx;
        const dy = ny - cy;
        const distSq = dx * dx + dy * dy;
        if (distSq < radius * radius) {
          const dist = Math.sqrt(distSq);
          if (dist === 0) {
            const left = Math.abs(nx - w.x);
            const right = Math.abs(w.x + w.w - nx);
            const top = Math.abs(ny - w.y);
            const bot = Math.abs(w.y + w.h - ny);
            const m = Math.min(left, right, top, bot);
            if (m === left) nx = w.x - radius;
            else if (m === right) nx = w.x + w.w + radius;
            else if (m === top) ny = w.y - radius;
            else ny = w.y + w.h + radius;
          } else {
            const push = radius - dist;
            nx += (dx / dist) * push;
            ny += (dy / dist) * push;
          }
        }
      }
      // Emergency table + side obstacles
      const pushCircle = (ox, oy, orad) => {
        const dx = nx - ox, dy = ny - oy;
        const minD = radius + orad;
        const d = Math.hypot(dx, dy);
        if (d < minD && d > 0.001) {
          nx = ox + (dx / d) * minD;
          ny = oy + (dy / d) * minD;
        }
      };
      pushCircle(EMERGENCY_POS.x, EMERGENCY_POS.y, EMERGENCY_POS.radius);
      for (const ob of OBSTACLES) pushCircle(ob.x, ob.y, ob.r);
    }
    return { x: nx, y: ny };
  }

  // Segment vs AABB Line of Sight
  function segHitsRect(x1, y1, x2, y2, r) {
    let t0 = 0, t1 = 1;
    const dx = x2 - x1, dy = y2 - y1;
    const checks = [
      [-dx, x1 - r.x],
      [dx, (r.x + r.w) - x1],
      [-dy, y1 - r.y],
      [dy, (r.y + r.h) - y1]
    ];
    for (const [p, q] of checks) {
      if (p === 0) { if (q < 0) return false; }
      else {
        const t = q / p;
        if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
        else { if (t < t0) return false; if (t < t1) t1 = t; }
      }
    }
    return t0 <= t1;
  }

  function hasLineOfSight(x1, y1, x2, y2) {
    for (const w of WALLS) {
      if (segHitsRect(x1, y1, x2, y2, w)) return false;
    }
    return true;
  }

  function getRoomId(x, y) {
    const c = Math.floor(x / TILE), r = Math.floor(y / TILE);
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) return GRID[r][c];
    return null;
  }

  function getRoomName(x, y) {
    const id = getRoomId(x, y);
    if (id && ROOM_MAP[id]) return ROOM_MAP[id].name;
    return 'CORRIDOR';
  }

  // --- PROCEDURAL WEB AUDIO ---
  const SFX = {
    ctx: null,
    muted: false,
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    tone(freq, dur, type = 'sine', vol = 0.14, endFreq = null) {
      if (this.muted) return;
      this.ensure();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, now + dur);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + dur);
    },
    kill() { this.tone(190, 0.25, 'sawtooth', 0.22, 38); setTimeout(() => this.tone(92, 0.24, 'square', 0.16, 28), 75); },
    task() { this.tone(540, 0.11, 'triangle', 0.16); setTimeout(() => this.tone(820, 0.2, 'triangle', 0.16), 95); },
    alarm() { this.tone(640, 0.18, 'sawtooth', 0.16, 430); setTimeout(() => this.tone(640, 0.26, 'sawtooth', 0.16, 430), 210); },
    vent() { this.tone(150, 0.16, 'sine', 0.14, 360); },
    click() { this.tone(460, 0.05, 'sine', 0.08); },
    chat() { this.tone(700, 0.07, 'sine', 0.08, 900); }
  };

  // --- PRE-RENDERED HIGH-DETAIL 2.5D SHIP DECK CANVAS ---
  const shipCanvas = document.createElement('canvas');
  shipCanvas.width = MAP_W;
  shipCanvas.height = MAP_H;
  const sCtx = shipCanvas.getContext('2d');

  function bakeShipDeck() {
    sCtx.clearRect(0, 0, MAP_W, MAP_H);

    // 1. Draw detailed room & corridor floor tiles
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = GRID[r][c];
        if (!cell || cell === 'WALL') continue;
        const x = c * TILE, y = r * TILE;
        const theme = ROOM_MAP[cell] ? ROOM_MAP[cell].theme : 'corridor';
        drawFloorTile(sCtx, x, y, c, r, theme);
      }
    }

    // 2. Subtle room labels stamped onto metallic deck floor
    sCtx.save();
    sCtx.textAlign = 'center';
    sCtx.font = '900 28px Inter, sans-serif';
    for (const r of ROOM_DEFS) {
      const cx = ((r.c1 + r.c2 + 1) / 2) * TILE;
      const cy = ((r.r1 + r.r2 + 1) / 2) * TILE + 10;
      sCtx.fillStyle = 'rgba(255,255,255,0.055)';
      sCtx.fillText(r.name, cx, cy);
    }
    sCtx.restore();

    // 3. Detailed Static Room Props (Skeld Furniture & Machinery)
    drawStaticRoomProps(sCtx);

    // 4. 2.5D Walls with Beveled Top Caps, Front Vertical Facades & Floor Shadows
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (GRID[r][c] !== 'WALL') continue;
        const x = c * TILE, y = r * TILE;
        const floorBelow = isFloor(r + 1, c);
        const floorAbove = isFloor(r - 1, c);
        const floorLeft = isFloor(r, c - 1);
        const floorRight = isFloor(r, c + 1);

        // Drop shadow onto floor below
        if (floorBelow) {
          const sh = sCtx.createLinearGradient(x, y + TILE, x, y + TILE + 22);
          sh.addColorStop(0, 'rgba(0,0,0,0.48)');
          sh.addColorStop(1, 'rgba(0,0,0,0)');
          sCtx.fillStyle = sh;
          sCtx.fillRect(x, y + TILE, TILE, 22);
        }

        // Wall Top Cap (metallic dark hull)
        sCtx.fillStyle = '#2c3547';
        sCtx.fillRect(x, y, TILE, TILE);
        // Inner dark trim
        sCtx.fillStyle = '#1f2636';
        sCtx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);

        // 2.5D Front Vertical Wall Panel when facing south into a room/corridor
        if (floorBelow) {
          const faceH = 42;
          const fy = y + TILE - faceH;
          const grad = sCtx.createLinearGradient(x, fy, x, y + TILE);
          grad.addColorStop(0, '#5a6882');
          grad.addColorStop(0.18, '#465269');
          grad.addColorStop(0.85, '#333d50');
          grad.addColorStop(1, '#202735');
          sCtx.fillStyle = grad;
          sCtx.fillRect(x, fy, TILE, faceH);

          // Metallic vertical panel seam + bolts
          sCtx.strokeStyle = 'rgba(0,0,0,0.35)';
          sCtx.lineWidth = 2;
          sCtx.beginPath();
          sCtx.moveTo(x + TILE / 2, fy + 4);
          sCtx.lineTo(x + TILE / 2, y + TILE - 4);
          sCtx.stroke();

          // Top bright metallic lip
          sCtx.fillStyle = '#7c8ca8';
          sCtx.fillRect(x, fy, TILE, 3);
          // Bottom baseboard
          sCtx.fillStyle = '#141923';
          sCtx.fillRect(x, y + TILE - 5, TILE, 5);
        }

        // Thick comic ink outlines on edges bordering floor or outer space
        sCtx.fillStyle = '#080b11';
        if (floorBelow || (r + 1 < ROWS && GRID[r + 1][c] === null)) sCtx.fillRect(x, y + TILE - 3, TILE, 3);
        if (floorAbove || (r - 1 >= 0 && GRID[r - 1][c] === null)) sCtx.fillRect(x, y, TILE, 3);
        if (floorLeft || (c - 1 >= 0 && GRID[r][c - 1] === null)) sCtx.fillRect(x, y, 3, TILE);
        if (floorRight || (c + 1 < COLS && GRID[r][c + 1] === null)) sCtx.fillRect(x + TILE - 3, y, 3, TILE);
      }
    }

    // 5. Navigation Panoramic Starlight Window on East Wall
    sCtx.save();
    const wx = 39 * TILE + 6, wy = 10.6 * TILE, wh = 4.8 * TILE;
    sCtx.fillStyle = '#050b18';
    sCtx.fillRect(wx, wy, 22, wh);
    sCtx.strokeStyle = '#38bdf8';
    sCtx.lineWidth = 3;
    sCtx.strokeRect(wx, wy, 22, wh);
    sCtx.restore();
  }

  function drawFloorTile(ctx, x, y, c, r, theme) {
    const alt = (c + r) % 2 === 0;
    if (theme === 'cafe') {
      ctx.fillStyle = alt ? '#6f7c8e' : '#657283';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = 'rgba(0,0,0,0.16)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, TILE, TILE);
    } else if (theme === 'medbay') {
      ctx.fillStyle = alt ? '#8ea6ad' : '#8098a0';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
    } else if (theme === 'reactor') {
      ctx.fillStyle = alt ? '#48505f' : '#404856';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.strokeRect(x, y, TILE, TILE);
      // Grating lines
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(x + 12, y + 12, TILE - 24, 6);
      ctx.fillRect(x + 12, y + TILE - 18, TILE - 24, 6);
    } else if (theme === 'engine') {
      ctx.fillStyle = alt ? '#56505d' : '#4d4754';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.strokeRect(x, y, TILE, TILE);
    } else if (theme === 'elec') {
      ctx.fillStyle = alt ? '#4c515c' : '#444954';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.strokeRect(x, y, TILE, TILE);
    } else if (theme === 'storage') {
      ctx.fillStyle = alt ? '#66605c' : '#5e5854';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.strokeRect(x, y, TILE, TILE);
    } else if (theme === 'admin') {
      ctx.fillStyle = alt ? '#5b6c73' : '#526269';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.strokeRect(x, y, TILE, TILE);
    } else if (theme === 'o2') {
      ctx.fillStyle = alt ? '#667b78' : '#5d716e';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = 'rgba(0,0,0,0.16)';
      ctx.strokeRect(x, y, TILE, TILE);
    } else if (theme === 'shields') {
      ctx.fillStyle = alt ? '#5d5c6d' : '#545363';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.strokeRect(x, y, TILE, TILE);
    } else if (theme === 'nav' || theme === 'tech' || theme === 'security') {
      ctx.fillStyle = alt ? '#4b5568' : '#434c5e';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.strokeRect(x, y, TILE, TILE);
    } else {
      // Corridor metallic panels with center guide stripe
      ctx.fillStyle = alt ? '#556072' : '#4e596a';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, TILE, TILE);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(x + 8, y + 8, 6, 6);
      ctx.fillRect(x + TILE - 14, y + TILE - 14, 6, 6);
    }
  }

  function drawStaticRoomProps(ctx) {
    // --- CAFETERIA: Center Emergency Table + 4 Side Tables with Stools ---
    for (const ob of OBSTACLES) {
      if (ob.kind === 'cafeTable') {
        // Stools
        for (let a = 0; a < 4; a++) {
          const ang = a * Math.PI / 2 + Math.PI / 4;
          ctx.fillStyle = '#334155';
          ctx.strokeStyle = '#090c12';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(ob.x + Math.cos(ang) * 42, ob.y + Math.sin(ang) * 42, 11, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        }
        // Table
        ctx.fillStyle = '#94a3b8';
        ctx.strokeStyle = '#090c12';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(ob.x, ob.y, ob.r, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        // Inner rim & tray
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.arc(ob.x, ob.y, ob.r - 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(ob.x - 14, ob.y - 8, 16, 11);
        ctx.fillStyle = '#f87171';
        ctx.beginPath(); ctx.arc(ob.x + 12, ob.y + 4, 5, 0, Math.PI * 2); ctx.fill();
      } else if (ob.kind === 'crates') {
        // Storage cargo boxes
        drawCrate(ctx, ob.x - 32, ob.y - 28, 42, 40, '#9a6b3e');
        drawCrate(ctx, ob.x - 6, ob.y - 6, 40, 38, '#7c532e');
      }
    }

    // Center Cafeteria Emergency Table
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.arc(EMERGENCY_POS.x + 4, EMERGENCY_POS.y + 8, EMERGENCY_POS.radius + 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.strokeStyle = '#090c12';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(EMERGENCY_POS.x, EMERGENCY_POS.y, EMERGENCY_POS.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath(); ctx.arc(EMERGENCY_POS.x, EMERGENCY_POS.y, EMERGENCY_POS.radius - 11, 0, Math.PI * 2); ctx.fill();
    // Glass emergency case + red button
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(EMERGENCY_POS.x - 24, EMERGENCY_POS.y - 24, 48, 48);
    ctx.strokeStyle = '#090c12'; ctx.lineWidth = 3;
    ctx.strokeRect(EMERGENCY_POS.x - 24, EMERGENCY_POS.y - 24, 48, 48);
    ctx.fillStyle = '#dc2626';
    ctx.beginPath(); ctx.arc(EMERGENCY_POS.x, EMERGENCY_POS.y, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.arc(EMERGENCY_POS.x - 5, EMERGENCY_POS.y - 5, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // --- UPPER & LOWER ENGINE TURBINES ---
    drawEngineTurbine(ctx, 3.6 * TILE, 3.2 * TILE);
    drawEngineTurbine(ctx, 3.6 * TILE, 20.5 * TILE);

    // --- MEDBAY BEDS ---
    for (let i = 0; i < 3; i++) {
      const bx = (12.6 + i * 0.78) * TILE, by = 7.35 * TILE;
      ctx.fillStyle = '#e2e8f0'; ctx.strokeStyle = '#090c12'; ctx.lineWidth = 2.5;
      roundRect(ctx, bx, by, 44, 64, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      roundRect(ctx, bx + 4, by + 22, 36, 36, 4); ctx.fill();
      ctx.fillStyle = '#fff';
      roundRect(ctx, bx + 8, by + 6, 28, 12, 4); ctx.fill();
    }

    // --- SECURITY MONITOR BANK ---
    const sx = 9.4 * TILE, sy = 12.1 * TILE;
    ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#090c12'; ctx.lineWidth = 3;
    roundRect(ctx, sx, sy, 180, 44, 6); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(sx + 10 + i * 42, sy + 8, 34, 24);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(sx + 13 + i * 42, sy + 11, 14, 4);
    }

    // --- ADMIN HOLOGRAPHIC MAP TABLE ---
    const ax = 24.5 * TILE, ay = 14.2 * TILE;
    ctx.fillStyle = '#334155'; ctx.strokeStyle = '#090c12'; ctx.lineWidth = 3.5;
    roundRect(ctx, ax - 54, ay - 30, 108, 60, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0f2942';
    roundRect(ctx, ax - 44, ay - 20, 88, 40, 6); ctx.fill();
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.8;
    ctx.strokeRect(ax - 34, ay - 12, 68, 24);

    // --- O2 POTTED PLANT & CANISTERS ---
    const ox = 28.8 * TILE, oy = 10.2 * TILE;
    ctx.fillStyle = '#78350f'; ctx.strokeStyle = '#090c12'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(ox, oy, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#16a34a';
    for (let a = 0; a < 6; a++) {
      ctx.beginPath();
      ctx.ellipse(ox + Math.cos(a) * 10, oy + Math.sin(a) * 10, 12, 6, a, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }

    // --- ELECTRICAL GENERATORS & WIRES ---
    ctx.fillStyle = '#334155'; ctx.strokeStyle = '#090c12'; ctx.lineWidth = 3;
    roundRect(ctx, 14.2 * TILE, 14.2 * TILE, 110, 48, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#eab308';
    for (let i = 0; i < 4; i++) ctx.fillRect(14.35 * TILE + i * 24, 14.35 * TILE, 14, 14);

    // --- NAVIGATION PILOT CONSOLE ---
    ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#090c12'; ctx.lineWidth = 3;
    roundRect(ctx, 37.8 * TILE, 11.4 * TILE, 42, 230, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(37.95 * TILE, 11.7 * TILE, 16, 48);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(37.95 * TILE, 12.7 * TILE, 16, 48);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(37.95 * TILE, 13.7 * TILE, 16, 48);

    // --- WEAPONS TARGETING CHAIR ---
    ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#090c12'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(32.5 * TILE, 3.6 * TILE, 30, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#10b981';
    ctx.beginPath(); ctx.arc(32.5 * TILE, 3.6 * TILE, 14, 0, Math.PI * 2); ctx.fill();

    // --- SHIELDS HEX PANEL ---
    ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#090c12'; ctx.lineWidth = 3;
    roundRect(ctx, 34.4 * TILE, 19.6 * TILE, 42, 160, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#38bdf8';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.arc(34.65 * TILE, 20.0 * TILE + i * 34, 11, 0, Math.PI * 2); ctx.fill();
    }

    // --- STORAGE FUEL CANISTERS ---
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = '#dc2626'; ctx.strokeStyle = '#090c12'; ctx.lineWidth = 2.5;
      roundRect(ctx, 19.3 * TILE + i * 26, 23.6 * TILE, 20, 28, 4); ctx.fill(); ctx.stroke();
    }
  }

  function drawCrate(ctx, x, y, w, h, color) {
    ctx.fillStyle = color; ctx.strokeStyle = '#090c12'; ctx.lineWidth = 3;
    roundRect(ctx, x, y, w, h, 4); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + w - 4, y + h - 4);
    ctx.moveTo(x + w - 4, y + 4); ctx.lineTo(x + 4, y + h - 4); ctx.stroke();
  }

  function drawEngineTurbine(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = '#3b4252'; ctx.strokeStyle = '#090c12'; ctx.lineWidth = 3.5;
    roundRect(ctx, x, y, 124, 170, 14); ctx.fill(); ctx.stroke();
    // Ribs
    ctx.fillStyle = '#64748b';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(x + 14, y + 18 + i * 36, 96, 18);
      ctx.strokeRect(x + 14, y + 18 + i * 36, 96, 18);
    }
    // Glowing core strip
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(x + 48, y + 12, 28, 146);
    ctx.restore();
  }

  bakeShipDeck();

  // Offscreen lighting canvas for dynamic raycast fog-of-war
  const lightCanvas = document.createElement('canvas');
  const lightCtx = lightCanvas.getContext('2d');

  // Deep-space parallax starfield
  const STARS = Array.from({ length: 240 }, () => ({
    x: Math.random() * MAP_W,
    y: Math.random() * MAP_H,
    r: Math.random() * 1.8 + 0.5,
    spd: Math.random() * 14 + 4,
    a: Math.random() * 0.6 + 0.25
  }));

  // Smooth camera state
  const cam = { x: EMERGENCY_POS.x, y: EMERGENCY_POS.y, init: false };

  function renderGame(ctx, vw, vh, state, localId, now) {
    const me = state.players[localId];
    const targetX = me ? me.x - vw / 2 : EMERGENCY_POS.x - vw / 2;
    const targetY = me ? me.y - vh / 2 : EMERGENCY_POS.y - vh / 2;

    if (!cam.init || Math.hypot(targetX - cam.x, targetY - cam.y) > 450) {
      cam.x = targetX; cam.y = targetY; cam.init = true;
    } else {
      cam.x += (targetX - cam.x) * 0.22;
      cam.y += (targetY - cam.y) * 0.22;
    }

    // 1. Deep Space Background & Drifting Stars
    const bgGrad = ctx.createRadialGradient(vw / 2, vh / 2, 60, vw / 2, vh / 2, Math.max(vw, vh));
    bgGrad.addColorStop(0, '#0a0f1d');
    bgGrad.addColorStop(1, '#03050a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, vw, vh);

    for (const s of STARS) {
      const sx = ((s.x - cam.x * 0.35 - (now / 1000) * s.spd) % vw + vw) % vw;
      const sy = ((s.y - cam.y * 0.35) % vh + vh) % vh;
      ctx.fillStyle = `rgba(215, 232, 255, ${s.a})`;
      ctx.beginPath();
      ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    // 2. Animated Blue Ion Thruster Flames behind Upper & Lower Engines
    drawThrusterFlame(ctx, 2 * TILE, 4.5 * TILE, now);
    drawThrusterFlame(ctx, 2 * TILE, 21.5 * TILE, now + 400);

    // 3. Blit Pre-Rendered High-Detail Ship Deck (only visible viewport slice!)
    const sx = Math.max(0, Math.floor(cam.x));
    const sy = Math.max(0, Math.floor(cam.y));
    const sw = Math.min(MAP_W - sx, Math.ceil(vw) + 2);
    const sh = Math.min(MAP_H - sy, Math.ceil(vh) + 2);
    if (sw > 0 && sh > 0) {
      ctx.drawImage(shipCanvas, sx, sy, sw, sh, sx, sy, sw, sh);
    }

    // 4. Dynamic Animated Room Effects (Reactor Core, MedBay Scanner, Security Cam LEDs)
    drawAnimatedProps(ctx, state, now);

    // 5. Vents (Metallic Grates)
    for (const v of VENTS) {
      ctx.save();
      ctx.fillStyle = '#334155';
      ctx.strokeStyle = (me && me.role === 'impostor') ? '#38bdf8' : '#090c12';
      ctx.lineWidth = (me && me.role === 'impostor') ? 3 : 2.5;
      roundRect(ctx, v.x - 22, v.y - 15, 44, 30, 5);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#0f172a';
      for (let i = -14; i <= 14; i += 7) ctx.fillRect(v.x + i - 2, v.y - 10, 4, 20);
      ctx.restore();
    }

    // 6. Task Stations with Classic Yellow Highlight Outline
    const myTasks = (me && me.tasks) ? me.tasks : [];
    for (const t of TASKS) {
      const assigned = myTasks.find((mt) => mt.id === t.id);
      const isPending = assigned && !assigned.done && me.role === 'crewmate';
      ctx.save();
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = isPending ? '#facc15' : '#090c12';
      ctx.lineWidth = isPending ? 3.5 : 2.5;
      roundRect(ctx, t.x - 16, t.y - 16, 32, 32, 5);
      ctx.fill(); ctx.stroke();
      if (isPending) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 200);
        ctx.strokeStyle = `rgba(250, 204, 21, ${0.4 + pulse * 0.6})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(t.x, t.y, 24 + pulse * 6, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = isPending ? '#fde047' : '#64748b';
      ctx.fillRect(t.x - 8, t.y - 7, 16, 10);
      ctx.restore();
    }

    // 7. Utility Console Highlights (Security & Admin)
    for (const c of Object.values(CONSOLES)) {
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(c.x, c.y, 26 + Math.sin(now / 320) * 3, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // 8. Sabotage Fix Beacon
    if (state.sabotage) {
      const s = SABOTAGES[state.sabotage.type];
      if (s) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 140);
        ctx.fillStyle = `rgba(239, 68, 68, ${0.28 + pulse * 0.45})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, 34 + pulse * 12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#dc2626'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
        roundRect(ctx, s.x - 16, s.y - 16, 32, 32, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = '900 18px Inter, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('!', s.x, s.y + 6);
      }
    }

    const visionR = getVisionRadius(me, state);

    // 9. Dead Bodies
    for (const b of state.bodies) {
      if (me && me.alive && !canSeePoint(me, b.x, b.y, visionR)) continue;
      drawBody(ctx, b);
    }

    // 10. Crewmates & Impostors (Y-sorted for natural overlapping)
    const playerList = Object.values(state.players).sort((a, b) => a.y - b.y);
    for (const p of playerList) {
      if (p.inVent && p.id !== localId) continue;
      if (!p.alive && me && me.alive) continue;
      if (p.id !== localId && me && me.alive && !canSeePoint(me, p.x, p.y, visionR)) continue;
      drawCrewmate(ctx, p, me, now);
    }

    ctx.restore();

    // 11. Real-Time Line-of-Sight Fog-of-War
    if (me && me.alive) {
      renderVisibilityShadows(ctx, vw, vh, cam.x, cam.y, me.x, me.y, visionR);
    } else if (me && !me.alive) {
      ctx.fillStyle = 'rgba(10, 18, 36, 0.22)';
      ctx.fillRect(0, 0, vw, vh);
    }

    // 12. Reactor Meltdown Pulsing Red Emergency Strobe
    if (state.sabotage && state.sabotage.type === 'reactor') {
      const flash = 0.14 + 0.16 * Math.abs(Math.sin(now / 260));
      const vig = ctx.createRadialGradient(vw / 2, vh / 2, vw * 0.22, vw / 2, vh / 2, vw * 0.72);
      vig.addColorStop(0, 'rgba(220, 38, 38, 0)');
      vig.addColorStop(1, `rgba(220, 38, 38, ${flash})`);
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, vw, vh);
    }
  }

  function drawThrusterFlame(ctx, x, y, now) {
    const len = 110 + Math.sin(now / 55) * 24;
    const grad = ctx.createLinearGradient(x, y, x - len, y);
    grad.addColorStop(0, 'rgba(186, 230, 253, 0.95)');
    grad.addColorStop(0.35, 'rgba(56, 189, 248, 0.75)');
    grad.addColorStop(1, 'rgba(37, 99, 235, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x, y - 34);
    ctx.lineTo(x - len, y);
    ctx.lineTo(x, y + 34);
    ctx.closePath();
    ctx.fill();
  }

  function drawAnimatedProps(ctx, state, now) {
    // Reactor Glowing Plasma Core
    const rx = 1.65 * TILE, ry = 13.0 * TILE;
    const pulse = 0.75 + 0.25 * Math.sin(now / 260);
    const rg = ctx.createRadialGradient(rx, ry, 8, rx, ry, 72);
    rg.addColorStop(0, `rgba(125, 211, 252, ${0.9 * pulse})`);
    rg.addColorStop(0.5, `rgba(14, 165, 233, ${0.45 * pulse})`);
    rg.addColorStop(1, 'rgba(14, 165, 233, 0)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(rx, ry, 72, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f172a'; ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(rx, ry, 28, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#7dd3fc';
    ctx.beginPath(); ctx.arc(rx, ry, 14 * pulse, 0, Math.PI * 2); ctx.fill();

    // MedBay Bio-Scanner Pad
    const mx = 12.8 * TILE, my = 9.2 * TILE;
    ctx.fillStyle = '#334155'; ctx.strokeStyle = '#090c12'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(mx, my, 30, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const scanR = 10 + ((now / 35) % 18);
    ctx.strokeStyle = 'rgba(45, 212, 191, 0.75)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(mx, my, scanR, 0, Math.PI * 2); ctx.stroke();

    // Security Hallway Camera Wall Units (blink red when someone is watching!)
    const anyCam = Object.values(state.players).some((p) => p.watchingCams);
    const blink = anyCam && Math.floor(now / 420) % 2 === 0;
    for (const c of CAMERAS) {
      ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#090c12'; ctx.lineWidth = 2;
      ctx.fillRect(c.x - 10, c.y - 36, 20, 12); ctx.strokeRect(c.x - 10, c.y - 36, 20, 12);
      ctx.fillStyle = blink ? '#ef4444' : '#475569';
      ctx.beginPath(); ctx.arc(c.x + 4, c.y - 30, 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  function getVisionRadius(me, state) {
    if (!me) return 520;
    if (!me.alive) return 960;
    if (me.role === 'impostor') return 560;
    if (state.sabotage && state.sabotage.type === 'lights') return 165;
    return 435;
  }

  function canSeePoint(me, tx, ty, visionR) {
    const d = Math.hypot(tx - me.x, ty - me.y);
    if (d > visionR + 28) return false;
    return hasLineOfSight(me.x, me.y, tx, ty);
  }

  function renderVisibilityShadows(ctx, vw, vh, camX, camY, px, py, radius) {
    if (lightCanvas.width !== vw || lightCanvas.height !== vh) {
      lightCanvas.width = vw;
      lightCanvas.height = vh;
    }
    const sx = px - camX, sy = py - camY;

    lightCtx.globalCompositeOperation = 'source-over';
    lightCtx.clearRect(0, 0, vw, vh);
    lightCtx.fillStyle = 'rgba(4, 6, 12, 0.87)';
    lightCtx.fillRect(0, 0, vw, vh);

    lightCtx.globalCompositeOperation = 'destination-out';
    const grad = lightCtx.createRadialGradient(sx, sy, radius * 0.5, sx, sy, radius);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    lightCtx.fillStyle = grad;
    lightCtx.beginPath();
    lightCtx.arc(sx, sy, radius, 0, Math.PI * 2);
    lightCtx.fill();

    lightCtx.globalCompositeOperation = 'source-over';
    lightCtx.fillStyle = 'rgba(4, 6, 12, 0.9)';
    const reach = radius + 1000;

    for (const w of WALLS) {
      const cx = Math.max(w.x, Math.min(px, w.x + w.w));
      const cy = Math.max(w.y, Math.min(py, w.y + w.h));
      if (Math.hypot(px - cx, py - cy) > radius + 35) continue;

      const x1 = w.x - camX, y1 = w.y - camY;
      const x2 = w.x + w.w - camX, y2 = w.y + w.h - camY;
      const edges = [[x1, y1, x2, y1], [x2, y1, x2, y2], [x2, y2, x1, y2], [x1, y2, x1, y1]];
      for (const [ax, ay, bx, by] of edges) {
        const d1 = Math.hypot(ax - sx, ay - sy) || 1;
        const d2 = Math.hypot(bx - sx, by - sy) || 1;
        lightCtx.beginPath();
        lightCtx.moveTo(ax, ay);
        lightCtx.lineTo(bx, by);
        lightCtx.lineTo(bx + ((bx - sx) / d2) * reach, by + ((by - sy) / d2) * reach);
        lightCtx.lineTo(ax + ((ax - sx) / d1) * reach, ay + ((ay - sy) / d1) * reach);
        lightCtx.closePath();
        lightCtx.fill();
      }
    }
    ctx.drawImage(lightCanvas, 0, 0);
  }

  // --- AUTHENTIC CEL-SHADED AMONG US CHARACTER RENDERER ---
  function drawCrewmate(ctx, p, me, now) {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (!p.alive) ctx.globalAlpha = 0.52;
    if (p.inVent) ctx.globalAlpha = 0.35;

    const bob = p.moving ? Math.abs(Math.sin(now / 65)) * -4 : Math.sin(now / 420) * 1;
    const face = p.facing >= 0 ? 1 : -1;
    const darkSuit = shadeHex(p.color, -46);

    // Subtle running dust puff
    if (p.alive && p.moving && Math.floor(now / 120) % 2 === 0) {
      ctx.fillStyle = 'rgba(226, 232, 240, 0.25)';
      ctx.beginPath();
      ctx.arc(-face * 18, 19, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ground Contact Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.44)';
    ctx.beginPath();
    ctx.ellipse(0, 22, 19, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.scale(face, 1);

    // Backpack (two-tone)
    ctx.fillStyle = darkSuit;
    roundRect(ctx, -23, -10 + bob, 12, 24, 6);
    ctx.fill();
    ctx.fillStyle = p.color;
    roundRect(ctx, -22, -9 + bob, 9, 13, 4);
    ctx.fill();
    ctx.strokeStyle = '#090c12';
    ctx.lineWidth = 3.2;
    roundRect(ctx, -23, -10 + bob, 12, 24, 6);
    ctx.stroke();

    // Legs or Ghost Tail
    if (p.alive) {
      const stride = p.moving ? Math.sin(now / 65) * 6 : 0;
      ctx.fillStyle = darkSuit;
      // Back leg
      roundRect(ctx, -13 - stride * 0.4, 9 + Math.max(0, stride * 0.3), 11, 14, 5);
      ctx.fill(); ctx.stroke();
      // Front leg
      roundRect(ctx, 2 + stride * 0.4, 9 + Math.max(0, -stride * 0.3), 11, 14, 5);
      ctx.fill(); ctx.stroke();
    } else {
      const wag = Math.sin(now / 150) * 5;
      ctx.fillStyle = darkSuit;
      ctx.beginPath();
      ctx.moveTo(-14, 8 + bob);
      ctx.quadraticCurveTo(-8 + wag, 26 + bob, 0 + wag, 20 + bob);
      ctx.quadraticCurveTo(10, 26 + bob, 14, 8 + bob);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }

    // Main Bean Torso (Two-Tone Cel Shaded!)
    ctx.save();
    roundRect(ctx, -16, -22 + bob, 32, 36, 15);
    ctx.fillStyle = darkSuit;
    ctx.fill();
    ctx.clip();
    // Bright upper-right highlight arc (signature Among Us shading)
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.ellipse(3, -9 + bob, 21, 20, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Thick Dark Ink Outline around Torso
    ctx.strokeStyle = '#090c12';
    ctx.lineWidth = 3.4;
    roundRect(ctx, -16, -22 + bob, 32, 36, 15);
    ctx.stroke();

    // Multi-layered Glossy Visor
    ctx.save();
    roundRect(ctx, -2, -15 + bob, 22, 14, 7);
    ctx.fillStyle = '#4f86a8';
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = '#97d9f7';
    ctx.beginPath();
    ctx.ellipse(11, -11 + bob, 13, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(12, -12 + bob, 6.5, 2.8, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = '#090c12';
    ctx.lineWidth = 3;
    roundRect(ctx, -2, -15 + bob, 22, 14, 7);
    ctx.stroke();

    ctx.restore();

    // Nameplate
    const showRedName = me && me.role === 'impostor' && p.role === 'impostor';
    ctx.font = '800 13px Inter, sans-serif';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(p.name).width + 14;
    ctx.fillStyle = 'rgba(5, 8, 15, 0.78)';
    roundRect(ctx, -tw / 2, -45, tw, 19, 6);
    ctx.fill();
    ctx.fillStyle = showRedName ? '#f87171' : '#f8fafc';
    ctx.fillText(p.name, 0, -31);

    ctx.restore();
  }

  function drawBody(ctx, b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    // Organic blood pool
    ctx.fillStyle = 'rgba(185, 28, 28, 0.72)';
    ctx.beginPath();
    ctx.ellipse(2, 9, 25, 11, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-18, 12, 8, 4, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // Bisected Lower Half + Legs
    const darkSuit = shadeHex(b.color, -45);
    ctx.strokeStyle = '#090c12';
    ctx.lineWidth = 3;
    ctx.fillStyle = darkSuit;
    roundRect(ctx, -13, 7, 10, 12, 4); ctx.fill(); ctx.stroke();
    roundRect(ctx, 3, 7, 10, 12, 4); ctx.fill(); ctx.stroke();

    ctx.fillStyle = b.color;
    roundRect(ctx, -16, -6, 32, 18, 7); ctx.fill(); ctx.stroke();
    // Red meat cross-section
    ctx.fillStyle = '#991b1b';
    ctx.beginPath(); ctx.ellipse(0, -4, 14, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // Cartoon Bone sticking out
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(-3.5, -18, 7, 15);
    ctx.beginPath();
    ctx.arc(-4, -18, 4.5, 0, Math.PI * 2);
    ctx.arc(4, -18, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#090c12'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-3.5, -4); ctx.lineTo(-3.5, -14);
    ctx.moveTo(3.5, -4); ctx.lineTo(3.5, -14);
    ctx.stroke();
    ctx.restore();
  }

  // --- SHIP SCHEMATIC MINIMAP ---
  function renderMiniMap(canvas, state, localId) {
    const ctx = canvas.getContext('2d');
    const sx = canvas.width / MAP_W;
    const sy = canvas.height / MAP_H;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#050912';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw exact ship grid
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = GRID[r][c];
        if (!cell) continue;
        ctx.fillStyle = cell === 'WALL' ? '#33415c' : (cell === 'corridor' ? '#162033' : '#1e2d47');
        ctx.fillRect(c * TILE * sx, r * TILE * sy, TILE * sx + 0.6, TILE * sy + 0.6);
      }
    }

    // Room labels
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '800 9px Inter, sans-serif';
    ctx.textAlign = 'center';
    for (const r of ROOM_DEFS) {
      const cx = ((r.c1 + r.c2 + 1) / 2) * TILE * sx;
      const cy = ((r.r1 + r.r2 + 1) / 2) * TILE * sy + 3;
      ctx.fillText(r.name, cx, cy);
    }

    const me = state.players[localId];
    // Show vent icons for Impostors
    if (me && me.role === 'impostor') {
      ctx.fillStyle = '#38bdf8';
      for (const v of VENTS) {
        ctx.fillRect(v.x * sx - 3, v.y * sy - 2, 6, 4);
      }
    }

    // Pending tasks
    if (me && me.tasks && me.role === 'crewmate') {
      for (const mt of me.tasks) {
        if (mt.done) continue;
        const t = TASKS.find((x) => x.id === mt.id);
        if (!t) continue;
        ctx.fillStyle = '#facc15';
        ctx.beginPath(); ctx.arc(t.x * sx, t.y * sy, 5.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }

    // Active sabotage
    if (state.sabotage) {
      const s = SABOTAGES[state.sabotage.type];
      if (s) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath(); ctx.arc(s.x * sx, s.y * sy, 8, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Player pin
    if (me) {
      ctx.fillStyle = me.color;
      ctx.beginPath(); ctx.arc(me.x * sx, me.y * sy, 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    }
  }

  // --- LIVE 4-CAMERA SECURITY FEED ---
  function renderSecurityCams(canvas, state, now) {
    const ctx = canvas.getContext('2d');
    const cw = canvas.width / 2, ch = canvas.height / 2;
    ctx.fillStyle = '#03060c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    CAMERAS.forEach((camInfo, idx) => {
      const ox = (idx % 2) * cw;
      const oy = Math.floor(idx / 2) * ch;
      const zoom = 0.55;
      const viewW = cw / zoom, viewH = ch / zoom;
      const sx = camInfo.x - viewW / 2;
      const sy = camInfo.y - viewH / 2;

      ctx.save();
      ctx.beginPath(); ctx.rect(ox + 2, oy + 2, cw - 4, ch - 4); ctx.clip();
      ctx.translate(ox, oy);
      ctx.scale(zoom, zoom);
      ctx.translate(-sx, -sy);

      ctx.drawImage(shipCanvas, 0, 0);
      for (const b of state.bodies) {
        if (Math.hypot(b.x - camInfo.x, b.y - camInfo.y) < 340) drawBody(ctx, b);
      }
      for (const p of Object.values(state.players)) {
        if (!p.alive || p.inVent) continue;
        if (Math.hypot(p.x - camInfo.x, p.y - camInfo.y) < 340) drawCrewmate(ctx, p, null, now);
      }
      ctx.restore();

      // CCTV green tint, border & label
      ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
      ctx.fillRect(ox + 2, oy + 2, cw - 4, ch - 4);
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 2;
      ctx.strokeRect(ox + 2, oy + 2, cw - 4, ch - 4);
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(ox + 6, oy + 6, 150, 18);
      ctx.fillStyle = '#4ade80';
      ctx.font = '700 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(camInfo.name, ox + 11, oy + 18);
      if (Math.floor(now / 500) % 2 === 0) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath(); ctx.arc(ox + cw - 14, oy + 15, 4, 0, Math.PI * 2); ctx.fill();
      }
    });
  }

  // --- LIVE ADMIN MAP TABLE (ANONYMOUS ROOM COUNTS) ---
  function renderAdminTable(canvas, state) {
    const ctx = canvas.getContext('2d');
    const sx = canvas.width / MAP_W, sy = canvas.height / MAP_H;
    ctx.fillStyle = '#04121f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = GRID[r][c];
        if (!cell) continue;
        ctx.fillStyle = cell === 'WALL' ? '#1e4e6e' : (cell === 'corridor' ? '#082032' : '#0c3552');
        ctx.fillRect(c * TILE * sx, r * TILE * sy, TILE * sx + 0.6, TILE * sy + 0.6);
      }
    }

    // Count living players per named room
    const counts = {};
    for (const p of Object.values(state.players)) {
      if (!p.alive) continue;
      const rid = getRoomId(p.x, p.y);
      if (rid && ROOM_MAP[rid]) counts[rid] = (counts[rid] || 0) + 1;
    }

    ctx.textAlign = 'center';
    for (const r of ROOM_DEFS) {
      const cx = ((r.c1 + r.c2 + 1) / 2) * TILE * sx;
      const cy = ((r.r1 + r.r2 + 1) / 2) * TILE * sy;
      ctx.fillStyle = 'rgba(125, 211, 252, 0.72)';
      ctx.font = '700 8px Inter, sans-serif';
      ctx.fillText(r.name, cx, cy - 6);

      const n = counts[r.id] || 0;
      for (let i = 0; i < n; i++) {
        const px = cx + (i - (n - 1) / 2) * 12;
        ctx.fillStyle = '#facc15';
        ctx.strokeStyle = '#090c12'; ctx.lineWidth = 1.5;
        roundRect(ctx, px - 4, cy, 8, 11, 3);
        ctx.fill(); ctx.stroke();
      }
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function shadeHex(hex, percent) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + percent));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + percent));
    const b = Math.max(0, Math.min(255, (n & 0xff) + percent));
    return `rgb(${r},${g},${b})`;
  }

  window.VoidWorld = {
    MAP_W, MAP_H, PLAYER_RADIUS, COLORS, WALLS, VENTS, TASKS, CONSOLES, SABOTAGES,
    EMERGENCY_POS, WAYPOINTS, resolveCollision, hasLineOfSight, getRoomName,
    SFX, renderGame, renderMiniMap, renderSecurityCams, renderAdminTable
  };
})();
