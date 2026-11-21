/* VOID CREW — PeerJS Multiplayer Engine, Bot AI, Security Cams, Admin Map & Mini-Games */
(function () {
  const W = window.VoidWorld;
  const $ = (id) => document.getElementById(id);

  const PEER_CONFIG = {
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    }
  };

  // --- LOCAL CLIENT STATE ---
  let peer = null;
  let isHost = false;
  let hostConn = null;
  const clientConns = {};

  let localId = null;
  let roomCode = '';
  let selectedColor = W.COLORS[0].hex;
  let activeTask = null;
  let activeSabFix = null;
  let activeConsole = null; // 'security' | 'admin' | null
  let myVote = null;
  let mapOpen = false;
  let killCooldownLocal = 0;
  let sabCooldownLocal = 0;

  const remoteTargets = {};
  let state = createEmptyState();

  function createEmptyState() {
    return {
      phase: 'menu',
      settings: { impostors: 1, killCd: 22, speed: 275, voteTime: 60 },
      players: {},
      bodies: [],
      sabotage: null,
      meeting: null,
      eject: null,
      winner: null,
      taskProgress: 0
    };
  }

  const botBrains = {};
  const BOT_NAMES = ['Nova', 'Orion', 'Vega', 'Lyra', 'Kael', 'Zora', 'Atlas', 'Echo', 'Cyrus'];

  const keys = {};
  const joy = { active: false, vx: 0, vy: 0, touchId: null };

  // --- INIT ---
  function init() {
    renderColorPicker();
    bindUIEvents();
    setupCanvas();
    setupJoystick();

    const params = new URLSearchParams(window.location.search);
    const inviteRoom = params.get('room');
    if (inviteRoom) {
      $('room-code-input').value = inviteRoom.toUpperCase().slice(0, 6);
      $('menu-status').textContent = `Invite detected for room ${inviteRoom.toUpperCase()} — enter name & click Join!`;
    }
    const savedName = localStorage.getItem('voidcrew_name');
    if (savedName) $('player-name').value = savedName;

    requestAnimationFrame(loop);
  }

  function renderColorPicker() {
    const box = $('color-picker');
    box.innerHTML = '';
    W.COLORS.forEach((c, idx) => {
      const el = document.createElement('div');
      el.className = 'color-swatch' + (idx === 0 ? ' selected' : '');
      el.style.background = c.hex;
      el.title = c.name;
      el.onclick = () => {
        selectedColor = c.hex;
        document.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('selected'));
        el.classList.add('selected');
        W.SFX.click();
      };
      box.appendChild(el);
    });
  }

  function showToast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(t._tid);
    t._tid = setTimeout(() => t.classList.add('hidden'), 2600);
  }

  function getCallsign() {
    const v = $('player-name').value.trim() || ('Crew' + Math.floor(100 + Math.random() * 899));
    localStorage.setItem('voidcrew_name', v);
    return v;
  }

  // --- PEERJS NETWORKING ---
  function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function startHost() {
    const name = getCallsign();
    roomCode = generateCode();
    $('menu-status').textContent = 'Opening subspace channel...';
    if (peer) peer.destroy();

    peer = new Peer('voidcrew-' + roomCode, PEER_CONFIG);
    peer.on('open', (id) => {
      isHost = true;
      localId = id;
      state = createEmptyState();
      state.phase = 'lobby';
      addPlayerToState(id, name, selectedColor, false, true);
      showScreen('lobby');
      updateLobbyUI();
      showToast(`Room ${roomCode} created!`);
    });

    peer.on('connection', (conn) => {
      conn.on('open', () => { clientConns[conn.peer] = conn; });
      conn.on('data', (msg) => handleHostReceive(conn, msg));
      conn.on('close', () => {
        delete clientConns[conn.peer];
        if (state.players[conn.peer]) {
          if (state.phase === 'lobby') delete state.players[conn.peer];
          else {
            state.players[conn.peer].alive = false;
            state.players[conn.peer].watchingCams = false;
            state.players[conn.peer].disconnected = true;
            checkWinConditions();
          }
          broadcastState();
          updateLobbyUI();
        }
      });
    });

    peer.on('error', (err) => {
      $('menu-status').textContent = 'Connection error: ' + err.type + '. Try again.';
    });
  }

  function joinRoom() {
    const name = getCallsign();
    const code = $('room-code-input').value.trim().toUpperCase();
    if (code.length < 4) { $('menu-status').textContent = 'Enter a valid room code.'; return; }
    roomCode = code;
    $('menu-status').textContent = `Connecting to room ${code}...`;
    if (peer) peer.destroy();

    peer = new Peer(PEER_CONFIG);
    peer.on('open', (id) => {
      isHost = false;
      localId = id;
      hostConn = peer.connect('voidcrew-' + code, { reliable: true });
      hostConn.on('open', () => { hostConn.send({ type: 'join', name, color: selectedColor }); });
      hostConn.on('data', (msg) => handleClientReceive(msg));
      hostConn.on('close', () => { showToast('Disconnected from host.'); leaveToMenu(); });
    });

    peer.on('error', (err) => {
      $('menu-status').textContent = err.type === 'peer-unavailable' ? `Room ${code} not found.` : `Error: ${err.type}`;
    });
  }

  function sendToHost(msg) {
    if (isHost) handleHostReceive({ peer: localId }, msg);
    else if (hostConn && hostConn.open) hostConn.send(msg);
  }

  function broadcast(msg) {
    if (!isHost) return;
    for (const c of Object.values(clientConns)) if (c.open) c.send(msg);
  }

  function broadcastState() {
    if (!isHost) return;
    broadcast({ type: 'state', state });
  }

  // --- HOST MESSAGE HANDLER ---
  function handleHostReceive(conn, msg) {
    const pid = conn.peer;
    if (msg.type === 'join') {
      if (state.phase !== 'lobby' || Object.keys(state.players).length >= 10) {
        if (conn.send) conn.send({ type: 'reject', reason: 'Room is full or match already in progress.' });
        return;
      }
      addPlayerToState(pid, msg.name, pickAvailableColor(msg.color), false, false);
      broadcastState();
      updateLobbyUI();
      return;
    }

    const p = state.players[pid];
    if (!p) return;

    if (msg.type === 'pos' && state.phase === 'playing') {
      p.x = msg.x; p.y = msg.y; p.facing = msg.facing; p.moving = msg.moving;
      return;
    }

    if (msg.type === 'cams' && state.phase === 'playing') {
      p.watchingCams = !!msg.active;
      return;
    }

    if (msg.type === 'kill' && state.phase === 'playing') {
      const target = state.players[msg.targetId];
      if (!p.alive || p.role !== 'impostor' || !target || !target.alive || target.role === 'impostor') return;
      if (Math.hypot(p.x - target.x, p.y - target.y) > 135) return;
      executeKill(p, target);
      return;
    }

    if (msg.type === 'ventToggle' && state.phase === 'playing') {
      if (!p.alive || p.role !== 'impostor') return;
      p.inVent = msg.inVent;
      if (msg.x != null) { p.x = msg.x; p.y = msg.y; }
      broadcast({ type: 'sfx', name: 'vent', only: pid });
      broadcastState();
      return;
    }

    if (msg.type === 'taskDone' && state.phase === 'playing') {
      const t = (p.tasks || []).find((x) => x.id === msg.taskId);
      if (t && !t.done) {
        t.done = true;
        recalcTaskProgress();
        checkWinConditions();
        broadcastState();
      }
      return;
    }

    if (msg.type === 'sabotageStart' && state.phase === 'playing') {
      if (!p.alive || p.role !== 'impostor' || state.sabotage) return;
      state.sabotage = { type: msg.sabType, timer: msg.sabType === 'reactor' ? 40 : 0 };
      broadcast({ type: 'sfx', name: 'alarm' });
      W.SFX.alarm();
      broadcastState();
      return;
    }

    if (msg.type === 'sabotageFix' && state.phase === 'playing') {
      if (state.sabotage && state.sabotage.type === msg.sabType) {
        state.sabotage = null;
        broadcast({ type: 'sfx', name: 'task' });
        W.SFX.task();
        broadcastState();
      }
      return;
    }

    if (msg.type === 'report' && state.phase === 'playing') {
      if (!p.alive) return;
      startMeeting('DEAD BODY REPORTED', `${p.name} reported a body!`);
      return;
    }

    if (msg.type === 'emergency' && state.phase === 'playing') {
      if (!p.alive || state.sabotage) return;
      startMeeting('EMERGENCY MEETING', `${p.name} called an emergency meeting!`);
      return;
    }

    if (msg.type === 'chat' && state.phase === 'meeting') {
      if (!p.alive) return;
      const text = String(msg.text || '').trim().slice(0, 120);
      if (!text) return;
      state.meeting.chat.push({ name: p.name, color: p.color, text });
      W.SFX.chat();
      broadcast({ type: 'sfx', name: 'chat' });
      broadcastState();
      renderMeetingUI();
      return;
    }

    if (msg.type === 'vote' && state.phase === 'meeting') {
      if (!p.alive || state.meeting.votes[pid] !== undefined) return;
      state.meeting.votes[pid] = msg.targetId;
      broadcastState();
      renderMeetingUI();
      checkAllVoted();
    }
  }

  // --- CLIENT MESSAGE HANDLER ---
  function handleClientReceive(msg) {
    if (msg.type === 'reject') {
      $('menu-status').textContent = msg.reason;
      hostConn.close();
      return;
    }
    if (msg.type === 'sfx') {
      if (!msg.only || msg.only === localId) {
        if (W.SFX[msg.name]) W.SFX[msg.name]();
      }
      return;
    }
    if (msg.type === 'state') {
      const prevPhase = state.phase;
      const incoming = msg.state;
      const myPrev = state.players[localId];
      const keepLocalPos = prevPhase === 'playing' && incoming.phase === 'playing' && myPrev && incoming.players[localId] && !incoming.players[localId].teleported;

      for (const [id, p] of Object.entries(incoming.players)) {
        if (id !== localId) {
          remoteTargets[id] = { x: p.x, y: p.y };
          if (state.players[id]) { p.x = state.players[id].x; p.y = state.players[id].y; }
        } else if (keepLocalPos) {
          p.x = myPrev.x; p.y = myPrev.y; p.facing = myPrev.facing; p.moving = myPrev.moving;
        }
      }
      state = incoming;
      onPhaseSync(prevPhase, state.phase);
    }
  }

  function onPhaseSync(prev, next) {
    if (next === 'lobby') { showScreen('lobby'); updateLobbyUI(); }
    else if (next === 'reveal' && prev !== 'reveal') { closeModals(); showRevealScreen(); }
    else if (next === 'playing') {
      if (prev !== 'playing') {
        showScreen('hud');
        killCooldownLocal = Math.min(10, state.settings.killCd);
        sabCooldownLocal = 10;
      }
      updateHudTasks();
    } else if (next === 'meeting') {
      if (prev !== 'meeting') { myVote = null; closeModals(); showScreen('meeting'); }
      renderMeetingUI();
    } else if (next === 'eject') {
      if (prev !== 'eject') showEjectScreen();
    } else if (next === 'gameover') {
      if (prev !== 'gameover') { closeModals(); showGameOverScreen(); }
    }
  }

  // --- PLAYER & MATCH MANAGEMENT (HOST) ---
  function pickAvailableColor(preferred) {
    const used = new Set(Object.values(state.players).map((p) => p.color));
    if (preferred && !used.has(preferred)) return preferred;
    const free = W.COLORS.find((c) => !used.has(c.hex));
    return free ? free.hex : W.COLORS[Math.floor(Math.random() * W.COLORS.length)].hex;
  }

  function addPlayerToState(id, name, color, isBot, hostFlag) {
    state.players[id] = {
      id, name, color, isBot, isHost: hostFlag,
      x: W.EMERGENCY_POS.x, y: W.EMERGENCY_POS.y + 100, facing: 1, moving: false,
      role: 'crewmate', alive: true, inVent: false, watchingCams: false, tasks: []
    };
  }

  function addBot() {
    if (!isHost || Object.keys(state.players).length >= 10) return;
    const usedNames = new Set(Object.values(state.players).map((p) => p.name));
    const name = BOT_NAMES.find((n) => !usedNames.has(n)) || ('Bot-' + Math.floor(10 + Math.random() * 89));
    const id = 'bot_' + Math.random().toString(36).slice(2, 8);
    addPlayerToState(id, name, pickAvailableColor(), true, false);
    broadcastState();
    updateLobbyUI();
  }

  function removeBot() {
    if (!isHost) return;
    const bots = Object.values(state.players).filter((p) => p.isBot);
    if (!bots.length) return;
    delete state.players[bots[bots.length - 1].id];
    broadcastState();
    updateLobbyUI();
  }

  function startMatch() {
    if (!isHost) return;
    const players = Object.values(state.players);
    if (players.length < 3) {
      showToast('Need at least 3 players (add Bots or invite friends)!');
      return;
    }

    state.settings = {
      impostors: Number($('set-impostors').value),
      killCd: Number($('set-killcd').value),
      speed: Number($('set-speed').value),
      voteTime: Number($('set-votetime').value)
    };
    const impCount = Math.min(state.settings.impostors, Math.max(1, Math.floor(players.length / 3)));

    const ids = players.map((p) => p.id).sort(() => Math.random() - 0.5);
    const impSet = new Set(ids.slice(0, impCount));

    state.bodies = [];
    state.sabotage = null;
    state.meeting = null;
    state.winner = null;

    ids.forEach((id) => {
      const p = state.players[id];
      p.role = impSet.has(id) ? 'impostor' : 'crewmate';
      p.alive = true;
      p.inVent = false;
      p.watchingCams = false;
      p.disconnected = false;
      const shuffled = [...W.TASKS].sort(() => Math.random() - 0.5).slice(0, 5);
      p.tasks = shuffled.map((t) => ({ id: t.id, room: t.room, label: t.label, done: false }));
      if (p.isBot) {
        botBrains[id] = { wp: 4, targetWp: [3, 5, 11][Math.floor(Math.random() * 3)], wait: 1, killCd: 15, chatSent: false };
      }
    });

    placePlayersAroundTable();
    recalcTaskProgress();
    state.phase = 'reveal';
    broadcastState();
    showRevealScreen();

    setTimeout(() => {
      if (state.phase !== 'reveal') return;
      state.phase = 'playing';
      killCooldownLocal = Math.min(10, state.settings.killCd);
      sabCooldownLocal = 10;
      broadcastState();
      showScreen('hud');
      updateHudTasks();
    }, 3400);
  }

  function placePlayersAroundTable() {
    const list = Object.values(state.players);
    list.forEach((p, i) => {
      const angle = (i / list.length) * Math.PI * 2;
      p.x = W.EMERGENCY_POS.x + Math.cos(angle) * 106;
      p.y = W.EMERGENCY_POS.y + Math.sin(angle) * 106;
      p.inVent = false;
      p.watchingCams = false;
      p.teleported = true;
      if (p.isBot && botBrains[p.id]) {
        botBrains[p.id].wp = 4;
        botBrains[p.id].targetWp = [3, 4, 5][i % 3];
      }
    });
    setTimeout(() => { Object.values(state.players).forEach((p) => delete p.teleported); }, 250);
  }

  function executeKill(killer, victim) {
    victim.alive = false;
    victim.inVent = false;
    victim.watchingCams = false;
    state.bodies.push({ id: victim.id, name: victim.name, color: victim.color, x: victim.x, y: victim.y });
    killer.x = victim.x;
    killer.y = victim.y;
    W.SFX.kill();
    broadcast({ type: 'sfx', name: 'kill' });
    checkWinConditions();
    broadcastState();
  }

  function recalcTaskProgress() {
    let total = 0, done = 0;
    for (const p of Object.values(state.players)) {
      if (p.role === 'crewmate' && p.tasks) {
        total += p.tasks.length;
        done += p.tasks.filter((t) => t.done).length;
      }
    }
    state.taskProgress = total ? Math.round((done / total) * 100) : 0;
  }

  function startMeeting(reason, callerName) {
    if (!isHost || state.phase !== 'playing') return;
    state.phase = 'meeting';
    state.sabotage = null;
    state.meeting = {
      reason,
      callerName,
      timer: state.settings.voteTime,
      votes: {},
      chat: [{ name: 'SYSTEM', color: '#e8b94d', text: `${callerName} Discuss and vote!` }]
    };
    Object.values(state.players).forEach((p) => { p.inVent = false; p.watchingCams = false; });
    Object.values(botBrains).forEach((b) => { b.chatSent = false; b.voteDelay = 3 + Math.random() * 8; });
    myVote = null;
    W.SFX.alarm();
    broadcast({ type: 'sfx', name: 'alarm' });
    closeModals();
    showScreen('meeting');
    renderMeetingUI();
    broadcastState();
  }

  function checkAllVoted() {
    if (!isHost || state.phase !== 'meeting') return;
    const living = Object.values(state.players).filter((p) => p.alive);
    if (living.filter((p) => state.meeting.votes[p.id] !== undefined).length >= living.length) resolveVotes();
  }

  function resolveVotes() {
    if (!isHost || state.phase !== 'meeting') return;
    const tally = {};
    for (const target of Object.values(state.meeting.votes)) tally[target] = (tally[target] || 0) + 1;
    let topTarget = 'skip', topCount = 0, tie = false;
    for (const [k, v] of Object.entries(tally)) {
      if (v > topCount) { topCount = v; topTarget = k; tie = false; }
      else if (v === topCount) tie = true;
    }

    if (tie || topTarget === 'skip' || !state.players[topTarget]) {
      state.eject = {
        text: tie ? 'No one was ejected (Tie).' : 'No one was ejected (Skipped).',
        sub: `${livingImpostorsCount()} Impostor(s) remain.`,
        color: '#64748b'
      };
    } else {
      const ejected = state.players[topTarget];
      ejected.alive = false;
      state.eject = {
        text: `${ejected.name} was ${ejected.role === 'impostor' ? 'An Impostor' : 'not An Impostor'}.`,
        sub: `${livingImpostorsCount()} Impostor(s) remain.`,
        color: ejected.color
      };
    }

    state.bodies = [];
    state.phase = 'eject';
    broadcastState();
    showEjectScreen();

    setTimeout(() => {
      if (state.phase !== 'eject') return;
      if (!checkWinConditions()) {
        placePlayersAroundTable();
        state.phase = 'playing';
        killCooldownLocal = state.settings.killCd;
        broadcastState();
        showScreen('hud');
        updateHudTasks();
      }
    }, 4400);
  }

  function livingImpostorsCount() {
    return Object.values(state.players).filter((p) => p.alive && p.role === 'impostor').length;
  }

  function checkWinConditions() {
    if (!isHost || state.phase === 'gameover' || state.phase === 'lobby') return false;
    const living = Object.values(state.players).filter((p) => p.alive);
    const imps = living.filter((p) => p.role === 'impostor').length;
    const crew = living.filter((p) => p.role === 'crewmate').length;
    const allImps = Object.values(state.players).filter((p) => p.role === 'impostor').map((p) => p.name);

    let win = null;
    if (imps === 0) win = { team: 'CREWMATES', reason: 'All impostors were ejected!', impostors: allImps };
    else if (state.taskProgress >= 100) win = { team: 'CREWMATES', reason: 'All ship tasks completed!', impostors: allImps };
    else if (imps >= crew) win = { team: 'IMPOSTORS', reason: 'Impostors outnumbered the crew!', impostors: allImps };
    else if (state.sabotage && state.sabotage.type === 'reactor' && state.sabotage.timer <= 0) {
      win = { team: 'IMPOSTORS', reason: 'Reactor meltdown destroyed SS Horizon!', impostors: allImps };
    }

    if (win) {
      state.winner = win;
      state.phase = 'gameover';
      broadcastState();
      closeModals();
      showGameOverScreen();
      return true;
    }
    return false;
  }

  // --- BOT AI (HOST) ---
  function updateBots(dt) {
    if (!isHost) return;
    if (state.phase === 'playing') {
      for (const p of Object.values(state.players)) {
        if (!p.isBot || !p.alive) continue;
        const brain = botBrains[p.id];
        if (!brain) continue;

        if (p.role === 'crewmate') {
          for (const b of state.bodies) {
            if (Math.hypot(p.x - b.x, p.y - b.y) < 175 && W.hasLineOfSight(p.x, p.y, b.x, b.y)) {
              startMeeting('DEAD BODY REPORTED', `${p.name} found ${b.name}'s body in ${W.getRoomName(b.x, b.y)}!`);
              return;
            }
          }
        }

        if (p.role === 'impostor') {
          brain.killCd = Math.max(0, brain.killCd - dt);
          if (brain.killCd <= 0) {
            const nearbyCrew = Object.values(state.players).filter(
              (o) => o.alive && o.role === 'crewmate' && Math.hypot(o.x - p.x, o.y - p.y) < 92
            );
            const witnesses = Object.values(state.players).filter(
              (o) => o.alive && o.id !== p.id && Math.hypot(o.x - p.x, o.y - p.y) < 340
            );
            if (nearbyCrew.length === 1 && witnesses.length <= 1) {
              executeKill(p, nearbyCrew[0]);
              brain.killCd = state.settings.killCd + 4;
              continue;
            }
          }
        }

        if (brain.wait > 0) {
          brain.wait -= dt;
          p.moving = false;
          if (brain.wait <= 0 && p.role === 'crewmate') {
            const nextT = (p.tasks || []).find((t) => !t.done);
            if (nextT && Math.random() < 0.3) {
              nextT.done = true;
              recalcTaskProgress();
              checkWinConditions();
            }
          }
          continue;
        }

        const target = W.WAYPOINTS[brain.targetWp];
        const dx = target.x - p.x, dy = target.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 20) {
          const prev = brain.wp;
          brain.wp = brain.targetWp;
          const adj = W.WAYPOINTS[brain.wp].adj;
          const forward = adj.filter((id) => id !== prev);
          const choices = forward.length ? forward : adj;
          brain.targetWp = choices[Math.floor(Math.random() * choices.length)];
          brain.wait = Math.random() < 0.32 ? (1.8 + Math.random() * 2.4) : 0;
          p.moving = false;
        } else {
          const spd = state.settings.speed * 0.86;
          const step = W.resolveCollision(p.x + (dx / dist) * spd * dt, p.y + (dy / dist) * spd * dt, W.PLAYER_RADIUS, false);
          p.x = step.x; p.y = step.y;
          p.facing = dx >= 0 ? 1 : -1;
          p.moving = true;
        }
      }
    } else if (state.phase === 'meeting') {
      for (const p of Object.values(state.players)) {
        if (!p.isBot || !p.alive) continue;
        const brain = botBrains[p.id];
        if (!brain) continue;
        brain.voteDelay -= dt;
        if (!brain.chatSent && brain.voteDelay < 4) {
          brain.chatSent = true;
          const lines = ['Where was the body?', `I was doing tasks in ${W.getRoomName(p.x, p.y)}.`, 'Anyone on cams or admin?', 'Skip if no solid proof.'];
          state.meeting.chat.push({ name: p.name, color: p.color, text: lines[Math.floor(Math.random() * lines.length)] });
          renderMeetingUI();
          broadcastState();
        }
        if (brain.voteDelay <= 0 && state.meeting.votes[p.id] === undefined) {
          const candidates = Object.values(state.players).filter((o) => o.alive && o.id !== p.id);
          const pick = Math.random() < 0.48 ? 'skip' : candidates[Math.floor(Math.random() * candidates.length)].id;
          state.meeting.votes[p.id] = pick;
          renderMeetingUI();
          broadcastState();
          checkAllVoted();
        }
      }
    }
  }

  // --- INTERACTIONS ---
  function getNearestInteractable() {
    const me = state.players[localId];
    if (!me || state.phase !== 'playing') return null;

    if (me.alive && state.sabotage) {
      const s = W.SABOTAGES[state.sabotage.type];
      if (s && Math.hypot(me.x - s.x, me.y - s.y) < 92) return { kind: 'sabotage', data: s };
    }
    if (me.alive && !state.sabotage && Math.hypot(me.x - W.EMERGENCY_POS.x, me.y - W.EMERGENCY_POS.y) < 110) {
      return { kind: 'emergency' };
    }
    if (me.role === 'crewmate' && me.tasks) {
      for (const mt of me.tasks) {
        if (mt.done) continue;
        const t = W.TASKS.find((x) => x.id === mt.id);
        if (t && Math.hypot(me.x - t.x, me.y - t.y) < 82) return { kind: 'task', data: t };
      }
    }
    if (me.alive) {
      for (const c of Object.values(W.CONSOLES)) {
        if (Math.hypot(me.x - c.x, me.y - c.y) < 86) return { kind: 'console', data: c };
      }
    }
    return null;
  }

  function getNearestKillTarget() {
    const me = state.players[localId];
    if (!me || !me.alive || me.role !== 'impostor' || me.inVent || killCooldownLocal > 0) return null;
    let best = null, bestD = 112;
    for (const p of Object.values(state.players)) {
      if (p.id === localId || !p.alive || p.role === 'impostor') continue;
      const d = Math.hypot(p.x - me.x, p.y - me.y);
      if (d < bestD && W.hasLineOfSight(me.x, me.y, p.x, p.y)) { bestD = d; best = p; }
    }
    return best;
  }

  function getNearestBody() {
    const me = state.players[localId];
    if (!me || !me.alive || me.inVent) return null;
    for (const b of state.bodies) {
      if (Math.hypot(b.x - me.x, b.y - me.y) < 125 && W.hasLineOfSight(me.x, me.y, b.x, b.y)) return b;
    }
    return null;
  }

  function getNearestVent() {
    const me = state.players[localId];
    if (!me || !me.alive || me.role !== 'impostor') return null;
    for (const v of W.VENTS) if (Math.hypot(v.x - me.x, v.y - me.y) < 76) return v;
    return null;
  }

  function triggerUse() {
    const me = state.players[localId];
    if (!me || state.phase !== 'playing') return;
    if (me.inVent) { exitVent(); return; }
    const item = getNearestInteractable();
    if (!item) return;
    if (item.kind === 'emergency') sendToHost({ type: 'emergency' });
    else if (item.kind === 'task') openTaskMiniGame(item.data);
    else if (item.kind === 'sabotage') openSabotageMiniGame(item.data);
    else if (item.kind === 'console') openUtilityConsole(item.data);
  }

  function triggerKill() {
    const target = getNearestKillTarget();
    if (!target) return;
    killCooldownLocal = state.settings.killCd;
    sendToHost({ type: 'kill', targetId: target.id });
  }

  function triggerReport() {
    if (!getNearestBody()) return;
    sendToHost({ type: 'report' });
  }

  function triggerVent() {
    const me = state.players[localId];
    if (!me || !me.alive || me.role !== 'impostor') return;
    if (!me.inVent) {
      const v = getNearestVent();
      if (!v) return;
      me.inVent = true;
      me.x = v.x; me.y = v.y;
      W.SFX.vent();
      $('vent-controls').classList.remove('hidden');
      sendToHost({ type: 'ventToggle', inVent: true, x: v.x, y: v.y });
    } else hopNextVent();
  }

  function hopNextVent() {
    const me = state.players[localId];
    if (!me || !me.inVent) return;
    const cur = W.VENTS.find((v) => Math.hypot(v.x - me.x, v.y - me.y) < 42) || W.VENTS[0];
    const net = W.VENTS.filter((v) => v.net === cur.net);
    const next = net[(net.indexOf(cur) + 1) % net.length];
    me.x = next.x; me.y = next.y;
    W.SFX.vent();
    sendToHost({ type: 'ventToggle', inVent: true, x: next.x, y: next.y });
  }

  function exitVent() {
    const me = state.players[localId];
    if (!me || !me.inVent) return;
    me.inVent = false;
    W.SFX.vent();
    $('vent-controls').classList.add('hidden');
    sendToHost({ type: 'ventToggle', inVent: false, x: me.x, y: me.y });
  }

  // --- UTILITY CONSOLES (SECURITY CAMS & ADMIN MAP) ---
  function openUtilityConsole(consoleInfo) {
    activeConsole = consoleInfo.id;
    $('task-modal-title').textContent = consoleInfo.label.toUpperCase();
    const body = $('task-modal-body');
    body.innerHTML = '';
    const cv = document.createElement('canvas');
    cv.id = 'consoleCanvas';
    cv.className = 'console-canvas';
    cv.width = 500;
    cv.height = 330;
    const note = document.createElement('div');
    note.style.fontSize = '0.78rem';
    note.style.color = '#94a3b8';
    note.textContent = consoleInfo.id === 'security'
      ? 'Live CCTV Hallway Feeds — red camera LEDs blink on the walls while viewing.'
      : 'Live Admin Tracking — yellow markers show living crewmates currently inside each room.';
    body.append(cv, note);
    $('task-modal').classList.remove('hidden');
    if (consoleInfo.id === 'security') sendToHost({ type: 'cams', active: true });
  }

  // --- TASK & SABOTAGE MINI-GAMES ---
  function openTaskMiniGame(task) {
    activeTask = task;
    $('task-modal-title').textContent = `${task.room.toUpperCase()} — ${task.label.toUpperCase()}`;
    const body = $('task-modal-body');
    body.innerHTML = '';
    $('task-modal').classList.remove('hidden');

    if (task.type === 'keypad') buildKeypadGame(body, () => completeTask(task.id));
    else if (task.type === 'wires') buildWiresGame(body, () => completeTask(task.id));
    else if (task.type === 'numbers') buildNumbersGame(body, () => completeTask(task.id));
    else if (task.type === 'lights') buildLightsGame(body, 'Prime all 5 shield capacitors to ON.', () => completeTask(task.id));
    else if (task.type === 'asteroids') buildAsteroidsGame(body, () => completeTask(task.id));
    else if (task.type === 'clean') buildCleanO2Game(body, () => completeTask(task.id));
    else if (task.type === 'card') buildCardSwipeGame(body, () => completeTask(task.id));
    else buildHoldGame(body, 'HOLD TO COMPLETE', 2.0, () => completeTask(task.id));
  }

  function openSabotageMiniGame(sab) {
    activeSabFix = sab;
    $('task-modal-title').textContent = `EMERGENCY — ${sab.label.toUpperCase()}`;
    const body = $('task-modal-body');
    body.innerHTML = '';
    $('task-modal').classList.remove('hidden');

    if (sab.id === 'lights') buildLightsGame(body, 'Flip all 5 electrical breakers to ON.', () => completeSabotage('lights'));
    else buildHoldGame(body, 'HOLD HAND ON SCANNER', 2.2, () => completeSabotage('reactor'));
  }

  function completeTask(taskId) {
    W.SFX.task();
    activeTask = null;
    $('task-modal').classList.add('hidden');
    sendToHost({ type: 'taskDone', taskId });
    showToast('Task completed!');
  }

  function completeSabotage(sabType) {
    activeSabFix = null;
    $('task-modal').classList.add('hidden');
    sendToHost({ type: 'sabotageFix', sabType });
    showToast('Systems restored!');
  }

  function buildKeypadGame(container, onWin) {
    const target = String(Math.floor(1000 + Math.random() * 9000));
    let entered = '';
    const info = document.createElement('div');
    info.innerHTML = `Enter Access Code: <b style="color:#e8b94d;letter-spacing:0.2em">${target}</b>`;
    const disp = document.createElement('div');
    disp.className = 'keypad-display'; disp.textContent = '----';
    const grid = document.createElement('div'); grid.className = 'keypad-grid';

    ['1','2','3','4','5','6','7','8','9','C','0','OK'].forEach((k) => {
      const b = document.createElement('button');
      b.className = 'keypad-btn'; b.textContent = k;
      b.onclick = () => {
        W.SFX.click();
        if (k === 'C') entered = '';
        else if (k === 'OK') { if (entered === target) onWin(); else entered = ''; }
        else if (entered.length < 4) entered += k;
        disp.textContent = entered.padEnd(4, '-');
        if (entered === target) setTimeout(onWin, 180);
      };
      grid.appendChild(b);
    });
    container.append(info, disp, grid);
  }

  function buildWiresGame(container, onWin) {
    const cols = [{ id: 'RED', bg: '#ef4444' }, { id: 'BLUE', bg: '#3b82f6' }, { id: 'GOLD', bg: '#eab308' }, { id: 'TEAL', bg: '#14b8a6' }];
    const left = [...cols].sort(() => Math.random() - 0.5);
    const right = [...cols].sort(() => Math.random() - 0.5);
    let picked = null, matched = 0;

    const tip = document.createElement('div');
    tip.textContent = 'Connect each left wire to its matching terminal on the right.';
    tip.style.fontSize = '0.84rem'; tip.style.color = '#94a3b8';

    const board = document.createElement('div'); board.className = 'wires-board';
    const cL = document.createElement('div'); cL.className = 'wires-col';
    const cR = document.createElement('div'); cR.className = 'wires-col';

    left.forEach((w) => {
      const b = document.createElement('button');
      b.className = 'wire-node'; b.style.background = w.bg; b.textContent = w.id;
      b.onclick = () => {
        if (b.classList.contains('matched')) return;
        W.SFX.click();
        cL.querySelectorAll('.wire-node').forEach((n) => n.classList.remove('selected'));
        b.classList.add('selected');
        picked = { id: w.id, el: b };
      };
      cL.appendChild(b);
    });

    right.forEach((w) => {
      const b = document.createElement('button');
      b.className = 'wire-node'; b.style.background = w.bg; b.textContent = w.id;
      b.onclick = () => {
        if (!picked || b.classList.contains('matched')) return;
        if (picked.id === w.id) {
          W.SFX.task();
          picked.el.classList.remove('selected'); picked.el.classList.add('matched');
          b.classList.add('matched'); picked = null;
          if (++matched === 4) setTimeout(onWin, 180);
        } else W.SFX.click();
      };
      cR.appendChild(b);
    });
    board.append(cL, cR);
    container.append(tip, board);
  }

  function buildNumbersGame(container, onWin) {
    let next = 1;
    const nums = [1,2,3,4,5,6,7,8,9].sort(() => Math.random() - 0.5);
    const tip = document.createElement('div');
    tip.textContent = 'Tap relays in ascending sequence (1 to 9).';
    tip.style.fontSize = '0.84rem'; tip.style.color = '#94a3b8';
    const grid = document.createElement('div'); grid.className = 'keypad-grid';

    nums.forEach((n) => {
      const b = document.createElement('button');
      b.className = 'keypad-btn'; b.textContent = n;
      b.onclick = () => {
        if (n === next) {
          W.SFX.click(); b.classList.add('done');
          if (++next > 9) setTimeout(onWin, 180);
        }
      };
      grid.appendChild(b);
    });
    container.append(tip, grid);
  }

  function buildLightsGame(container, text, onWin) {
    const tip = document.createElement('div'); tip.textContent = text;
    const row = document.createElement('div'); row.className = 'switches-row';
    const states = [0, 1, 0, 0, 1].sort(() => Math.random() - 0.5);
    if (states.every(Boolean)) states[0] = 0;

    const renderSw = () => {
      row.innerHTML = '';
      states.forEach((on, idx) => {
        const b = document.createElement('button');
        b.className = 'switch-btn' + (on ? ' on' : '');
        b.textContent = on ? 'ON' : 'OFF';
        b.onclick = () => {
          W.SFX.click();
          states[idx] = states[idx] ? 0 : 1;
          renderSw();
          if (states.every(Boolean)) setTimeout(onWin, 180);
        };
        row.appendChild(b);
      });
    };
    renderSw();
    container.append(tip, row);
  }

  function buildAsteroidsGame(container, onWin) {
    let destroyed = 0;
    const goal = 7;
    const status = document.createElement('div');
    status.textContent = `Destroy Asteroids: 0 / ${goal}`;
    const arena = document.createElement('div');
    arena.className = 'radar-arena';

    const spawnRock = () => {
      if (destroyed >= goal || $('task-modal').classList.contains('hidden')) return;
      const b = document.createElement('button');
      b.className = 'asteroid-btn';
      b.style.left = (20 + Math.random() * 265) + 'px';
      b.style.top = (20 + Math.random() * 155) + 'px';
      b.onclick = () => {
        W.SFX.click();
        b.remove();
        destroyed++;
        status.textContent = `Destroy Asteroids: ${destroyed} / ${goal}`;
        if (destroyed >= goal) setTimeout(onWin, 180);
        else spawnRock();
      };
      arena.appendChild(b);
    };
    spawnRock(); spawnRock();
    container.append(status, arena);
  }

  function buildCleanO2Game(container, onWin) {
    let left = 6;
    const status = document.createElement('div');
    status.textContent = `Tap all ${left} leaves to clear the O2 filter`;
    const arena = document.createElement('div');
    arena.className = 'radar-arena';
    arena.style.background = '#13242b';

    for (let i = 0; i < left; i++) {
      const b = document.createElement('button');
      b.className = 'leaf-btn';
      b.style.left = (25 + Math.random() * 260) + 'px';
      b.style.top = (20 + Math.random() * 165) + 'px';
      b.style.transform = `rotate(${Math.random() * 180}deg)`;
      b.onclick = () => {
        W.SFX.click();
        b.remove();
        left--;
        status.textContent = left ? `${left} leaves remaining` : 'Filter clear!';
        if (left <= 0) setTimeout(onWin, 180);
      };
      arena.appendChild(b);
    }
    container.append(status, arena);
  }

  function buildCardSwipeGame(container, onWin) {
    let startTs = 0;
    const box = document.createElement('div'); box.className = 'card-reader-box';
    const msg = document.createElement('div');
    msg.textContent = 'Drag your Crew ID smoothly from left to right.';
    msg.style.color = '#e2e8f0'; msg.style.fontSize = '0.88rem';
    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = 0; slider.max = 100; slider.value = 0;
    slider.className = 'card-slider';

    slider.oninput = () => {
      if (!startTs && Number(slider.value) > 5) startTs = performance.now();
      if (Number(slider.value) >= 98) {
        const dur = performance.now() - startTs;
        if (dur < 160) {
          msg.textContent = 'Too fast! Try swiping smoothly.';
          msg.style.color = '#f87171';
          slider.value = 0; startTs = 0;
        } else {
          msg.textContent = 'ACCEPTED — WELCOME CREWMATE';
          msg.style.color = '#4ade80';
          slider.disabled = true;
          setTimeout(onWin, 220);
        }
      }
    };
    box.append(msg, slider);
    container.append(box);
  }

  function buildHoldGame(container, label, secs, onWin) {
    let holding = false, progress = 0, done = false;
    const btn = document.createElement('button'); btn.className = 'hold-btn'; btn.textContent = label;
    const bar = document.createElement('div'); bar.className = 'progress-track'; bar.style.width = '260px';
    const fill = document.createElement('div'); fill.className = 'progress-fill';
    bar.appendChild(fill);

    const startH = (e) => { e.preventDefault(); holding = true; };
    const endH = () => { holding = false; };
    btn.addEventListener('mousedown', startH);
    btn.addEventListener('touchstart', startH);
    window.addEventListener('mouseup', endH);
    window.addEventListener('touchend', endH);

    const iv = setInterval(() => {
      if ($('task-modal').classList.contains('hidden')) { clearInterval(iv); return; }
      if (holding && !done) {
        progress += 0.05 / secs;
        fill.style.width = Math.min(100, progress * 100) + '%';
        if (progress >= 1) { done = true; clearInterval(iv); onWin(); }
      }
    }, 50);
    container.append(btn, bar);
  }

  // --- UI SCREENS ---
  function showScreen(name) {
    ['menu-screen', 'lobby-screen', 'hud', 'reveal-screen', 'meeting-screen', 'eject-screen', 'gameover-screen']
      .forEach((id) => $(id).classList.add('hidden'));
    if (name === 'hud') $('hud').classList.remove('hidden');
    else $(name + '-screen').classList.remove('hidden');
  }

  function closeModals() {
    if (activeConsole === 'security') sendToHost({ type: 'cams', active: false });
    $('task-modal').classList.add('hidden');
    $('map-modal').classList.add('hidden');
    $('sabotage-menu').classList.add('hidden');
    $('vent-controls').classList.add('hidden');
    mapOpen = false;
    activeTask = null;
    activeSabFix = null;
    activeConsole = null;
  }

  function updateLobbyUI() {
    if (state.phase !== 'lobby') return;
    $('lobby-code').textContent = roomCode;
    const players = Object.values(state.players);
    $('player-count').textContent = players.length;

    const list = $('lobby-players');
    list.innerHTML = '';
    for (const p of players) {
      const card = document.createElement('div');
      card.className = 'player-card';
      card.innerHTML = `
        <div class="avatar-dot" style="background:${p.color}"></div>
        <span class="player-card-name">${escapeHtml(p.name)}</span>
        ${p.isHost ? '<span class="player-tag">HOST</span>' : (p.isBot ? '<span class="player-tag bot">BOT</span>' : '')}
      `;
      list.appendChild(card);
    }

    $('bot-controls').classList.toggle('hidden', !isHost);
    $('btn-start-game').classList.toggle('hidden', !isHost);
    $('waiting-host-msg').classList.toggle('hidden', isHost);
    ['set-impostors', 'set-killcd', 'set-speed', 'set-votetime'].forEach((id) => { $(id).disabled = !isHost; });
  }

  function showRevealScreen() {
    showScreen('reveal');
    const me = state.players[localId];
    const isImp = me && me.role === 'impostor';
    $('reveal-role').textContent = isImp ? 'IMPOSTOR' : 'CREWMATE';
    $('reveal-role').style.color = isImp ? '#ef4444' : '#2dd4bf';
    if (isImp) {
      const allies = Object.values(state.players).filter((p) => p.role === 'impostor' && p.id !== localId).map((p) => p.name);
      $('reveal-desc').textContent = allies.length
        ? `Sabotage systems and eliminate the crew. Fellow impostor: ${allies.join(', ')}.`
        : 'Sabotage systems, use the 4 vent loops, and eliminate the crew without getting caught.';
    } else {
      $('reveal-desc').textContent = 'Complete all ship tasks, watch Security Cams & Admin Map, and eject the impostor.';
    }
  }

  function updateHudTasks() {
    const me = state.players[localId];
    if (!me) return;
    $('task-percent').textContent = state.taskProgress + '%';
    $('task-progress-fill').style.width = state.taskProgress + '%';

    const badge = $('role-badge');
    if (!me.alive) { badge.textContent = 'GHOST'; badge.className = 'role-badge ghost'; }
    else if (me.role === 'impostor') { badge.textContent = 'IMPOSTOR'; badge.className = 'role-badge impostor'; }
    else { badge.textContent = 'CREWMATE'; badge.className = 'role-badge'; }

    const box = $('task-list-box');
    if (me.role === 'impostor') {
      box.innerHTML = `<div style="color:#fca5a5;font-weight:800;margin-bottom:4px">SABOTAGE & ELIMINATE</div>
        <div style="color:#94a3b8;font-size:0.74rem">Check Security Cams or Admin Map to hunt isolated crewmates.</div>`;
    } else {
      box.innerHTML = (me.tasks || []).map((t) =>
        `<div class="task-item ${t.done ? 'done' : ''}"><span>${t.room}: ${t.label}</span><span>${t.done ? '✓' : '•'}</span></div>`
      ).join('');
    }

    const isImpAlive = me.alive && me.role === 'impostor';
    $('act-kill').classList.toggle('hidden', !isImpAlive);
    $('act-vent').classList.toggle('hidden', !isImpAlive);
    $('act-sabotage').classList.toggle('hidden', !isImpAlive);
  }

  function renderMeetingUI() {
    if (!state.meeting) return;
    $('meeting-reason').textContent = state.meeting.reason;
    $('meeting-caller').textContent = state.meeting.callerName;
    $('meeting-timer').textContent = Math.max(0, Math.ceil(state.meeting.timer));

    const me = state.players[localId];
    const canVote = me && me.alive && myVote === null;

    const grid = $('meeting-players');
    grid.innerHTML = '';
    for (const p of Object.values(state.players)) {
      const card = document.createElement('div');
      const hasVoted = state.meeting.votes[p.id] !== undefined;
      card.className = 'vote-card' + (!p.alive ? ' dead' : '') + (myVote === p.id ? ' selected' : '') + (!canVote ? ' disabled' : '');
      card.innerHTML = `
        <div class="avatar-dot" style="background:${p.color}"></div>
        <div>
          <div class="player-card-name">${escapeHtml(p.name)}</div>
          <div style="font-size:0.7rem;color:#94a3b8">${p.alive ? (p.isBot ? 'Bot' : 'Alive') : 'DECEASED'}</div>
        </div>
        ${hasVoted ? '<span class="vote-badge">VOTED</span>' : ''}
      `;
      if (canVote && p.alive) {
        card.onclick = () => {
          myVote = p.id; W.SFX.click();
          sendToHost({ type: 'vote', targetId: p.id });
          renderMeetingUI();
        };
      }
      grid.appendChild(card);
    }

    $('btn-skip-vote').disabled = !canVote;
    $('vote-status-text').textContent = !me || !me.alive
      ? 'Ghosts cannot vote.'
      : (myVote ? 'Vote locked in. Waiting for crew...' : 'Click a crewmate or Skip Vote.');

    const chatBox = $('chat-messages');
    chatBox.innerHTML = state.meeting.chat.map((m) =>
      `<div class="chat-msg"><span class="sender" style="color:${m.color}">${escapeHtml(m.name)}:</span>${escapeHtml(m.text)}</div>`
    ).join('');
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  function showEjectScreen() {
    showScreen('eject');
    $('eject-avatar').style.background = state.eject.color;
    $('eject-text').textContent = state.eject.text;
    $('eject-sub').textContent = state.eject.sub;
  }

  function showGameOverScreen() {
    showScreen('gameover');
    const win = state.winner;
    $('gameover-title').textContent = `${win.team} WIN`;
    $('gameover-title').style.color = win.team === 'IMPOSTORS' ? '#ef4444' : '#2dd4bf';
    $('gameover-reason').textContent = win.reason;
    $('gameover-impostors').innerHTML = `Impostors were: <b style="color:#fca5a5">${win.impostors.map(escapeHtml).join(', ')}</b>`;
    $('btn-play-again').classList.toggle('hidden', !isHost);
    $('gameover-wait').classList.toggle('hidden', isHost);
  }

  function leaveToMenu() {
    if (peer) { peer.destroy(); peer = null; }
    isHost = false; hostConn = null;
    state = createEmptyState();
    closeModals();
    showScreen('menu');
  }

  // --- MAIN 60 FPS LOOP ---
  const canvas = $('gameCanvas');
  const ctx = canvas.getContext('2d');
  let lastTime = performance.now();
  let netAccum = 0;

  function setupCanvas() {
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    window.addEventListener('resize', resize);
    resize();
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (state.phase === 'playing') {
      updateLocalMovement(dt);
      updateCooldownsAndHud(dt);
      if (isHost) {
        updateBots(dt);
        if (state.sabotage && state.sabotage.type === 'reactor') {
          state.sabotage.timer = Math.max(0, state.sabotage.timer - dt);
          if (state.sabotage.timer <= 0) checkWinConditions();
        }
      } else {
        for (const [id, t] of Object.entries(remoteTargets)) {
          const p = state.players[id];
          if (p) {
            const lerp = Math.min(1, dt * 15);
            p.x += (t.x - p.x) * lerp;
            p.y += (t.y - p.y) * lerp;
          }
        }
      }

      netAccum += dt;
      if (netAccum >= 0.05) {
        netAccum = 0;
        if (isHost) broadcastState();
        else if (hostConn && hostConn.open && state.players[localId]) {
          const me = state.players[localId];
          hostConn.send({ type: 'pos', x: me.x, y: me.y, facing: me.facing, moving: me.moving });
        }
      }

      W.renderGame(ctx, window.innerWidth, window.innerHeight, state, localId, now);
      if (mapOpen) W.renderMiniMap($('mapCanvas'), state, localId);
      if (activeConsole) {
        const cv = $('consoleCanvas');
        if (cv) {
          if (activeConsole === 'security') W.renderSecurityCams(cv, state, now);
          else if (activeConsole === 'admin') W.renderAdminTable(cv, state);
        }
      }
    } else if (state.phase === 'meeting' && isHost) {
      updateBots(dt);
      state.meeting.timer -= dt;
      $('meeting-timer').textContent = Math.max(0, Math.ceil(state.meeting.timer));
      netAccum += dt;
      if (netAccum >= 0.5) { netAccum = 0; broadcastState(); }
      if (state.meeting.timer <= 0) resolveVotes();
    }

    requestAnimationFrame(loop);
  }

  function updateLocalMovement(dt) {
    const me = state.players[localId];
    if (!me || me.inVent || activeTask || activeSabFix || activeConsole) {
      if (me) me.moving = false;
      return;
    }

    let vx = 0, vy = 0;
    if (keys['KeyW'] || keys['ArrowUp']) vy -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) vy += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) vx -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) vx += 1;
    if (joy.active) { vx = joy.vx; vy = joy.vy; }

    const mag = Math.hypot(vx, vy);
    if (mag > 0.08) {
      const nx = vx / Math.max(1, mag), ny = vy / Math.max(1, mag);
      const spd = state.settings.speed * (me.alive ? 1 : 1.15);
      const next = W.resolveCollision(me.x + nx * spd * dt, me.y + ny * spd * dt, W.PLAYER_RADIUS, !me.alive);
      me.x = next.x; me.y = next.y;
      if (Math.abs(nx) > 0.1) me.facing = nx > 0 ? 1 : -1;
      me.moving = true;
    } else me.moving = false;
  }

  function updateCooldownsAndHud(dt) {
    const me = state.players[localId];
    if (!me) return;

    killCooldownLocal = Math.max(0, killCooldownLocal - dt);
    sabCooldownLocal = Math.max(0, sabCooldownLocal - dt);

    $('room-indicator').textContent = W.getRoomName(me.x, me.y);

    const sabBanner = $('sabotage-banner');
    if (state.sabotage) {
      sabBanner.classList.remove('hidden');
      sabBanner.textContent = state.sabotage.type === 'lights'
        ? 'LIGHTS SABOTAGED — FIX IN ELECTRICAL'
        : `REACTOR MELTDOWN IN ${Math.ceil(state.sabotage.timer)}s — RESET IN REACTOR`;
    } else sabBanner.classList.add('hidden');

    const useItem = getNearestInteractable();
    $('act-use').disabled = !useItem && !me.inVent;
    $('act-use').querySelector('span').textContent = useItem && useItem.kind === 'console'
      ? (useItem.data.id === 'security' ? 'CAMS' : 'ADMIN')
      : 'USE';
    $('act-report').disabled = !getNearestBody();

    if (me.alive && me.role === 'impostor') {
      $('act-kill').disabled = !getNearestKillTarget();
      $('kill-cd').textContent = killCooldownLocal > 0 ? Math.ceil(killCooldownLocal) + 's' : 'Q';
      $('act-vent').disabled = !me.inVent && !getNearestVent();
      $('act-sabotage').disabled = !!state.sabotage || sabCooldownLocal > 0;
      $('sab-cd').textContent = sabCooldownLocal > 0 ? Math.ceil(sabCooldownLocal) + 's' : '';
    }
  }

  // --- EVENTS & JOYSTICK ---
  function bindUIEvents() {
    $('btn-host').onclick = startHost;
    $('btn-join').onclick = joinRoom;
    $('btn-leave-lobby').onclick = leaveToMenu;
    $('btn-add-bot').onclick = addBot;
    $('btn-rem-bot').onclick = removeBot;
    $('btn-start-game').onclick = startMatch;

    $('btn-copy-link').onclick = () => {
      const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
      navigator.clipboard.writeText(url).then(() => showToast('Invite link copied!')).catch(() => showToast(`Room Code: ${roomCode}`));
    };

    $('btn-play-again').onclick = () => {
      if (!isHost) return;
      state.phase = 'lobby';
      state.bodies = [];
      state.sabotage = null;
      broadcastState();
      showScreen('lobby');
      updateLobbyUI();
    };

    $('act-use').onclick = triggerUse;
    $('act-kill').onclick = triggerKill;
    $('act-report').onclick = triggerReport;
    $('act-vent').onclick = triggerVent;
    $('btn-vent-hop').onclick = hopNextVent;
    $('btn-vent-exit').onclick = exitVent;

    $('act-sabotage').onclick = () => $('sabotage-menu').classList.toggle('hidden');
    $('btn-sab-close').onclick = () => $('sabotage-menu').classList.add('hidden');
    $('btn-sab-lights').onclick = () => {
      sabCooldownLocal = 25;
      $('sabotage-menu').classList.add('hidden');
      sendToHost({ type: 'sabotageStart', sabType: 'lights' });
    };
    $('btn-sab-reactor').onclick = () => {
      sabCooldownLocal = 30;
      $('sabotage-menu').classList.add('hidden');
      sendToHost({ type: 'sabotageStart', sabType: 'reactor' });
    };

    $('btn-toggle-map').onclick = toggleMap;
    $('btn-close-map').onclick = toggleMap;
    $('btn-close-task').onclick = () => {
      if (activeConsole === 'security') sendToHost({ type: 'cams', active: false });
      activeTask = null; activeSabFix = null; activeConsole = null;
      $('task-modal').classList.add('hidden');
    };

    $('btn-mute').onclick = () => {
      W.SFX.muted = !W.SFX.muted;
      $('btn-mute').textContent = W.SFX.muted ? 'MUTED' : 'SFX';
    };

    $('btn-skip-vote').onclick = () => {
      myVote = 'skip'; W.SFX.click();
      sendToHost({ type: 'vote', targetId: 'skip' });
      renderMeetingUI();
    };

    $('chat-form').onsubmit = (e) => {
      e.preventDefault();
      const inp = $('chat-input');
      if (!inp.value.trim()) return;
      sendToHost({ type: 'chat', text: inp.value });
      inp.value = '';
    };

    window.addEventListener('keydown', (e) => {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      keys[e.code] = true;
      if (state.phase !== 'playing') return;
      if (e.code === 'KeyE') triggerUse();
      if (e.code === 'KeyQ') triggerKill();
      if (e.code === 'KeyR') triggerReport();
      if (e.code === 'KeyV') triggerVent();
      if (e.code === 'KeyM') toggleMap();
      if (e.code === 'Escape') closeModals();
    });
    window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  }

  function toggleMap() {
    if (state.phase !== 'playing') return;
    mapOpen = !mapOpen;
    $('map-modal').classList.toggle('hidden', !mapOpen);
  }

  function setupJoystick() {
    const zone = $('joystick-zone');
    const knob = $('joystick-knob');
    const maxR = 38;

    const updateStick = (clientX, clientY) => {
      const rect = zone.getBoundingClientRect();
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      let dx = clientX - cx, dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > maxR) { dx = (dx / dist) * maxR; dy = (dy / dist) * maxR; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      joy.vx = dx / maxR; joy.vy = dy / maxR;
    };

    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      joy.active = true; joy.touchId = t.identifier;
      updateStick(t.clientX, t.clientY);
    }, { passive: false });

    zone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === joy.touchId) updateStick(t.clientX, t.clientY);
    }, { passive: false });

    const resetStick = () => {
      joy.active = false; joy.vx = 0; joy.vy = 0; joy.touchId = null;
      knob.style.transform = 'translate(0, 0)';
    };
    zone.addEventListener('touchend', resetStick);
    zone.addEventListener('touchcancel', resetStick);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  init();
})();
