/* VOID CREW — 14-Room Skeld Map, Dropship Cabin, Blast Doors, Vent Animations & Spatial Audio */
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

  // Walkable Dropship Lobby Geometry
  const DROPSHIP = {
    x: 200, y: 150, w: 680, h: 460,
    laptop: { x: 540, y: 225, r: 46 },
    crates: [
      { x: 270, y: 520, r: 32 },
      { x: 800, y: 520, r: 32 }
    ]
  };

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

  const CORRIDOR_RECTS = [
    { c1: 9,  r1: 4,  c2: 15, r2: 5 },
    { c1: 11, r1: 6,  c2: 12, r2: 6 },
    { c1: 25, r1: 4,  c2: 28, r2: 5 },
    { c1: 6,  r1: 7,  c2: 7,  r2: 18 },
    { c1: 5,  r1: 12, c2: 5,  r2: 13 },
    { c1: 8,  r1: 13, c2: 8,  r2: 14 },
    { c1: 19, r1: 9,  c2: 21, r2: 16 },
    { c1: 22, r1: 13, c2: 22, r2: 14 },
    { c1: 31, r1: 7,  c2: 32, r2: 18 },
    { c1: 30, r1: 8,  c2: 30, r2: 9 },
    { c1: 33, r1: 12, c2: 34, r2: 13 },
    { c1: 9,  r1: 20, c2: 18, r2: 21 },
    { c1: 15, r1: 19, c2: 16, r2: 19 },
    { c1: 24, r1: 20, c2: 29, r2: 21 },
    { c1: 26, r1: 22, c2: 27, r2: 22 }
  ];

  const GRID = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const ROOM_MAP = {};
  for (const r of ROOM_DEFS) {
    ROOM_MAP[r.id] = r;
    for (let row = r.r1; row <= r.r2; row++)
      for (let col = r.c1; col <= r.c2; col++) GRID[row][col] = r.id;
  }
  for (const c of CORRIDOR_RECTS) {
    for (let row = c.r1; row <= c.r2; row++)
      for (let col = c.c1; col <= c.c2; col++)
        if (!GRID[row][col]) GRID[row][col] = 'corridor';
  }
  // Electrical blind-corner partition
  GRID[16][14] = 'WALL';
  GRID[16][15] = 'WALL';

  const isFloor = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS && GRID[r][c] && GRID[r][c] !== 'WALL';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (GRID[r][c] !== null) continue;
      let touches = false;
      for (let dr = -1; dr <= 1 && !touches; dr++)
        for (let dc = -1; dc <= 1 && !touches; dc++)
          if (isFloor(r + dr, c + dc)) touches = true;
      if (touches) GRID[r][c] = 'WALL';
    }
  }

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

  // Lockable Blast Doors (grouped by room key)
  const DOORS = [
    { room: 'cafeteria',    x: 15 * TILE + 26, y: 4 * TILE,  w: 28, h: 2 * TILE },
    { room: 'cafeteria',    x: 25 * TILE + 26, y: 4 * TILE,  w: 28, h: 2 * TILE },
    { room: 'cafeteria',    x: 19 * TILE,      y: 9 * TILE + 26, w: 3 * TILE, h: 28 },
    { room: 'electrical',   x: 15 * TILE,      y: 19 * TILE + 26, w: 2 * TILE, h: 28 },
    { room: 'medbay',       x: 11 * TILE,      y: 6 * TILE + 26,  w: 2 * TILE, h: 28 },
    { room: 'security',     x: 8 * TILE + 26,  y: 13 * TILE, w: 28, h: 2 * TILE },
    { room: 'storage',      x: 18 * TILE + 26, y: 20 * TILE, w: 28, h: 2 * TILE },
    { room: 'storage',      x: 24 * TILE + 26, y: 20 * TILE, w: 28, h: 2 * TILE },
    { room: 'upper_engine', x: 9 * TILE + 26,  y: 4 * TILE,  w: 28, h: 2 * TILE },
    { room: 'upper_engine', x: 6 * TILE,       y: 7 * TILE + 26, w: 2 * TILE, h: 28 },
    { room: 'upper_engine', x: 6 * TILE,       y: 18 * TILE + 26, w: 2 * TILE, h: 28 }
  ];

  const tc = (col, row) => ({ x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 });
  const EMERGENCY_POS = { ...tc(20, 4.4), radius: 56 };

  const OBSTACLES = [
    { x: 17.4 * TILE, y: 2.6 * TILE, r: 34, kind: 'cafeTable' },
    { x: 23.6 * TILE, y: 2.6 * TILE, r: 34, kind: 'cafeTable' },
    { x: 17.4 * TILE, y: 7.4 * TILE, r: 34, kind: 'cafeTable' },
    { x: 23.6 * TILE, y: 7.4 * TILE, r: 34, kind: 'cafeTable' },
    { x: 22.8 * TILE, y: 23.1 * TILE, r: 36, kind: 'crates' }
  ];

  const VENTS = [
    { id: 0,  ...tc(9.5, 15.6),  net: 'A', room: 'Security' },
    { id: 1,  ...tc(10.6, 9.6),  net: 'A', room: 'MedBay' },
    { id: 2,  ...tc(14.5, 14.5), net: 'A', room: 'Electrical' },
    { id: 3,  ...tc(3.6, 10.2),  net: 'B', room: 'Reactor' },
    { id: 4,  ...tc(4.0, 5.7),   net: 'B', room: 'Upper Engine' },
    { id: 5,  ...tc(4.0, 22.6),  net: 'B', room: 'Lower Engine' },
    { id: 6,  ...tc(23.6, 6.2),  net: 'C', room: 'Cafeteria' },
    { id: 7,  ...tc(25.6, 14.6), net: 'C', room: 'Admin' },
    { id: 8,  ...tc(28.5, 8.5),  net: 'C', room: 'O2' },
    { id: 9,  ...tc(33.5, 2.7),  net: 'D', room: 'Weapons' },
    { id: 10, ...tc(36.0, 10.6), net: 'D', room: 'Navigation' },
    { id: 11, ...tc(34.4, 22.6), net: 'D', room: 'Shields' }
  ];

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

  const CONSOLES = {
    security: { id: 'security', room: 'Security', label: 'Security Cameras', ...tc(10.5, 12.6) },
    admin:    { id: 'admin',    room: 'Admin',    label: 'Admin Map Table',  ...tc(24.5, 14.2) }
  };

  const CAMERAS = [
    { name: 'CAM 01 • WEST HALL',   ...tc(6.5, 12.8) },
    { name: 'CAM 02 • MEDBAY HALL', ...tc(12.0, 4.5) },
    { name: 'CAM 03 • CENTER HALL', ...tc(20.0, 12.5) },
    { name: 'CAM 04 • NAV HALL',    ...tc(31.5, 12.8) }
  ];

  const SABOTAGES = {
    lights:  { id: 'lights',  room: 'Electrical',     label: 'Fix Lights',        ...tc(16.6, 17.5) },
    reactor: { id: 'reactor', room: 'Reactor',        label: 'Reset Reactor',     ...tc(1.7, 12.5) },
    o2_a:    { id: 'o2_a',    room: 'O2',             label: 'O2 Keypad (O2)',    ...tc(28.4, 9.5) },
    o2_b:    { id: 'o2_b',    room: 'Admin',          label: 'O2 Keypad (Admin)', ...tc(23.6, 12.5) },
    comms:   { id: 'comms',   room: 'Communications', label: 'Restore Comms',     ...tc(26.5, 24.6) }
  };

  const wp = (id, col, row, adj) => ({ id, x: col * TILE + TILE / 2, y: row * TILE + TILE / 2, adj });
  const WAYPOINTS = [
    wp(0,  4.8,  4.5,  [26]),
    wp(1,  11.5, 4.5,  [26, 2, 3]),
    wp(2,  11.5, 8.5,  [1]),
    wp(3,  17.5, 4.5,  [1, 4]),
    wp(4,  20.0, 7.2,  [3, 5, 11]),
    wp(5,  23.2, 4.5,  [4, 6]),
    wp(6,  27.0, 4.5,  [5, 7]),
    wp(7,  31.5, 4.5,  [6, 8]),
    wp(8,  31.5, 8.8,  [7, 9, 10]),
    wp(9,  28.2, 8.8,  [8]),
    wp(10, 31.5, 12.8, [8, 13, 14]),
    wp(11, 20.0, 13.5, [4, 12, 18]),
    wp(12, 24.3, 13.5, [11]),
    wp(13, 36.5, 12.8, [10]),
    wp(14, 31.5, 20.5, [10, 15]),
    wp(15, 26.5, 20.5, [14, 16, 17]),
    wp(16, 26.5, 24.0, [15]),
    wp(17, 20.5, 20.5, [15, 18, 19]),
    wp(18, 20.0, 17.8, [11, 17]),
    wp(19, 15.8, 20.5, [17, 20, 21]),
    wp(20, 15.8, 17.6, [19, 25]),
    wp(21, 6.5,  20.5, [19, 22]),
    wp(22, 6.5,  13.2, [21, 23, 24, 26]),
    wp(23, 2.8,  12.8, [22]),
    wp(24, 10.5, 13.5, [22]),
    wp(25, 16.5, 14.8, [20]),
    wp(26, 6.5,  4.5,  [0, 1, 22])
  ];

  function activeDoorRects(lockedDoors) {
    if (!lockedDoors) return [];
    const list = [];
    for (const d of DOORS) if (lockedDoors[d.room] > 0) list.push(d);
    return list;
  }

  function resolveCollision(x, y, radius, isGhost, lockedDoors, isLobby) {
    if (isLobby) {
      let nx = Math.max(DROPSHIP.x + 28 + radius, Math.min(DROPSHIP.x + DROPSHIP.w - 28 - radius, x));
      let ny = Math.max(DROPSHIP.y + 48 + radius, Math.min(DROPSHIP.y + DROPSHIP.h - 28 - radius, y));
      const pushC = (ox, oy, orad) => {
        const dx = nx - ox, dy = ny - oy, minD = radius + orad, d = Math.hypot(dx, dy);
        if (d < minD && d > 0.001) { nx = ox + (dx / d) * minD; ny = oy + (dy / d) * minD; }
      };
      pushC(DROPSHIP.laptop.x, DROPSHIP.laptop.y, 26);
      for (const cr of DROPSHIP.crates) pushC(cr.x, cr.y, cr.r);
      return { x: nx, y: ny };
    }

    let nx = Math.max(TILE + radius, Math.min(MAP_W - TILE - radius, x));
    let ny = Math.max(TILE + radius, Math.min(MAP_H - TILE - radius, y));
    if (isGhost) return { x: nx, y: ny };

    const solids = WALLS.concat(activeDoorRects(lockedDoors));
    for (let iter = 0; iter < 2; iter++) {
      for (const w of solids) {
        const cx = Math.max(w.x, Math.min(nx, w.x + w.w));
        const cy = Math.max(w.y, Math.min(ny, w.y + w.h));
        const dx = nx - cx, dy = ny - cy, distSq = dx * dx + dy * dy;
        if (distSq < radius * radius) {
          const dist = Math.sqrt(distSq);
          if (dist === 0) {
            const left = Math.abs(nx - w.x), right = Math.abs(w.x + w.w - nx);
            const top = Math.abs(ny - w.y), bot = Math.abs(w.y + w.h - ny);
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
      const pushCircle = (ox, oy, orad) => {
        const dx = nx - ox, dy = ny - oy, minD = radius + orad, d = Math.hypot(dx, dy);
        if (d < minD && d > 0.001) { nx = ox + (dx / d) * minD; ny = oy + (dy / d) * minD; }
      };
      pushCircle(EMERGENCY_POS.x, EMERGENCY_POS.y, EMERGENCY_POS.radius);
      for (const ob of OBSTACLES) pushCircle(ob.x, ob.y, ob.r);
    }
    return { x: nx, y: ny };
  }

  function segHitsRect(x1, y1, x2, y2, r) {
    let t0 = 0, t1 = 1;
    const dx = x2 - x1, dy = y2 - y1;
    const checks = [[-dx, x1 - r.x], [dx, (r.x + r.w) - x1], [-dy, y1 - r.y], [dy, (r.y + r.h) - y1]];
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

  function hasLineOfSight(x1, y1, x2, y2, lockedDoors) {
    for (const w of WALLS) if (segHitsRect(x1, y1, x2, y2, w)) return false;
    for (const d of activeDoorRects(lockedDoors)) if (segHitsRect(x1, y1, x2, y2, d)) return false;
    return true;
  }

  function getRoomId(x, y) {
    const c = Math.floor(x / TILE), r = Math.floor(y / TILE);
    return (r >= 0 && r < ROWS && c >= 0 && c < COLS) ? GRID[r][c] : null;
  }

  function getRoomName(x, y) {
    const id = getRoomId(x, y);
    return (id && ROOM_MAP[id]) ? ROOM_MAP[id].name : 'CORRIDOR';
  }

  // --- SPATIAL & AMBIENT WEB AUDIO ENGINE ---
  const SFX = {
    ctx: null,
    muted: false,
    ambientGain: null,
    lastStep: 0,
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    startAmbience() {
      this.ensure();
      if (!this.ctx || this.ambientGain) return;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 54;
      filter.type = 'lowpass';
      filter.frequency.value = 115;
      gain.gain.value = this.muted ? 0 : 0.022;
      osc.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
      osc.start();
      this.ambientGain = gain;
    },
    setMuted(m) {
      this.muted = m;
      if (this.ambientGain && this.ctx) this.ambientGain.gain.setTargetAtTime(m ? 0 : 0.022, this.ctx.currentTime, 0.1);
    },
    tone(freq, dur, type = 'sine', vol = 0.14, endFreq = null) {
      if (this.muted || vol <= 0.005) return;
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
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.start(now); osc.stop(now + dur);
    },
    playSpatial(name, sx, sy, lx, ly, maxDist = 650) {
      const d = Math.hypot(sx - lx, sy - ly);
      if (d > maxDist) return;
      const scale = Math.max(0.05, 1 - d / maxDist);
      if (name === 'vent') this.tone(150, 0.16, 'sine', 0.16 * scale, 360);
      else if (name === 'door') this.tone(120, 0.22, 'square', 0.18 * scale, 48);
      else if (name === 'shift') this.tone(320, 0.25, 'triangle', 0.15 * scale, 640);
    },
    step() {
      const t = performance.now();
      if (t - this.lastStep < 250) return;
      this.lastStep = t;
      this.tone(110 + Math.random() * 25, 0.04, 'triangle', 0.032, 70);
    },
    kill() { this.tone(190, 0.25, 'sawtooth', 0.24, 38); setTimeout(() => this.tone(92, 0.24, 'square', 0.18, 28), 75); },
    task() { this.tone(540, 0.11, 'triangle', 0.16); setTimeout(() => this.tone(820, 0.2, 'triangle', 0.16), 95); },
    alarm() { this.tone(640, 0.18, 'sawtooth', 0.16, 430); setTimeout(() => this.tone(640, 0.26, 'sawtooth', 0.16, 430), 210); },
    vent() { this.tone(150, 0.16, 'sine', 0.14, 360); },
    door() { this.tone(120, 0.22, 'square', 0.16, 48); },
    click() { this.tone(460, 0.05, 'sine', 0.08); },
    chat() { this.tone(700, 0.07, 'sine', 0.08, 900); }
  };

  // --- PRE-RENDERED 2.5D SHIP DECK ---
  const shipCanvas = document.createElement('canvas');
  shipCanvas.width = MAP_W; shipCanvas.height = MAP_H;
  const sCtx = shipCanvas.getContext('2d');

  function bakeShipDeck() {
    sCtx.clearRect(0, 0, MAP_W, MAP_H);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = GRID[r][c];
        if (!cell || cell === 'WALL') continue;
        drawFloorTile(sCtx, c * TILE, r * TILE, c, r, ROOM_MAP[cell] ? ROOM_MAP[cell].theme : 'corridor');
      }
    }
    sCtx.save();
    sCtx.textAlign = 'center'; sCtx.font = '900 28px Inter, sans-serif';
    for (const r of ROOM_DEFS) {
      sCtx.fillStyle = 'rgba(255,255,255,0.055)';
      sCtx.fillText(r.name, ((r.c1 + r.c2 + 1) / 2) * TILE, ((r.r1 + r.r2 + 1) / 2) * TILE + 10);
    }
    sCtx.restore();

    drawStaticRoomProps(sCtx);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (GRID[r][c] !== 'WALL') continue;
        const x = c * TILE, y = r * TILE;
        const floorBelow = isFloor(r + 1, c);
        if (floorBelow) {
          const sh = sCtx.createLinearGradient(x, y + TILE, x, y + TILE + 22);
          sh.addColorStop(0, 'rgba(0,0,0,0.48)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
          sCtx.fillStyle = sh; sCtx.fillRect(x, y + TILE, TILE, 22);
        }
        sCtx.fillStyle = '#2c3547'; sCtx.fillRect(x, y, TILE, TILE);
        sCtx.fillStyle = '#1f2636'; sCtx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
        if (floorBelow) {
          const fy = y + TILE - 42;
          const grad = sCtx.createLinearGradient(x, fy, x, y + TILE);
          grad.addColorStop(0, '#5a6882'); grad.addColorStop(0.2, '#465269'); grad.addColorStop(0.85, '#333d50'); grad.addColorStop(1, '#202735');
          sCtx.fillStyle = grad; sCtx.fillRect(x, fy, TILE, 42);
          sCtx.fillStyle = '#7c8ca8'; sCtx.fillRect(x, fy, TILE, 3);
          sCtx.fillStyle = '#141923'; sCtx.fillRect(x, y + TILE - 5, TILE, 5);
        }
        sCtx.fillStyle = '#080b11';
        if (floorBelow || (r + 1 < ROWS && GRID[r + 1][c] === null)) sCtx.fillRect(x, y + TILE - 3, TILE, 3);
        if (isFloor(r - 1, c) || (r - 1 >= 0 && GRID[r - 1][c] === null)) sCtx.fillRect(x, y, TILE, 3);
        if (isFloor(r, c - 1) || (c - 1 >= 0 && GRID[r][c - 1] === null)) sCtx.fillRect(x, y, 3, TILE);
        if (isFloor(r, c + 1) || (c + 1 < COLS && GRID[r][c + 1] === null)) sCtx.fillRect(x + TILE - 3, y, 3, TILE);
      }
    }
  }

  function drawFloorTile(ctx, x, y, c, r, theme) {
    const alt = (c + r) % 2 === 0;
    const palette = {
      cafe: ['#6f7c8e', '#657283'], medbay: ['#8ea6ad', '#8098a0'], reactor: ['#48505f', '#404856'],
      engine: ['#56505d', '#4d4754'], elec: ['#4c515c', '#444954'], storage: ['#66605c', '#5e5854'],
      admin: ['#5b6c73', '#526269'], o2: ['#667b78', '#5d716e'], shields: ['#5d5c6d', '#545363'],
      nav: ['#4b5568', '#434c5e'], tech: ['#4b5568', '#434c5e'], security: ['#4b5568', '#434c5e'],
      corridor: ['#556072', '#4e596a']
    };
    const [c1, c2] = palette[theme] || palette.corridor;
    ctx.fillStyle = alt ? c1 : c2;
    ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, TILE, TILE);
  }

  function drawStaticRoomProps(ctx) {
    for (const ob of OBSTACLES) {
      if (ob.kind === 'cafeTable') {
        ctx.fillStyle = '#94a3b8'; ctx.strokeStyle = '#090c12'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(ob.x, ob.y, ob.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#cbd5e1'; ctx.beginPath(); ctx.arc(ob.x, ob.y, ob.r - 8, 0, Math.PI * 2); ctx.fill();
      } else {
        drawCrate(ctx, ob.x - 32, ob.y - 28, 42, 40, '#9a6b3e');
        drawCrate(ctx, ob.x - 6, ob.y - 6, 40, 38, '#7c532e');
      }
    }
    // Emergency Table
    ctx.fillStyle = '#94a3b8'; ctx.strokeStyle = '#090c12'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(EMERGENCY_POS.x, EMERGENCY_POS.y, EMERGENCY_POS.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1e293b'; ctx.fillRect(EMERGENCY_POS.x - 22, EMERGENCY_POS.y - 22, 44, 44);
    ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.arc(EMERGENCY_POS.x, EMERGENCY_POS.y, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // Turbines, Security Monitors, Admin Table, Beds
    drawEngineTurbine(ctx, 3.6 * TILE, 3.2 * TILE);
    drawEngineTurbine(ctx, 3.6 * TILE, 20.5 * TILE);
    for (let i = 0; i < 3; i++) {
      const bx = (12.6 + i * 0.78) * TILE, by = 7.35 * TILE;
      ctx.fillStyle = '#e2e8f0'; ctx.strokeStyle = '#090c12'; ctx.lineWidth = 2.5;
      roundRect(ctx, bx, by, 44, 62, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#38bdf8'; roundRect(ctx, bx + 4, by + 22, 36, 34, 4); ctx.fill();
    }
    ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#090c12'; ctx.lineWidth = 3;
    roundRect(ctx, 9.4 * TILE, 12.1 * TILE, 180, 44, 6); ctx.fill(); ctx.stroke();
    roundRect(ctx, 24.5 * TILE - 54, 14.2 * TILE - 30, 108, 60, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0f2942'; roundRect(ctx, 24.5 * TILE - 44, 14.2 * TILE - 20, 88, 40, 6); ctx.fill();
  }

  function drawCrate(ctx, x, y, w, h, color) {
    ctx.fillStyle = color; ctx.strokeStyle = '#090c12'; ctx.lineWidth = 3;
    roundRect(ctx, x, y, w, h, 4); ctx.fill(); ctx.stroke();
  }

  function drawEngineTurbine(ctx, x, y) {
    ctx.fillStyle = '#3b4252'; ctx.strokeStyle = '#090c12'; ctx.lineWidth = 3.5;
    roundRect(ctx, x, y, 120, 165, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#38bdf8'; ctx.fillRect(x + 46, y + 12, 28, 140);
  }

  bakeShipDeck();

  const lightCanvas = document.createElement('canvas');
  const lightCtx = lightCanvas.getContext('2d');
  const STARS = Array.from({ length: 220 }, () => ({
    x: Math.random() * MAP_W, y: Math.random() * MAP_H, r: Math.random() * 1.8 + 0.5, spd: Math.random() * 14 + 4, a: Math.random() * 0.6 + 0.25
  }));
  const cam = { x: EMERGENCY_POS.x, y: EMERGENCY_POS.y, init: false };

  // --- WALKABLE DROPSHIP LOBBY RENDERER ---
  function renderLobby(ctx, vw, vh, state, localId, now) {
    const me = state.players[localId];
    const cx = DROPSHIP.x + DROPSHIP.w / 2;
    const cy = DROPSHIP.y + DROPSHIP.h / 2;
    const camX = cx - vw / 2;
    const camY = cy - vh / 2;

    ctx.fillStyle = '#04070f';
    ctx.fillRect(0, 0, vw, vh);
    for (const s of STARS) {
      const sx = ((s.x - (now / 1000) * s.spd * 2.2) % vw + vw) % vw;
      const sy = s.y % vh;
      ctx.fillStyle = `rgba(215, 232, 255, ${s.a})`;
      ctx.beginPath(); ctx.arc(sx, sy, s.r, 0, Math.PI * 2); ctx.fill();
    }

    ctx.save();
    ctx.translate(-camX, -camY);

    // Thrusters behind dropship
    drawThrusterFlame(ctx, DROPSHIP.x, DROPSHIP.y + 130, now);
    drawThrusterFlame(ctx, DROPSHIP.x, DROPSHIP.y + DROPSHIP.h - 130, now + 300);

    // Dropship Hull
    ctx.fillStyle = '#2c3547'; ctx.strokeStyle = '#090c12'; ctx.lineWidth = 6;
    roundRect(ctx, DROPSHIP.x, DROPSHIP.y, DROPSHIP.w, DROPSHIP.h, 28); ctx.fill(); ctx.stroke();

    // Dropship Floor
    ctx.fillStyle = '#536073';
    roundRect(ctx, DROPSHIP.x + 26, DROPSHIP.y + 44, DROPSHIP.w - 52, DROPSHIP.h - 70, 14); ctx.fill(); ctx.stroke();

    // Customization Laptop Station
    const lp = DROPSHIP.laptop;
    ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3;
    roundRect(ctx, lp.x - 32, lp.y - 22, 64, 42, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#38bdf8'; ctx.fillRect(lp.x - 20, lp.y - 12, 40, 20);
    ctx.fillStyle = '#facc15'; ctx.font = '800 11px Inter, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('SETTINGS (E)', lp.x, lp.y - 30);

    for (const cr of DROPSHIP.crates) drawCrate(ctx, cr.x - 28, cr.y - 26, 56, 52, '#8b5e34');

    const list = Object.values(state.players).sort((a, b) => a.y - b.y);
    for (const p of list) drawCrewmate(ctx, p, me, now, true);
    ctx.restore();
  }

  // --- MAIN SHIP RENDERER ---
  function renderGame(ctx, vw, vh, state, localId, now) {
    const me = state.players[localId];
    const targetX = me ? me.x - vw / 2 : EMERGENCY_POS.x - vw / 2;
    const targetY = me ? me.y - vh / 2 : EMERGENCY_POS.y - vh / 2;

    if (!cam.init || Math.hypot(targetX - cam.x, targetY - cam.y) > 450) {
      cam.x = targetX; cam.y = targetY; cam.init = true;
    } else {
      cam.x += (targetX - cam.x) * 0.22; cam.y += (targetY - cam.y) * 0.22;
    }

    ctx.fillStyle = '#04060b'; ctx.fillRect(0, 0, vw, vh);
    for (const s of STARS) {
      const sx = ((s.x - cam.x * 0.35 - (now / 1000) * s.spd) % vw + vw) % vw;
      const sy = ((s.y - cam.y * 0.35) % vh + vh) % vh;
      ctx.fillStyle = `rgba(215, 232, 255, ${s.a})`;
      ctx.beginPath(); ctx.arc(sx, sy, s.r, 0, Math.PI * 2); ctx.fill();
    }

    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    drawThrusterFlame(ctx, 2 * TILE, 4.5 * TILE, now);
    drawThrusterFlame(ctx, 2 * TILE, 21.5 * TILE, now + 400);

    const sx = Math.max(0, Math.floor(cam.x)), sy = Math.max(0, Math.floor(cam.y));
    const sw = Math.min(MAP_W - sx, Math.ceil(vw) + 2), sh = Math.min(MAP_H - sy, Math.ceil(vh) + 2);
    if (sw > 0 && sh > 0) ctx.drawImage(shipCanvas, sx, sy, sw, sh, sx, sy, sw, sh);

    drawAnimatedProps(ctx, state, now);

    // Animated Vents
    const canVent = me && (me.role === 'impostor' || me.subRole === 'engineer');
    for (const v of VENTS) {
      const animT = state.ventAnims && state.ventAnims[v.id] ? Math.max(0, 1 - (now - state.ventAnims[v.id]) / 420) : 0;
      ctx.save();
      ctx.fillStyle = '#090d16';
      roundRect(ctx, v.x - 22, v.y - 15, 44, 30, 5); ctx.fill();
      ctx.save();
      ctx.translate(v.x - 22, v.y - 15);
      ctx.rotate(-animT * 0.85);
      ctx.fillStyle = '#334155';
      ctx.strokeStyle = canVent ? '#38bdf8' : '#090c12';
      ctx.lineWidth = canVent ? 3 : 2.5;
      roundRect(ctx, 0, 0, 44, 30, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#0f172a';
      for (let i = 8; i <= 36; i += 7) ctx.fillRect(i - 2, 5, 4, 20);
      ctx.restore();
      ctx.restore();
    }

    // Locked Blast Doors
    for (const d of activeDoorRects(state.lockedDoors)) {
      ctx.save();
      ctx.fillStyle = '#334155'; ctx.strokeStyle = '#090c12'; ctx.lineWidth = 3;
      ctx.fillRect(d.x, d.y, d.w, d.h); ctx.strokeRect(d.x, d.y, d.w, d.h);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(d.x + d.w / 2 - 4, d.y + d.h / 2 - 4, 8, 8);
      ctx.restore();
    }

    // Task Stations (hidden if Comms sabotaged)
    const commsDown = state.sabotage && state.sabotage.type === 'comms';
    const myTasks = (!commsDown && me && me.tasks) ? me.tasks : [];
    for (const t of TASKS) {
      const assigned = myTasks.find((mt) => mt.id === t.id);
      const isPending = assigned && !assigned.done && me.role === 'crewmate';
      ctx.fillStyle = '#1e293b'; ctx.strokeStyle = isPending ? '#facc15' : '#090c12'; ctx.lineWidth = isPending ? 3.5 : 2.5;
      roundRect(ctx, t.x - 16, t.y - 16, 32, 32, 5); ctx.fill(); ctx.stroke();
      if (isPending) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 200);
        ctx.strokeStyle = `rgba(250,204,21,${0.4 + pulse * 0.6})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(t.x, t.y, 24 + pulse * 6, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = isPending ? '#fde047' : '#64748b'; ctx.fillRect(t.x - 8, t.y - 7, 16, 10);
    }

    // Sabotage Beacons
    if (state.sabotage) {
      const keys = state.sabotage.type === 'o2'
        ? [!state.sabotage.o2FixedA && 'o2_a', !state.sabotage.o2FixedB && 'o2_b'].filter(Boolean)
        : [state.sabotage.type];
      for (const k of keys) {
        const s = SABOTAGES[k];
        if (!s) continue;
        const pulse = 0.5 + 0.5 * Math.sin(now / 140);
        ctx.fillStyle = `rgba(239,68,68,${0.28 + pulse * 0.45})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, 34 + pulse * 12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#dc2626'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
        roundRect(ctx, s.x - 16, s.y - 16, 32, 32, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = '900 18px Inter, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('!', s.x, s.y + 6);
      }
    }

    const visionR = getVisionRadius(me, state);
    for (const b of state.bodies) {
      if (me && me.alive && !canSeePoint(me, b.x, b.y, visionR, state.lockedDoors)) continue;
      drawBody(ctx, b);
    }

    const playerList = Object.values(state.players).sort((a, b) => a.y - b.y);
    for (const p of playerList) {
      if (p.inVent && p.id !== localId) continue;
      if (!p.alive && me && me.alive) continue;
      if (p.id !== localId && me && me.alive && !canSeePoint(me, p.x, p.y, visionR, state.lockedDoors)) continue;
      drawCrewmate(ctx, p, me, now, false);
    }

    ctx.restore();

    if (me && me.alive) renderVisibilityShadows(ctx, vw, vh, cam.x, cam.y, me.x, me.y, visionR, state.lockedDoors);
    else if (me && !me.alive) { ctx.fillStyle = 'rgba(10, 18, 36, 0.22)'; ctx.fillRect(0, 0, vw, vh); }

    if (state.sabotage && (state.sabotage.type === 'reactor' || state.sabotage.type === 'o2')) {
      const flash = 0.14 + 0.16 * Math.abs(Math.sin(now / 260));
      const vig = ctx.createRadialGradient(vw / 2, vh / 2, vw * 0.22, vw / 2, vh / 2, vw * 0.72);
      vig.addColorStop(0, 'rgba(220,38,38,0)'); vig.addColorStop(1, `rgba(220,38,38,${flash})`);
      ctx.fillStyle = vig; ctx.fillRect(0, 0, vw, vh);
    }
  }

  function drawThrusterFlame(ctx, x, y, now) {
    const len = 105 + Math.sin(now / 55) * 24;
    const grad = ctx.createLinearGradient(x, y, x - len, y);
    grad.addColorStop(0, 'rgba(186,230,253,0.95)'); grad.addColorStop(0.35, 'rgba(56,189,248,0.75)'); grad.addColorStop(1, 'rgba(37,99,235,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(x, y - 32); ctx.lineTo(x - len, y); ctx.lineTo(x, y + 32); ctx.closePath(); ctx.fill();
  }

  function drawAnimatedProps(ctx, state, now) {
    const rx = 1.65 * TILE, ry = 13.0 * TILE, pulse = 0.75 + 0.25 * Math.sin(now / 260);
    const rg = ctx.createRadialGradient(rx, ry, 8, rx, ry, 72);
    rg.addColorStop(0, `rgba(125,211,252,${0.9 * pulse})`); rg.addColorStop(1, 'rgba(14,165,233,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(rx, ry, 72, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f172a'; ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(rx, ry, 28, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

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

  function canSeePoint(me, tx, ty, visionR, lockedDoors) {
    return Math.hypot(tx - me.x, ty - me.y) <= visionR + 28 && hasLineOfSight(me.x, me.y, tx, ty, lockedDoors);
  }

  function renderVisibilityShadows(ctx, vw, vh, camX, camY, px, py, radius, lockedDoors) {
    if (lightCanvas.width !== vw || lightCanvas.height !== vh) { lightCanvas.width = vw; lightCanvas.height = vh; }
    const sx = px - camX, sy = py - camY;
    lightCtx.globalCompositeOperation = 'source-over';
    lightCtx.clearRect(0, 0, vw, vh);
    lightCtx.fillStyle = 'rgba(4, 6, 12, 0.87)';
    lightCtx.fillRect(0, 0, vw, vh);

    lightCtx.globalCompositeOperation = 'destination-out';
    const grad = lightCtx.createRadialGradient(sx, sy, radius * 0.5, sx, sy, radius);
    grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    lightCtx.fillStyle = grad;
    lightCtx.beginPath(); lightCtx.arc(sx, sy, radius, 0, Math.PI * 2); lightCtx.fill();

    lightCtx.globalCompositeOperation = 'source-over';
    lightCtx.fillStyle = 'rgba(4, 6, 12, 0.9)';
    const reach = radius + 1000;
    const solids = WALLS.concat(activeDoorRects(lockedDoors));
    for (const w of solids) {
      const cx = Math.max(w.x, Math.min(px, w.x + w.w)), cy = Math.max(w.y, Math.min(py, w.y + w.h));
      if (Math.hypot(px - cx, py - cy) > radius + 35) continue;
      const x1 = w.x - camX, y1 = w.y - camY, x2 = w.x + w.w - camX, y2 = w.y + w.h - camY;
      const edges = [[x1, y1, x2, y1], [x2, y1, x2, y2], [x2, y2, x1, y2], [x1, y2, x1, y1]];
      for (const [ax, ay, bx, by] of edges) {
        const d1 = Math.hypot(ax - sx, ay - sy) || 1, d2 = Math.hypot(bx - sx, by - sy) || 1;
        lightCtx.beginPath();
        lightCtx.moveTo(ax, ay); lightCtx.lineTo(bx, by);
        lightCtx.lineTo(bx + ((bx - sx) / d2) * reach, by + ((by - sy) / d2) * reach);
        lightCtx.lineTo(ax + ((ax - sx) / d1) * reach, ay + ((ay - sy) / d1) * reach);
        lightCtx.closePath(); lightCtx.fill();
      }
    }
    ctx.drawImage(lightCanvas, 0, 0);
  }

  function drawCrewmate(ctx, p, me, now, isLobby) {
    // Apply Shapeshifter disguise if active!
    const dispColor = (!isLobby && p.disguise) ? p.disguise.color : p.color;
    const dispName = (!isLobby && p.disguise) ? p.disguise.name : p.name;

    ctx.save();
    ctx.translate(p.x, p.y);
    if (!p.alive && !isLobby) ctx.globalAlpha = 0.5;
    if (p.inVent) ctx.globalAlpha = 0.35;

    const bob = p.moving ? Math.abs(Math.sin(now / 65)) * -4 : Math.sin(now / 420) * 1;
    const face = p.facing >= 0 ? 1 : -1;
    const darkSuit = shadeHex(dispColor, -46);

    ctx.fillStyle = 'rgba(0,0,0,0.44)';
    ctx.beginPath(); ctx.ellipse(0, 22, 19, 7, 0, 0, Math.PI * 2); ctx.fill();

    ctx.save(); ctx.scale(face, 1);
    ctx.fillStyle = darkSuit; roundRect(ctx, -23, -10 + bob, 12, 24, 6); ctx.fill();
    ctx.fillStyle = dispColor; roundRect(ctx, -22, -9 + bob, 9, 13, 4); ctx.fill();
    ctx.strokeStyle = '#090c12'; ctx.lineWidth = 3.2; roundRect(ctx, -23, -10 + bob, 12, 24, 6); ctx.stroke();

    if (p.alive || isLobby) {
      const stride = p.moving ? Math.sin(now / 65) * 6 : 0;
      ctx.fillStyle = darkSuit;
      roundRect(ctx, -13 - stride * 0.4, 9 + Math.max(0, stride * 0.3), 11, 14, 5); ctx.fill(); ctx.stroke();
      roundRect(ctx, 2 + stride * 0.4, 9 + Math.max(0, -stride * 0.3), 11, 14, 5); ctx.fill(); ctx.stroke();
    } else {
      const wag = Math.sin(now / 150) * 5;
      ctx.fillStyle = darkSuit;
      ctx.beginPath(); ctx.moveTo(-14, 8 + bob); ctx.quadraticCurveTo(-8 + wag, 26 + bob, 0 + wag, 20 + bob);
      ctx.quadraticCurveTo(10, 26 + bob, 14, 8 + bob); ctx.closePath(); ctx.fill(); ctx.stroke();
    }

    ctx.save();
    roundRect(ctx, -16, -22 + bob, 32, 36, 15); ctx.fillStyle = darkSuit; ctx.fill(); ctx.clip();
    ctx.fillStyle = dispColor; ctx.beginPath(); ctx.ellipse(3, -9 + bob, 21, 20, -0.15, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#090c12'; ctx.lineWidth = 3.4; roundRect(ctx, -16, -22 + bob, 32, 36, 15); ctx.stroke();

    ctx.save();
    roundRect(ctx, -2, -15 + bob, 22, 14, 7); ctx.fillStyle = '#4f86a8'; ctx.fill(); ctx.clip();
    ctx.fillStyle = '#97d9f7'; ctx.beginPath(); ctx.ellipse(11, -11 + bob, 13, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(12, -12 + bob, 6.5, 2.8, -0.1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#090c12'; ctx.lineWidth = 3; roundRect(ctx, -2, -15 + bob, 22, 14, 7); ctx.stroke();
    ctx.restore();

    const showRedName = !isLobby && me && me.role === 'impostor' && p.role === 'impostor';
    ctx.font = '800 13px Inter, sans-serif'; ctx.textAlign = 'center';
    const tw = ctx.measureText(dispName).width + 14;
    ctx.fillStyle = 'rgba(5, 8, 15, 0.78)'; roundRect(ctx, -tw / 2, -45, tw, 19, 6); ctx.fill();
    ctx.fillStyle = showRedName ? '#f87171' : '#f8fafc';
    ctx.fillText(dispName, 0, -31);
    ctx.restore();
  }

  function drawBody(ctx, b) {
    ctx.save(); ctx.translate(b.x, b.y);
    ctx.fillStyle = 'rgba(185,28,28,0.72)'; ctx.beginPath(); ctx.ellipse(2, 9, 25, 11, 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#090c12'; ctx.lineWidth = 3; ctx.fillStyle = shadeHex(b.color, -45);
    roundRect(ctx, -13, 7, 10, 12, 4); ctx.fill(); ctx.stroke();
    roundRect(ctx, 3, 7, 10, 12, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = b.color; roundRect(ctx, -16, -6, 32, 18, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#991b1b'; ctx.beginPath(); ctx.ellipse(0, -4, 14, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(-3.5, -18, 7, 15);
    ctx.beginPath(); ctx.arc(-4, -18, 4.5, 0, Math.PI * 2); ctx.arc(4, -18, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function renderMiniMap(canvas, state, localId) {
    const ctx = canvas.getContext('2d');
    const sx = canvas.width / MAP_W, sy = canvas.height / MAP_H;
    ctx.fillStyle = '#050912'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = GRID[r][c]; if (!cell) continue;
        ctx.fillStyle = cell === 'WALL' ? '#33415c' : (cell === 'corridor' ? '#162033' : '#1e2d47');
        ctx.fillRect(c * TILE * sx, r * TILE * sy, TILE * sx + 0.6, TILE * sy + 0.6);
      }
    }
    ctx.fillStyle = '#cbd5e1'; ctx.font = '800 9px Inter, sans-serif'; ctx.textAlign = 'center';
    for (const r of ROOM_DEFS) ctx.fillText(r.name, ((r.c1 + r.c2 + 1) / 2) * TILE * sx, ((r.r1 + r.r2 + 1) / 2) * TILE * sy + 3);

    const me = state.players[localId];
    const commsDown = state.sabotage && state.sabotage.type === 'comms';
    if (!commsDown && me && me.tasks && me.role === 'crewmate') {
      for (const mt of me.tasks) {
        if (mt.done) continue;
        const t = TASKS.find((x) => x.id === mt.id); if (!t) continue;
        ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(t.x * sx, t.y * sy, 5.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (state.sabotage) {
      const keys = state.sabotage.type === 'o2'
        ? [!state.sabotage.o2FixedA && 'o2_a', !state.sabotage.o2FixedB && 'o2_b'].filter(Boolean)
        : [state.sabotage.type];
      for (const k of keys) {
        const s = SABOTAGES[k]; if (!s) continue;
        ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(s.x * sx, s.y * sy, 8, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (me) {
      ctx.fillStyle = me.color; ctx.beginPath(); ctx.arc(me.x * sx, me.y * sy, 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    }
  }

  function renderSecurityCams(canvas, state, now) {
    const ctx = canvas.getContext('2d');
    if (state.sabotage && state.sabotage.type === 'comms') {
      ctx.fillStyle = '#04070e'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ef4444'; ctx.font = '800 18px monospace'; ctx.textAlign = 'center';
      ctx.fillText('COMMS SABOTAGED — NO SIGNAL', canvas.width / 2, canvas.height / 2);
      return;
    }
    const cw = canvas.width / 2, ch = canvas.height / 2;
    ctx.fillStyle = '#03060c'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    CAMERAS.forEach((camInfo, idx) => {
      const ox = (idx % 2) * cw, oy = Math.floor(idx / 2) * ch, zoom = 0.55;
      const sx = camInfo.x - (cw / zoom) / 2, sy = camInfo.y - (ch / zoom) / 2;
      ctx.save(); ctx.beginPath(); ctx.rect(ox + 2, oy + 2, cw - 4, ch - 4); ctx.clip();
      ctx.translate(ox, oy); ctx.scale(zoom, zoom); ctx.translate(-sx, -sy);
      ctx.drawImage(shipCanvas, 0, 0);
      for (const b of state.bodies) if (Math.hypot(b.x - camInfo.x, b.y - camInfo.y) < 340) drawBody(ctx, b);
      for (const p of Object.values(state.players)) if (p.alive && !p.inVent && Math.hypot(p.x - camInfo.x, p.y - camInfo.y) < 340) drawCrewmate(ctx, p, null, now, false);
      ctx.restore();
      ctx.strokeStyle = '#334155'; ctx.strokeRect(ox + 2, oy + 2, cw - 4, ch - 4);
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(ox + 6, oy + 6, 150, 18);
      ctx.fillStyle = '#4ade80'; ctx.font = '700 10px monospace'; ctx.textAlign = 'left'; ctx.fillText(camInfo.name, ox + 11, oy + 18);
    });
  }

  function renderAdminTable(canvas, state) {
    const ctx = canvas.getContext('2d');
    if (state.sabotage && state.sabotage.type === 'comms') {
      ctx.fillStyle = '#04070e'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ef4444'; ctx.font = '800 18px monospace'; ctx.textAlign = 'center';
      ctx.fillText('COMMS SABOTAGED — ADMIN OFFLINE', canvas.width / 2, canvas.height / 2);
      return;
    }
    const sx = canvas.width / MAP_W, sy = canvas.height / MAP_H;
    ctx.fillStyle = '#04121f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const cell = GRID[r][c]; if (!cell) continue;
        ctx.fillStyle = cell === 'WALL' ? '#1e4e6e' : (cell === 'corridor' ? '#082032' : '#0c3552');
        ctx.fillRect(c * TILE * sx, r * TILE * sy, TILE * sx + 0.6, TILE * sy + 0.6);
      }
    const counts = {};
    for (const p of Object.values(state.players)) {
      if (!p.alive) continue;
      const rid = getRoomId(p.x, p.y);
      if (rid && ROOM_MAP[rid]) counts[rid] = (counts[rid] || 0) + 1;
    }
    ctx.textAlign = 'center';
    for (const r of ROOM_DEFS) {
      const cx = ((r.c1 + r.c2 + 1) / 2) * TILE * sx, cy = ((r.r1 + r.r2 + 1) / 2) * TILE * sy;
      ctx.fillStyle = 'rgba(125,211,252,0.72)'; ctx.font = '700 8px Inter, sans-serif'; ctx.fillText(r.name, cx, cy - 6);
      const n = counts[r.id] || 0;
      for (let i = 0; i < n; i++) {
        const px = cx + (i - (n - 1) / 2) * 12;
        ctx.fillStyle = '#facc15'; ctx.strokeStyle = '#090c12'; ctx.lineWidth = 1.5;
        roundRect(ctx, px - 4, cy, 8, 11, 3); ctx.fill(); ctx.stroke();
      }
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  function shadeHex(hex, percent) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + percent));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + percent));
    const b = Math.max(0, Math.min(255, (n & 0xff) + percent));
    return `rgb(${r},${g},${b})`;
  }

  window.VoidWorld = {
    MAP_W, MAP_H, DROPSHIP, PLAYER_RADIUS, COLORS, WALLS, DOORS, VENTS, TASKS, CONSOLES, SABOTAGES,
    EMERGENCY_POS, WAYPOINTS, resolveCollision, hasLineOfSight, getRoomName,
    SFX, renderLobby, renderGame, renderMiniMap, renderSecurityCams, renderAdminTable
  };
})();
