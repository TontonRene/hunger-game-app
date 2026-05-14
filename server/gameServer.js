/**
 * ═══════════════════════════════════════════════════════════════════════
 *  Hunger Game — Game Server
 *  Node.js + ws  (remplacer ws par uWebSockets.js pour la prod)
 *  Architecture : Fixed Timestep 30 Hz + Delta Broadcast + FSM
 * ═══════════════════════════════════════════════════════════════════════
 *  Install :  npm install ws
 *  Run     :  node server/gameServer.js
 *  Swap ws → uWS pour ×10 throughput en production
 * ═══════════════════════════════════════════════════════════════════════
 */

'use strict';

const { WebSocketServer } = require('ws');
const { EventEmitter }    = require('events');

// ── Config ────────────────────────────────────────────────────────────────
const PORT       = process.env.PORT || 3001;
const TICK_RATE  = 30;                    // Hz
const TICK_MS    = 1000 / TICK_RATE;      // 33.333 ms
const MAX_ROOMS  = 100;
const WORLD      = 300;

// ── Bootstrap ─────────────────────────────────────────────────────────────
const wss      = new WebSocketServer({ port: PORT });
const rooms    = new Map();   // roomId → GameRoom
let   nextRoom = 1;

console.log(`[SERVER] Hunger Game Server running on ws://localhost:${PORT}`);

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.roomId  = null;
  ws.champId = null;

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      handleMessage(ws, msg);
    } catch (e) {
      console.error('[WS] Parse error:', e.message);
    }
  });

  ws.on('close', () => {
    if (ws.roomId && rooms.has(ws.roomId)) {
      const room = rooms.get(ws.roomId);
      room.onPlayerDisconnect(ws.champId);
      if (room.isEmpty()) { room.destroy(); rooms.delete(ws.roomId); }
    }
  });

  // Send welcome + available rooms
  send(ws, { type: 'welcome', rooms: getRoomList() });
});

// Heartbeat — détecter les connexions mortes
const heartbeat = setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  });
}, 15_000);

wss.on('close', () => clearInterval(heartbeat));

// ── Message router ────────────────────────────────────────────────────────
function handleMessage(ws, msg) {
  switch (msg.type) {

    case 'create_room': {
      if (rooms.size >= MAX_ROOMS) { send(ws, { type: 'error', code: 'MAX_ROOMS' }); return; }
      const id   = `room_${nextRoom++}`;
      const room = new GameRoom(id, msg.config || {});
      rooms.set(id, room);
      joinRoom(ws, room, msg.champName);
      broadcast(null, { type: 'room_list', rooms: getRoomList() }); // notify spectators
      break;
    }

    case 'join_room': {
      const room = rooms.get(msg.roomId);
      if (!room) { send(ws, { type: 'error', code: 'ROOM_NOT_FOUND' }); return; }
      joinRoom(ws, room, msg.champName);
      break;
    }

    case 'start_game': {
      const room = rooms.get(ws.roomId);
      if (!room || room.hostId !== ws.champId) { send(ws, { type: 'error', code: 'NOT_HOST' }); return; }
      room.start();
      break;
    }

    case 'drop_supply': {
      const room = rooms.get(ws.roomId);
      if (room) room.dropSupply(msg.supType);
      break;
    }

    case 'sponsor_champion': {
      const room = rooms.get(ws.roomId);
      if (room) room.sponsorChampion(ws.champId, msg.targetId, msg.item);
      break;
    }

    case 'ping':
      send(ws, { type: 'pong', t: msg.t });
      break;
  }
}

function joinRoom(ws, room, champName) {
  const champId = room.addSpectator(ws, champName);
  ws.roomId  = room.id;
  ws.champId = champId;
  send(ws, { type: 'joined', roomId: room.id, champId, state: room.getFullState() });
  room.broadcast({ type: 'player_joined', champId, champName });
}

// ── Helpers ───────────────────────────────────────────────────────────────
function send(ws, data)         { if (ws.readyState === 1) ws.send(JSON.stringify(data)); }
function getRoomList()          { return [...rooms.values()].map(r => r.getMeta()); }
function broadcast(exclude, data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach(ws => { if (ws !== exclude && ws.readyState === 1) ws.send(payload); });
}

// ══════════════════════════════════════════════════════════════════════════
// ── GameRoom ──────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════
class GameRoom extends EventEmitter {
  constructor(id, config) {
    super();
    this.id        = id;
    this.hostId    = null;
    this.clients   = new Map();   // champId → ws
    this.status    = 'waiting';   // waiting | active | finished
    this.loop      = null;
    this.state     = this._buildInitialState(config);
    this.prevState = null;        // pour le delta
  }

  // ── Joueurs ────────────────────────────────────────────────────────────
  addSpectator(ws, name) {
    const id = `p_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    this.clients.set(id, ws);
    if (!this.hostId) this.hostId = id;
    // Assigner un champion IA si place disponible
    const free = this.state.champions.find(c => !c.playerId && c.hp > 0);
    if (free && name) { free.playerId = id; free.name = name; }
    return id;
  }

  onPlayerDisconnect(champId) {
    this.clients.delete(champId);
    const champ = this.state.champions.find(c => c.playerId === champId);
    if (champ) champ.playerId = null; // repasse en mode IA
  }

  isEmpty() { return this.clients.size === 0; }

  // ── Démarrage ──────────────────────────────────────────────────────────
  start() {
    if (this.status !== 'waiting') return;
    this.status = 'active';
    this.broadcast({ type: 'game_start', state: this.state });
    this._startLoop();
  }

  destroy() {
    this._stopLoop();
    this.removeAllListeners();
  }

  // ── Game Loop — Fixed Timestep + drift correction ─────────────────────
  _startLoop() {
    let lastHr      = process.hrtime.bigint();
    let accumulator = 0;

    const tick = () => {
      if (this.status !== 'active') return;

      const now   = process.hrtime.bigint();
      const delta = Number(now - lastHr) / 1_000_000; // ns → ms
      lastHr      = now;
      accumulator += delta;

      while (accumulator >= TICK_MS) {
        this._gameTick(TICK_MS / 1000); // dt en secondes
        accumulator -= TICK_MS;
      }

      // Delta broadcast après traitement de tous les ticks
      this._broadcastDelta();

      // Reschedule — setImmediate > setTimeout pour précision
      setImmediate(tick);
    };

    setImmediate(tick);
  }

  _stopLoop() { this.status = 'stopped'; }

  // ── Tick principal ────────────────────────────────────────────────────
  _gameTick(dt) {
    const state = this.state;
    state.tick++;
    state.dayPhase = state.tick % 24;

    const alive = state.champions.filter(c => c.hp > 0);
    if (alive.length <= 1) {
      state.status = 'finished';
      state.winner = alive[0]?.id ?? null;
      this.status  = 'finished';
      this.broadcast({ type: 'game_over', winner: state.winner, state });
      return;
    }

    // Zone shrink
    if (state.tick % 4 === 0 && state.map.zone.radius > 10) {
      state.map.zone.radius = Math.max(10, state.map.zone.radius - 8);
    }

    // FSM + movement + combat (voir FSM class ci-dessous)
    alive.forEach(c => {
      c.fsm.update(dt, alive, state);
      this._applyMovement(c, dt, alive, state);
    });

    // Zone damage
    alive.forEach(c => {
      const d = Math.hypot(c.x - state.map.zone.cx, c.y - state.map.zone.cy);
      if (d > state.map.zone.radius) {
        const dmg = 6 + Math.floor((185 - state.map.zone.radius) * 0.45);
        this._applyDamage(c, null, dmg, 'zone');
      }
    });

    // Combat de proximité
    const fighters = alive.filter(c => c.hp > 0);
    for (let i = 0; i < fighters.length; i++) {
      for (let j = i + 1; j < fighters.length; j++) {
        const a = fighters[i], b = fighters[j];
        if (a.hp <= 0 || b.hp <= 0) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d >= 8) continue;
        this._resolveCombat(a, b);
      }
    }

    // Status effects tick
    alive.forEach(c => this._tickStatusEffects(c));

    // Buff expiry
    alive.forEach(c => {
      c.buffs = (c.buffs || []).filter(b => { b.ticks--; return b.ticks > 0; });
    });
  }

  // ── Mouvement ─────────────────────────────────────────────────────────
  _applyMovement(c, dt, alive, state) {
    if (c.fsm.state === 'STUNNED' || c.fsm.state === 'CHANNELING_CRAFT') return;
    const spd = Math.max(0.5, c.stats.speed) * (state.dayPhase >= 18 && c.stats.instinct <= 4 ? 0.6 : 1);
    const { dx, dy } = c.fsm.getMovement(alive, state);
    c.x = Math.max(0, Math.min(WORLD - 1, c.x + dx * spd * dt * 30));
    c.y = Math.max(0, Math.min(WORLD - 1, c.y + dy * spd * dt * 30));
  }

  // ── Combat ────────────────────────────────────────────────────────────
  _resolveCombat(a, b) {
    const sA = a.stats, sB = b.stats;
    const dmgToA = Math.max(1, sB.strength - Math.floor(sA.defense * 0.5)) + _rng(0, 4);
    const dmgToB = Math.max(1, sA.strength - Math.floor(sB.defense * 0.5)) + _rng(0, 4);
    this._applyDamage(a, b, dmgToA, 'combat');
    this._applyDamage(b, a, dmgToB, 'combat');
    this.state.events.push({ type: 'combat', a: a.id, b: b.id, dmgA: dmgToB, dmgB: dmgToA, tick: this.state.tick });
  }

  _applyDamage(target, source, amount, cause) {
    target.hp = Math.max(0, target.hp - amount);
    if (target.hp <= 0) {
      if (source) source.simStats = source.simStats || {}; (source?.simStats || {}).kills = ((source?.simStats || {}).kills || 0) + 1;
      this.state.events.push({ type: 'death', champion: target.id, killedBy: source?.id || cause, tick: this.state.tick });
    }
  }

  // ── Status effects ────────────────────────────────────────────────────
  _tickStatusEffects(c) {
    if (!c.statusEffects) return;
    c.statusEffects = c.statusEffects.filter(fx => {
      if (fx.damage) { c.hp = Math.max(0, c.hp - fx.damage); }
      fx.duration--;
      return fx.duration > 0;
    });
  }

  // ── Supply drop ───────────────────────────────────────────────────────
  dropSupply(type) {
    this.state.map.supplies = this.state.map.supplies || [];
    this.state.map.supplies.push({ id: `sup_${Date.now()}`, type, x: _rng(30, 270), y: _rng(30, 270) });
    this.broadcast({ type: 'supply_drop', supType: type });
  }

  sponsorChampion(fromId, targetId, item) {
    const c = this.state.champions.find(x => x.id === targetId);
    if (!c || c.hp <= 0) return;
    if (item === 'soin')   c.hp = Math.min(c.maxHp, c.hp + 45);
    if (item === 'force')  c.buffs = c.buffs || []; c.buffs?.push({ stat: 'strength', value: 3, ticks: 8 });
    this.broadcast({ type: 'sponsor', targetId, item, fromId });
  }

  // ── Delta broadcast ───────────────────────────────────────────────────
  _broadcastDelta() {
    if (this.clients.size === 0) return;
    const state = this.state;

    // Delta minimal : positions + HP si changés
    const delta = {
      type:      'delta',
      tick:      state.tick,
      dayPhase:  state.dayPhase,
      zone:      state.map.zone,
      champions: state.champions.map(c => ({
        id: c.id, x: _q(c.x), y: _q(c.y), hp: c.hp, state: c.fsm?.state || 'IDLE',
      })),
      events: state.events.slice(-10), // 10 derniers events
    };

    // Binary serait ×10 plus léger ici — implémentation JSON pour la clarté
    const payload = JSON.stringify(delta);
    this.clients.forEach((ws) => { if (ws.readyState === 1) ws.send(payload); });

    // Purger les events après broadcast
    state.events = state.events.slice(-200);
  }

  broadcast(data) {
    const payload = JSON.stringify(data);
    this.clients.forEach(ws => { if (ws.readyState === 1) ws.send(payload); });
  }

  getFullState() { return JSON.parse(JSON.stringify(this.state)); }

  getMeta() {
    return {
      id: this.id, status: this.status,
      players: this.clients.size,
      champCount: this.state.champions.filter(c => c.hp > 0).length,
    };
  }

  // ── État initial ──────────────────────────────────────────────────────
  _buildInitialState(cfg) {
    const count = Math.min(24, Math.max(4, cfg.champCount || 8));
    const names = cfg.names || ['Ragnar','Lyra','Gorak','Sera','Kael','Bjorn','Freya','Leif',
                                 'Thor','Mira','Draven','Cleo','Axel','Nova','Oz','Rin',
                                 'Vex','Zara','Finn','Iris','Rex','Luna','Ash','Storm'];
    const biomes = ['forêt','désert','toundra','marais','montagne'];
    return {
      id: this.id, tick: 0, status: 'waiting', winner: null,
      dayPhase: 0, events: [], alliances: [], activeEvent: null,
      map: {
        biome:    biomes[_rng(0, 4)],
        width:    cfg.mapSize === 'S' ? 150 : cfg.mapSize === 'L' ? 500 : 300,
        height:   cfg.mapSize === 'S' ? 150 : cfg.mapSize === 'L' ? 500 : 300,
        zone:     { cx: 150, cy: 150, radius: 185 },
        pois:     buildPOIs(),
        supplies: [], traps: [], combatScars: [],
      },
      champions: Array.from({ length: count }, (_, i) =>
        buildChampion(`c_${i}`, names[i % names.length], i, cfg.colors?.[i])
      ),
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ── Champion FSM ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════
const CRAFT_TIMERS = { crude_weapon: 4000, crude_armor: 5000, herbal_remedy: 3000, trap: 3000, torch: 2000 };

class ChampionFSM {
  constructor(champion) {
    this.champion      = champion;
    this.state         = 'IDLE';
    this.timerHandle   = null;
    this.timerEnd      = 0;
    this.savedProgress = 0;
    this.craftId       = null;
    this.stunTimer     = 0;
  }

  enter(newState, params = {}) {
    if (this.timerHandle) { clearTimeout(this.timerHandle); this.timerHandle = null; this.timerEnd = 0; }
    this.state   = newState;
    this.craftId = params.craftId || this.craftId;

    let dur = 0;
    if (newState === 'CHANNELING_CRAFT') dur = (CRAFT_TIMERS[this.craftId] || 3000) * (1 - (params.resume || 0));
    if (newState === 'STUNNED')          dur = params.duration || 800;
    if (newState === 'FLEEING')          dur = 3000;
    if (newState === 'CHANNELING_LOOT')  dur = 2000;

    if (dur > 0) {
      this.timerEnd    = Date.now() + dur;
      this.timerHandle = setTimeout(() => this._onExpire(), dur);
    }
  }

  interrupt(reason) {
    if (this.state === 'CHANNELING_CRAFT' && this.timerEnd > 0 && this.craftId) {
      const total   = CRAFT_TIMERS[this.craftId] || 3000;
      const elapsed = total - (this.timerEnd - Date.now());
      this.savedProgress = Math.min(1, elapsed / total);
    }
    this.enter('IDLE');
  }

  get progress() {
    if (!this.timerEnd) return 0;
    const dur = CRAFT_TIMERS[this.craftId] || 3000;
    return Math.max(0, Math.min(1, 1 - (this.timerEnd - Date.now()) / dur));
  }

  _onExpire() {
    switch (this.state) {
      case 'CHANNELING_CRAFT': this.enter('CRAFT_RESOLVE'); break;
      case 'CHANNELING_LOOT':  this.enter('LOOTING'); break;
      case 'STUNNED':
      case 'FLEEING':          this.enter('IDLE'); break;
    }
    this.savedProgress = 0;
  }

  update(dt, alive, state) {
    const c = this.champion;
    if (c.hp <= 0) { this.enter('DEAD'); return; }

    const enemies  = alive.filter(e => e.id !== c.id && e.hp > 0);
    const nearest  = enemies.length ? enemies.reduce((p, e) => Math.hypot(e.x-c.x,e.y-c.y)<Math.hypot(p.x-c.x,p.y-c.y)?e:p) : null;
    const nearDist = nearest ? Math.hypot(nearest.x-c.x, nearest.y-c.y) : Infinity;

    // Interruption si ennemi trop proche pendant craft/loot
    if (['CHANNELING_CRAFT','CHANNELING_LOOT'].includes(this.state) && nearDist < 20) {
      this.interrupt('threat');
    }

    // Transitions basiques
    if (this.state === 'IDLE') {
      if (nearest && nearDist < 60) this.enter('CHASING');
      else if (c.hp < c.maxHp * 0.4) this.enter('FLEEING');
    }
    if (this.state === 'CHASING' && nearDist < 8) this.enter('COMBAT');
    if (this.state === 'COMBAT'  && nearDist > 12) this.enter('CHASING');
    if (this.state === 'FLEEING' && !this.timerEnd) this.enter('IDLE');
  }

  // Direction de déplacement selon l'état
  getMovement(alive, state) {
    const c = this.champion;
    const enemies = alive.filter(e => e.id !== c.id && e.hp > 0);
    if (!enemies.length) return { dx: _noise(1), dy: _noise(1) };
    const nearest = enemies.reduce((p, e) => Math.hypot(e.x-c.x,e.y-c.y)<Math.hypot(p.x-c.x,p.y-c.y)?e:p);

    switch (this.state) {
      case 'CHASING':
      case 'COMBAT':  return _toward(nearest, c);
      case 'FLEEING': return _away(nearest, c);
      case 'IDLE':
      default:        return { dx: _noise(1), dy: _noise(1) };
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────
function buildChampion(id, name, idx, color) {
  const stats = { strength:_rng(3,8), speed:_rng(3,8), defense:_rng(2,6), endurance:_rng(3,7), instinct:_rng(2,7), survival:_rng(2,7) };
  const champ = {
    id, name, color: color || '#e2b96f',
    x: _rng(20, 280), y: _rng(20, 280),
    hp: 150, maxHp: 150, stats,
    archetype: _getArch(stats),
    buffs: [], items: [], statusEffects: [],
    simStats: { kills: 0, dmgDealt: 0, dmgTaken: 0 },
    playerId: null,
  };
  champ.fsm = new ChampionFSM(champ);
  return champ;
}

function buildPOIs() {
  return [
    { id:'cornucopia',  name:'Cornucopia',   icon:'⚡', x:150, y:150, radius:18, effect:'loot'    },
    { id:'caves',       name:'Grottes',      icon:'🌑', x:55,  y:60,  radius:22, effect:'shelter' },
    { id:'ruins',       name:'Ruines',       icon:'🏚', x:235, y:85,  radius:18, effect:'craft'   },
    { id:'river',       name:'Rivière',      icon:'🌊', x:105, y:190, radius:16, effect:'water'   },
    { id:'watchtower',  name:'Tour de guet', icon:'🗼', x:255, y:215, radius:12, effect:'vision'  },
    { id:'forest',      name:'Forêt Dense',  icon:'🌲', x:65,  y:235, radius:28, effect:'cover'   },
    { id:'village',     name:'Village',      icon:'🏘', x:185, y:270, radius:20, effect:'loot'    },
  ];
}

function _getArch(stats) {
  const best = Object.entries(stats).sort((a,b)=>b[1]-a[1])[0][0];
  return {strength:'berserker',speed:'hunter',defense:'tank',endurance:'tank',instinct:'opportunist',survival:'survivor'}[best]||'soldier';
}

function _rng(a, b)     { return a + Math.floor(Math.random() * (b - a + 1)); }
function _noise(amp)    { return Math.floor(Math.random() * amp * 2 - amp); }
function _q(v)          { return Math.round(v * 10) / 10; }  // quantification à 0.1u
function _sign(v)       { return v > 0 ? 1 : v < 0 ? -1 : 0; }
function _toward(t, c)  { return { dx: _sign(t.x-c.x)||_noise(1), dy: _sign(t.y-c.y)||_noise(1) }; }
function _away(t, c)    { return { dx: _sign(c.x-t.x)||_noise(1), dy: _sign(c.y-t.y)||_noise(1) }; }
