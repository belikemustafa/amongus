/* VOID CREW — Ship Geometry, Collision, Visibility Raycasting, SFX & Renderer */
(function () {
  const MAP_W = 2400;
  const MAP_H = 1600;
  const PLAYER_RADIUS = 19;
  const WALL_T = 24;

  const COLORS = [
    { name: 'Crimson', hex: '#ef4444' },
    { name: 'Cyan',    hex: '#06b6d4' },
    { name: 'Lime',    hex: '#22c55e' },
    { name: 'Gold',    hex: '#eab308' },
    { name: 'Violet',  hex: '#8b5cf6' },
    { name: 'Coral',   hex: '#f97316' },
    { name: 'Rose',    hex: '#ec4899' },
    { name: 'Cobalt',  hex: '#3b82f6' },
    { name: 'Mint',    hex: '#14b8a6' },
    { name: 'Silver',  hex: '#cbd5e1' }
  ];

  const ROOMS = [
    { id: 'reactor',    name: 'REACTOR',    x: 60,   y: 60,   w: 520, h: 400, floor: '#181c2b', doors: [{ side: 'E', pos: 140, size: 130 }, { side: 'S', pos: 195, size: 130 }], skip: ['N', 'W'] },
    { id: 'cafeteria',  name: 'CAFETERIA',  x: 820,  y: 60,   w: 760, h: 460, floor: '#1a2030', doors: [{ side: 'W', pos: 165, size: 130 }, { side: 'E', pos: 165, size: 130 }, { side: 'S', pos: 315, size: 130 }], skip: ['N'] },
    { id: 'navigation', name: 'NAVIGATION', x: 1820, y: 60,   w: 520, h: 400, floor: '#171e2c', doors: [{ side: 'W', pos: 140, size: 130 }, { side: 'S', pos: 195, size: 130 }], skip: ['N', 'E'] },
    { id: 'security',   name: 'SECURITY',   x: 60,   y: 640,  w: 400, h: 340, floor: '#1b1d2c', doors: [{ side: 'N', pos: 135, size: 130 }, { side: 'E', pos: 105, size: 130 }], skip: ['W'] },
    { id: 'medbay',     name: 'MEDBAY',     x: 1940, y: 640,  w: 400, h: 340, floor: '#16232d', doors: [{ side: 'N', pos: 135, size: 130 }, { side: 'W', pos: 105, size: 130 }], skip: ['E'] },
    { id: 'engine',     name: 'ENGINE',     x: 60,   y: 1140, w: 560, h: 400, floor: '#1f1b26', doors: [{ side: 'N', pos: 215, size: 130 }, { side: 'E', pos: 135, size: 130 }], skip: ['S', 'W'] },
    { id: 'storage',    name: 'STORAGE',    x: 860,  y: 1060, w: 680, h: 480, floor: '#1c1f2b', doors: [{ side: 'N', pos: 275, size: 130 }, { side: 'W', pos: 175, size: 130 }, { side: 'E', pos: 175, size: 130 }], skip: ['S'] },
    { id: 'electrical', name: 'ELECTRICAL', x: 1780, y: 1140, w: 560, h: 400, floor: '#1d1e26', doors: [{ side: 'N', pos: 215, size: 130 }, { side: 'W', pos: 135, size: 130 }], skip: ['S', 'E'] }
  ];

  // Build AABB walls from outer hull, rooms, and central pillars
  function buildWalls() {
    const walls = [
      { x: 0, y: 0, w: MAP_W, h: 60 },
      { x: 0, y: MAP_H - 60, w: MAP_W, h: 60 },
      { x: 0, y: 60, w: 60, h: MAP_H - 120 },
      { x: MAP_W - 60, y: 60, w: 60, h: MAP_H - 120 },
      // Central Deck Cover Pillars
      { x: 920, y: 740, w: 100, h: 100 },
      { x: 1380, y: 740, w: 100, h: 100 }
    ];

    for (const r of ROOMS) {
      const skip = new Set(r.skip || []);
      const doorFor = (side) => (r.doors || []).find((d) => d.side === side);

      if (!skip.has('N')) {
        const d = doorFor('N');
        if (d) {
          walls.push({ x: r.x, y: r.y, w: d.pos, h: WALL_T });
          walls.push({ x: r.x + d.pos + d.size, y: r.y, w: r.w - d.pos - d.size, h: WALL_T });
        } else {
          walls.push({ x: r.x, y: r.y, w: r.w, h: WALL_T });
        }
      }
      if (!skip.has('S')) {
        const d = doorFor('S');
        const y = r.y + r.h - WALL_T;
        if (d) {
          walls.push({ x: r.x, y, w: d.pos, h: WALL_T });
          walls.push({ x: r.x + d.pos + d.size, y, w: r.w - d.pos - d.size, h: WALL_T });
        } else {
          walls.push({ x: r.x, y, w: r.w, h: WALL_T });
        }
      }
      if (!skip.has('W')) {
        const d = doorFor('W');
        if (d) {
          walls.push({ x: r.x, y: r.y, w: WALL_T, h: d.pos });
          walls.push({ x: r.x, y: r.y + d.pos + d.size, w: WALL_T, h: r.h - d.pos - d.size });
        } else {
          walls.push({ x: r.x, y: r.y, w: WALL_T, h: r.h });
        }
      }
      if (!skip.has('E')) {
        const d = doorFor('E');
        const x = r.x + r.w - WALL_T;
        if (d) {
          walls.push({ x, y: r.y, w: WALL_T, h: d.pos });
          walls.push({ x, y: r.y + d.pos + d.size, w: WALL_T, h: r.h - d.pos - d.size });
        } else {
          walls.push({ x, y: r.y, w: WALL_T, h: r.h });
        }
      }
    }
    return walls;
  }

  const WALLS = buildWalls();

  const EMERGENCY_POS = { x: 1200, y: 270, radius: 52 };

  const VENTS = [
    { id: 0, x: 145,  y: 145,  net: 'A', room: 'Reactor' },
    { id: 1, x: 145,  y: 895,  net: 'A', room: 'Security' },
    { id: 2, x: 145,  y: 1455, net: 'A', room: 'Engine' },
    { id: 3, x: 2255, y: 145,  net: 'B', room: 'Navigation' },
    { id: 4, x: 2255, y: 895,  net: 'B', room: 'MedBay' },
    { id: 5, x: 2255, y: 1455, net: 'B', room: 'Electrical' }
  ];

  const TASKS = [
    { id: 't_wires_elec',  room: 'Electrical', label: 'Fix Wiring',        type: 'wires',   x: 2180, y: 1220 },
    { id: 't_wires_stor',  room: 'Storage',    label: 'Reroute Power',     type: 'wires',   x: 1020, y: 1440 },
    { id: 't_code_nav',    room: 'Navigation', label: 'Chart Course',      type: 'keypad',  x: 2210, y: 260 },
    { id: 't_code_sec',    room: 'Security',   label: 'Verify Passcode',   type: 'keypad',  x: 150,  y: 720 },
    { id: 't_seq_react',   room: 'Reactor',    label: 'Unlock Manifolds',  type: 'numbers', x: 170,  y: 350 },
    { id: 't_seq_eng',     room: 'Engine',     label: 'Align Thrusters',   type: 'numbers', x: 320,  y: 1440 },
    { id: 't_scan_med',    room: 'MedBay',     label: 'Submit Bio-Scan',   type: 'hold',    x: 2160, y: 740 },
    { id: 't_scan_cafe',   room: 'Cafeteria',  label: 'Upload Logs',       type: 'hold',    x: 1470, y: 140 }
  ];

  const SABOTAGES = {
    lights:  { id: 'lights',  room: 'Electrical', label: 'Fix Lights',    x: 1890, y: 1440 },
    reactor: { id: 'reactor', room: 'Reactor',    label: 'Reset Reactor', x: 440,  y: 145 }
  };

  // Connected navigation graph for smooth bot pathing
  const WAYPOINTS = [
    { id: 0,  x: 320,  y: 260,  adj: [1, 2] },       // Reactor
    { id: 1,  x: 700,  y: 260,  adj: [0, 3, 7] },    // NW Corridor
    { id: 2,  x: 320,  y: 550,  adj: [0, 6, 7] },    // W Corridor
    { id: 3,  x: 1200, y: 400,  adj: [1, 4, 8] },    // Cafeteria
    { id: 4,  x: 1700, y: 260,  adj: [3, 5, 9] },    // NE Corridor
    { id: 5,  x: 2080, y: 260,  adj: [4, 10] },      // Navigation
    { id: 6,  x: 260,  y: 810,  adj: [2, 7] },       // Security
    { id: 7,  x: 680,  y: 790,  adj: [1, 2, 6, 8, 12] }, // W Hub
    { id: 8,  x: 1200, y: 790,  adj: [3, 7, 9, 13] },    // Center Deck
    { id: 9,  x: 1720, y: 790,  adj: [4, 8, 10, 11, 14] }, // E Hub
    { id: 10, x: 2140, y: 550,  adj: [5, 9, 11] },   // E Corridor
    { id: 11, x: 2140, y: 810,  adj: [9, 10] },      // MedBay
    { id: 12, x: 340,  y: 1340, adj: [7, 13] },      // Engine
    { id: 13, x: 1200, y: 1300, adj: [8, 12, 14] },  // Storage
    { id: 14, x: 2060, y: 1340, adj: [9, 13] }       // Electrical
  ];

  // Circle vs AABB + Emergency Table Collision
  function resolveCollision(x, y, radius, isGhost) {
    let nx = Math.max(60 + radius, Math.min(MAP_W - 60 - radius, x));
    let ny = Math.max(60 + radius, Math.min(MAP_H - 60 - radius, y));
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
      // Emergency table circle collision
      const tdx = nx - EMERGENCY_POS.x;
      const tdy = ny - EMERGENCY_POS.y;
      const minD = radius + EMERGENCY_POS.radius;
      const tDist = Math.hypot(tdx, tdy);
      if (tDist < minD && tDist > 0.001) {
        nx = EMERGENCY_POS.x + (tdx / tDist) * minD;
        ny = EMERGENCY_POS.y + (tdy / tDist) * minD;
      }
    }
    return { x: nx, y: ny };
  }

  // Segment vs AABB intersection for Line of Sight
  function segHitsRect(x1, y1, x2, y2, r) {
    let t0 = 0, t1 = 1;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const checks = [
      [-dx, x1 - r.x],
      [dx, (r.x + r.w) - x1],
      [-dy, y1 - r.y],
      [dy, (r.y + r.h) - y1]
    ];
    for (const [p, q] of checks) {
      if (p === 0) {
        if (q < 0) return false;
      } else {
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

  function getRoomName(x, y) {
    for (const r of ROOMS) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.name;
    }
    return 'CORRIDOR';
  }

  // Procedural Web Audio SFX
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
    kill() { this.tone(180, 0.25, 'sawtooth', 0.22, 42); setTimeout(() => this.tone(95, 0.22, 'square', 0.16, 30), 70); },
    task() { this.tone(520, 0.12, 'triangle', 0.16); setTimeout(() => this.tone(780, 0.22, 'triangle', 0.16), 100); },
    alarm() { this.tone(620, 0.18, 'sawtooth', 0.16, 440); setTimeout(() => this.tone(620, 0.26, 'sawtooth', 0.16, 440), 210); },
    vent() { this.tone(160, 0.16, 'sine', 0.14, 340); },
    click() { this.tone(440, 0.05, 'sine', 0.08); },
    chat() { this.tone(680, 0.07, 'sine', 0.08, 860); }
  };

  // Offscreen lighting canvas for crisp fog-of-war shadows
  const lightCanvas = document.createElement('canvas');
  const lightCtx = lightCanvas.getContext('2d');

  // Starfield background dots
  const STARS = Array.from({ length: 140 }, () => ({
    x: Math.random() * MAP_W,
    y: Math.random() * MAP_H,
    r: Math.random() * 1.6 + 0.4,
    a: Math.random() * 0.5 + 0.2
  }));

  function renderGame(ctx, vw, vh, state, localId, now) {
    const me = state.players[localId];
    const camX = me ? me.x - vw / 2 : MAP_W / 2 - vw / 2;
    const camY = me ? me.y - vh / 2 : MAP_H / 2 - vh / 2;

    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, vw, vh);

    ctx.save();
    ctx.translate(-camX, -camY);

    // Space stars outside hull
    for (const s of STARS) {
      ctx.fillStyle = `rgba(210, 225, 255, ${s.a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Main Deck Corridor Floor
    ctx.fillStyle = '#121622';
    ctx.fillRect(60, 60, MAP_W - 120, MAP_H - 120);

    // Subtle Floor Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.032)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 60; x <= MAP_W - 60; x += 60) {
      ctx.moveTo(x, 60); ctx.lineTo(x, MAP_H - 60);
    }
    for (let y = 60; y <= MAP_H - 60; y += 60) {
      ctx.moveTo(60, y); ctx.lineTo(MAP_W - 60, y);
    }
    ctx.stroke();

    // Room Floors & Labels
    for (const r of ROOMS) {
      ctx.fillStyle = r.floor;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.font = '800 32px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(r.name, r.x + r.w / 2, r.y + r.h / 2 + 12);
    }

    // Emergency Table in Cafeteria
    ctx.fillStyle = '#252f44';
    ctx.beginPath();
    ctx.arc(EMERGENCY_POS.x, EMERGENCY_POS.y, EMERGENCY_POS.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3d4c6b';
    ctx.lineWidth = 4;
    ctx.stroke();
    // Red Button
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(EMERGENCY_POS.x, EMERGENCY_POS.y, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fca5a5';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Vents
    for (const v of VENTS) {
      ctx.fillStyle = '#0d111a';
      ctx.fillRect(v.x - 20, v.y - 14, 40, 28);
      ctx.strokeStyle = (me && me.role === 'impostor') ? '#38bdf8' : '#334155';
      ctx.lineWidth = 2;
      ctx.strokeRect(v.x - 20, v.y - 14, 40, 28);
      ctx.fillStyle = '#334155';
      for (let i = -12; i <= 12; i += 8) ctx.fillRect(v.x + i - 2, v.y - 9, 4, 18);
    }

    // Task Stations
    const myTasks = (me && me.tasks) ? me.tasks : [];
    for (const t of TASKS) {
      const assigned = myTasks.find((mt) => mt.id === t.id);
      const isPending = assigned && !assigned.done && me.role === 'crewmate';
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(t.x - 18, t.y - 18, 36, 36);
      ctx.strokeStyle = isPending ? '#eab308' : '#475569';
      ctx.lineWidth = isPending ? 3 : 2;
      ctx.strokeRect(t.x - 18, t.y - 18, 36, 36);
      if (isPending) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 220);
        ctx.fillStyle = `rgba(234, 179, 8, ${0.2 + pulse * 0.35})`;
        ctx.beginPath();
        ctx.arc(t.x, t.y, 26 + pulse * 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = isPending ? '#fde047' : '#64748b';
      ctx.fillRect(t.x - 9, t.y - 7, 18, 10);
    }

    // Sabotage Fix Stations
    if (state.sabotage) {
      const s = SABOTAGES[state.sabotage.type];
      if (s) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 150);
        ctx.fillStyle = `rgba(239, 68, 68, ${0.28 + pulse * 0.45})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 34 + pulse * 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(s.x - 16, s.y - 16, 32, 32);
        ctx.fillStyle = '#fff';
        ctx.font = '800 18px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('!', s.x, s.y + 6);
      }
    }

    const visionR = getVisionRadius(me, state);

    // Dead Bodies
    for (const b of state.bodies) {
      if (me && me.alive && !canSeePoint(me, b.x, b.y, visionR)) continue;
      drawBody(ctx, b);
    }

    // Players
    const playerList = Object.values(state.players).sort((a, b) => a.y - b.y);
    for (const p of playerList) {
      if (p.inVent && p.id !== localId) continue;
      if (!p.alive && me && me.alive) continue; // Living cannot see ghosts
      if (p.id !== localId && me && me.alive && !canSeePoint(me, p.x, p.y, visionR)) continue;
      drawCrewmate(ctx, p, me, now);
    }

    ctx.restore();

    // Dynamic Fog-of-War / Line-of-Sight Shadows
    if (me && me.alive) {
      renderVisibilityShadows(ctx, vw, vh, camX, camY, me.x, me.y, visionR);
    } else if (me && !me.alive) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
      ctx.fillRect(0, 0, vw, vh);
    }

    // Redraw crisp wall tops ABOVE fog layer so geometry stays sharp
    ctx.save();
    ctx.translate(-camX, -camY);
    for (const w of WALLS) {
      if (w.x + w.w < camX - 40 || w.x > camX + vw + 40 || w.y + w.h < camY - 40 || w.y > camY + vh + 40) continue;
      ctx.fillStyle = '#21293d';
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.strokeStyle = '#33415c';
      ctx.lineWidth = 2;
      ctx.strokeRect(w.x, w.y, w.w, w.h);
    }
    ctx.restore();
  }

  function getVisionRadius(me, state) {
    if (!me) return 500;
    if (!me.alive) return 900;
    if (me.role === 'impostor') return 540;
    if (state.sabotage && state.sabotage.type === 'lights') return 165;
    return 410;
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
    const sx = px - camX;
    const sy = py - camY;

    lightCtx.globalCompositeOperation = 'source-over';
    lightCtx.clearRect(0, 0, vw, vh);
    lightCtx.fillStyle = 'rgba(4, 6, 12, 0.94)';
    lightCtx.fillRect(0, 0, vw, vh);

    // Punch out smooth vision circle
    lightCtx.globalCompositeOperation = 'destination-out';
    const grad = lightCtx.createRadialGradient(sx, sy, radius * 0.45, sx, sy, radius);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    lightCtx.fillStyle = grad;
    lightCtx.beginPath();
    lightCtx.arc(sx, sy, radius, 0, Math.PI * 2);
    lightCtx.fill();

    // Project wall shadow volumes back onto darkness mask
    lightCtx.globalCompositeOperation = 'source-over';
    lightCtx.fillStyle = 'rgba(4, 6, 12, 0.96)';
    const reach = radius + 900;

    for (const w of WALLS) {
      const cx = Math.max(w.x, Math.min(px, w.x + w.w));
      const cy = Math.max(w.y, Math.min(py, w.y + w.h));
      if (Math.hypot(px - cx, py - cy) > radius + 30) continue;

      const x1 = w.x - camX, y1 = w.y - camY;
      const x2 = w.x + w.w - camX, y2 = w.y + w.h - camY;
      const edges = [
        [x1, y1, x2, y1],
        [x2, y1, x2, y2],
        [x2, y2, x1, y2],
        [x1, y2, x1, y1]
      ];
      for (const [ax, ay, bx, by] of edges) {
        const d1 = Math.hypot(ax - sx, ay - sy) || 1;
        const d2 = Math.hypot(bx - sx, by - sy) || 1;
        const paX = ax + ((ax - sx) / d1) * reach;
        const paY = ay + ((ay - sy) / d1) * reach;
        const pbX = bx + ((bx - sx) / d2) * reach;
        const pbY = by + ((by - sy) / d2) * reach;

        lightCtx.beginPath();
        lightCtx.moveTo(ax, ay);
        lightCtx.lineTo(bx, by);
        lightCtx.lineTo(pbX, pbY);
        lightCtx.lineTo(paX, paY);
        lightCtx.closePath();
        lightCtx.fill();
      }
    }

    ctx.drawImage(lightCanvas, 0, 0);
  }

  function drawCrewmate(ctx, p, me, now) {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (!p.alive) ctx.globalAlpha = 0.45;
    if (p.inVent) ctx.globalAlpha = 0.35;

    const bob = p.moving ? Math.sin(now / 70) * 3 : 0;
    const face = p.facing >= 0 ? 1 : -1;

    // Ground Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.ellipse(0, 21, 18, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.scale(face, 1);

    // Backpack
    ctx.fillStyle = shadeHex(p.color, -25);
    roundRect(ctx, -22, -10 + bob, 10, 22, 5);
    ctx.fill();
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Legs (if alive)
    if (p.alive) {
      const stride = p.moving ? Math.sin(now / 70) * 5 : 0;
      ctx.fillStyle = shadeHex(p.color, -15);
      roundRect(ctx, -12, 10 + stride * 0.5, 9, 13, 4);
      ctx.fill(); ctx.stroke();
      roundRect(ctx, 3, 10 - stride * 0.5, 9, 13, 4);
      ctx.fill(); ctx.stroke();
    }

    // Body
    ctx.fillStyle = p.color;
    roundRect(ctx, -15, -20 + bob, 30, 34, 13);
    ctx.fill();
    ctx.stroke();

    // Visor
    ctx.fillStyle = '#bae6fd';
    roundRect(ctx, 0, -13 + bob, 17, 11, 5);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    roundRect(ctx, 4, -11 + bob, 8, 3, 2);
    ctx.fill();

    ctx.restore();

    // Nameplate
    const showRedName = me && me.role === 'impostor' && p.role === 'impostor';
    ctx.font = '700 13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(5, 8, 15, 0.72)';
    const tw = ctx.measureText(p.name).width + 12;
    roundRect(ctx, -tw / 2, -42, tw, 18, 5);
    ctx.fill();
    ctx.fillStyle = showRedName ? '#f87171' : '#f1f5f9';
    ctx.fillText(p.name, 0, -29);

    ctx.restore();
  }

  function drawBody(ctx, b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    // Pool
    ctx.fillStyle = 'rgba(185, 28, 28, 0.55)';
    ctx.beginPath();
    ctx.ellipse(0, 6, 22, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // Lower half
    ctx.fillStyle = b.color;
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 2.5;
    roundRect(ctx, -14, -4, 28, 16, 6);
    ctx.fill(); ctx.stroke();
    // Bone
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(-3, -15, 6, 12);
    ctx.beginPath();
    ctx.arc(-3, -15, 4, 0, Math.PI * 2);
    ctx.arc(3, -15, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function renderMiniMap(canvas, state, localId) {
    const ctx = canvas.getContext('2d');
    const sx = canvas.width / MAP_W;
    const sy = canvas.height / MAP_H;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Deck
    ctx.fillStyle = '#151b2b';
    ctx.fillRect(60 * sx, 60 * sy, (MAP_W - 120) * sx, (MAP_H - 120) * sy);

    for (const r of ROOMS) {
      ctx.fillStyle = '#1f293d';
      ctx.fillRect(r.x * sx, r.y * sy, r.w * sx, r.h * sy);
      ctx.strokeStyle = '#3b4a69';
      ctx.strokeRect(r.x * sx, r.y * sy, r.w * sx, r.h * sy);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '700 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(r.name, (r.x + r.w / 2) * sx, (r.y + r.h / 2) * sy + 3);
    }

    const me = state.players[localId];
    if (me && me.tasks && me.role === 'crewmate') {
      for (const mt of me.tasks) {
        if (mt.done) continue;
        const t = TASKS.find((x) => x.id === mt.id);
        if (!t) continue;
        ctx.fillStyle = '#eab308';
        ctx.beginPath();
        ctx.arc(t.x * sx, t.y * sy, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (state.sabotage) {
      const s = SABOTAGES[state.sabotage.type];
      if (s) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(s.x * sx, s.y * sy, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (me) {
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(me.x * sx, me.y * sy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
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
    MAP_W, MAP_H, PLAYER_RADIUS, COLORS, ROOMS, WALLS, VENTS, TASKS, SABOTAGES,
    EMERGENCY_POS, WAYPOINTS, resolveCollision, hasLineOfSight, getRoomName,
    SFX, renderGame, renderMiniMap
  };
})();
