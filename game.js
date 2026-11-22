/* VOID CREW — Multiplayer Engine, Roles, Blast Doors, Proximity Voice, Cutscenes & Smart Bots */
(function () {
  const W = window.VoidWorld;
  const $ = (id) => document.getElementById(id);

  const PEER_CONFIG = {
    config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] }
  };

  // --- NETWORK & PROXIMITY VOICE STATE ---
  let peer = null, isHost = false, hostConn = null;
  const clientConns = {};
  let localStream = null, micEnabled = false;
  const voicePeers = {}; // peerId -> { call, gain, audioEl }

  let localId = null, roomCode = '', selectedColor = W.COLORS[0].hex;
  let activeTask = null, activeSabFix = null, activeConsole = null;
  let myVote = null, mapOpen = false, settingsOpen = false, vitalsOpen = false;
  let killCooldownLocal = 0, sabCooldownLocal = 0, abilityCdLocal = 0, ventCdLocal = 0;
  let vitalsBattery = 100;

  const remoteTargets = {};
  const doorCdLocal = {};
  let state = createEmptyState();

  function createEmptyState() {
    return {
      phase: 'menu',
      settings: {
        impostors: 1, killCd: 22, speed: 275, voteTime: 60, emergLimit: 1,
        anonVotes: false, confirmEjects: true,
        roles: { shifter: true, engineer: true, scientist: true, sheriff: true }
      },
      players: {},
      bodies: [],
      sabotage: null,     // { type, timer, o2FixedA, o2FixedB }
      lockedDoors: {},    // room -> remaining seconds
      ventAnims: {},      // ventId -> timestamp
      meeting: null,      // { reason, callerName, timer, votes, tallyPhase, chat, ghostChat }
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
    renderColorPicker('color-picker', false);
    renderColorPicker('lobby-color-picker', true);
    bindUIEvents();
    setupCanvas();
    setupJoystick();

    const params = new URLSearchParams(window.location.search);
    const inviteRoom = params.get('room');
    if (inviteRoom) {
      $('room-code-input').value = inviteRoom.toUpperCase().slice(0, 6);
      $('menu-status').textContent = `Invite detected for room ${inviteRoom.toUpperCase()} — click Join!`;
    }
    const savedName = localStorage.getItem('voidcrew_name');
    if (savedName) $('player-name').value = savedName;
    requestAnimationFrame(loop);
  }

  function renderColorPicker(containerId, inLobby) {
    const box = $(containerId);
    box.innerHTML = '';
    W.COLORS.forEach((c, idx) => {
      const el = document.createElement('div');
      el.className = 'color-swatch' + (idx === 0 ? ' selected' : '');
      el.style.background = c.hex;
      el.title = c.name;
      el.onclick = () => {
        selectedColor = c.hex;
        box.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('selected'));
        el.classList.add('selected');
        W.SFX.click();
        if (inLobby) sendToHost({ type: 'setColor', color: c.hex });
      };
      box.appendChild(el);
    });
  }

  function showToast(msg) {
    const t = $('toast');
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(t._tid);
    t._tid = setTimeout(() => t.classList.add('hidden'), 2600);
  }

  function getCallsign() {
    const v = $('player-name').value.trim() || ('Crew' + Math.floor(100 + Math.random() * 899));
    localStorage.setItem('voidcrew_name', v);
    return v;
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  }

  // --- PROXIMITY VOICE CHAT (WEBRTC + WEB AUDIO GAIN) ---
  async function toggleMic() {
    W.SFX.ensure();
    if (!micEnabled) {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micEnabled = true;
        updateMicButtons();
        showToast('Proximity Voice ON');
        connectVoiceToAllPeers();
      } catch (e) {
        showToast('Mic permission denied or unavailable.');
      }
    } else {
      micEnabled = false;
      if (localStream) localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
      updateMicButtons();
      showToast('Proximity Voice OFF');
    }
  }

  function updateMicButtons() {
    ['btn-mic', 'btn-lobby-mic'].forEach((id) => {
      const b = $(id);
      b.textContent = micEnabled ? 'MIC ON' : 'MIC OFF';
      b.classList.toggle('active', micEnabled);
    });
  }

  function connectVoiceToAllPeers() {
    if (!peer || !localStream) return;
    for (const pid of Object.keys(state.players)) {
      if (pid === localId || state.players[pid].isBot || voicePeers[pid]) continue;
      const call = peer.call(pid, localStream);
      attachVoiceStream(pid, call);
    }
  }

  function attachVoiceStream(pid, call) {
    call.on('stream', (remoteStream) => {
      W.SFX.ensure();
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.muted = true; // Route through Web Audio GainNode
      audio.play().catch(() => {});
      let gainNode = null;
      if (W.SFX.ctx) {
        const src = W.SFX.ctx.createMediaStreamSource(remoteStream);
        gainNode = W.SFX.ctx.createGain();
        gainNode.gain.value = 0;
        src.connect(gainNode);
        gainNode.connect(W.SFX.ctx.destination);
      }
      voicePeers[pid] = { call, gain: gainNode, audio };
    });
    call.on('close', () => { delete voicePeers[pid]; });
  }

  function updateProximityVoice() {
    const me = state.players[localId];
    if (!me) return;
    for (const [pid, vp] of Object.entries(voicePeers)) {
      if (!vp.gain || !W.SFX.ctx) continue;
      const other = state.players[pid];
      if (!other) { vp.gain.gain.value = 0; continue; }

      let vol = 0;
      if (state.phase === 'lobby' || state.phase === 'gameover') {
        vol = 0.85;
      } else if (state.phase === 'meeting') {
        if (me.alive && other.alive) vol = 0.9;
        else if (!me.alive) vol = 0.75; // Ghosts hear everyone + ghosts
      } else if (state.phase === 'playing') {
        if (me.alive && !other.alive) vol = 0; // Living cannot hear ghosts
        else {
          const d = Math.hypot(me.x - other.x, me.y - other.y);
          if (d < 560) {
            vol = Math.pow(1 - d / 560, 1.4);
            if (me.alive && !W.hasLineOfSight(me.x, me.y, other.x, other.y, state.lockedDoors)) vol *= 0.4;
          }
        }
      }
      vp.gain.gain.setTargetAtTime(vol, W.SFX.ctx.currentTime, 0.08);
    }
  }

  // --- PEERJS NETWORKING ---
  function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function setupPeerVoiceListener() {
    peer.on('call', (call) => {
      call.answer(localStream || undefined);
      attachVoiceStream(call.peer, call);
    });
  }

  function startHost() {
    W.SFX.startAmbience();
    const name = getCallsign();
    roomCode = generateCode();
    $('menu-status').textContent = 'Opening Dropship channel...';
    if (peer) peer.destroy();

    peer = new Peer('voidcrew-' + roomCode, PEER_CONFIG);
    setupPeerVoiceListener();
    peer.on('open', (id) => {
      isHost = true; localId = id;
      state = createEmptyState();
      state.phase = 'lobby';
      addPlayerToState(id, name, selectedColor, false, true);
      showScreen('lobby');
      updateLobbyUI();
      showToast(`Dropship ${roomCode} ready!`);
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
            state.players[conn.peer].disconnected = true;
            checkWinConditions();
          }
          broadcastState();
          updateLobbyUI();
        }
      });
    });
    peer.on('error', (err) => { $('menu-status').textContent = 'Error: ' + err.type; });
  }

  function joinRoom() {
    W.SFX.startAmbience();
    const name = getCallsign();
    const code = $('room-code-input').value.trim().toUpperCase();
    if (code.length < 4) { $('menu-status').textContent = 'Enter a valid room code.'; return; }
    roomCode = code;
    $('menu-status').textContent = `Boarding Dropship ${code}...`;
    if (peer) peer.destroy();

    peer = new Peer(PEER_CONFIG);
    setupPeerVoiceListener();
    peer.on('open', (id) => {
      isHost = false; localId = id;
      hostConn = peer.connect('voidcrew-' + code, { reliable: true });
      hostConn.on('open', () => { hostConn.send({ type: 'join', name, color: selectedColor }); });
      hostConn.on('data', (msg) => handleClientReceive(msg));
      hostConn.on('close', () => { showToast('Disconnected from host.'); leaveToMenu(); });
    });
    peer.on('error', (err) => { $('menu-status').textContent = err.type === 'peer-unavailable' ? `Room ${code} not found.` : `Error: ${err.type}`; });
  }

  function sendToHost(msg) {
    if (isHost) handleHostReceive({ peer: localId }, msg);
    else if (hostConn && hostConn.open) hostConn.send(msg);
  }

  function sendToPeer(pid, msg) {
    if (pid === localId) handleClientReceive(msg);
    else if (clientConns[pid] && clientConns[pid].open) clientConns[pid].send(msg);
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
        if (conn.send) conn.send({ type: 'reject', reason: 'Room is full or match already running.' });
        return;
      }
      addPlayerToState(pid, msg.name, pickAvailableColor(msg.color), false, false);
      broadcastState();
      updateLobbyUI();
      if (micEnabled) connectVoiceToAllPeers();
      return;
    }

    const p = state.players[pid];
    if (!p) return;

    if (msg.type === 'setColor' && state.phase === 'lobby') {
      p.color = pickAvailableColor(msg.color);
      broadcastState(); updateLobbyUI(); return;
    }

    if (msg.type === 'pos' && (state.phase === 'playing' || state.phase === 'lobby')) {
      p.x = msg.x; p.y = msg.y; p.facing = msg.facing; p.moving = msg.moving;
      return;
    }

    if (msg.type === 'cams' && state.phase === 'playing') { p.watchingCams = !!msg.active; return; }

    if (msg.type === 'kill' && state.phase === 'playing') {
      const target = state.players[msg.targetId];
      if (!p.alive || !target || !target.alive) return;
      if (Math.hypot(p.x - target.x, p.y - target.y) > 135) return;
      if (p.role === 'impostor' && target.role !== 'impostor') {
        executeKill(p, target);
      } else if (p.subRole === 'sheriff') {
        // Sheriff: kills Impostor, or misfires and dies if target is Crewmate!
        if (target.role === 'impostor') executeKill(p, target);
        else executeKill(p, p);
      }
      return;
    }

    if (msg.type === 'shapeshift' && state.phase === 'playing') {
      if (!p.alive || p.subRole !== 'shifter') return;
      const t = state.players[msg.targetId];
      if (!t) return;
      p.disguise = { name: t.name, color: t.color, timer: 15 };
      broadcast({ type: 'spatialSfx', name: 'shift', x: p.x, y: p.y });
      W.SFX.playSpatial('shift', p.x, p.y, state.players[localId].x, state.players[localId].y);
      broadcastState(); return;
    }

    if (msg.type === 'ventToggle' && state.phase === 'playing') {
      if (!p.alive || (p.role !== 'impostor' && p.subRole !== 'engineer')) return;
      p.inVent = msg.inVent;
      if (msg.x != null) { p.x = msg.x; p.y = msg.y; }
      if (msg.ventId != null) state.ventAnims[msg.ventId] = performance.now();
      broadcast({ type: 'spatialSfx', name: 'vent', x: p.x, y: p.y });
      W.SFX.playSpatial('vent', p.x, p.y, state.players[localId].x, state.players[localId].y);
      broadcastState(); return;
    }

    if (msg.type === 'lockDoor' && state.phase === 'playing') {
      if (!p.alive || p.role !== 'impostor') return;
      state.lockedDoors[msg.room] = 10;
      const door = W.DOORS.find((d) => d.room === msg.room);
      if (door) {
        broadcast({ type: 'spatialSfx', name: 'door', x: door.x, y: door.y });
        W.SFX.playSpatial('door', door.x, door.y, state.players[localId].x, state.players[localId].y);
      }
      broadcastState(); return;
    }

    if (msg.type === 'taskDone' && state.phase === 'playing') {
      const t = (p.tasks || []).find((x) => x.id === msg.taskId);
      if (t && !t.done) {
        t.done = true; recalcTaskProgress(); checkWinConditions(); broadcastState();
      }
      return;
    }

    if (msg.type === 'sabotageStart' && state.phase === 'playing') {
      if (!p.alive || p.role !== 'impostor' || state.sabotage) return;
      const timer = msg.sabType === 'reactor' ? 40 : (msg.sabType === 'o2' ? 35 : 0);
      state.sabotage = { type: msg.sabType, timer, o2FixedA: false, o2FixedB: false };
      broadcast({ type: 'sfx', name: 'alarm' }); W.SFX.alarm(); broadcastState(); return;
    }

    if (msg.type === 'sabotageFix' && state.phase === 'playing') {
      if (!state.sabotage) return;
      if (state.sabotage.type === 'o2') {
        if (msg.sabType === 'o2_a') state.sabotage.o2FixedA = true;
        if (msg.sabType === 'o2_b') state.sabotage.o2FixedB = true;
        if (state.sabotage.o2FixedA && state.sabotage.o2FixedB) state.sabotage = null;
      } else if (state.sabotage.type === msg.sabType) {
        state.sabotage = null;
      }
      broadcast({ type: 'sfx', name: 'task' }); W.SFX.task(); broadcastState(); return;
    }

    if (msg.type === 'report' && state.phase === 'playing') {
      if (!p.alive) return;
      startMeeting('DEAD BODY REPORTED', `${p.name} reported a body!`); return;
    }

    if (msg.type === 'emergency' && state.phase === 'playing') {
      if (!p.alive || state.sabotage || (p.emergLeft || 0) <= 0) return;
      p.emergLeft--;
      startMeeting('EMERGENCY MEETING', `${p.name} called an emergency meeting!`); return;
    }

    if (msg.type === 'chat' && state.phase === 'meeting') {
      const text = String(msg.text || '').trim().slice(0, 120);
      if (!text) return;
      if (p.alive) {
        state.meeting.chat.push({ name: p.name, color: p.color, text });
      } else {
        state.meeting.ghostChat.push({ name: p.name + ' (Ghost)', color: '#94a3b8', text });
      }
      W.SFX.chat(); broadcast({ type: 'sfx', name: 'chat' }); broadcastState(); renderMeetingUI(); return;
    }

    if (msg.type === 'vote' && state.phase === 'meeting') {
      if (!p.alive || state.meeting.tallyPhase || state.meeting.votes[pid] !== undefined) return;
      state.meeting.votes[pid] = msg.targetId;
      broadcastState(); renderMeetingUI(); checkAllVoted();
    }
  }

  // --- CLIENT MESSAGE HANDLER ---
  function handleClientReceive(msg) {
    if (msg.type === 'reject') { $('menu-status').textContent = msg.reason; hostConn.close(); return; }
    if (msg.type === 'sfx') { if (W.SFX[msg.name]) W.SFX[msg.name](); return; }
    if (msg.type === 'spatialSfx') {
      const me = state.players[localId];
      if (me) W.SFX.playSpatial(msg.name, msg.x, msg.y, me.x, me.y);
      return;
    }
    if (msg.type === 'killPrivate') {
      // STRICTLY PRIVATE: Only killer & victim receive this!
      W.SFX.kill();
      if (msg.isVictim) playKillCutscene(msg.killerColor, msg.victimColor);
      return;
    }
    if (msg.type === 'state') {
      const prevPhase = state.phase;
      const incoming = msg.state;
      const myPrev = state.players[localId];
      const keepLocal = (prevPhase === incoming.phase) && (incoming.phase === 'playing' || incoming.phase === 'lobby')
        && myPrev && incoming.players[localId] && !incoming.players[localId].teleported;

      for (const [id, p] of Object.entries(incoming.players)) {
        if (id !== localId) {
          remoteTargets[id] = { x: p.x, y: p.y };
          if (state.players[id]) { p.x = state.players[id].x; p.y = state.players[id].y; }
        } else if (keepLocal) {
          p.x = myPrev.x; p.y = myPrev.y; p.facing = myPrev.facing; p.moving = myPrev.moving;
        }
      }
      state = incoming;
      onPhaseSync(prevPhase, state.phase);
      if (micEnabled) connectVoiceToAllPeers();
    }
  }

  function playKillCutscene(killerColor, victimColor) {
    closeModals();
    $('kc-killer').style.background = killerColor;
    $('kc-victim').style.background = victimColor;
    const el = $('kill-cutscene');
    el.classList.remove('hidden');
    clearTimeout(el._tid);
    el._tid = setTimeout(() => el.classList.add('hidden'), 1850);
  }

  function onPhaseSync(prev, next) {
    if (next === 'lobby') { showScreen('lobby'); updateLobbyUI(); }
    else if (next === 'reveal' && prev !== 'reveal') { closeModals(); showRevealScreen(); }
    else if (next === 'playing') {
      if (prev !== 'playing') {
        showScreen('hud');
        killCooldownLocal = Math.min(10, state.settings.killCd);
        sabCooldownLocal = 10; abilityCdLocal = 8; ventCdLocal = 0; vitalsBattery = 100;
      }
      updateHudTasks();
    } else if (next === 'meeting') {
      if (prev !== 'meeting') { myVote = null; closeModals(); showScreen('meeting'); }
      renderMeetingUI();
    } else if (next === 'eject') { if (prev !== 'eject') showEjectScreen(); }
    else if (next === 'gameover') { if (prev !== 'gameover') { closeModals(); showGameOverScreen(); } }
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
      x: 420 + Math.random() * 240, y: 340 + Math.random() * 140, facing: 1, moving: false,
      role: 'crewmate', subRole: null, alive: true, inVent: false, watchingCams: false,
      disguise: null, emergLeft: 1, tasks: []
    };
  }

  function addBot() {
    if (!isHost || Object.keys(state.players).length >= 10) return;
    const usedNames = new Set(Object.values(state.players).map((p) => p.name));
    const name = BOT_NAMES.find((n) => !usedNames.has(n)) || ('Bot-' + Math.floor(10 + Math.random() * 89));
    addPlayerToState('bot_' + Math.random().toString(36).slice(2, 8), name, pickAvailableColor(), true, false);
    broadcastState(); updateLobbyUI();
  }

  function removeBot() {
    if (!isHost) return;
    const bots = Object.values(state.players).filter((p) => p.isBot);
    if (!bots.length) return;
    delete state.players[bots[bots.length - 1].id];
    broadcastState(); updateLobbyUI();
  }

  function startMatch() {
    if (!isHost) return;
    const players = Object.values(state.players);
    if (players.length < 3) { showToast('Need at least 3 players (add Bots or invite friends)!'); return; }

    state.settings = {
      impostors: Number($('set-impostors').value),
      killCd: Number($('set-killcd').value),
      speed: Number($('set-speed').value),
      voteTime: Number($('set-votetime').value),
      emergLimit: Number($('set-emerg').value),
      anonVotes: $('set-anon').value === '1',
      confirmEjects: $('set-confirm').value === '1',
      roles: {
        shifter: $('role-shifter').value === '1',
        engineer: $('role-engineer').value === '1',
        scientist: $('role-scientist').value === '1',
        sheriff: $('role-sheriff').value === '1'
      }
    };

    const impCount = Math.min(state.settings.impostors, Math.max(1, Math.floor(players.length / 3)));
    const ids = players.map((p) => p.id).sort(() => Math.random() - 0.5);
    const impIds = ids.slice(0, impCount);
    const crewIds = ids.slice(impCount);

    state.bodies = []; state.sabotage = null; state.lockedDoors = {}; state.meeting = null; state.winner = null;

    ids.forEach((id) => {
      const p = state.players[id];
      p.role = impIds.includes(id) ? 'impostor' : 'crewmate';
      p.subRole = null; p.alive = true; p.inVent = false; p.watchingCams = false; p.disguise = null;
      p.emergLeft = state.settings.emergLimit;
      const shuffled = [...W.TASKS].sort(() => Math.random() - 0.5).slice(0, 5);
      p.tasks = shuffled.map((t) => ({ id: t.id, room: t.room, label: t.label, done: false }));
      if (p.isBot) botBrains[id] = { wp: 4, targetWp: 3, wait: 1, killCd: 15, sightings: {}, suspect: null };
    });

    // Assign Special Roles
    if (state.settings.roles.shifter && impIds.length) state.players[impIds[0]].subRole = 'shifter';
    const crewPool = [...crewIds];
    if (state.settings.roles.engineer && crewPool.length) state.players[crewPool.shift()].subRole = 'engineer';
    if (state.settings.roles.scientist && crewPool.length) state.players[crewPool.shift()].subRole = 'scientist';
    if (state.settings.roles.sheriff && crewPool.length) state.players[crewPool.shift()].subRole = 'sheriff';

    placePlayersAroundTable();
    recalcTaskProgress();
    settingsOpen = false; $('settings-modal').classList.add('hidden');
    state.phase = 'reveal';
    broadcastState();
    showRevealScreen();

    setTimeout(() => {
      if (state.phase !== 'reveal') return;
      state.phase = 'playing';
      killCooldownLocal = Math.min(10, state.settings.killCd);
      sabCooldownLocal = 10; abilityCdLocal = 8; vitalsBattery = 100;
      broadcastState(); showScreen('hud'); updateHudTasks();
    }, 3400);
  }

  function placePlayersAroundTable() {
    const list = Object.values(state.players);
    list.forEach((p, i) => {
      const angle = (i / list.length) * Math.PI * 2;
      p.x = W.EMERGENCY_POS.x + Math.cos(angle) * 106;
      p.y = W.EMERGENCY_POS.y + Math.sin(angle) * 106;
      p.inVent = false; p.watchingCams = false; p.disguise = null; p.teleported = true;
      if (p.isBot && botBrains[p.id]) { botBrains[p.id].wp = 4; botBrains[p.id].targetWp = [3, 4, 5][i % 3]; }
    });
    setTimeout(() => Object.values(state.players).forEach((p) => delete p.teleported), 250);
  }

  function executeKill(killer, victim) {
    victim.alive = false; victim.inVent = false; victim.watchingCams = false; victim.disguise = null;
    state.bodies.push({ id: victim.id, name: victim.name, color: victim.color, x: victim.x, y: victim.y, time: performance.now() });
    if (killer.id !== victim.id) { killer.x = victim.x; killer.y = victim.y; }

    // PRIVATE KILL SOUND & CUTSCENE (Nobody else hears it!)
    const kColor = killer.disguise ? killer.disguise.color : killer.color;
    sendToPeer(victim.id, { type: 'killPrivate', isVictim: true, killerColor: kColor, victimColor: victim.color });
    if (killer.id !== victim.id) sendToPeer(killer.id, { type: 'killPrivate', isVictim: false });

    checkWinConditions();
    broadcastState();
  }

  function recalcTaskProgress() {
    let total = 0, done = 0;
    for (const p of Object.values(state.players)) {
      if (p.role === 'crewmate' && p.tasks) { total += p.tasks.length; done += p.tasks.filter((t) => t.done).length; }
    }
    state.taskProgress = total ? Math.round((done / total) * 100) : 0;
  }

  function startMeeting(reason, callerName) {
    if (!isHost || state.phase !== 'playing') return;
    state.phase = 'meeting';
    state.sabotage = null; state.lockedDoors = {};
    state.meeting = {
      reason, callerName, timer: state.settings.voteTime,
      votes: {}, tallyPhase: false,
      chat: [{ name: 'SYSTEM', color: '#e8b94d', text: `${callerName} Discuss & vote!` }],
      ghostChat: [{ name: 'GHOST CHANNEL', color: '#94a3b8', text: 'Only ghosts can read messages here.' }]
    };
    Object.values(state.players).forEach((p) => { p.inVent = false; p.watchingCams = false; p.disguise = null; });
    Object.values(botBrains).forEach((b) => { b.chatSent = false; b.voteDelay = 3 + Math.random() * 7; });
    myVote = null;
    W.SFX.alarm(); broadcast({ type: 'sfx', name: 'alarm' });
    closeModals(); showScreen('meeting'); renderMeetingUI(); broadcastState();
  }

  function checkAllVoted() {
    if (!isHost || state.phase !== 'meeting' || state.meeting.tallyPhase) return;
    const living = Object.values(state.players).filter((p) => p.alive);
    if (living.filter((p) => state.meeting.votes[p.id] !== undefined).length >= living.length) beginVoteTally();
  }

  function beginVoteTally() {
    if (!isHost || state.phase !== 'meeting' || state.meeting.tallyPhase) return;
    state.meeting.tallyPhase = true;
    state.meeting.timer = 4;
    broadcastState(); renderMeetingUI();
    setTimeout(() => { if (state.phase === 'meeting') resolveVotes(); }, 4000);
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
        sub: state.settings.confirmEjects ? `${livingImpostorsCount()} Impostor(s) remain.` : '',
        color: '#64748b'
      };
    } else {
      const ej = state.players[topTarget];
      ej.alive = false;
      state.eject = {
        text: state.settings.confirmEjects
          ? `${ej.name} was ${ej.role === 'impostor' ? 'An Impostor' : 'not An Impostor'}.`
          : `${ej.name} was ejected.`,
        sub: state.settings.confirmEjects ? `${livingImpostorsCount()} Impostor(s) remain.` : '',
        color: ej.color
      };
    }

    state.bodies = []; state.phase = 'eject';
    broadcastState(); showEjectScreen();

    setTimeout(() => {
      if (state.phase !== 'eject') return;
      if (!checkWinConditions()) {
        placePlayersAroundTable();
        state.phase = 'playing';
        killCooldownLocal = state.settings.killCd;
        broadcastState(); showScreen('hud'); updateHudTasks();
      }
    }, 4200);
  }

  function livingImpostorsCount() { return Object.values(state.players).filter((p) => p.alive && p.role === 'impostor').length; }

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
    else if (state.sabotage && (state.sabotage.type === 'reactor' || state.sabotage.type === 'o2') && state.sabotage.timer <= 0) {
      win = { team: 'IMPOSTORS', reason: `${state.sabotage.type.toUpperCase()} failure destroyed SS Horizon!`, impostors: allImps };
    }

    if (win) {
      state.winner = win; state.phase = 'gameover';
      broadcastState(); closeModals(); showGameOverScreen(); return true;
    }
    return false;
  }

  // --- SMART DEDUCTION BOTS (HOST ONLY) ---
  function updateBots(dt, now) {
    if (!isHost) return;
    if (state.phase === 'playing') {
      for (const p of Object.values(state.players)) {
        if (!p.isBot || !p.alive) continue;
        const brain = botBrains[p.id]; if (!brain) continue;

        // 1. Record hallway sightings for deduction
        for (const o of Object.values(state.players)) {
          if (o.id === p.id || !o.alive || o.inVent) continue;
          if (Math.hypot(o.x - p.x, o.y - p.y) < 320 && W.hasLineOfSight(p.x, p.y, o.x, o.y, state.lockedDoors)) {
            brain.sightings[o.id] = { room: W.getRoomName(o.x, o.y), time: now };
          }
        }

        // 2. Report fresh body & deduce suspect who was seen near that room
        if (p.role === 'crewmate') {
          for (const b of state.bodies) {
            if (Math.hypot(p.x - b.x, p.y - b.y) < 175 && W.hasLineOfSight(p.x, p.y, b.x, b.y, state.lockedDoors)) {
              const room = W.getRoomName(b.x, b.y);
              let suspect = null;
              for (const [sid, info] of Object.entries(brain.sightings)) {
                if (sid !== b.id && now - info.time < 16000 && info.room === room) { suspect = sid; break; }
              }
              brain.suspect = suspect;
              startMeeting('DEAD BODY REPORTED', `${p.name} found ${b.name}'s body in ${room}!`);
              return;
            }
          }
        }

        // 3. Crewmate bots actively fix active sabotages when close
        if (p.role === 'crewmate' && state.sabotage) {
          const sKey = state.sabotage.type === 'o2' ? (!state.sabotage.o2FixedA ? 'o2_a' : 'o2_b') : state.sabotage.type;
          const sab = W.SABOTAGES[sKey];
          if (sab && Math.hypot(p.x - sab.x, p.y - sab.y) < 130) {
            handleHostReceive({ peer: p.id }, { type: 'sabotageFix', sabType: sKey });
          }
        }

        // 4. Impostor bot smart kills & occasional sabotage
        if (p.role === 'impostor') {
          brain.killCd = Math.max(0, brain.killCd - dt);
          if (brain.killCd <= 0) {
            const nearbyCrew = Object.values(state.players).filter((o) => o.alive && o.role === 'crewmate' && Math.hypot(o.x - p.x, o.y - p.y) < 92);
            const witnesses = Object.values(state.players).filter((o) => o.alive && o.id !== p.id && Math.hypot(o.x - p.x, o.y - p.y) < 350);
            if (nearbyCrew.length === 1 && witnesses.length <= 1) {
              executeKill(p, nearbyCrew[0]);
              brain.killCd = state.settings.killCd + 4;
              continue;
            }
          }
          if (!state.sabotage && Math.random() < 0.0007) {
            const pick = ['lights', 'reactor', 'o2', 'comms'][Math.floor(Math.random() * 4)];
            handleHostReceive({ peer: p.id }, { type: 'sabotageStart', sabType: pick });
          }
        }

        // 5. Waypoint navigation
        if (brain.wait > 0) {
          brain.wait -= dt; p.moving = false;
          if (brain.wait <= 0 && p.role === 'crewmate') {
            const nextT = (p.tasks || []).find((t) => !t.done);
            if (nextT && Math.random() < 0.32) { nextT.done = true; recalcTaskProgress(); checkWinConditions(); }
          }
          continue;
        }
        const target = W.WAYPOINTS[brain.targetWp];
        const dx = target.x - p.x, dy = target.y - p.y, dist = Math.hypot(dx, dy);
        if (dist < 20) {
          const prev = brain.wp; brain.wp = brain.targetWp;
          const adj = W.WAYPOINTS[brain.wp].adj;
          const choices = adj.filter((id) => id !== prev);
          brain.targetWp = (choices.length ? choices : adj)[Math.floor(Math.random() * (choices.length || adj.length))];
          brain.wait = Math.random() < 0.3 ? (1.8 + Math.random() * 2.2) : 0;
          p.moving = false;
        } else {
          const spd = state.settings.speed * 0.86;
          const step = W.resolveCollision(p.x + (dx / dist) * spd * dt, p.y + (dy / dist) * spd * dt, W.PLAYER_RADIUS, false, state.lockedDoors, false);
          p.x = step.x; p.y = step.y; p.facing = dx >= 0 ? 1 : -1; p.moving = true;
        }
      }
    } else if (state.phase === 'meeting' && !state.meeting.tallyPhase) {
      for (const p of Object.values(state.players)) {
        if (!p.isBot || !p.alive) continue;
        const brain = botBrains[p.id]; if (!brain) continue;
        brain.voteDelay -= dt;
        if (!brain.chatSent && brain.voteDelay < 3.5) {
          brain.chatSent = true;
          let line = `I was in ${W.getRoomName(p.x, p.y)}.`;
          if (brain.suspect && state.players[brain.suspect] && state.players[brain.suspect].alive) {
            line = `I saw ${state.players[brain.suspect].name} right near the body! Sus!`;
          } else {
            const recent = Object.entries(brain.sightings).find(([, v]) => now - v.time < 15000);
            if (recent && state.players[recent[0]]) line = `I passed ${state.players[recent[0]].name} in ${recent[1].room}.`;
          }
          state.meeting.chat.push({ name: p.name, color: p.color, text: line });
          renderMeetingUI(); broadcastState();
        }
        if (brain.voteDelay <= 0 && state.meeting.votes[p.id] === undefined) {
          let pick = 'skip';
          if (brain.suspect && state.players[brain.suspect] && state.players[brain.suspect].alive) {
            pick = brain.suspect;
          } else if (Math.random() < 0.45) {
            const cands = Object.values(state.players).filter((o) => o.alive && o.id !== p.id);
            if (cands.length) pick = cands[Math.floor(Math.random() * cands.length)].id;
          }
          state.meeting.votes[p.id] = pick;
          brain.suspect = null;
          renderMeetingUI(); broadcastState(); checkAllVoted();
        }
      }
    }
  }

  // --- INTERACTIONS & ROLES ---
  function getNearestInteractable() {
    const me = state.players[localId];
    if (!me || state.phase !== 'playing') return null;

    if (me.alive && state.sabotage) {
      const keys = state.sabotage.type === 'o2'
        ? [!state.sabotage.o2FixedA && 'o2_a', !state.sabotage.o2FixedB && 'o2_b'].filter(Boolean)
        : [state.sabotage.type];
      for (const k of keys) {
        const s = W.SABOTAGES[k];
        if (s && Math.hypot(me.x - s.x, me.y - s.y) < 92) return { kind: 'sabotage', data: s };
      }
    }
    if (me.alive && !state.sabotage && (me.emergLeft || 0) > 0 && Math.hypot(me.x - W.EMERGENCY_POS.x, me.y - W.EMERGENCY_POS.y) < 110) {
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
    const canKill = me && me.alive && !me.inVent && killCooldownLocal <= 0 && (me.role === 'impostor' || me.subRole === 'sheriff');
    if (!canKill) return null;
    let best = null, bestD = 112;
    for (const p of Object.values(state.players)) {
      if (p.id === localId || !p.alive) continue;
      if (me.role === 'impostor' && p.role === 'impostor') continue;
      const d = Math.hypot(p.x - me.x, p.y - me.y);
      if (d < bestD && W.hasLineOfSight(me.x, me.y, p.x, p.y, state.lockedDoors)) { bestD = d; best = p; }
    }
    return best;
  }

  function getNearestBody() {
    const me = state.players[localId];
    if (!me || !me.alive || me.inVent) return null;
    for (const b of state.bodies) {
      if (Math.hypot(b.x - me.x, b.y - me.y) < 125 && W.hasLineOfSight(me.x, me.y, b.x, b.y, state.lockedDoors)) return b;
    }
    return null;
  }

  function getNearestVent() {
    const me = state.players[localId];
    if (!me || !me.alive || (me.role !== 'impostor' && me.subRole !== 'engineer')) return null;
    for (const v of W.VENTS) if (Math.hypot(v.x - me.x, v.y - me.y) < 76) return v;
    return null;
  }

  function triggerUse() {
    const me = state.players[localId];
    if (!me) return;
    if (state.phase === 'lobby') {
      if (Math.hypot(me.x - W.DROPSHIP.laptop.x, me.y - W.DROPSHIP.laptop.y) < 120 || settingsOpen) toggleSettingsModal();
      return;
    }
    if (state.phase !== 'playing') return;
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

  function triggerReport() { if (getNearestBody()) sendToHost({ type: 'report' }); }

  function triggerVent() {
    const me = state.players[localId];
    if (!me || !me.alive || (me.role !== 'impostor' && me.subRole !== 'engineer')) return;
    if (!me.inVent) {
      if (me.subRole === 'engineer' && ventCdLocal > 0) return;
      const v = getNearestVent(); if (!v) return;
      me.inVent = true; me.x = v.x; me.y = v.y;
      $('vent-controls').classList.remove('hidden');
      sendToHost({ type: 'ventToggle', inVent: true, x: v.x, y: v.y, ventId: v.id });
    } else hopNextVent();
  }

  function hopNextVent() {
    const me = state.players[localId]; if (!me || !me.inVent) return;
    const cur = W.VENTS.find((v) => Math.hypot(v.x - me.x, v.y - me.y) < 42) || W.VENTS[0];
    const net = W.VENTS.filter((v) => v.net === cur.net);
    const next = net[(net.indexOf(cur) + 1) % net.length];
    me.x = next.x; me.y = next.y;
    sendToHost({ type: 'ventToggle', inVent: true, x: next.x, y: next.y, ventId: next.id });
  }

  function exitVent() {
    const me = state.players[localId]; if (!me || !me.inVent) return;
    const cur = W.VENTS.find((v) => Math.hypot(v.x - me.x, v.y - me.y) < 42);
    me.inVent = false;
    if (me.subRole === 'engineer') ventCdLocal = 15;
    $('vent-controls').classList.add('hidden');
    sendToHost({ type: 'ventToggle', inVent: false, x: me.x, y: me.y, ventId: cur ? cur.id : null });
  }

  function triggerAbility() {
    const me = state.players[localId];
    if (!me || !me.alive || state.phase !== 'playing') return;
    if (me.subRole === 'shifter' && abilityCdLocal <= 0) openMorphModal();
    else if (me.subRole === 'scientist') toggleVitalsModal();
  }

  function openMorphModal() {
    const list = $('morph-list'); list.innerHTML = '';
    for (const p of Object.values(state.players)) {
      if (p.id === localId || !p.alive) continue;
      const card = document.createElement('div');
      card.className = 'player-card'; card.style.cursor = 'pointer';
      card.innerHTML = `<div class="avatar-dot" style="background:${p.color}"></div><span class="player-card-name">${escapeHtml(p.name)}</span>`;
      card.onclick = () => {
        abilityCdLocal = 25;
        $('morph-modal').classList.add('hidden');
        sendToHost({ type: 'shapeshift', targetId: p.id });
        showToast(`Shapeshifted into ${p.name} (15s)`);
      };
      list.appendChild(card);
    }
    $('morph-modal').classList.remove('hidden');
  }

  function toggleVitalsModal() {
    if (state.sabotage && state.sabotage.type === 'comms') { showToast('Vitals offline during Comms Sabotage!'); return; }
    if (!vitalsOpen && vitalsBattery <= 0) { showToast('Vitals battery empty! Finish tasks to recharge.'); return; }
    vitalsOpen = !vitalsOpen;
    $('vitals-modal').classList.toggle('hidden', !vitalsOpen);
    if (vitalsOpen) renderVitalsUI();
  }

  function renderVitalsUI() {
    $('vitals-bat').textContent = Math.ceil(vitalsBattery) + '%';
    const grid = $('vitals-grid'); grid.innerHTML = '';
    for (const p of Object.values(state.players)) {
      const card = document.createElement('div'); card.className = 'vital-card';
      const st = p.disconnected ? 'D/C' : (p.alive ? 'OK' : 'DEAD');
      card.innerHTML = `<div class="avatar-dot" style="background:${p.color}"></div><span class="player-card-name">${escapeHtml(p.name)}</span>
        <span class="vital-state ${p.alive ? 'vital-ok' : 'vital-dead'}">${st}</span>`;
      grid.appendChild(card);
    }
  }

  // --- CONSOLES & MINI-GAMES ---
  function openUtilityConsole(info) {
    activeConsole = info.id;
    $('task-modal-title').textContent = info.label.toUpperCase();
    const body = $('task-modal-body'); body.innerHTML = '';
    const cv = document.createElement('canvas');
    cv.id = 'consoleCanvas'; cv.className = 'console-canvas'; cv.width = 500; cv.height = 330;
    body.append(cv);
    $('task-modal').classList.remove('hidden');
    if (info.id === 'security') sendToHost({ type: 'cams', active: true });
  }

  function openTaskMiniGame(task) {
    activeTask = task;
    $('task-modal-title').textContent = `${task.room.toUpperCase()} — ${task.label.toUpperCase()}`;
    const body = $('task-modal-body'); body.innerHTML = '';
    $('task-modal').classList.remove('hidden');
    if (task.type === 'keypad') buildKeypadGame(body, () => completeTask(task.id));
    else if (task.type === 'wires') buildWiresGame(body, () => completeTask(task.id));
    else if (task.type === 'numbers') buildNumbersGame(body, () => completeTask(task.id));
    else if (task.type === 'lights') buildLightsGame(body, 'Prime all 5 capacitors to ON.', () => completeTask(task.id));
    else if (task.type === 'asteroids') buildAsteroidsGame(body, () => completeTask(task.id));
    else if (task.type === 'clean') buildCleanO2Game(body, () => completeTask(task.id));
    else if (task.type === 'card') buildCardSwipeGame(body, () => completeTask(task.id));
    else buildHoldGame(body, 'HOLD TO COMPLETE', 1.9, () => completeTask(task.id));
  }

  function openSabotageMiniGame(sab) {
    activeSabFix = sab;
    $('task-modal-title').textContent = `EMERGENCY — ${sab.label.toUpperCase()}`;
    const body = $('task-modal-body'); body.innerHTML = '';
    $('task-modal').classList.remove('hidden');
    if (sab.id === 'lights') buildLightsGame(body, 'Flip all 5 breakers to ON.', () => completeSabotage('lights'));
    else if (sab.id === 'o2_a' || sab.id === 'o2_b') buildKeypadGame(body, () => completeSabotage(sab.id));
    else if (sab.id === 'comms') buildLightsGame(body, 'Align all 5 comm relays to ON.', () => completeSabotage('comms'));
    else buildHoldGame(body, 'HOLD HAND ON SCANNER', 2.0, () => completeSabotage('reactor'));
  }

  function completeTask(taskId) {
    W.SFX.task(); activeTask = null; $('task-modal').classList.add('hidden');
    vitalsBattery = Math.min(100, vitalsBattery + 35);
    sendToHost({ type: 'taskDone', taskId });
    showToast('Task completed!');
  }

  function completeSabotage(sabType) {
    activeSabFix = null; $('task-modal').classList.add('hidden');
    sendToHost({ type: 'sabotageFix', sabType });
    showToast('System stabilized!');
  }

  function buildKeypadGame(container, onWin) {
    const target = String(Math.floor(1000 + Math.random() * 9000));
    let entered = '';
    const info = document.createElement('div'); info.innerHTML = `Enter Code: <b style="color:#e8b94d;letter-spacing:0.2em">${target}</b>`;
    const disp = document.createElement('div'); disp.className = 'keypad-display'; disp.textContent = '----';
    const grid = document.createElement('div'); grid.className = 'keypad-grid';
    ['1','2','3','4','5','6','7','8','9','C','0','OK'].forEach((k) => {
      const b = document.createElement('button'); b.className = 'keypad-btn'; b.textContent = k;
      b.onclick = () => {
        W.SFX.click();
        if (k === 'C') entered = '';
        else if (k === 'OK') { if (entered === target) onWin(); else entered = ''; }
        else if (entered.length < 4) entered += k;
        disp.textContent = entered.padEnd(4, '-');
        if (entered === target) setTimeout(onWin, 160);
      };
      grid.appendChild(b);
    });
    container.append(info, disp, grid);
  }

  function buildWiresGame(container, onWin) {
    const cols = [{ id: 'RED', bg: '#ef4444' }, { id: 'BLUE', bg: '#3b82f6' }, { id: 'GOLD', bg: '#eab308' }, { id: 'TEAL', bg: '#14b8a6' }];
    const left = [...cols].sort(() => Math.random() - 0.5), right = [...cols].sort(() => Math.random() - 0.5);
    let picked = null, matched = 0;
    const board = document.createElement('div'); board.className = 'wires-board';
    const cL = document.createElement('div'); cL.className = 'wires-col';
    const cR = document.createElement('div'); cR.className = 'wires-col';
    left.forEach((w) => {
      const b = document.createElement('button'); b.className = 'wire-node'; b.style.background = w.bg; b.textContent = w.id;
      b.onclick = () => {
        if (b.classList.contains('matched')) return; W.SFX.click();
        cL.querySelectorAll('.wire-node').forEach((n) => n.classList.remove('selected'));
        b.classList.add('selected'); picked = { id: w.id, el: b };
      };
      cL.appendChild(b);
    });
    right.forEach((w) => {
      const b = document.createElement('button'); b.className = 'wire-node'; b.style.background = w.bg; b.textContent = w.id;
      b.onclick = () => {
        if (!picked || b.classList.contains('matched')) return;
        if (picked.id === w.id) {
          W.SFX.task(); picked.el.classList.remove('selected'); picked.el.classList.add('matched'); b.classList.add('matched'); picked = null;
          if (++matched === 4) setTimeout(onWin, 160);
        } else W.SFX.click();
      };
      cR.appendChild(b);
    });
    board.append(cL, cR); container.append(board);
  }

  function buildNumbersGame(container, onWin) {
    let next = 1;
    const grid = document.createElement('div'); grid.className = 'keypad-grid';
    [1,2,3,4,5,6,7,8,9].sort(() => Math.random() - 0.5).forEach((n) => {
      const b = document.createElement('button'); b.className = 'keypad-btn'; b.textContent = n;
      b.onclick = () => { if (n === next) { W.SFX.click(); b.classList.add('done'); if (++next > 9) setTimeout(onWin, 160); } };
      grid.appendChild(b);
    });
    container.append(grid);
  }

  function buildLightsGame(container, text, onWin) {
    const tip = document.createElement('div'); tip.textContent = text;
    const row = document.createElement('div'); row.className = 'switches-row';
    const states = [0, 1, 0, 0, 1].sort(() => Math.random() - 0.5);
    if (states.every(Boolean)) states[0] = 0;
    const draw = () => {
      row.innerHTML = '';
      states.forEach((on, idx) => {
        const b = document.createElement('button'); b.className = 'switch-btn' + (on ? ' on' : ''); b.textContent = on ? 'ON' : 'OFF';
        b.onclick = () => { W.SFX.click(); states[idx] = states[idx] ? 0 : 1; draw(); if (states.every(Boolean)) setTimeout(onWin, 160); };
        row.appendChild(b);
      });
    };
    draw(); container.append(tip, row);
  }

  function buildAsteroidsGame(container, onWin) {
    let destroyed = 0, goal = 7;
    const st = document.createElement('div'); st.textContent = `Asteroids: 0 / ${goal}`;
    const arena = document.createElement('div'); arena.className = 'radar-arena';
    const spawn = () => {
      if (destroyed >= goal || $('task-modal').classList.contains('hidden')) return;
      const b = document.createElement('button'); b.className = 'asteroid-btn';
      b.style.left = (20 + Math.random() * 265) + 'px'; b.style.top = (20 + Math.random() * 145) + 'px';
      b.onclick = () => { W.SFX.click(); b.remove(); destroyed++; st.textContent = `Asteroids: ${destroyed} / ${goal}`; if (destroyed >= goal) setTimeout(onWin, 160); else spawn(); };
      arena.appendChild(b);
    };
    spawn(); spawn(); container.append(st, arena);
  }

  function buildCleanO2Game(container, onWin) {
    let left = 6;
    const arena = document.createElement('div'); arena.className = 'radar-arena'; arena.style.background = '#13242b';
    for (let i = 0; i < left; i++) {
      const b = document.createElement('button'); b.className = 'leaf-btn';
      b.style.left = (25 + Math.random() * 260) + 'px'; b.style.top = (20 + Math.random() * 155) + 'px';
      b.onclick = () => { W.SFX.click(); b.remove(); if (--left <= 0) setTimeout(onWin, 160); };
      arena.appendChild(b);
    }
    container.append(arena);
  }

  function buildCardSwipeGame(container, onWin) {
    let startTs = 0;
    const box = document.createElement('div'); box.className = 'card-reader-box';
    const msg = document.createElement('div'); msg.textContent = 'Swipe ID card smoothly left to right.';
    const slider = document.createElement('input'); slider.type = 'range'; slider.min = 0; slider.max = 100; slider.value = 0; slider.className = 'card-slider';
    slider.oninput = () => {
      if (!startTs && Number(slider.value) > 5) startTs = performance.now();
      if (Number(slider.value) >= 98) {
        if (performance.now() - startTs < 150) { msg.textContent = 'Too fast! Try again.'; slider.value = 0; startTs = 0; }
        else { msg.textContent = 'ACCEPTED'; slider.disabled = true; setTimeout(onWin, 200); }
      }
    };
    box.append(msg, slider); container.append(box);
  }

  function buildHoldGame(container, label, secs, onWin) {
    let holding = false, progress = 0, done = false;
    const btn = document.createElement('button'); btn.className = 'hold-btn'; btn.textContent = label;
    const bar = document.createElement('div'); bar.className = 'progress-track'; bar.style.width = '250px';
    const fill = document.createElement('div'); fill.className = 'progress-fill'; bar.appendChild(fill);
    btn.onmousedown = btn.ontouchstart = (e) => { e.preventDefault(); holding = true; };
    window.addEventListener('mouseup', () => { holding = false; });
    window.addEventListener('touchend', () => { holding = false; });
    const iv = setInterval(() => {
      if ($('task-modal').classList.contains('hidden')) { clearInterval(iv); return; }
      if (holding && !done) {
        progress += 0.05 / secs; fill.style.width = Math.min(100, progress * 100) + '%';
        if (progress >= 1) { done = true; clearInterval(iv); onWin(); }
      }
    }, 50);
    container.append(btn, bar);
  }

  // --- UI SCREENS ---
  function showScreen(name) {
    ['menu-screen', 'lobby-hud', 'hud', 'reveal-screen', 'meeting-screen', 'eject-screen', 'gameover-screen']
      .forEach((id) => $(id).classList.add('hidden'));
    if (name === 'hud') $('hud').classList.remove('hidden');
    else if (name === 'lobby') $('lobby-hud').classList.remove('hidden');
    else $(name + '-screen').classList.remove('hidden');
  }

  function closeModals() {
    if (activeConsole === 'security') sendToHost({ type: 'cams', active: false });
    ['task-modal', 'map-modal', 'sabotage-menu', 'vent-controls', 'morph-modal', 'vitals-modal', 'settings-modal']
      .forEach((id) => $(id).classList.add('hidden'));
    mapOpen = false; settingsOpen = false; vitalsOpen = false;
    activeTask = null; activeSabFix = null; activeConsole = null;
  }

  function toggleSettingsModal() {
    settingsOpen = !settingsOpen;
    $('settings-modal').classList.toggle('hidden', !settingsOpen);
    if (settingsOpen) updateLobbyUI();
  }

  function updateLobbyUI() {
    if (state.phase !== 'lobby') return;
    $('lobby-code').textContent = roomCode;
    const players = Object.values(state.players);
    $('player-count').textContent = players.length;

    const list = $('lobby-players'); list.innerHTML = '';
    for (const p of players) {
      const card = document.createElement('div'); card.className = 'player-card';
      card.innerHTML = `<div class="avatar-dot" style="background:${p.color}"></div>
        <span class="player-card-name">${escapeHtml(p.name)}</span>
        ${p.isHost ? '<span class="player-tag">HOST</span>' : (p.isBot ? '<span class="player-tag bot">BOT</span>' : '')}`;
      list.appendChild(card);
    }

    $('bot-controls').classList.toggle('hidden', !isHost);
    $('btn-start-game').classList.toggle('hidden', !isHost);
    $('waiting-host-msg').classList.toggle('hidden', isHost);
    ['set-impostors', 'set-killcd', 'set-speed', 'set-votetime', 'set-emerg', 'set-anon', 'set-confirm',
      'role-shifter', 'role-engineer', 'role-scientist', 'role-sheriff'].forEach((id) => { $(id).disabled = !isHost; });
  }

  function getRoleTitle(p) {
    if (!p) return 'CREWMATE';
    if (p.subRole === 'shifter') return 'SHAPESHIFTER';
    if (p.subRole === 'engineer') return 'ENGINEER';
    if (p.subRole === 'scientist') return 'SCIENTIST';
    if (p.subRole === 'sheriff') return 'SHERIFF';
    return p.role === 'impostor' ? 'IMPOSTOR' : 'CREWMATE';
  }

  function showRevealScreen() {
    showScreen('reveal');
    const me = state.players[localId];
    const title = getRoleTitle(me);
    const isImp = me && me.role === 'impostor';
    $('reveal-role').textContent = title;
    $('reveal-role').style.color = isImp ? '#ef4444' : (me && me.subRole ? '#c084fc' : '#2dd4bf');

    const descMap = {
      SHAPESHIFTER: 'Impostor: Morph into any living player (F) for 15s, lock blast doors, and eliminate the crew.',
      IMPOSTOR: 'Sabotage systems, lock blast doors, use vents, and eliminate the crew.',
      ENGINEER: 'Crewmate: You can hide inside and travel through vents (V) on a cooldown!',
      SCIENTIST: 'Crewmate: Open your portable Vitals monitor (F) to check who is alive or dead.',
      SHERIFF: 'Crewmate: You have a Kill button (Q) to shoot an Impostor—but shooting a Crewmate eliminates you!',
      CREWMATE: 'Complete ship tasks, check Security Cams & Admin Map, and eject the Impostor.'
    };
    $('reveal-desc').textContent = descMap[title];
  }

  function updateHudTasks() {
    const me = state.players[localId]; if (!me) return;
    const commsDown = state.sabotage && state.sabotage.type === 'comms';
    $('task-percent').textContent = commsDown ? '???' : (state.taskProgress + '%');
    $('task-progress-fill').style.width = (commsDown ? 0 : state.taskProgress) + '%';

    const badge = $('role-badge');
    if (!me.alive) { badge.textContent = 'GHOST'; badge.className = 'role-badge ghost'; }
    else if (me.role === 'impostor') { badge.textContent = getRoleTitle(me); badge.className = 'role-badge impostor'; }
    else if (me.subRole) { badge.textContent = getRoleTitle(me); badge.className = 'role-badge special'; }
    else { badge.textContent = 'CREWMATE'; badge.className = 'role-badge'; }

    const box = $('task-list-box');
    if (commsDown) {
      box.innerHTML = `<div style="color:#f87171;font-weight:800">COMMS SABOTAGED</div><div style="font-size:0.74rem;color:#94a3b8">Restore relays in Communications.</div>`;
    } else if (me.role === 'impostor') {
      box.innerHTML = `<div style="color:#fca5a5;font-weight:800">SABOTAGE & ELIMINATE</div><div style="font-size:0.74rem;color:#94a3b8">Use Blast Doors, Vents, and Sabotages to isolate crewmates.</div>`;
    } else {
      box.innerHTML = (me.tasks || []).map((t) =>
        `<div class="task-item ${t.done ? 'done' : ''}"><span>${t.room}: ${t.label}</span><span>${t.done ? '✓' : '•'}</span></div>`
      ).join('');
    }

    const canKill = me.alive && (me.role === 'impostor' || me.subRole === 'sheriff');
    const canVent = me.alive && (me.role === 'impostor' || me.subRole === 'engineer');
    const hasSkill = me.alive && (me.subRole === 'shifter' || me.subRole === 'scientist');

    $('act-kill').classList.toggle('hidden', !canKill);
    $('act-vent').classList.toggle('hidden', !canVent);
    $('act-sabotage').classList.toggle('hidden', !(me.alive && me.role === 'impostor'));
    $('act-ability').classList.toggle('hidden', !hasSkill);
    if (hasSkill) $('ability-label').textContent = me.subRole === 'shifter' ? 'SHIFT' : 'VITALS';
  }

  function renderMeetingUI() {
    if (!state.meeting) return;
    $('meeting-reason').textContent = state.meeting.tallyPhase ? 'VOTE RESULTS' : state.meeting.reason;
    $('meeting-caller').textContent = state.meeting.callerName;
    $('meeting-timer').textContent = Math.max(0, Math.ceil(state.meeting.timer));

    const me = state.players[localId];
    const canVote = me && me.alive && myVote === null && !state.meeting.tallyPhase;

    // Build voter breakdown map for tallyPhase
    const votersFor = {};
    if (state.meeting.tallyPhase) {
      for (const [voterId, targetId] of Object.entries(state.meeting.votes)) {
        if (!votersFor[targetId]) votersFor[targetId] = [];
        votersFor[targetId].push(state.players[voterId]);
      }
    }

    const grid = $('meeting-players'); grid.innerHTML = '';
    for (const p of Object.values(state.players)) {
      const card = document.createElement('div');
      const hasVoted = state.meeting.votes[p.id] !== undefined;
      card.className = 'vote-card' + (!p.alive ? ' dead' : '') + (myVote === p.id ? ' selected' : '') + (!canVote ? ' disabled' : '');
      const chips = (votersFor[p.id] || []).map((vp) =>
        `<span class="voter-chip" style="background:${state.settings.anonVotes ? '#64748b' : (vp ? vp.color : '#64748b')}"></span>`
      ).join('');
      card.innerHTML = `
        <div class="vote-card-top">
          <div class="avatar-dot" style="background:${p.color}"></div>
          <div><div class="player-card-name">${escapeHtml(p.name)}</div>
            <div style="font-size:0.68rem;color:#94a3b8">${p.alive ? 'Alive' : 'DECEASED'}</div></div>
          ${hasVoted ? '<span class="vote-badge">VOTED</span>' : ''}
        </div>
        ${state.meeting.tallyPhase ? `<div class="voter-chips">${chips}</div>` : ''}`;
      if (canVote && p.alive) {
        card.onclick = () => { myVote = p.id; W.SFX.click(); sendToHost({ type: 'vote', targetId: p.id }); renderMeetingUI(); };
      }
      grid.appendChild(card);
    }

    $('skip-voters').innerHTML = state.meeting.tallyPhase
      ? (votersFor['skip'] || []).map((vp) => `<span class="voter-chip" style="background:${state.settings.anonVotes ? '#64748b' : (vp ? vp.color : '#64748b')}"></span>`).join('')
      : '';

    $('btn-skip-vote').disabled = !canVote;
    $('vote-status-text').textContent = state.meeting.tallyPhase
      ? 'Tallying votes...'
      : (!me || !me.alive ? 'Ghosts cannot vote (Ghost Chat active).' : (myVote ? 'Vote locked.' : 'Select a player or Skip.'));

    // Live Chat + Ghost Chat
    $('chat-channel-label').textContent = (me && !me.alive) ? 'COMMS + GHOST CHAT' : 'COMMS CHANNEL';
    const msgs = [...state.meeting.chat];
    if (me && !me.alive) msgs.push(...state.meeting.ghostChat.map((m) => ({ ...m, ghost: true })));
    const chatBox = $('chat-messages');
    chatBox.innerHTML = msgs.map((m) =>
      `<div class="chat-msg ${m.ghost ? 'ghost-msg' : ''}"><span class="sender" style="color:${m.color}">${escapeHtml(m.name)}:</span>${escapeHtml(m.text)}</div>`
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
    $('gameover-impostors').innerHTML = `Impostors: <b style="color:#fca5a5">${win.impostors.map(escapeHtml).join(', ')}</b>`;
    $('btn-play-again').classList.toggle('hidden', !isHost);
    $('gameover-wait').classList.toggle('hidden', isHost);
  }

  function leaveToMenu() {
    if (peer) { peer.destroy(); peer = null; }
    isHost = false; hostConn = null; state = createEmptyState();
    closeModals(); showScreen('menu');
  }

  // --- MAIN 60 FPS LOOP ---
  const canvas = $('gameCanvas');
  const ctx = canvas.getContext('2d');
  let lastTime = performance.now(), netAccum = 0;

  function setupCanvas() {
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr; canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    window.addEventListener('resize', resize); resize();
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (state.phase === 'lobby') {
      updateLocalMovement(dt, true);
      if (!isHost) interpolateRemotes(dt);
      syncNetwork(dt);
      W.renderLobby(ctx, window.innerWidth, window.innerHeight, state, localId, now);
      updateProximityVoice();
    } else if (state.phase === 'playing') {
      updateLocalMovement(dt, false);
      updateCooldownsAndHud(dt);
      if (isHost) {
        updateBots(dt, now);
        // Tick locked blast doors & shapeshifter disguises
        for (const r of Object.keys(state.lockedDoors)) {
          state.lockedDoors[r] = Math.max(0, state.lockedDoors[r] - dt);
          if (state.lockedDoors[r] <= 0) delete state.lockedDoors[r];
        }
        for (const p of Object.values(state.players)) {
          if (p.disguise) { p.disguise.timer -= dt; if (p.disguise.timer <= 0) p.disguise = null; }
        }
        if (state.sabotage && (state.sabotage.type === 'reactor' || state.sabotage.type === 'o2')) {
          state.sabotage.timer = Math.max(0, state.sabotage.timer - dt);
          if (state.sabotage.timer <= 0) checkWinConditions();
        }
      } else {
        interpolateRemotes(dt);
      }
      syncNetwork(dt);
      W.renderGame(ctx, window.innerWidth, window.innerHeight, state, localId, now);
      updateProximityVoice();

      if (mapOpen) W.renderMiniMap($('mapCanvas'), state, localId);
      if (vitalsOpen) {
        vitalsBattery = Math.max(0, vitalsBattery - dt * 10);
        renderVitalsUI();
        if (vitalsBattery <= 0) toggleVitalsModal();
      }
      if (activeConsole) {
        const cv = $('consoleCanvas');
        if (cv) {
          if (activeConsole === 'security') W.renderSecurityCams(cv, state, now);
          else if (activeConsole === 'admin') W.renderAdminTable(cv, state);
        }
      }
    } else if (state.phase === 'meeting') {
      updateProximityVoice();
      if (isHost && !state.meeting.tallyPhase) {
        updateBots(dt, now);
        state.meeting.timer -= dt;
        $('meeting-timer').textContent = Math.max(0, Math.ceil(state.meeting.timer));
        netAccum += dt;
        if (netAccum >= 0.5) { netAccum = 0; broadcastState(); }
        if (state.meeting.timer <= 0) beginVoteTally();
      }
    }

    requestAnimationFrame(loop);
  }

  function interpolateRemotes(dt) {
    for (const [id, t] of Object.entries(remoteTargets)) {
      const p = state.players[id];
      if (p) { const lerp = Math.min(1, dt * 15); p.x += (t.x - p.x) * lerp; p.y += (t.y - p.y) * lerp; }
    }
  }

  function syncNetwork(dt) {
    netAccum += dt;
    if (netAccum < 0.05) return;
    netAccum = 0;
    if (isHost) broadcastState();
    else if (hostConn && hostConn.open && state.players[localId]) {
      const me = state.players[localId];
      hostConn.send({ type: 'pos', x: me.x, y: me.y, facing: me.facing, moving: me.moving });
    }
  }

  function updateLocalMovement(dt, isLobby) {
    const me = state.players[localId];
    if (!me || me.inVent || activeTask || activeSabFix || activeConsole || settingsOpen || vitalsOpen) {
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
      const spd = (isLobby ? 255 : state.settings.speed) * (me.alive || isLobby ? 1 : 1.15);
      const next = W.resolveCollision(me.x + nx * spd * dt, me.y + ny * spd * dt, W.PLAYER_RADIUS, !me.alive && !isLobby, state.lockedDoors, isLobby);
      me.x = next.x; me.y = next.y;
      if (Math.abs(nx) > 0.1) me.facing = nx > 0 ? 1 : -1;
      me.moving = true;
      if (me.alive || isLobby) W.SFX.step();
    } else me.moving = false;
  }

  function updateCooldownsAndHud(dt) {
    const me = state.players[localId]; if (!me) return;
    killCooldownLocal = Math.max(0, killCooldownLocal - dt);
    sabCooldownLocal = Math.max(0, sabCooldownLocal - dt);
    abilityCdLocal = Math.max(0, abilityCdLocal - dt);
    ventCdLocal = Math.max(0, ventCdLocal - dt);
    for (const k of Object.keys(doorCdLocal)) doorCdLocal[k] = Math.max(0, doorCdLocal[k] - dt);

    $('room-indicator').textContent = W.getRoomName(me.x, me.y);

    const sabBanner = $('sabotage-banner');
    if (state.sabotage) {
      sabBanner.classList.remove('hidden');
      if (state.sabotage.type === 'lights') sabBanner.textContent = 'LIGHTS SABOTAGED — FIX IN ELECTRICAL';
      else if (state.sabotage.type === 'comms') sabBanner.textContent = 'COMMS SABOTAGED — RESTORE IN COMMUNICATIONS';
      else if (state.sabotage.type === 'o2') sabBanner.textContent = `O2 DEPLETING IN ${Math.ceil(state.sabotage.timer)}s — FIX IN O2 & ADMIN`;
      else sabBanner.textContent = `REACTOR MELTDOWN IN ${Math.ceil(state.sabotage.timer)}s — RESET IN REACTOR`;
    } else sabBanner.classList.add('hidden');

    const useItem = getNearestInteractable();
    $('act-use').disabled = !useItem && !me.inVent;
    $('act-use').querySelector('span').textContent = useItem && useItem.kind === 'console'
      ? (useItem.data.id === 'security' ? 'CAMS' : 'ADMIN') : 'USE';
    $('act-report').disabled = !getNearestBody();

    if (me.alive && (me.role === 'impostor' || me.subRole === 'sheriff')) {
      $('act-kill').disabled = !getNearestKillTarget();
      $('kill-cd').textContent = killCooldownLocal > 0 ? Math.ceil(killCooldownLocal) + 's' : 'Q';
    }
    if (me.alive && (me.role === 'impostor' || me.subRole === 'engineer')) {
      $('act-vent').disabled = !me.inVent && (!getNearestVent() || (me.subRole === 'engineer' && ventCdLocal > 0));
      $('vent-cd').textContent = (me.subRole === 'engineer' && ventCdLocal > 0) ? Math.ceil(ventCdLocal) + 's' : 'V';
    }
    if (me.alive && me.subRole === 'shifter') {
      $('act-ability').disabled = abilityCdLocal > 0;
      $('ability-cd').textContent = abilityCdLocal > 0 ? Math.ceil(abilityCdLocal) + 's' : 'F';
    } else if (me.alive && me.subRole === 'scientist') {
      $('act-ability').disabled = vitalsBattery <= 0;
      $('ability-cd').textContent = Math.ceil(vitalsBattery) + '%';
    }
    if (me.alive && me.role === 'impostor') {
      $('act-sabotage').disabled = sabCooldownLocal > 0;
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
    $('btn-open-settings').onclick = toggleSettingsModal;
    $('btn-close-settings').onclick = toggleSettingsModal;
    $('btn-fs').onclick = toggleFullscreen;
    $('btn-lobby-fs').onclick = toggleFullscreen;
    $('btn-mic').onclick = toggleMic;
    $('btn-lobby-mic').onclick = toggleMic;

    $('btn-copy-link').onclick = () => {
      const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
      navigator.clipboard.writeText(url).then(() => showToast('Invite link copied!')).catch(() => showToast(`Room Code: ${roomCode}`));
    };

    $('btn-play-again').onclick = () => {
      if (!isHost) return;
      state.phase = 'lobby'; state.bodies = []; state.sabotage = null; state.lockedDoors = {};
      Object.values(state.players).forEach((p) => { p.x = 480 + Math.random() * 140; p.y = 360 + Math.random() * 100; p.alive = true; p.teleported = true; });
      broadcastState(); showScreen('lobby'); updateLobbyUI();
    };

    $('act-use').onclick = triggerUse;
    $('act-kill').onclick = triggerKill;
    $('act-report').onclick = triggerReport;
    $('act-vent').onclick = triggerVent;
    $('act-ability').onclick = triggerAbility;
    $('btn-vent-hop').onclick = hopNextVent;
    $('btn-vent-exit').onclick = exitVent;

    $('act-sabotage').onclick = () => $('sabotage-menu').classList.toggle('hidden');
    $('btn-sab-close').onclick = () => $('sabotage-menu').classList.add('hidden');
    const launchSab = (type, cd) => {
      if (state.sabotage) { showToast('A sabotage is already active!'); return; }
      sabCooldownLocal = cd; $('sabotage-menu').classList.add('hidden');
      sendToHost({ type: 'sabotageStart', sabType: type });
    };
    $('btn-sab-lights').onclick = () => launchSab('lights', 24);
    $('btn-sab-reactor').onclick = () => launchSab('reactor', 30);
    $('btn-sab-o2').onclick = () => launchSab('o2', 30);
    $('btn-sab-comms').onclick = () => launchSab('comms', 24);

    document.querySelectorAll('.door-lock-btn').forEach((btn) => {
      btn.onclick = () => {
        const room = btn.dataset.room;
        if ((doorCdLocal[room] || 0) > 0) { showToast('Doors cooling down!'); return; }
        doorCdLocal[room] = 20;
        $('sabotage-menu').classList.add('hidden');
        sendToHost({ type: 'lockDoor', room });
        showToast(`Locked ${btn.textContent} doors (10s)!`);
      };
    });

    $('btn-toggle-map').onclick = toggleMap;
    $('btn-close-map').onclick = toggleMap;
    $('btn-close-morph').onclick = () => $('morph-modal').classList.add('hidden');
    $('btn-close-vitals').onclick = toggleVitalsModal;
    $('btn-close-task').onclick = () => {
      if (activeConsole === 'security') sendToHost({ type: 'cams', active: false });
      activeTask = null; activeSabFix = null; activeConsole = null;
      $('task-modal').classList.add('hidden');
    };

    $('btn-mute').onclick = () => {
      W.SFX.setMuted(!W.SFX.muted);
      $('btn-mute').textContent = W.SFX.muted ? 'MUTED' : 'SFX';
    };

    $('btn-skip-vote').onclick = () => {
      myVote = 'skip'; W.SFX.click(); sendToHost({ type: 'vote', targetId: 'skip' }); renderMeetingUI();
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
      if (e.code === 'KeyE') triggerUse();
      if (state.phase !== 'playing') return;
      if (e.code === 'KeyQ') triggerKill();
      if (e.code === 'KeyR') triggerReport();
      if (e.code === 'KeyV') triggerVent();
      if (e.code === 'KeyF') triggerAbility();
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
    const zone = $('joystick-zone'), knob = $('joystick-knob'), maxR = 38;
    const update = (cx0, cy0) => {
      const r = zone.getBoundingClientRect();
      let dx = cx0 - (r.left + r.width / 2), dy = cy0 - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy);
      if (d > maxR) { dx = (dx / d) * maxR; dy = (dy / d) * maxR; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      joy.vx = dx / maxR; joy.vy = dy / maxR;
    };
    zone.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; joy.active = true; joy.touchId = t.identifier; update(t.clientX, t.clientY); }, { passive: false });
    zone.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === joy.touchId) update(t.clientX, t.clientY); }, { passive: false });
    const reset = () => { joy.active = false; joy.vx = 0; joy.vy = 0; joy.touchId = null; knob.style.transform = 'translate(0,0)'; };
    zone.addEventListener('touchend', reset); zone.addEventListener('touchcancel', reset);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  init();
})();
