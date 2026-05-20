import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Modal, Pressable, TextInput,
} from 'react-native';
import BattleMap from '../components/BattleMap';
import ChampionModel from '../components/ChampionModel';

// ── Constantes monde ──────────────────────────────────────────────────────
const WORLD        = 300;
const ZONE_START   = 185;
const ZONE_MIN     = 10;
const ZONE_EVERY   = 4;
const ZONE_SHRINK  = 8;
const ZONE_DMG     = 6;
const COMBAT_RANGE = 8;
const DAY_LEN      = 24;
const NIGHT_START  = 18;
const DUSK_START   = 15;
const EVENT_COOLDOWN   = 20;
const ALLIANCE_EVERY   = 12;
const MENTAL_DURATIONS = { berserk:6, exhausted:8, traumatized:5 };

// ── POIs ──────────────────────────────────────────────────────────────────
const BASE_POIS = [
  { id:'cornucopia', name:'Cornucopia',   icon:'⚡', x:150, y:150, radius:18, effect:'loot'    },
  { id:'caves',      name:'Grottes',      icon:'🌑', x:55,  y:60,  radius:22, effect:'shelter' },
  { id:'ruins',      name:'Ruines',       icon:'🏚', x:235, y:85,  radius:18, effect:'craft'   },
  { id:'river',      name:'Rivière',      icon:'🌊', x:105, y:190, radius:16, effect:'water'   },
  { id:'watchtower', name:'Tour de guet', icon:'🗼', x:255, y:215, radius:12, effect:'vision'  },
  { id:'forest',     name:'Forêt Dense',  icon:'🌲', x:65,  y:235, radius:28, effect:'cover'   },
  { id:'village',    name:'Village',      icon:'🏘', x:185, y:270, radius:20, effect:'loot'    },
];

// ── Craft ─────────────────────────────────────────────────────────────────
const CRAFT_RECIPES = [
  { id:'crude_weapon', name:'Arme grossière',    icon:'🪓', requiredEffect:'craft',
    duration:4, successStats:{instinct:0.35,survival:0.20,strength:0.15},
    onSuccess:{stat:'strength',value:3,ticks:18}, failMsg:'La lame se brise avant d\'être terminée.' },
  { id:'crude_armor',  name:'Armure de fortune', icon:'🛡', requiredEffect:'craft',
    duration:5, successStats:{instinct:0.25,survival:0.25,endurance:0.20},
    onSuccess:{stat:'defense',value:3,ticks:18},  failMsg:'Les sangles lâchent — armure inutilisable.' },
  { id:'herbal_remedy',name:'Remède naturel',    icon:'🍃', requiredEffect:['water','cover'],
    duration:3, successStats:{survival:0.45,instinct:0.20},
    onSuccess:{heal:40}, failMsg:'Les herbes récoltées sont les mauvaises.' },
  { id:'trap',         name:'Piège',             icon:'🪤', requiredEffect:'cover',
    duration:3, successStats:{instinct:0.40,survival:0.25},
    onSuccess:{placeTrap:true}, failMsg:'Le piège s\'effondre avant d\'être posé.' },
  { id:'torch',        name:'Torche',            icon:'🔦', requiredEffect:['cover','shelter'],
    duration:2, successStats:{survival:0.35,instinct:0.15},
    onSuccess:{giveItem:'torch'}, failMsg:'Le bois est trop humide.' },
];

// ── Archétypes ────────────────────────────────────────────────────────────
const ARCH = {
  berserker:   { icon:'⚔️',  label:'Berserker',   preferCraft:'crude_weapon', preferPOI:'cornucopia' },
  hunter:      { icon:'🏹',  label:'Chasseur',    preferCraft:'trap',         preferPOI:'watchtower' },
  opportunist: { icon:'🦊',  label:'Opportuniste',preferCraft:'trap',         preferPOI:'village'    },
  survivor:    { icon:'🌿',  label:'Survivant',   preferCraft:'herbal_remedy',preferPOI:'caves'      },
  tank:        { icon:'🛡',  label:'Tank',        preferCraft:'crude_armor',  preferPOI:'ruins'      },
  soldier:     { icon:'🗡',  label:'Soldat',      preferCraft:'crude_weapon', preferPOI:'ruins'      },
};
const ARCH_QUOTES = {
  berserker:   ['Rien ne peut m\'arrêter.','Le sang appelle le sang.'],
  hunter:      ['La patience est ma force.','J\'ai choisi mes cibles.'],
  opportunist: ['J\'ai joué le jeu parfaitement.','Les idiots se sont battus pour moi.'],
  survivor:    ['La forêt m\'a sauvé.','Pas besoin de tuer pour survivre... presque.'],
  tank:        ['Ils se sont brisés sur moi.','J\'ai encaissé chaque coup.'],
  soldier:     ['Discipline et stratégie.','Un guerrier ne faiblit pas.'],
};
const STAT_LBL = {
  strength:'⚔️ Force', speed:'💨 Vitesse', defense:'🛡 Défense',
  endurance:'💪 Endurance', instinct:'🧠 Instinct', survival:'🌿 Survie',
};
const CHAMP_NAMES = [
  'Ragnar','Lyra','Gorak','Sera','Kael','Bjorn','Freya','Leif',
  'Thane','Vex','Mira','Odo','Zara','Crix','Neva','Dorv',
  'Pax','Sela','Urn','Wren','Axel','Brin','Cole','Dawn',
];
const CHAMP_COLORS = [
  '#e74c3c','#3498db','#2ecc71','#f39c12',
  '#9b59b6','#1abc9c','#e67e22','#ff6b9d',
  '#00b894','#fd79a8','#6c5ce7','#fdcb6e',
  '#e17055','#74b9ff','#a29bfe','#55efc4',
  '#fab1a0','#81ecec','#d63031','#0984e3',
  '#00cec9','#e84393','#b2bec3','#dfe6e9',
];

// ── Capacités spéciales par archétype ────────────────────────────────────
const ARCH_ABILITIES = {
  berserker:{ name:'Charge',        icon:'💥', cooldown:10,
    use(c,alive,state,ev){ const en=alive.filter(e=>e.id!==c.id&&e.hp>0); if(!en.length)return false;
      const t=en.reduce((p,e)=>dist(e,c)<dist(p,c)?e:p);
      const d=Math.max(8,c._eff.strength*2+rng(4,10)); t.hp-=d; t.simStats.dmgTaken+=d; c.simStats.dmgDealt+=d;
      c.x=t.x; c.y=t.y;
      ev.push({type:'narr',sub:'ability',id:c.id,name:c.name,tick:state.tick,
        text:`se précipite sur ${t.name} avec une Charge ! (−${d} PV)`});
      if(t.hp<=0){c.simStats.kills++;ev.push({type:'death',champion:t.id,name:t.name,killedBy:c.id,killedByName:c.name});}
      return true; }
  },
  hunter:{ name:'Piège Éclair', icon:'🪤', cooldown:8,
    use(c,alive,state,ev){ state.map.traps.push({id:`trap_ab_${state.tick}`,x:c.x,y:c.y,ownerId:c.id});
      ev.push({type:'narr',sub:'ability',id:c.id,name:c.name,tick:state.tick,
        text:`pose instantanément un piège à sa position`}); return true; }
  },
  opportunist:{ name:'Camouflage', icon:'🫥', cooldown:12,
    use(c,alive,state,ev){ c.buffs.push({stat:'_camo',value:1,ticks:3,special:'camo'});
      ev.push({type:'narr',sub:'ability',id:c.id,name:c.name,tick:state.tick,
        text:`disparaît dans les ombres — Camouflage actif (3 ticks)`}); return true; }
  },
  survivor:{ name:'Premiers Soins', icon:'💊', cooldown:9,
    use(c,alive,state,ev){ if(c.hp>=c.maxHp*0.85)return false;
      const h=35+Math.floor((c._eff||c.stats).survival*3); c.hp=Math.min(c.maxHp,c.hp+h);
      ev.push({type:'narr',sub:'ability',id:c.id,name:c.name,tick:state.tick,
        text:`applique des Premiers Soins d'urgence (+${h} PV)`}); return true; }
  },
  tank:{ name:'Fortifier', icon:'🛡️', cooldown:11,
    use(c,alive,state,ev){ c.buffs.push({stat:'defense',value:5,ticks:5});
      ev.push({type:'narr',sub:'ability',id:c.id,name:c.name,tick:state.tick,
        text:`adopte une posture Fortifiée (+5 déf, 5 ticks)`}); return true; }
  },
  soldier:{ name:'Tactique', icon:'🎯', cooldown:10,
    use(c,alive,state,ev){ const en=alive.filter(e=>e.id!==c.id&&e.hp>0); if(!en.length)return false;
      const t=en.reduce((p,e)=>dist(e,c)<dist(p,c)?e:p);
      t.buffs.push({stat:'strength',value:-2,ticks:4},{stat:'speed',value:-1,ticks:4});
      ev.push({type:'narr',sub:'ability',id:c.id,name:c.name,tick:state.tick,
        text:`applique Tactique sur ${t.name} (−2 str, −1 spd, 4t)`}); return true; }
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────
const rng   = (a,b) => a + Math.floor(Math.random()*(b-a+1));
const noise = (amp) => Math.floor(Math.random()*amp*2 - amp);
const dist  = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
const sign  = v => v>0?1:v<0?-1:0;
const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));

function timeOfDay(phase) {
  if (phase >= NIGHT_START) return '🌙 Nuit';
  if (phase >= DUSK_START)  return '🌆 Crépuscule';
  if (phase >= 6)           return '☀️ Jour';
  return '🌅 Aube';
}
function tickLabel(tick) {
  const day = Math.floor(tick/DAY_LEN)+1;
  return `J${day} · ${timeOfDay(tick%DAY_LEN)}`;
}

// ── Archétype ─────────────────────────────────────────────────────────────
function getArch(stats) {
  const ranges = {strength:[3,8],speed:[3,8],defense:[2,6],endurance:[3,7],instinct:[2,7],survival:[2,7]};
  const norm   = Object.fromEntries(Object.entries(stats).map(([k,v])=>[k,(v-ranges[k][0])/(ranges[k][1]-ranges[k][0])]));
  const sorted = Object.entries(norm).sort((a,b)=>b[1]-a[1]);
  if (sorted[0][1]-sorted[1][1] < 0.13) return 'soldier';
  return {strength:'berserker',speed:'hunter',defense:'tank',endurance:'tank',
          instinct:'opportunist',survival:'survivor'}[sorted[0][0]]||'soldier';
}

// ── Craft success ─────────────────────────────────────────────────────────
function craftSuccessChance(champ, recipe) {
  const s  = champ.stats;
  let   p  = 0.20;
  Object.entries(recipe.successStats).forEach(([stat,weight])=>{
    p += (s[stat]||0)/10 * weight * 0.8;
  });
  const req  = Array.isArray(recipe.requiredEffect) ? recipe.requiredEffect : [recipe.requiredEffect];
  const near = BASE_POIS.find(poi => req.includes(poi.effect) && dist(champ,poi)<poi.radius*1.5);
  if (near) p += 0.25;
  return Math.min(0.92, p);
}

// ── Make champion ─────────────────────────────────────────────────────────
function makeChamp(id, name, colorIdx, spawnRange=[20,280]) {
  const [sMin,sMax]=spawnRange;
  const stats = {
    strength:rng(3,8), speed:rng(3,8), defense:rng(2,6),
    endurance:rng(3,7), instinct:rng(2,7), survival:rng(2,7),
  };
  return {
    id, name, colorIdx,
    color: CHAMP_COLORS[colorIdx%CHAMP_COLORS.length],
    x:rng(sMin,sMax), y:rng(sMin,sMax),
    hp:150, maxHp:150, stats,
    archetype: getArch(stats),
    buffs:[], items:[], statusEffects:[],
    simStats:{ kills:0, dmgDealt:0, dmgTaken:0, crafts:0, survivedTicks:0 },
    _memory:{ targetId:null, targetTicks:0, lastAttackerId:null, lastHealTick:-99 },
    _activity:{ type:'idle', startTick:0, craftId:null },
    _mentalState:'normal', _mentalStateTick:0,
    _combatTicks:0, _journal:[], _lastNarrTick:-99,
    _abilityCooldown:0,
    sponsorUsername:'simulateur',
  };
}

// ── État initial ──────────────────────────────────────────────────────────
const MAP_SIZES = {
  S:{ zoneStart:130, spawn:[25,175] },
  M:{ zoneStart:185, spawn:[20,280] },
  L:{ zoneStart:240, spawn:[10,290] },
};
function createSimState(cfg={}) {
  const count     = clamp(cfg.champCount||8, 4, 24);
  const names     = (cfg.champNames||CHAMP_NAMES).slice(0,count);
  const sizeCfg   = MAP_SIZES[cfg.mapSize||'M'];
  const biome     = cfg.biome||['forêt','désert','toundra','marais','montagne'][rng(0,4)];
  const champs    = names.map((n,i)=>makeChamp(`sim_${i}`,n,i,sizeCfg.spawn));
  return {
    id:'sim_local', tick:0, status:'active', winner:null,
    events:[], narrative:[],
    dayPhase:0, alliances:[], activeEvent:null,
    lastEventTick:0,
    matchStats:{ totalCombats:0, totalCrafts:0, zoneDeaths:0, alliancesFormed:0, betrayals:0 },
    map:{
      biome,
      width:WORLD, height:WORLD,
      zone:{ cx:WORLD/2, cy:WORLD/2, radius:sizeCfg.zoneStart },
      pois:BASE_POIS.map(p=>({...p})),
      loots:Array.from({length:8+count},(_,i)=>({
        id:`loot_${i}`,x:rng(10,290),y:rng(10,290),type:['arme','soin','armure'][i%3]
      })),
      supplies:[],traps:[],
    },
    champions:champs,
  };
}

// ── IA ────────────────────────────────────────────────────────────────────
function aiMove(c, alive, zone, supplies, pois, isNight, alliances, activeEvent) {
  const enemies = alive.filter(e=>e.id!==c.id&&e.hp>0);
  if (!enemies.length) return {dx:noise(1),dy:noise(1)};

  // Alliés : exclure des ennemis
  const myAlly = (alliances||[]).find(al=>al.ids.includes(c.id));
  const allyId = myAlly?.ids.find(id=>id!==c.id);
  const realEnemies = allyId ? enemies.filter(e=>e.id!==allyId) : enemies;

  const targets  = realEnemies.length ? realEnemies : enemies;
  const hpR      = c.hp/c.maxHp;
  const nearest  = targets.reduce((p,e)=>dist(e,c)<dist(p,c)?e:p);
  const weakest  = targets.reduce((p,e)=>e.hp<p.hp?e:p);
  const nearSup  = supplies.length ? supplies.reduce((p,s)=>dist(s,c)<dist(p,c)?s:p) : null;
  const dZone    = Math.hypot(c.x-zone.cx, c.y-zone.cy);
  const nearEdge = dZone > zone.radius*0.84;
  const prefPOI  = pois.find(p=>p.id===(ARCH[c.archetype]||ARCH.soldier).preferPOI);

  if (alive.length<=3) return toward(weakest,c);
  if (nearEdge) return toward({x:zone.cx,y:zone.cy},c);

  // Nuit : les instinct≤4 se dirigent vers un abri
  if (isNight && c.stats.instinct<=4 && hpR>0.5) {
    const shelter = pois.find(p=>!p._disabled&&(p.effect==='shelter'||p.effect==='cover'));
    if (shelter && dist(shelter,c)>20) return toward(shelter,c);
    return {dx:noise(1),dy:noise(1)};
  }
  // Tempête/brouillard : réduit la détection
  const detectRange = (activeEvent?.type==='fog'||activeEvent?.type==='sandstorm') ? 30 : 90;

  switch(c.archetype) {
    case 'berserker': return toward(nearest,c);
    case 'hunter': {
      const mem = c._memory;
      let tgt = mem.targetId ? targets.find(e=>e.id===mem.targetId) : null;
      if (!tgt||mem.targetTicks>8) {
        const vis = targets.filter(e=>dist(e,c)<detectRange);
        tgt = vis.length ? vis.reduce((p,e)=>e.hp<p.hp?e:p) : nearest;
        mem.targetId=tgt.id; mem.targetTicks=0;
      } else mem.targetTicks++;
      return toward(tgt,c);
    }
    case 'opportunist': {
      const wounded = targets.filter(e=>e.hp/e.maxHp<0.45);
      if (wounded.length) return toward(wounded.sort((a,b)=>dist(a,c)-dist(b,c))[0],c);
      if (prefPOI&&!prefPOI._disabled&&dist(prefPOI,c)>25) return toward(prefPOI,c);
      return {dx:sign(zone.cx-c.x)+noise(1), dy:sign(zone.cy-c.y)+noise(1)};
    }
    case 'survivor':
      if (dist(nearest,c)<28) return away(nearest,c);
      if (nearSup&&dist(nearSup,c)<40) return toward(nearSup,c);
      if (prefPOI&&!prefPOI._disabled&&dist(prefPOI,c)>20) return toward(prefPOI,c);
      return {dx:noise(1),dy:noise(1)};
    case 'tank': {
      const close = targets.filter(e=>dist(e,c)<22);
      if (close.length) return toward(close[0],c);
      return {dx:sign(zone.cx-c.x),dy:sign(zone.cy-c.y)};
    }
    default: { // soldier
      if (c._memory.lastAttackerId) {
        const nem = targets.find(e=>e.id===c._memory.lastAttackerId);
        if (nem) return toward(nem,c);
      }
      if (hpR<0.28) { if(nearSup&&dist(nearSup,c)<50) return toward(nearSup,c); return away(nearest,c); }
      if (hpR>0.55) return toward(nearest,c);
      return {dx:noise(1),dy:noise(1)};
    }
  }
}
const toward = (t,c) => ({dx:sign(t.x-c.x)||noise(1), dy:sign(t.y-c.y)||noise(1)});
const away   = (t,c) => ({dx:sign(c.x-t.x)||noise(1), dy:sign(c.y-t.y)||noise(1)});

// ── Narratif ──────────────────────────────────────────────────────────────
function getDirection(from,to) {
  const ang = Math.atan2(to.y-from.y, to.x-from.x)*180/Math.PI;
  if (ang>=-22&&ang<22)   return 'est';
  if (ang>=22&&ang<67)    return 'sud-est';
  if (ang>=67&&ang<112)   return 'sud';
  if (ang>=112&&ang<157)  return 'sud-ouest';
  if (ang>=-67&&ang<-22)  return 'nord-est';
  if (ang>=-112&&ang<-67) return 'nord';
  if (ang>=-157&&ang<-112)return 'nord-ouest';
  return 'ouest';
}

function tryNarrative(c, state, events) {
  if (state.tick - c._lastNarrTick < 8) return;
  if (c.hp<=0) return;
  const isNight = state.dayPhase >= NIGHT_START;
  const pois    = state.map.pois.filter(p=>!p._disabled);
  const nearPOI = pois.find(p=>dist(c,p)<p.radius*1.2);
  const alive   = state.champions.filter(x=>x.hp>0);
  const enemies = alive.filter(x=>x.id!==c.id);
  const near    = enemies.length ? enemies.reduce((p,e)=>dist(e,c)<dist(p,c)?e:p) : null;
  const rand    = Math.random();

  if (isNight && c._activity.type==='idle' && nearPOI && ['shelter','cover'].includes(nearPOI.effect) && rand<0.18) {
    c._activity = {type:'campfire',startTick:state.tick};
    c._lastNarrTick = state.tick;
    events.push({type:'narr',sub:'campfire',id:c.id,name:c.name,tick:state.tick,
      text:`allume un feu de camp près des ${nearPOI.name}`});
    return;
  }
  if (nearPOI?.effect==='vision' && near && rand<0.25) {
    c._lastNarrTick = state.tick;
    events.push({type:'narr',sub:'scout',id:c.id,name:c.name,tick:state.tick,
      text:`depuis la ${nearPOI.name}, repère ${near.name} au ${getDirection(c,near)}`});
    return;
  }
  if (nearPOI?.effect==='water' && c.hp<c.maxHp*0.7 && rand<0.22) {
    const heal = rng(12,22);
    c.hp = Math.min(c.maxHp, c.hp+heal);
    c._lastNarrTick = state.tick;
    events.push({type:'narr',sub:'treat',id:c.id,name:c.name,tick:state.tick,
      text:`soigne ses blessures au bord de la ${nearPOI.name} (+${heal} PV)`});
    return;
  }
  if (nearPOI && ['craft','cover'].includes(nearPOI.effect) && c._activity.type==='idle' && rand<0.15) {
    const req   = nearPOI.effect==='craft' ? ['crude_weapon','crude_armor','trap'] : ['herbal_remedy','trap','torch'];
    const pref  = ARCH[c.archetype]?.preferCraft;
    const recipe= CRAFT_RECIPES.find(r=>r.id===pref&&req.includes(r.id)) || CRAFT_RECIPES.find(r=>req.includes(r.id));
    if (recipe) {
      c._activity = {type:'crafting',startTick:state.tick,craftId:recipe.id};
      c._lastNarrTick = state.tick;
      events.push({type:'narr',sub:'craft_start',id:c.id,name:c.name,tick:state.tick,
        text:`commence à fabriquer ${recipe.icon} ${recipe.name} dans les ${nearPOI.name}...`});
      return;
    }
  }
  if (near && c.hp/c.maxHp<0.35 && near.hp/near.maxHp<0.35 && rand<0.30) {
    c._lastNarrTick = state.tick;
    events.push({type:'narr',sub:'truce',id:c.id,name:c.name,tick:state.tick,
      text:`et ${near.name} se croisent — trop épuisés pour combattre, ils s'évitent`});
    return;
  }
  if (nearPOI?.effect==='cover' && rand<0.12) {
    const hp2 = rng(8,18);
    c.hp = Math.min(c.maxHp, c.hp+hp2);
    c._lastNarrTick = state.tick;
    events.push({type:'narr',sub:'forage',id:c.id,name:c.name,tick:state.tick,
      text:`cueille des baies dans la ${nearPOI.name} (+${hp2} PV)`});
    return;
  }
  if (isNight && !nearPOI && state.map.biome==='montagne' && rand<0.25) {
    const cold = rng(3,8);
    c.hp -= cold;
    c._lastNarrTick = state.tick;
    events.push({type:'narr',sub:'cold',id:c.id,name:c.name,tick:state.tick,
      text:`souffre du froid cette nuit sur les hauteurs (−${cold} PV)`});
    return;
  }
}

// ── Craft résolution ──────────────────────────────────────────────────────
function resolveCrafts(alive, tick, events, traps, matchStats) {
  alive.forEach(c => {
    if (c._activity.type!=='crafting') return;
    const recipe = CRAFT_RECIPES.find(r=>r.id===c._activity.craftId);
    if (!recipe) { c._activity={type:'idle',startTick:tick}; return; }
    if (tick - c._activity.startTick < recipe.duration) return;
    const success = Math.random() < craftSuccessChance(c, recipe);
    c._activity = {type:'idle',startTick:tick};
    if (success) {
      matchStats.totalCrafts++;
      c.simStats.crafts++;
      if (recipe.onSuccess.heal)      c.hp = Math.min(c.maxHp, c.hp+recipe.onSuccess.heal);
      if (recipe.onSuccess.stat)      c.buffs.push({stat:recipe.onSuccess.stat,value:recipe.onSuccess.value,ticks:recipe.onSuccess.ticks});
      if (recipe.onSuccess.placeTrap) traps.push({id:`trap_${tick}_${c.id}`,x:c.x+rng(-4,4),y:c.y+rng(-4,4),ownerId:c.id});
      if (recipe.onSuccess.giveItem)  c.items.push(recipe.onSuccess.giveItem);
      events.push({type:'narr',sub:'craft_ok',id:c.id,name:c.name,craftId:recipe.id,tick,
        text:`réussit à fabriquer ${recipe.icon} ${recipe.name} !`});
    } else {
      events.push({type:'narr',sub:'craft_fail',id:c.id,name:c.name,craftId:recipe.id,tick,
        text:recipe.failMsg});
    }
  });
}

// ── Pièges ────────────────────────────────────────────────────────────────
function checkTraps(alive, traps, events, tick) {
  const remaining = [];
  for (const trap of traps) {
    let triggered = false;
    for (const c of alive) {
      if (c.id===trap.ownerId||c.hp<=0) continue;
      if (dist(c,trap)<5) {
        const dmg = rng(12,22);
        c.hp -= dmg; c.simStats.dmgTaken += dmg;
        events.push({type:'narr',sub:'trap_trigger',id:c.id,name:c.name,tick,
          text:`tombe dans un piège ! (−${dmg} PV)`});
        if (c.hp<=0) events.push({type:'death',champion:c.id,name:c.name,killedBy:trap.ownerId,killedByName:'piège'});
        triggered=true; break;
      }
    }
    if (!triggered) remaining.push(trap);
  }
  return remaining;
}

// ── Alliances ─────────────────────────────────────────────────────────────
function tryAlliance(alive, state, events) {
  // Expirations & trahisons
  state.alliances = (state.alliances||[]).filter(al => {
    const [id1,id2] = al.ids;
    const c1=alive.find(c=>c.id===id1), c2=alive.find(c=>c.id===id2);
    if (!c1||!c2) return false;
    const elapsed = state.tick - al.formedTick;
    const betrayChance = 0.015*(elapsed/al.duration) +
      ((c1.archetype==='opportunist'||c2.archetype==='opportunist') ? 0.04 : 0);
    if (elapsed > al.duration*0.5 && Math.random()<betrayChance) {
      const betrayer = c1.archetype==='opportunist' ? c1 : c2;
      const victim   = betrayer===c1 ? c2 : c1;
      state.matchStats.betrayals++;
      events.push({type:'narr',sub:'betrayal',id:betrayer.id,name:betrayer.name,tick:state.tick,
        text:`trahit ${victim.name} ! L'alliance vole en éclats.`});
      return false;
    }
    return elapsed < al.duration;
  });

  if (alive.length<4) return;
  if ((state.alliances||[]).length>=2) return;
  if (state.tick%ALLIANCE_EVERY!==0) return;
  if (Math.random()>0.12) return;

  for (let i=0; i<alive.length; i++) {
    for (let j=i+1; j<alive.length; j++) {
      const a=alive[i], b=alive[j];
      if (dist(a,b)>45) continue;
      if ((state.alliances||[]).some(al=>al.ids.includes(a.id)||al.ids.includes(b.id))) continue;
      const bothWeak   = a.hp/a.maxHp<0.45 && b.hp/b.maxHp<0.45;
      const hasSurvivor= a.archetype==='survivor'||b.archetype==='survivor';
      const chance     = bothWeak?0.65:hasSurvivor?0.5:0.22;
      if (Math.random()<chance) {
        state.alliances.push({ids:[a.id,b.id],formedTick:state.tick,duration:rng(14,24)});
        state.matchStats.alliancesFormed++;
        events.push({type:'narr',sub:'alliance',id:a.id,name:a.name,tick:state.tick,
          text:`et ${b.name} forment une alliance... pour l'instant.`});
        return;
      }
    }
  }
}

// ── Événements aléatoires ─────────────────────────────────────────────────
function tryRandomEvent(state, events) {
  const ae = state.activeEvent;
  if (ae) {
    // Résolution continue
    const alive   = state.champions.filter(c=>c.hp>0);
    const elapsed = state.tick - ae.startTick;
    if (ae.type==='fire') {
      const r = ae.radius + elapsed*1.5;
      alive.forEach(c=>{
        if (Math.hypot(c.x-ae.x,c.y-ae.y)<r) {
          const dmg=rng(5,11); c.hp-=dmg; c.simStats.dmgTaken+=dmg;
          events.push({type:'narr',sub:'fire_damage',id:c.id,name:c.name,tick:state.tick,
            text:`brûle dans l'incendie ! (−${dmg} PV)`});
        }
      });
    }
    if (ae.type==='cold_snap') {
      alive.forEach(c=>{
        if (!c._coldProof && !c.items?.includes('torch')) {
          const nearShelter = state.map.pois.find(p=>!p._disabled&&dist(c,p)<p.radius&&(p.effect==='shelter'||p.effect==='cover'));
          if (!nearShelter) { const dmg=rng(4,9); c.hp-=dmg; c.simStats.dmgTaken+=dmg; }
        }
      });
    }
    if (elapsed >= ae.duration) {
      if (ae.type==='earthquake') {
        const poi=state.map.pois.find(p=>p.id===ae.poiId);
        if (poi) delete poi._disabled;
      }
      state.activeEvent=null;
    }
    return;
  }

  if (state.tick - (state.lastEventTick||0) < EVENT_COOLDOWN) return;
  if (Math.random()>0.28) return;

  const biome = state.map.biome;
  const pool  = [
    {type:'supply_rain', w:2, cond:true},
    {type:'fire',        w:1.5, cond:biome==='forêt'||biome==='marais'},
    {type:'sandstorm',   w:2,   cond:biome==='désert'},
    {type:'earthquake',  w:2,   cond:biome==='montagne'},
    {type:'cold_snap',   w:2,   cond:biome==='toundra'},
    {type:'fog',         w:1.5, cond:biome==='marais'},
  ].filter(e=>e.cond);

  const pick = pool[Math.floor(Math.random()*pool.length)];
  state.lastEventTick = state.tick;

  switch(pick.type) {
    case 'supply_rain': {
      const count=rng(3,5);
      const types=['soin','soin','force','vitesse','armure'];
      for(let i=0;i<count;i++)
        state.map.supplies.push({id:`ev_${i}_${state.tick}`,type:types[i%types.length],x:rng(80,220),y:rng(80,220)});
      events.push({type:'event',evType:'supply_rain',tick:state.tick,
        text:`📦 Les Organisateurs larguent ${count} colis en zone centrale !`});
      break;
    }
    case 'fire': {
      const p=state.map.pois.find(poi=>poi.effect==='cover')||{x:65,y:235};
      state.activeEvent={type:'fire',startTick:state.tick,duration:8,x:p.x+rng(-10,10),y:p.y+rng(-10,10),radius:18};
      events.push({type:'event',evType:'fire',tick:state.tick,text:`🔥 Un incendie se déclare dans la zone végétale !`});
      break;
    }
    case 'sandstorm':
      state.activeEvent={type:'sandstorm',startTick:state.tick,duration:10};
      events.push({type:'event',evType:'sandstorm',tick:state.tick,text:`🌪 Tempête de sable ! Vision réduite à 30 unités.`});
      break;
    case 'earthquake': {
      const idx=Math.floor(Math.random()*state.map.pois.length);
      const poi=state.map.pois[idx];
      poi._disabled=true;
      state.activeEvent={type:'earthquake',startTick:state.tick,duration:12,poiId:poi.id};
      const alive2=state.champions.filter(c=>c.hp>0);
      alive2.forEach(c=>{if(dist(c,poi)<poi.radius){const d=rng(10,20);c.hp-=d;c.simStats.dmgTaken+=d;}});
      events.push({type:'event',evType:'earthquake',tick:state.tick,text:`💥 Séisme ! ${poi.name} s'effondre temporairement.`});
      break;
    }
    case 'cold_snap':
      state.activeEvent={type:'cold_snap',startTick:state.tick,duration:8};
      events.push({type:'event',evType:'cold_snap',tick:state.tick,text:`❄️ Vague de froid glacial sur la toundra !`});
      break;
    case 'fog':
      state.activeEvent={type:'fog',startTick:state.tick,duration:9};
      events.push({type:'event',evType:'fog',tick:state.tick,text:`🌫 Brouillard épais dans le marais — repérage difficile.`});
      break;
  }
}

// ── États mentaux ─────────────────────────────────────────────────────────
function updateMentalStates(alive, tick, events) {
  alive.forEach(c=>{
    if (c._mentalState && c._mentalState!=='normal') {
      const dur = MENTAL_DURATIONS[c._mentalState]||6;
      if (tick - c._mentalStateTick >= dur) {
        c._mentalState='normal'; c._mentalStateTick=0;
      }
    }
    if (!c._combatTicks) c._combatTicks=0;
    if (c._mentalState==='normal' && c._combatTicks>=5) {
      c._mentalState='exhausted'; c._mentalStateTick=tick; c._combatTicks=0;
      events.push({type:'narr',sub:'exhausted',id:c.id,name:c.name,tick,
        text:`s'effondre d'épuisement après trop de combats`});
    }
  });
}

function applyMentalEffects(c) {
  switch(c._mentalState){
    case 'exhausted':   c._eff.speed=Math.max(1,c._eff.speed-2); c._eff.strength=Math.max(1,c._eff.strength-1); break;
    case 'berserk':     c._eff.strength+=4; c._eff.defense=Math.max(0,c._eff.defense-2); break;
    case 'traumatized': c._eff.instinct+=3; c._eff.speed=Math.max(1,c._eff.speed-1); break;
  }
}

// ── Effets de statut ─────────────────────────────────────────────────────
function applyStatusEffects(alive, tick, events) {
  alive.forEach(c=>{
    if (!c.statusEffects?.length) return;
    const kept=[];
    c.statusEffects.forEach(se=>{
      if (se.type==='stun') { se.ticks--; if(se.ticks>0)kept.push(se); return; }
      const dmg = se.type==='poison' ? rng(4,7) : rng(2,4); // bleed = 2-4
      c.hp-=dmg; c.simStats.dmgTaken+=dmg; se.ticks--;
      events.push({type:'narr',sub:se.type,id:c.id,name:c.name,tick,
        text:se.type==='poison'?`souffre du poison (−${dmg} PV)`:`saigne abondamment (−${dmg} PV)`});
      if (c.hp<=0) events.push({type:'death',champion:c.id,name:c.name,killedBy:se.srcId||'?',killedByName:se.type});
      if (se.ticks>0) kept.push(se);
    });
    c.statusEffects=kept;
  });
}

// ── Capacités actives ─────────────────────────────────────────────────────
function tryAbility(c, alive, state, events) {
  if (c.hp<=0) return;
  const ab = ARCH_ABILITIES[c.archetype]; if(!ab) return;
  if (!c._abilityCooldown) c._abilityCooldown=0;
  if (state.tick - c._abilityCooldown < ab.cooldown) return;
  if (Math.random()>0.20) return;
  const enemies=alive.filter(e=>e.id!==c.id&&e.hp>0);
  const nearEnemy=enemies.some(e=>dist(e,c)<40);
  const lowHp=c.hp/c.maxHp<0.55;
  if (!nearEnemy&&!lowHp&&c.archetype!=='hunter') return;
  if (ab.use(c,alive,state,events)) c._abilityCooldown=state.tick;
}

// ── Journal personnel ─────────────────────────────────────────────────────
function distributeToJournals(champions, events) {
  events.forEach(ev=>{
    const ids = ev.id ? [ev.id] : ev.type==='combat' ? [ev.a,ev.b] : [];
    ids.forEach(id=>{
      const c=champions.find(x=>x.id===id);
      if (!c) return;
      let txt = ev.text;
      if (ev.type==='combat'&&!txt) {
        const other=id===ev.a?ev.bName:ev.aName;
        const dmg  =id===ev.a?ev.dmgB:ev.dmgA;
        txt=`Combat vs ${other} (−${dmg} PV)`;
      }
      if (!txt) return;
      if (!c._journal) c._journal=[];
      c._journal.unshift({text:txt,sub:ev.sub||ev.type,tick:ev.tick||0});
      if (c._journal.length>5) c._journal.length=5;
    });
  });
}

// ── tickSim ───────────────────────────────────────────────────────────────
function tickSim(prev) {
  if (prev.status!=='active') return prev;
  const state = JSON.parse(JSON.stringify(prev));
  state.tick++;
  state.dayPhase = state.tick % DAY_LEN;
  const isNight = state.dayPhase >= NIGHT_START;
  const events  = [];
  const alive   = state.champions.filter(c=>c.hp>0);

  if (alive.length<=1) {
    state.status='finished'; state.winner=alive[0]?.id??null;
    state.events=[...state.events,...events].slice(-200);
    return state;
  }

  // Zone
  const zone = state.map.zone;
  if (state.tick%ZONE_EVERY===0 && zone.radius>ZONE_MIN) {
    zone.radius = Math.max(ZONE_MIN, zone.radius-ZONE_SHRINK);
    events.push({type:'zone',radius:zone.radius});
  }

  // Survie tick
  alive.forEach(c=>c.simStats.survivedTicks++);

  // Stats effectives
  alive.forEach(c=>{
    c._eff = {...c.stats};
    c.buffs.forEach(b=>{ if(c._eff[b.stat]!==undefined) c._eff[b.stat]+=b.value; });
    const nearPOI = state.map.pois.find(p=>!p._disabled&&dist(c,p)<p.radius);
    if (nearPOI?.effect==='vision')  c._eff.instinct  = Math.min(10,c._eff.instinct+2);
    if (nearPOI?.effect==='water')   c._eff.endurance = Math.min(10,c._eff.endurance+1);
    if (nearPOI?.effect==='shelter'&&isNight) c._eff.defense=Math.min(10,c._eff.defense+1);
    if (nearPOI?.effect==='cover')   c._eff.instinct  = Math.min(10,c._eff.instinct+1);
    if (c.items?.includes('torch'))  c._coldProof=true;
    applyMentalEffects(c);
  });

  // Heal survie
  alive.forEach(c=>{
    if (c._eff.survival<6||c.hp>=c.maxHp*0.82) return;
    if (state.tick-(c._memory.lastHealTick??-99)<5) return;
    const others=alive.filter(e=>e.id!==c.id&&e.hp>0);
    const close=others.length?others.reduce((p,e)=>dist(e,c)<dist(p,c)?e:p):null;
    if (close&&dist(close,c)<24) return;
    const heal=10+Math.floor(c._eff.survival*1.5);
    c.hp=Math.min(c.maxHp,c.hp+heal);
    c._memory.lastHealTick=state.tick;
    events.push({type:'heal',champion:c.id,name:c.name,amount:heal});
  });

  // Craft résolution
  resolveCrafts(alive, state.tick, events, state.map.traps, state.matchStats);

  // Alliances
  tryAlliance(alive, state, events);

  // Événements aléatoires
  tryRandomEvent(state, events);

  // États mentaux
  updateMentalStates(alive, state.tick, events);

  // Effets de statut (poison / saignement / étourdissement)
  applyStatusEffects(alive, state.tick, events);

  // Capacités spéciales
  alive.forEach(c=>tryAbility(c, alive, state, events));

  // Narratif
  if (state.tick%2===0) alive.forEach(c=>tryNarrative(c, state, events));

  // Mouvement
  alive.forEach(c=>{
    if (c.hp<=0) return;
    if (c._activity.type==='crafting') return;
    if (c.statusEffects?.some(se=>se.type==='stun')) return; // étourdi = immobile
    if (c._activity.type==='campfire') {
      const others=alive.filter(e=>e.id!==c.id&&e.hp>0);
      const close=others.length?others.reduce((p,e)=>dist(e,c)<dist(p,c)?e:p):null;
      if (close&&dist(close,c)<20) c._activity={type:'idle',startTick:state.tick};
      else return;
    }
    const stormSlow = (state.activeEvent?.type==='sandstorm'||state.activeEvent?.type==='fog') ? 0.55 : 1;
    const nightSlow = isNight&&c.stats.instinct<=4 ? 0.6 : 1;
    const spd = Math.max(1,c._eff.speed) * stormSlow * nightSlow;
    const {dx,dy} = aiMove(c, alive, zone, state.map.supplies, state.map.pois, isNight, state.alliances, state.activeEvent);
    c.x = clamp(c.x+dx*spd+noise(1), 0, WORLD-1);
    c.y = clamp(c.y+dy*spd+noise(1), 0, WORLD-1);
  });

  // Dégâts zone
  alive.forEach(c=>{
    if (c.hp<=0) return;
    if (Math.hypot(c.x-zone.cx,c.y-zone.cy)>zone.radius) {
      const dmg=Math.ceil(ZONE_DMG+(ZONE_START-zone.radius)*0.45);
      c.hp-=dmg; c.simStats.dmgTaken+=dmg;
      events.push({type:'zone_damage',champion:c.id,name:c.name,damage:dmg});
      if (c.hp<=0) {
        state.matchStats.zoneDeaths++;
        events.push({type:'death',champion:c.id,name:c.name,killedBy:'zone',killedByName:'la Zone'});
      }
    }
  });

  // Collecte colis
  state.map.supplies = state.map.supplies.filter(s=>{
    for (const c of alive) {
      if (c.hp<=0) continue;
      if (dist(s,c)<9) {
        if (s.type==='soin')    c.hp=Math.min(c.maxHp,c.hp+45);
        if (s.type==='force')   c.buffs.push({stat:'strength',value:3,ticks:7});
        if (s.type==='vitesse') c.buffs.push({stat:'speed',value:3,ticks:7});
        if (s.type==='armure')  c.buffs.push({stat:'defense',value:3,ticks:7});
        events.push({type:'collect',champion:c.id,name:c.name,supply:s.type});
        return false;
      }
    }
    return true;
  });

  // Pièges
  state.map.traps = checkTraps(alive, state.map.traps, events, state.tick);

  // Combats
  const fighters = alive.filter(c=>c.hp>0);
  for (let i=0;i<fighters.length;i++) {
    for (let j=i+1;j<fighters.length;j++) {
      const a=fighters[i], b=fighters[j];
      if (a.hp<=0||b.hp<=0) continue;
      if (dist(a,b)>=COMBAT_RANGE) continue;
      // Alliance → pas de combat
      const allied=(state.alliances||[]).some(al=>al.ids.includes(a.id)&&al.ids.includes(b.id));
      if (allied) continue;
      // Trêve
      if (a.hp/a.maxHp<0.32&&b.hp/b.maxHp<0.32&&Math.random()<0.45) {
        events.push({type:'narr',sub:'truce',id:a.id,name:a.name,tick:state.tick,
          text:`et ${b.name} s'évitent — trop épuisés`});
        continue;
      }
      // Traumatisé ne contre-attaque pas les 3 premiers ticks
      const aPanic = a._mentalState==='traumatized'&&(state.tick-a._mentalStateTick)<3;
      const bPanic = b._mentalState==='traumatized'&&(state.tick-b._mentalStateTick)<3;
      if (aPanic) { a.x=clamp(a.x+away(b,a).dx*a._eff.speed,0,WORLD-1); a.y=clamp(a.y+away(b,a).dy*a._eff.speed,0,WORLD-1); continue; }
      if (bPanic) { b.x=clamp(b.x+away(a,b).dx*b._eff.speed,0,WORLD-1); b.y=clamp(b.y+away(a,b).dy*b._eff.speed,0,WORLD-1); continue; }
      // Désengagement survivor
      if (a.archetype==='survivor'&&a.hp/a.maxHp>0.4&&Math.random()<0.42) {
        a.x=clamp(a.x+away(b,a).dx*a._eff.speed,0,WORLD-1); a.y=clamp(a.y+away(b,a).dy*a._eff.speed,0,WORLD-1); continue;
      }
      if (b.archetype==='survivor'&&b.hp/b.maxHp>0.4&&Math.random()<0.42) {
        b.x=clamp(b.x+away(a,b).dx*b._eff.speed,0,WORLD-1); b.y=clamp(b.y+away(a,b).dy*b._eff.speed,0,WORLD-1); continue;
      }
      const sA=a._eff, sB=b._eff;
      const bA=a._mentalState==='berserk'?4:a.archetype==='berserker'?2:0;
      const bB=b._mentalState==='berserk'?4:b.archetype==='berserker'?2:0;
      const dA=Math.random()<sA.instinct*0.04, dB=Math.random()<sB.instinct*0.04;
      const rA=dA?0:Math.max(1,sA.strength+bA-Math.floor(sB.defense*.5)+rng(0,4));
      const rB=dB?0:Math.max(1,sB.strength+bB-Math.floor(sA.defense*.5)+rng(0,4));
      const tA=Math.max(1,rB-Math.floor(sA.endurance*.3));
      const tB=Math.max(1,rA-Math.floor(sB.endurance*.3));
      a.hp-=tA; b.hp-=tB;
      a.simStats.dmgTaken+=tA; b.simStats.dmgTaken+=tB;
      a.simStats.dmgDealt+=tB; b.simStats.dmgDealt+=tA;
      a._combatTicks=(a._combatTicks||0)+1; b._combatTicks=(b._combatTicks||0)+1;
      if (tA>0&&a._memory) a._memory.lastAttackerId=b.id;
      if (tB>0&&b._memory) b._memory.lastAttackerId=a.id;
      state.matchStats.totalCombats++;
      // Poison (hunter/survivor) et saignement (berserker) au toucher
      if (!dA&&tB>0&&a.archetype==='hunter'&&Math.random()<0.25&&!b.statusEffects?.some(se=>se.type==='poison'))
        b.statusEffects.push({type:'poison',ticks:8,srcId:a.id});
      if (!dB&&tA>0&&b.archetype==='hunter'&&Math.random()<0.25&&!a.statusEffects?.some(se=>se.type==='poison'))
        a.statusEffects.push({type:'poison',ticks:8,srcId:b.id});
      if (!dA&&tB>0&&a.archetype==='berserker'&&Math.random()<0.30&&!b.statusEffects?.some(se=>se.type==='bleed'))
        b.statusEffects.push({type:'bleed',ticks:12,srcId:a.id});
      if (!dB&&tA>0&&b.archetype==='berserker'&&Math.random()<0.30&&!a.statusEffects?.some(se=>se.type==='bleed'))
        a.statusEffects.push({type:'bleed',ticks:12,srcId:b.id});
      // Étourdissement (tank sur gros coup)
      if (!dA&&tB>=Math.floor(b.maxHp*0.22)&&a.archetype==='tank'&&Math.random()<0.20&&!b.statusEffects?.some(se=>se.type==='stun'))
        b.statusEffects.push({type:'stun',ticks:3,srcId:a.id});
      events.push({type:'combat',a:a.id,aName:a.name,b:b.id,bName:b.name,dmgA:tB,dmgB:tA,dodgeA:dA,dodgeB:dB,tick:state.tick});
      // Gros coup → berserk
      if (tA>=Math.floor(a.maxHp*0.3)&&a._mentalState==='normal'&&Math.random()<0.35) {
        a._mentalState='berserk'; a._mentalStateTick=state.tick;
        events.push({type:'narr',sub:'berserk',id:a.id,name:a.name,tick:state.tick,text:`entre en rage après un coup dévastateur !`});
      }
      if (tB>=Math.floor(b.maxHp*0.3)&&b._mentalState==='normal'&&Math.random()<0.35) {
        b._mentalState='berserk'; b._mentalStateTick=state.tick;
        events.push({type:'narr',sub:'berserk',id:b.id,name:b.name,tick:state.tick,text:`entre en rage après un coup dévastateur !`});
      }
      if (a.hp<=0) {
        b.simStats.kills++; if(b._memory)b._memory.lastAttackerId=null;
        events.push({type:'death',champion:a.id,name:a.name,killedBy:b.id,killedByName:b.name});
        // Trauma pour témoins proches
        alive.filter(x=>x.id!==a.id&&x.id!==b.id&&dist(x,a)<40&&x._mentalState==='normal').forEach(w=>{
          w._mentalState='traumatized'; w._mentalStateTick=state.tick;
          events.push({type:'narr',sub:'traumatized',id:w.id,name:w.name,tick:state.tick,
            text:`est traumatisé(e) d'avoir assisté à la mort de ${a.name}`});
        });
      }
      if (b.hp<=0) {
        a.simStats.kills++; if(a._memory)a._memory.lastAttackerId=null;
        events.push({type:'death',champion:b.id,name:b.name,killedBy:a.id,killedByName:a.name});
        alive.filter(x=>x.id!==b.id&&x.id!==a.id&&dist(x,b)<40&&x._mentalState==='normal').forEach(w=>{
          w._mentalState='traumatized'; w._mentalStateTick=state.tick;
          events.push({type:'narr',sub:'traumatized',id:w.id,name:w.name,tick:state.tick,
            text:`est traumatisé(e) d'avoir assisté à la mort de ${b.name}`});
        });
      }
    }
  }

  // Reset combat ticks si pas de combat ce tick
  fighters.forEach(c=>{ if(c._combatTicks>0 && !events.some(e=>e.type==='combat'&&(e.a===c.id||e.b===c.id))) c._combatTicks=0; });

  // Buffs tick
  alive.forEach(c=>{ delete c._eff; delete c._coldProof; c.buffs=c.buffs.map(b=>({...b,ticks:b.ticks-1})).filter(b=>b.ticks>0); });

  // Journal
  distributeToJournals(state.champions, events);

  // Merge events
  const allEvents = [...state.events, ...events].slice(-200);
  const narr = [...(state.narrative||[]), ...events.filter(e=>e.type==='narr')].slice(-60);
  state.events   = allEvents;
  state.narrative= narr;

  // Victoire
  const fin=state.champions.filter(c=>c.hp>0);
  if (fin.length<=1) {
    state.status='finished'; state.winner=fin[0]?.id??null;
    if (fin[0]) state.events.push({type:'winner',champion:fin[0].id,name:fin[0].name});
  }
  return state;
}

// ══════════════════════════════════════════════════════════════════════════
// ── UI ────────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════
const SUPPLY_LIST = [
  {type:'soin',    label:'🧪 Soin',  color:'#2ecc71'},
  {type:'force',   label:'💪 Force', color:'#e74c3c'},
  {type:'vitesse', label:'⚡ Vit.',  color:'#3498db'},
  {type:'armure',  label:'🛡 Arm.',  color:'#f39c12'},
];
const NARR_COLORS = {
  campfire:'#3d1f00', scout:'#0a1f3d', treat:'#0d2b1a', craft_start:'#2a1a0a',
  craft_ok:'#0d2a0d', craft_fail:'#2a0d0d', forage:'#0a2a12', truce:'#1a1a2e',
  betrayal:'#2a0000', alliance:'#1a1500', berserk:'#3d0000',
  traumatized:'#0d0d2a', exhausted:'#1a1a1a', cold:'#001a2a',
  fire_damage:'#2a0d00', trap_trigger:'#1a1a00', cold_snap:'#001520',
  ability:'#0d1a2a', poison:'#0d1a0d', bleed:'#2a0808', stun_end:'#1a1a1a',
};

export default function SimulateurScreen() {
  const [gamePhase, setGamePhase] = useState('config'); // 'config' | 'sim'
  const [cfg,       setCfg]       = useState({champCount:8, mapSize:'M', biome:null});
  const [sim,       setSim]       = useState(()=>createSimState());
  const [autoRun,   setAuto]      = useState(false);
  const [speed,     setSpeed]     = useState(600);
  const [selId,     setSelId]     = useState(null);
  const [tab,       setTab]       = useState('game');
  const [narrFilter,setNarrFilter]= useState(null);
  const [endOpen,   setEndOpen]   = useState(false);
  const intRef = useRef(null);

  useEffect(()=>{
    clearInterval(intRef.current);
    if (autoRun&&sim.status==='active')
      intRef.current=setInterval(()=>setSim(p=>tickSim(p)),speed);
    return ()=>clearInterval(intRef.current);
  },[autoRun,speed,sim.status]);

  // Auto-open end modal
  useEffect(()=>{ if(sim.status==='finished') setEndOpen(true); },[sim.status]);

  const startGame = useCallback((newCfg)=>{
    setCfg(newCfg);
    setSim(createSimState(newCfg));
    setAuto(false); setSelId(null); setEndOpen(false); setNarrFilter(null); setTab('game');
    setGamePhase('sim');
  },[]);

  const reset  = useCallback(()=>{ clearInterval(intRef.current); setAuto(false); setSelId(null); setEndOpen(false); setNarrFilter(null); setGamePhase('config'); },[]);
  const tick   = useCallback(()=>setSim(p=>tickSim(p)),[]);
  const turbo  = useCallback((n=10)=>{ setAuto(false); setSim(p=>{ let s=p; for(let i=0;i<n&&s.status==='active';i++)s=tickSim(s); return s; }); },[]);
  const finish = useCallback(()=>{
    setAuto(false);
    // Découpage en chunks pour ne pas freeze le JS thread
    let chunks = 0;
    const runChunk = () => {
      setSim(p => {
        let s = p;
        for (let i = 0; i < 100 && s.status === 'active'; i++) s = tickSim(s);
        return s;
      });
      chunks++;
      if (chunks < 12) setTimeout(runChunk, 0); // 12×100 = 1200 ticks max
    };
    runChunk();
  },[]);
  const drop   = useCallback(type=>setSim(p=>{ const s=JSON.parse(JSON.stringify(p)); s.map.supplies.push({id:`sup_${Date.now()}`,type,x:rng(10,290),y:rng(10,290)}); return s; }),[]);
  const cycSpd = useCallback(()=>setSpeed(s=>s===1000?600:s===600?300:s===300?100:1000),[]);

  const alive  = sim.champions.filter(c=>c.hp>0);
  const events = sim.events.slice(-20).reverse();
  const winner = sim.status==='finished' ? sim.champions.find(c=>c.id===sim.winner) : null;
  const sel    = selId ? sim.champions.find(c=>c.id===selId) : null;
  const zR     = sim.map.zone?.radius ?? ZONE_START;
  const active = sim.status==='active';
  const phase  = sim.dayPhase ?? 0;
  const timeIcon = phase>=NIGHT_START?'🌙':phase>=DUSK_START?'🌆':'☀️';

  const filteredNarr = (sim.narrative||[]).slice(-50).reverse().filter(e=>!narrFilter||e.id===narrFilter);

  if (gamePhase==='config') return <ConfigScreen onStart={startGame}/>;

  return (
    <View style={s.root}>
      {/* MAP */}
      <View style={s.map}>
        <BattleMap
          battleState={sim}
          onChampionTap={id=>setSelId(prev=>prev===id?null:id)}
        />
        {winner&&(
          <TouchableOpacity style={s.winBanner} onPress={()=>setEndOpen(true)}>
            <Text style={s.winCrown}>👑</Text>
            <Text style={s.winName}>{winner.name}</Text>
            <Text style={s.winSub}>{ARCH[winner.archetype]?.icon} VAINQUEUR · Tap pour résultats</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* STATS BAR */}
      <View style={s.statsBar}>
        <Chip val={alive.length}  lbl="Vivants" />
        <Chip val={sim.tick}      lbl="Tick" />
        <Chip val={`${zR}u`}      lbl="Zone"   color="#e74c3c" />
        <Chip val={`${timeIcon} J${Math.floor(sim.tick/DAY_LEN)+1}`} lbl="Jour" />
        <Chip val={sim.map.biome} lbl="Biome"  small />
        {sim.alliances.length>0&&<Chip val={`🤝${sim.alliances.length}`} lbl="Alliances" color="#e2b96f"/>}
      </View>

      {/* TABS */}
      <View style={s.tabs}>
        {['game','story'].map(t=>(
          <TouchableOpacity key={t} style={[s.tab,tab===t&&s.tabActive]} onPress={()=>setTab(t)}>
            <Text style={[s.tabTxt,tab===t&&s.tabTxtActive]}>
              {t==='game'?'⚔️ COMBAT':'📰 FIL DU MATCH'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab==='game' ? (
        <>
          {/* STRIP CHAMPIONS */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={s.strip} contentContainerStyle={s.stripInner}>
            {sim.champions.map(c=>{
              const m  = ARCH[c.archetype]||{};
              const act= c._activity?.type;
              const ms = c._mentalState;
              const msIco = ms==='berserk'?'😡':ms==='exhausted'?'😴':ms==='traumatized'?'😨':'';
              const seIco = (c.statusEffects||[]).map(se=>se.type==='poison'?'☠️':se.type==='bleed'?'🩸':'💫').join('');
              const inAl = sim.alliances.some(al=>al.ids.includes(c.id));
              return (
                <TouchableOpacity key={c.id}
                  style={[s.card,!c.hp&&s.cardDead,selId===c.id&&{borderColor:c.color,borderWidth:2}]}
                  onPress={()=>setSelId(selId===c.id?null:c.id)}>
                  <View style={[s.dot,{backgroundColor:c.hp?c.color:'#333'}]}/>
                  <Text style={[s.cName,!c.hp&&{color:'#333'}]} numberOfLines={1}>{m.icon} {c.name}</Text>
                  {c.hp>0?(
                    <>
                      <View style={s.hpT}>
                        <View style={[s.hpF,{width:`${Math.round(c.hp/c.maxHp*100)}%`,
                          backgroundColor:c.hp/c.maxHp>.6?'#2ecc71':c.hp/c.maxHp>.3?'#f39c12':'#e74c3c'}]}/>
                      </View>
                      <Text style={s.cKills}>
                        {c.simStats?.kills??0}💀{msIco}{seIco}{inAl?' 🤝':''}{act&&act!=='idle'?` ${actIcon(act)}`:''}</Text>
                    </>
                  ):<Text style={s.cDead}>☠</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* CONTRÔLES */}
          <View style={s.ctrl}>
            <Btn label="⏭ Tick"  onPress={tick}   gold disabled={!active}/>
            <Btn label={autoRun?'⏸ Pause':'▶ Auto'} onPress={()=>setAuto(a=>!a)} color={autoRun?'#c0392b':'#27ae60'} disabled={!active}/>
            <Btn label="⏩ ×10"  onPress={()=>turbo(10)} color="#8e44ad" disabled={!active}/>
            <Btn label="⏭ Fin"  onPress={finish}  color="#d35400" disabled={!active}/>
            <Btn label={`${speed}ms`} onPress={cycSpd} color="#2c3e50" flex={0.85}/>
            <Btn label="🔄" onPress={reset} color="#1a1a2e" flex={0.6}/>
          </View>

          {/* COLIS */}
          <View style={s.sup}>
            <Text style={s.supLbl}>📦 Larguer</Text>
            <View style={s.supRow}>
              {SUPPLY_LIST.map(sl=>(
                <TouchableOpacity key={sl.type} style={[s.supBtn,{borderColor:sl.color+'77'}]} onPress={()=>drop(sl.type)}>
                  <Text style={[s.supTxt,{color:sl.color}]}>{sl.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* LOG COMBAT */}
          <ScrollView style={s.log} contentContainerStyle={{padding:5}}>
            {events.length===0
              ? <Text style={s.logE}>Lance la sim avec ▶ Auto ou ⏭ Tick</Text>
              : events.map((e,i)=><EvLine key={i} e={e}/>)
            }
          </ScrollView>
        </>
      ) : (
        /* FIL DU MATCH */
        <>
          {/* Filtre par champion */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={s.filterRow} contentContainerStyle={s.filterInner}>
            <TouchableOpacity style={[s.filterChip,!narrFilter&&s.filterActive]} onPress={()=>setNarrFilter(null)}>
              <Text style={[s.filterTxt,!narrFilter&&s.filterActiveTxt]}>Tous</Text>
            </TouchableOpacity>
            {sim.champions.map(c=>(
              <TouchableOpacity key={c.id}
                style={[s.filterChip,narrFilter===c.id&&{backgroundColor:c.color+'33',borderColor:c.color}]}
                onPress={()=>setNarrFilter(narrFilter===c.id?null:c.id)}>
                <View style={[s.fDot,{backgroundColor:c.hp?c.color:'#444'}]}/>
                <Text style={[s.filterTxt,narrFilter===c.id&&{color:c.color}]}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <ScrollView style={s.story} contentContainerStyle={{padding:10}}>
            {filteredNarr.length===0
              ? <Text style={s.storyE}>
                  {narrFilter ? 'Aucun événement pour ce champion.' : 'Les événements narratifs apparaîtront ici...'}
                </Text>
              : filteredNarr.map((e,i)=><NarrCard key={i} e={e} champs={sim.champions}/>)
            }
          </ScrollView>
        </>
      )}

      {/* MODAL CHAMPION */}
      {sel&&(
        <Modal transparent animationType="slide" onRequestClose={()=>setSelId(null)}>
          <Pressable style={s.mb} onPress={()=>setSelId(null)}>
            <Pressable style={s.mx} onPress={()=>{}}>
              {/* Modèle 3D — monté seulement quand modal ouverte */}
              <ChampionModel
                key={sel.id}
                name={sel.name}
                archetype={sel.archetype}
                isDead={sel.hp<=0}
                color={sel.color}
              />
              <View style={s.mh}>
                <View style={[s.md,{backgroundColor:sel.color}]}/>
                <View style={{flex:1}}>
                  <Text style={s.mn}>{sel.name}</Text>
                  <Text style={[s.ma,{color:sel.color}]}>{ARCH[sel.archetype]?.icon} {ARCH[sel.archetype]?.label}</Text>
                  {sel._mentalState&&sel._mentalState!=='normal'&&(
                    <Text style={s.mst}>{sel._mentalState==='berserk'?'😡 EN RAGE':sel._mentalState==='exhausted'?'😴 ÉPUISÉ':'😨 TRAUMATISÉ'}</Text>
                  )}
                </View>
                <Text style={[s.mhp,{color:sel.hp/sel.maxHp>.5?'#2ecc71':'#e74c3c'}]}>{Math.max(0,sel.hp)}/{sel.maxHp}</Text>
              </View>

              {/* Alliance */}
              {sim.alliances.filter(al=>al.ids.includes(sel.id)).map((al,i)=>{
                const ally=sim.champions.find(c=>c.id===al.ids.find(id=>id!==sel.id));
                return ally?(
                  <View key={i} style={s.alBadge}>
                    <Text style={s.alTxt}>🤝 Allié : {ally.name} ({al.ids[1]===sel.id?'':'reste '}{al.duration-(sim.tick-al.formedTick)} ticks)</Text>
                  </View>
                ):null;
              })}

              {/* Stats */}
              <Text style={s.ms}>STATISTIQUES</Text>
              {Object.entries(sel.stats).map(([k,v])=>(
                <View key={k} style={s.sr}>
                  <Text style={s.sl}>{STAT_LBL[k]}</Text>
                  <View style={s.st}><View style={[s.sb,{width:`${v/10*100}%`}]}/></View>
                  <Text style={s.sv}>{v}</Text>
                </View>
              ))}
              {sel.buffs.length>0&&<>
                <Text style={s.ms}>BUFFS ACTIFS</Text>
                {sel.buffs.filter(b=>b.stat!=='_camo').map((b,i)=><Text key={i} style={s.bl}>✨ {b.value>0?'+':''}{b.value} {b.stat} ({b.ticks}t)</Text>)}
                {sel.buffs.some(b=>b.special==='camo')&&<Text style={s.bl}>🫥 Camouflage actif</Text>}
              </>}
              {(sel.statusEffects||[]).length>0&&<>
                <Text style={s.ms}>EFFETS DE STATUT</Text>
                {sel.statusEffects.map((se,i)=>(
                  <Text key={i} style={[s.bl,{color:se.type==='poison'?'#2ecc71':se.type==='bleed'?'#e74c3c':'#f39c12'}]}>
                    {se.type==='poison'?'☠️ Empoisonné':se.type==='bleed'?'🩸 Saignement':'💫 Étourdi'} ({se.ticks}t)
                  </Text>
                ))}
              </>}
              {ARCH_ABILITIES[sel.archetype]&&<>
                <Text style={s.ms}>CAPACITÉ SPÉCIALE</Text>
                <View style={s.ablRow}>
                  <Text style={s.ablIco}>{ARCH_ABILITIES[sel.archetype].icon}</Text>
                  <View style={{flex:1}}>
                    <Text style={s.ablName}>{ARCH_ABILITIES[sel.archetype].name}</Text>
                    <Text style={s.ablCd}>Cooldown : {ARCH_ABILITIES[sel.archetype].cooldown} ticks · Dernier usage : {sel._abilityCooldown>0?`tick ${sel._abilityCooldown}`:'jamais'}</Text>
                  </View>
                </View>
              </>}

              {/* Journal */}
              {(sel._journal||[]).length>0&&<>
                <Text style={s.ms}>JOURNAL PERSONNEL</Text>
                {(sel._journal||[]).map((j,i)=>(
                  <View key={i} style={s.jRow}>
                    <Text style={s.jTick}>{tickLabel(j.tick||0)}</Text>
                    <Text style={s.jTxt}>{j.text}</Text>
                  </View>
                ))}
              </>}

              {/* Combat stats */}
              <Text style={s.ms}>COMBAT</Text>
              <View style={s.cr}>
                <CC l="Kills"   v={sel.simStats?.kills??0}          c="#e74c3c"/>
                <CC l="Dégâts"  v={sel.simStats?.dmgDealt??0}       c="#f39c12"/>
                <CC l="Crafts"  v={sel.simStats?.crafts??0}         c="#1abc9c"/>
                <CC l="Survie"  v={sel.simStats?.survivedTicks??0}  c="#3498db"/>
              </View>
              <TouchableOpacity style={s.mc} onPress={()=>setSelId(null)}>
                <Text style={s.mct}>Fermer</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* MODAL RÉSULTATS */}
      {endOpen&&winner&&(
        <Modal transparent animationType="fade" onRequestClose={()=>setEndOpen(false)}>
          <View style={s.endBg}>
            <ScrollView style={s.endBox} contentContainerStyle={{padding:20}}>
              {/* Vainqueur */}
              <Text style={s.eCrown}>👑</Text>
              <Text style={s.eWinName}>{winner.name}</Text>
              <Text style={[s.eWinArch,{color:winner.color}]}>{ARCH[winner.archetype]?.icon} {ARCH[winner.archetype]?.label?.toUpperCase()}</Text>
              <Text style={s.eQuote}>"{(ARCH_QUOTES[winner.archetype]||['…'])[Math.floor(Math.random()*(ARCH_QUOTES[winner.archetype]?.length||1))]}"</Text>
              <Text style={s.eDuration}>Partie terminée en {sim.tick} ticks · Jour {Math.floor(sim.tick/DAY_LEN)+1}</Text>

              {/* Awards */}
              <AwardRow sim={sim} />

              {/* Classement */}
              <Text style={s.eHead}>CLASSEMENT</Text>
              {[...sim.champions]
                .sort((a,b)=>a.id===sim.winner?-1:b.id===sim.winner?1:b.simStats.kills-a.simStats.kills||b.simStats.survivedTicks-a.simStats.survivedTicks)
                .map((c,i)=>(
                  <View key={c.id} style={[s.eRow,i===0&&{backgroundColor:'#1a1208'}]}>
                    <Text style={s.eRank}>{i===0?'👑':i===1?'🥈':i===2?'🥉':`${i+1}`}</Text>
                    <View style={[s.eDot,{backgroundColor:c.color}]}/>
                    <Text style={s.eName} numberOfLines={1}>{c.name}</Text>
                    <Text style={s.eStat}>{c.simStats.kills}💀</Text>
                    <Text style={s.eStat}>{c.simStats.dmgDealt}⚔️</Text>
                    <Text style={s.eStat}>{c.simStats.survivedTicks}t</Text>
                  </View>
                ))
              }

              {/* Stats match */}
              <Text style={s.eHead}>STATISTIQUES DE PARTIE</Text>
              <View style={s.eStats}>
                <MS l="Combats"    v={sim.matchStats.totalCombats}/>
                <MS l="Crafts"     v={sim.matchStats.totalCrafts}/>
                <MS l="Morts zone" v={sim.matchStats.zoneDeaths}/>
                <MS l="Alliances"  v={sim.matchStats.alliancesFormed}/>
                <MS l="Trahisons"  v={sim.matchStats.betrayals}/>
              </View>

              <View style={s.eBtns}>
                <TouchableOpacity style={[s.eBtn,{backgroundColor:'#1a1a2e'}]} onPress={()=>setEndOpen(false)}>
                  <Text style={s.eBtnTxt}>Voir la carte</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.eBtn,{backgroundColor:'#e2b96f'}]} onPress={reset}>
                  <Text style={[s.eBtnTxt,{color:'#0d0d1a'}]}>🔄 Rejouer</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </Modal>
      )}
    </View>
  );
}

// ── Sous-composants ───────────────────────────────────────────────────────
function actIcon(t) { return {campfire:'🔥',crafting:'⚒️',foraging:'🍃',idle:''}[t]||''; }

function EvLine({e}) {
  let icon='',txt='',big=false;
  switch(e.type){
    case 'death':        icon='💀';big=true; txt=e.killedBy==='zone'?`${e.name} périt hors zone`:`${e.name} tué par ${e.killedByName}`; break;
    case 'combat':       icon='⚔️'; txt=`${e.aName}(−${e.dmgB}) vs ${e.bName}(−${e.dmgA})`+(e.dodgeA?' 🌀':'')+(e.dodgeB?' 🌀':''); break;
    case 'collect':      icon='📦'; txt=`${e.name} → ${e.supply}`; break;
    case 'heal':         icon='💚'; txt=`${e.name} +${e.amount} PV`; break;
    case 'zone':         icon='🔴'; txt=`Zone → rayon ${e.radius}`; break;
    case 'zone_damage':  icon='🔥'; txt=`${e.name} brûle (−${e.damage})`; break;
    case 'winner':       icon='👑';big=true; txt=`${e.name} GAGNE !`; break;
    case 'event':        icon='⚠️'; txt=e.text; big=true; break;
    default: return null;
  }
  return <Text style={[s.el,big&&s.eb]}>{icon} {txt}</Text>;
}

function NarrCard({e,champs}) {
  const c   = champs.find(x=>x.id===e.id);
  const col = c?.color||'#888';
  const sub = e.sub||'';
  const icon= {campfire:'🔥',scout:'👁️',treat:'💊',craft_start:'⚒️',craft_ok:'✅',
               craft_fail:'❌',forage:'🍃',truce:'🤝',trap_trigger:'🪤',cold:'🥶',
               betrayal:'🗡️',alliance:'🤝',berserk:'😡',traumatized:'😨',
               exhausted:'😴',fire_damage:'🔥',cold_snap:'❄️',
               ability:'⚡',poison:'☠️',bleed:'🩸',stun_end:'💫'}[sub]||'📌';
  const bg  = NARR_COLORS[sub]||'#111122';
  const ts  = e.tick!=null ? tickLabel(e.tick) : '—';
  return (
    <View style={[s.nc,{borderLeftColor:col,backgroundColor:bg}]}>
      <View style={s.nHeader}>
        <View style={[s.nDot,{backgroundColor:col}]}/>
        <Text style={[s.nName,{color:col}]}>{c?.name||e.name}</Text>
        <Text style={s.nTick}>{ts}</Text>
      </View>
      <Text style={s.nTxt}>{icon} {e.text}</Text>
    </View>
  );
}

function AwardRow({sim}) {
  const champs = sim.champions;
  const bestCrafter = champs.reduce((p,c)=>(c.simStats.crafts||0)>(p.simStats.crafts||0)?c:p);
  const mosAgg      = champs.reduce((p,c)=>(c.simStats.dmgDealt||0)>(p.simStats.dmgDealt||0)?c:p);
  const survivor2   = champs.filter(c=>c.id!==sim.winner).sort((a,b)=>b.simStats.survivedTicks-a.simStats.survivedTicks)[0];
  return (
    <View style={s.awards}>
      {bestCrafter.simStats.crafts>0&&<AwardBadge icon="⚒️" lbl="Artisan"   name={bestCrafter.name} col={bestCrafter.color}/>}
      {mosAgg.simStats.dmgDealt>0&&   <AwardBadge icon="⚔️" lbl="Agresseur" name={mosAgg.name}      col={mosAgg.color}/>}
      {survivor2&&                    <AwardBadge icon="🌿" lbl="Survivant"  name={survivor2.name}   col={survivor2.color}/>}
    </View>
  );
}
function AwardBadge({icon,lbl,name,col}) {
  return (
    <View style={[s.award,{borderColor:col+'55'}]}>
      <Text style={s.awIco}>{icon}</Text>
      <Text style={[s.awName,{color:col}]} numberOfLines={1}>{name}</Text>
      <Text style={s.awLbl}>{lbl}</Text>
    </View>
  );
}

function Chip({val,lbl,color,small}) {
  return (
    <View style={s.chip}>
      <Text style={[s.cv,color&&{color},small&&{fontSize:9}]}>{val}</Text>
      <Text style={s.cl}>{lbl}</Text>
    </View>
  );
}
function Btn({label,onPress,color,gold,disabled,flex=1}) {
  return (
    <TouchableOpacity style={[s.btn,{backgroundColor:gold?'#e2b96f':color||'#333',flex},disabled&&s.boff]} onPress={onPress} disabled={disabled}>
      <Text style={[s.bt,gold&&{color:'#0d0d1a'}]}>{label}</Text>
    </TouchableOpacity>
  );
}
function CC({l,v,c}) {
  return <View style={s.cc}><Text style={[s.ccv,{color:c}]}>{v}</Text><Text style={s.ccl}>{l}</Text></View>;
}
function MS({l,v}) {
  return (
    <View style={s.msRow}>
      <Text style={s.msL}>{l}</Text>
      <Text style={s.msV}>{v}</Text>
    </View>
  );
}

// ── Config Screen ─────────────────────────────────────────────────────────
const BIOMES = [null,'forêt','désert','toundra','marais','montagne'];
const BIOME_ICONS = {null:'🎲','forêt':'🌲','désert':'🏜️','toundra':'❄️','marais':'🌿','montagne':'⛰️'};

function ConfigScreen({onStart}) {
  const [count,    setCount]  = useState(8);
  const [mapSize,  setMapSz]  = useState('M');
  const [biome,    setBiome]  = useState(null);
  const [names,    setNames]  = useState([...CHAMP_NAMES.slice(0,8)]);
  const [editIdx,  setEditIdx]= useState(null);
  const [editVal,  setEditVal]= useState('');

  // Sync names array when count changes
  const changeCount = v => {
    setCount(v);
    setNames(prev => {
      const next=[...prev];
      while(next.length<v) next.push(CHAMP_NAMES[next.length]||`Tribut${next.length+1}`);
      return next.slice(0,v);
    });
  };

  const launch = () => onStart({champCount:count, mapSize, biome, champNames:names});

  return (
    <ScrollView style={cs.root} contentContainerStyle={cs.scroll}>
      <Text style={cs.title}>⚔️ HUNGER GAME</Text>
      <Text style={cs.sub}>CONFIGUREZ VOTRE PARTIE</Text>

      {/* Nombre de champions */}
      <Text style={cs.sec}>NOMBRE DE TRIBUTS</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={cs.optRow}
        contentContainerStyle={cs.optInner}>
        {[4,6,8,10,12,16,20,24].map(n=>(
          <TouchableOpacity key={n} style={[cs.opt,count===n&&cs.optSel]} onPress={()=>changeCount(n)}>
            <Text style={[cs.optTxt,count===n&&cs.optSelTxt]}>{n}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Taille de la carte */}
      <Text style={cs.sec}>TAILLE DE LA CARTE</Text>
      <View style={cs.row3}>
        {[['S','Petite','Rapide & brutal'],['M','Moyenne','Équilibrée'],['L','Grande','Stratégique']].map(([v,l,d])=>(
          <TouchableOpacity key={v} style={[cs.card3,mapSize===v&&cs.card3Sel]} onPress={()=>setMapSz(v)}>
            <Text style={[cs.card3L,mapSize===v&&cs.card3SelTxt]}>{v}</Text>
            <Text style={[cs.card3N,mapSize===v&&cs.card3SelTxt]}>{l}</Text>
            <Text style={cs.card3D}>{d}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Biome */}
      <Text style={cs.sec}>BIOME <Text style={cs.secSub}>(🎲 = aléatoire)</Text></Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={cs.optRow}
        contentContainerStyle={cs.optInner}>
        {BIOMES.map(b=>(
          <TouchableOpacity key={String(b)} style={[cs.biome,biome===b&&cs.biomeSel]} onPress={()=>setBiome(b)}>
            <Text style={cs.biomeIco}>{BIOME_ICONS[b]}</Text>
            <Text style={[cs.biomeTxt,biome===b&&cs.biomeSelTxt]}>{b||'Aléatoire'}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Noms des champions */}
      <Text style={cs.sec}>NOMS DES TRIBUTS</Text>
      <View style={cs.nameGrid}>
        {names.map((n,i)=>(
          editIdx===i ? (
            <View key={i} style={cs.nameEditRow}>
              <TextInput style={cs.nameInput} value={editVal} onChangeText={setEditVal}
                autoFocus maxLength={14} onSubmitEditing={()=>{
                  const next=[...names]; next[i]=editVal.trim()||n; setNames(next); setEditIdx(null);
                }} onBlur={()=>{
                  const next=[...names]; next[i]=editVal.trim()||n; setNames(next); setEditIdx(null);
                }}/>
            </View>
          ) : (
            <TouchableOpacity key={i} style={[cs.nameChip,{borderColor:CHAMP_COLORS[i%CHAMP_COLORS.length]+'55'}]}
              onPress={()=>{setEditIdx(i);setEditVal(n);}}>
              <View style={[cs.nameDot,{backgroundColor:CHAMP_COLORS[i%CHAMP_COLORS.length]}]}/>
              <Text style={cs.nameTxt}>{n}</Text>
              <Text style={cs.nameEdit}>✎</Text>
            </TouchableOpacity>
          )
        ))}
      </View>

      <TouchableOpacity style={cs.launch} onPress={launch}>
        <Text style={cs.launchTxt}>⚔️  LANCER LA PARTIE  ⚔️</Text>
        <Text style={cs.launchSub}>{count} tributs · Carte {mapSize} · {biome||'Biome aléatoire'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:{flex:1,backgroundColor:'#0d0d1a'},
  map:{flex:1,minHeight:240,position:'relative'},
  winBanner:{position:'absolute',top:0,left:0,right:0,bottom:0,alignItems:'center',
    justifyContent:'center',backgroundColor:'#0d0d1acc'},
  winCrown:{fontSize:50},
  winName:{color:'#e2b96f',fontSize:24,fontWeight:'bold',marginTop:6},
  winSub:{color:'#a08040',fontSize:10,letterSpacing:3,marginTop:4},

  statsBar:{flexDirection:'row',backgroundColor:'#111122',paddingVertical:5,paddingHorizontal:6,gap:4},
  chip:{flex:1,alignItems:'center',backgroundColor:'#1a1a2e',borderRadius:7,paddingVertical:4,borderWidth:1,borderColor:'#2a2a4a'},
  cv:{color:'#e2b96f',fontSize:10,fontWeight:'bold'}, cl:{color:'#444',fontSize:7,marginTop:1},

  tabs:{flexDirection:'row',backgroundColor:'#0a0a14',borderBottomWidth:1,borderColor:'#1a1a2e'},
  tab:{flex:1,paddingVertical:7,alignItems:'center'},
  tabActive:{borderBottomWidth:2,borderBottomColor:'#e2b96f'},
  tabTxt:{color:'#444',fontSize:10,fontWeight:'bold'},
  tabTxtActive:{color:'#e2b96f'},

  strip:{backgroundColor:'#0a0a14',maxHeight:70},
  stripInner:{padding:5,gap:5,flexDirection:'row',alignItems:'center'},
  card:{backgroundColor:'#1a1a2e',borderRadius:8,padding:5,width:72,alignItems:'center',borderWidth:1,borderColor:'#2a2a4a'},
  cardDead:{opacity:0.3},
  dot:{width:9,height:9,borderRadius:5,marginBottom:2},
  cName:{color:'#ccc',fontSize:8,fontWeight:'bold',marginBottom:2,textAlign:'center'},
  hpT:{width:'100%',height:4,backgroundColor:'#111',borderRadius:2},
  hpF:{height:4,borderRadius:2},
  cKills:{color:'#555',fontSize:8,marginTop:2},
  cDead:{color:'#444',fontSize:14},

  ctrl:{flexDirection:'row',gap:4,padding:5,backgroundColor:'#0a0a14'},
  btn:{borderRadius:7,paddingVertical:8,alignItems:'center',justifyContent:'center',flex:1},
  bt:{color:'#fff',fontWeight:'bold',fontSize:10},
  boff:{opacity:0.28},

  sup:{backgroundColor:'#111122',paddingHorizontal:6,paddingVertical:4},
  supLbl:{color:'#333',fontSize:8,marginBottom:3},
  supRow:{flexDirection:'row',gap:4},
  supBtn:{flex:1,backgroundColor:'#1a1a2e',borderRadius:6,paddingVertical:5,alignItems:'center',borderWidth:1},
  supTxt:{fontSize:10,fontWeight:'bold'},

  log:{maxHeight:80,backgroundColor:'#07070f'},
  el:{color:'#4a5568',fontSize:10,marginBottom:2,paddingHorizontal:5},
  eb:{color:'#e2b96f',fontWeight:'bold'},
  logE:{color:'#222',fontSize:11,textAlign:'center',paddingVertical:8},

  // Fil du match
  filterRow:{backgroundColor:'#0a0a14',maxHeight:36},
  filterInner:{paddingHorizontal:8,paddingVertical:5,gap:5,flexDirection:'row',alignItems:'center'},
  filterChip:{flexDirection:'row',alignItems:'center',backgroundColor:'#1a1a2e',borderRadius:12,
    paddingHorizontal:8,paddingVertical:3,borderWidth:1,borderColor:'#2a2a4a',gap:4},
  filterActive:{backgroundColor:'#1a1500',borderColor:'#e2b96f'},
  filterTxt:{color:'#666',fontSize:10,fontWeight:'bold'},
  filterActiveTxt:{color:'#e2b96f'},
  fDot:{width:6,height:6,borderRadius:3},

  story:{flex:1,backgroundColor:'#07070f'},
  storyE:{color:'#333',fontSize:12,textAlign:'center',paddingTop:20},
  nc:{borderRadius:8,padding:10,marginBottom:6,borderLeftWidth:3},
  nHeader:{flexDirection:'row',alignItems:'center',marginBottom:4,gap:6},
  nDot:{width:8,height:8,borderRadius:4},
  nName:{fontWeight:'bold',fontSize:11,flex:1},
  nTick:{color:'#666',fontSize:8},
  nTxt:{color:'#8899aa',fontSize:11,lineHeight:16},

  // Modal champion
  mb:{flex:1,backgroundColor:'#000000aa',justifyContent:'flex-end'},
  mx:{backgroundColor:'#111122',borderTopLeftRadius:20,borderTopRightRadius:20,
    padding:16,borderWidth:1,borderColor:'#2a2a4a',maxHeight:'90%'},
  mh:{flexDirection:'row',alignItems:'center',marginBottom:10,gap:10},
  md:{width:13,height:13,borderRadius:7},
  mn:{color:'#fff',fontSize:16,fontWeight:'bold'},
  ma:{fontSize:11,marginTop:2},
  mst:{fontSize:10,marginTop:2,color:'#ff8800'},
  mhp:{fontSize:13,fontWeight:'bold'},
  ms:{color:'#333',fontSize:9,letterSpacing:2,marginTop:10,marginBottom:5},
  sr:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:4},
  sl:{color:'#777',fontSize:11,width:95},
  st:{flex:1,height:5,backgroundColor:'#1a1a2e',borderRadius:3},
  sb:{height:5,backgroundColor:'#e2b96f',borderRadius:3},
  sv:{color:'#e2b96f',fontSize:12,fontWeight:'bold',width:20,textAlign:'right'},
  bl:{color:'#9b59b6',fontSize:11,marginBottom:2},
  cr:{flexDirection:'row',gap:6,marginTop:4},
  cc:{flex:1,backgroundColor:'#1a1a2e',borderRadius:8,padding:8,alignItems:'center'},
  ccv:{fontSize:16,fontWeight:'bold'}, ccl:{color:'#444',fontSize:8,marginTop:2},
  alBadge:{backgroundColor:'#1a1500',borderRadius:8,padding:8,marginBottom:6,borderWidth:1,borderColor:'#e2b96f33'},
  alTxt:{color:'#e2b96f',fontSize:11},
  jRow:{backgroundColor:'#0a0a14',borderRadius:6,padding:8,marginBottom:4},
  jTick:{color:'#444',fontSize:8,marginBottom:2},
  jTxt:{color:'#7a8899',fontSize:11},
  mc:{marginTop:12,backgroundColor:'#1a1a2e',borderRadius:8,paddingVertical:12,
    alignItems:'center',borderWidth:1,borderColor:'#2a2a4a'},
  mct:{color:'#666',fontSize:14},

  // Modal résultats
  endBg:{flex:1,backgroundColor:'#0d0d1af0',justifyContent:'center'},
  endBox:{backgroundColor:'#111122',margin:10,borderRadius:16,borderWidth:1,borderColor:'#2a2a4a'},
  eCrown:{fontSize:56,textAlign:'center'},
  eWinName:{color:'#e2b96f',fontSize:28,fontWeight:'bold',textAlign:'center',marginTop:4},
  eWinArch:{fontSize:13,letterSpacing:3,textAlign:'center',marginTop:4},
  eQuote:{color:'#666',fontStyle:'italic',fontSize:12,textAlign:'center',marginTop:8,marginHorizontal:10},
  eDuration:{color:'#444',fontSize:10,textAlign:'center',marginTop:6,marginBottom:10},
  awards:{flexDirection:'row',gap:8,justifyContent:'center',marginBottom:12},
  award:{backgroundColor:'#1a1a2e',borderRadius:10,padding:8,alignItems:'center',flex:1,borderWidth:1},
  awIco:{fontSize:18},
  awName:{color:'#e2b96f',fontSize:11,fontWeight:'bold',marginTop:2},
  awLbl:{color:'#444',fontSize:8,marginTop:1},
  eHead:{color:'#333',fontSize:9,letterSpacing:2,marginTop:12,marginBottom:6},
  eRow:{flexDirection:'row',alignItems:'center',backgroundColor:'#1a1a2e',
    borderRadius:8,padding:8,marginBottom:4,gap:8},
  eRank:{fontSize:14,width:24,textAlign:'center'},
  eDot:{width:10,height:10,borderRadius:5},
  eName:{color:'#ccc',fontSize:12,fontWeight:'bold',flex:1},
  eStat:{color:'#666',fontSize:10,width:44,textAlign:'right'},
  eStats:{backgroundColor:'#1a1a2e',borderRadius:10,padding:10,marginTop:4},
  msRow:{flexDirection:'row',justifyContent:'space-between',paddingVertical:4,
    borderBottomWidth:1,borderColor:'#1a1a2e'},
  msL:{color:'#666',fontSize:11},
  msV:{color:'#e2b96f',fontSize:11,fontWeight:'bold'},
  eBtns:{flexDirection:'row',gap:10,marginTop:16},
  eBtn:{flex:1,borderRadius:10,paddingVertical:13,alignItems:'center'},
  eBtnTxt:{fontWeight:'bold',fontSize:14,color:'#fff'},
  // Ability row in modal
  ablRow:{flexDirection:'row',alignItems:'center',backgroundColor:'#0d1a2a',borderRadius:8,
    padding:8,gap:8,borderWidth:1,borderColor:'#1a3a5a'},
  ablIco:{fontSize:22},
  ablName:{color:'#74b9ff',fontSize:13,fontWeight:'bold'},
  ablCd:{color:'#444',fontSize:9,marginTop:2},
});

// ── Config screen styles ──────────────────────────────────────────────────
const cs = StyleSheet.create({
  root:{flex:1,backgroundColor:'#0d0d1a'},
  scroll:{padding:18,paddingBottom:40},
  title:{color:'#e2b96f',fontSize:28,fontWeight:'bold',textAlign:'center',marginTop:16,letterSpacing:4},
  sub:{color:'#444',fontSize:10,letterSpacing:3,textAlign:'center',marginBottom:20},
  sec:{color:'#555',fontSize:9,letterSpacing:3,marginBottom:8,marginTop:16},
  secSub:{color:'#333',fontWeight:'normal'},

  // Count picker
  optRow:{maxHeight:46},
  optInner:{gap:8,paddingHorizontal:2,alignItems:'center'},
  opt:{backgroundColor:'#1a1a2e',borderRadius:8,paddingHorizontal:14,paddingVertical:10,
    borderWidth:1,borderColor:'#2a2a4a'},
  optSel:{backgroundColor:'#e2b96f',borderColor:'#e2b96f'},
  optTxt:{color:'#888',fontSize:13,fontWeight:'bold'},
  optSelTxt:{color:'#0d0d1a'},

  // Map size
  row3:{flexDirection:'row',gap:8},
  card3:{flex:1,backgroundColor:'#1a1a2e',borderRadius:10,padding:10,alignItems:'center',
    borderWidth:1,borderColor:'#2a2a4a'},
  card3Sel:{backgroundColor:'#1a1500',borderColor:'#e2b96f'},
  card3L:{color:'#888',fontSize:22,fontWeight:'bold'},
  card3N:{color:'#666',fontSize:11,marginTop:2},
  card3D:{color:'#333',fontSize:8,marginTop:4,textAlign:'center'},
  card3SelTxt:{color:'#e2b96f'},

  // Biome
  biome:{backgroundColor:'#1a1a2e',borderRadius:10,padding:8,alignItems:'center',marginRight:8,
    borderWidth:1,borderColor:'#2a2a4a',minWidth:72},
  biomeSel:{backgroundColor:'#0d1f0d',borderColor:'#2ecc71'},
  biomeIco:{fontSize:22},
  biomeTxt:{color:'#555',fontSize:9,marginTop:4},
  biomeSelTxt:{color:'#2ecc71'},

  // Names
  nameGrid:{flexDirection:'row',flexWrap:'wrap',gap:6},
  nameChip:{flexDirection:'row',alignItems:'center',backgroundColor:'#1a1a2e',
    borderRadius:8,paddingHorizontal:8,paddingVertical:6,borderWidth:1,gap:5,
    minWidth:'47%'},
  nameDot:{width:8,height:8,borderRadius:4},
  nameTxt:{color:'#ccc',fontSize:12,flex:1},
  nameEdit:{color:'#333',fontSize:11},
  nameEditRow:{minWidth:'47%'},
  nameInput:{backgroundColor:'#1a1a2e',borderRadius:8,paddingHorizontal:10,paddingVertical:6,
    color:'#e2b96f',fontSize:12,borderWidth:1,borderColor:'#e2b96f55'},

  // Launch
  launch:{backgroundColor:'#e2b96f',borderRadius:14,paddingVertical:16,alignItems:'center',marginTop:28},
  launchTxt:{color:'#0d0d1a',fontWeight:'bold',fontSize:15,letterSpacing:2},
  launchSub:{color:'#0d0d1a99',fontSize:10,marginTop:4},
});
