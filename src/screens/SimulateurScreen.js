import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Modal, Pressable, TextInput,
} from 'react-native';
import BattleMap from '../components/BattleMap';
import ChampionModel from '../components/ChampionModel';

// ── Constantes monde ──────────────────────────────────────────────────────
const WORLD        = 900;          // ×3 — île plus grande
const ISLAND_EDGE  = 84;           // bords = eau
const WATER_DMG    = 3;
const COMBAT_RANGE = 27;           // référence (combat utilise portées arme)
const DAY_LEN      = 80;           // vrai cycle jour/nuit
const NIGHT_START  = 60;
const DUSK_START   = 50;
const DAWN_START   = 8;
const EVENT_COOLDOWN   = 40;
const ALLIANCE_EVERY   = 30;
const MENTAL_DURATIONS = { berserk:12, exhausted:20, traumatized:15 };

// ── Système de survie — lent et progressif ────────────────────────────────
const HUNGER_DRAIN  = 0.28;  // /tick → ~0 en 360 ticks ≈ 9 min à 1500ms
const THIRST_DRAIN  = 0.42;  // /tick → ~0 en 240 ticks ≈ 6 min
const HUNGER_DMG    = 1;     // HP/tick quand faim=0
const THIRST_DMG    = 2;     // HP/tick quand soif=0
const TEMP_DMG      = 2;     // HP/tick température extrême
const HP_REGEN_RATE = 0.4;   // HP passif/tick quand bien nourri + reposé
const WOUND_TICKS   = 30;    // durée d'une blessure (malus speed)

// ── Fatigue ───────────────────────────────────────────────────────────────
const FATIGUE_COMBAT     = 7;    // +fatigue par tick de combat
const FATIGUE_SPRINT     = 0.3;  // +fatigue par tick de mouvement
const FATIGUE_REST_CAMP  = 5;    // -fatigue par tick en camp
const FATIGUE_REST_IDLE  = 1;    // -fatigue par tick immobile
const FATIGUE_THRESHOLD  = 65;   // seuil pour chercher repos
const FATIGUE_PENALTY    = 80;   // seuil pénalité stats

// ── Armes médiévales — portées ×3, dégâts ÷3 ─────────────────────────────
const WEAPON_DEFS = {
  fists:  { name:'Poings',   meleeRange:27,  rangedRange:0,   dmgMin:1, dmgMax:2,  def:0 },
  sword:  { name:'Épée',     meleeRange:32,  rangedRange:0,   dmgMin:2, dmgMax:5,  def:1 },
  spear:  { name:'Lance',    meleeRange:54,  rangedRange:0,   dmgMin:2, dmgMax:4,  def:0 },
  bow:    { name:'Arc',      meleeRange:27,  rangedRange:150, dmgMin:2, dmgMax:5,  def:0 },
  shield: { name:'Bouclier', meleeRange:27,  rangedRange:0,   dmgMin:1, dmgMax:2,  def:6 },
};
const WEAPON_LOOT = ['sword','spear','bow','shield'];

// ── Faune — portées ×3 ────────────────────────────────────────────────────
const FAUNA_DEFS = {
  deer:   { maxHp:50,  speed:6, dmg:0,  food:55, water:12, aggressive:false, fearRange:42,  label:'Cerf'     },
  wolf:   { maxHp:70,  speed:7, dmg:5,  food:30, water:5,  aggressive:true,  attackRange:30, label:'Loup'    },
  rabbit: { maxHp:12,  speed:9, dmg:0,  food:18, water:5,  aggressive:false, fearRange:60,  label:'Lapin'    },
  boar:   { maxHp:90,  speed:5, dmg:8,  food:60, water:10, aggressive:true,  attackRange:36, label:'Sanglier' },
};

// ── Flore ─────────────────────────────────────────────────────────────────
const FLORA_DEFS = {
  berries:     { food:32,  water:10, heal:0,  poisonChance:0,    label:'Baies'          },
  herbs:       { food:5,   water:0,  heal:28, poisonChance:0,    label:'Herbes'         },
  mushroom:    { food:22,  water:0,  heal:0,  poisonChance:0.35, label:'Champignon'     },
  waterSource: { food:0,   water:60, heal:0,  poisonChance:0,    label:'Source d\'eau'  },
  poisonPlant: { food:0,   water:0,  heal:0,  poisonChance:1.0,  label:'Plante toxique' },
};

// ── POIs — coordonnées ×3 + nouveaux POIs pour grande map ────────────────
const BASE_POIS = [
  { id:'cornucopia', name:'Cornucopia',     icon:'⚡', x:450, y:450, radius:54,  effect:'loot'    },
  { id:'caves',      name:'Grottes',        icon:'🌑', x:165, y:180, radius:66,  effect:'shelter' },
  { id:'ruins',      name:'Ruines',         icon:'🏚', x:705, y:255, radius:54,  effect:'craft'   },
  { id:'river',      name:'Rivière',        icon:'🌊', x:315, y:570, radius:48,  effect:'water'   },
  { id:'watchtower', name:'Tour de guet',   icon:'🗼', x:765, y:645, radius:36,  effect:'vision'  },
  { id:'forest',     name:'Forêt Dense',    icon:'🌲', x:195, y:705, radius:84,  effect:'cover'   },
  { id:'village',    name:'Village',        icon:'🏘', x:555, y:810, radius:60,  effect:'loot'    },
  { id:'marsh',      name:'Marécage',       icon:'💧', x:120, y:450, radius:70,  effect:'water'   },
  { id:'highland',   name:'Hauteurs',       icon:'⛰', x:750, y:180, radius:45,  effect:'vision'  },
  { id:'oldcamp',    name:'Vieux Camp',     icon:'🏕', x:450, y:750, radius:55,  effect:'shelter' },
  { id:'hotspring',  name:'Source Chaude',  icon:'♨️', x:680, y:500, radius:40,  effect:'water'   },
  { id:'deadforest', name:'Bois Mort',      icon:'🌵', x:250, y:350, radius:75,  effect:'cover'   },
];

// ── Craft ─────────────────────────────────────────────────────────────────
const CRAFT_RECIPES = [
  // ── Tier 1 ────────────────────────────────────────────────────────────
  { id:'crude_weapon', name:'Arme grossière',    icon:'🪓', tier:1, requiredEffect:'craft',
    duration:10, successStats:{instinct:0.35,survival:0.20,strength:0.15},
    onSuccess:{stat:'strength',value:3,ticks:40,giveItem:'crude_weapon'}, failMsg:'La lame se brise avant d\'être terminée.' },
  { id:'crude_armor',  name:'Armure de fortune', icon:'🛡', tier:1, requiredEffect:'craft',
    duration:12, successStats:{instinct:0.25,survival:0.25,endurance:0.20},
    onSuccess:{stat:'defense',value:4,ticks:40,giveItem:'crude_armor'},  failMsg:'Les sangles lâchent — armure inutilisable.' },
  { id:'herbal_remedy',name:'Remède naturel',    icon:'🍃', tier:1, requiredEffect:['water','cover'],
    duration:8,  successStats:{survival:0.45,instinct:0.20},
    onSuccess:{heal:80,giveItem:'herbal_remedy'}, failMsg:'Les herbes récoltées sont les mauvaises.' },
  { id:'trap',         name:'Piège',             icon:'🪤', tier:1, requiredEffect:'cover',
    duration:8,  successStats:{instinct:0.40,survival:0.25},
    onSuccess:{placeTrap:true,giveItem:'trap_kit'}, failMsg:'Le piège s\'effondre avant d\'être posé.' },
  { id:'torch',        name:'Torche',            icon:'🔦', tier:1, requiredEffect:['cover','shelter'],
    duration:5,  successStats:{survival:0.35,instinct:0.15},
    onSuccess:{giveItem:'torch'}, failMsg:'Le bois est trop humide.' },
  { id:'ration',       name:'Ration sèche',      icon:'🍖', tier:1, requiredEffect:['cover','shelter'],
    duration:6,  successStats:{survival:0.50,instinct:0.15},
    onSuccess:{giveItem:'ration'}, failMsg:'Les provisions moisissent avant d\'être prêtes.' },
  // ── Tier 2 (nécessitent un objet tier 1 dans l'inventaire) ───────────
  { id:'refined_weapon', name:'Arme affinée',    icon:'⚔️', tier:2, requires:'crude_weapon', requiredEffect:'craft',
    duration:12, successStats:{instinct:0.45,strength:0.35,survival:0.10},
    onSuccess:{stat:'strength',value:5,ticks:60,removeItem:'crude_weapon'}, failMsg:'L\'affûtage fend la lame en deux.' },
  { id:'iron_armor',     name:'Armure de fer',   icon:'🛡️', tier:2, requires:'crude_armor', requiredEffect:'craft',
    duration:14, successStats:{defense:0.50,endurance:0.25,strength:0.10},
    onSuccess:{stat:'defense',value:6,ticks:70,removeItem:'crude_armor'}, failMsg:'Les plaques restent mal ajustées.' },
  { id:'antidote',       name:'Antidote',        icon:'🧪', tier:2, requires:'herbal_remedy', requiredEffect:['water','cover'],
    duration:10, successStats:{survival:0.65,instinct:0.20},
    onSuccess:{heal:60,clearPoison:true,removeItem:'herbal_remedy'}, failMsg:'Le mélange est inefficace.' },
  { id:'explosive_trap', name:'Piège explosif',  icon:'💣', tier:2, requires:'trap_kit', requiredEffect:'cover',
    duration:12, successStats:{instinct:0.55,survival:0.25},
    onSuccess:{placeBoostedTrap:true,removeItem:'trap_kit'}, failMsg:'L\'explosif rate son amorçage.' },
  { id:'healing_salve',  name:'Baume cicatrisant',icon:'💊',tier:2, requires:'herbal_remedy', requiredEffect:['cover','shelter','water'],
    duration:8, successStats:{survival:0.70,instinct:0.15},
    onSuccess:{heal:130,removeItem:'herbal_remedy'}, failMsg:'Le baume se décompose trop vite.' },
];

// ── Météo dynamique ──────────────────────────────────────────────────────
const WEATHER_TYPES = {
  clear:    { label:'Dégagé',     icon:'☀️', tempMod:  0,  thirstMod:1.0, hungerMod:1.0, speedPct:1.0, visionMod:1.0, dmg:0, duration:[40,80] },
  rain:     { label:'Pluie',       icon:'🌧', tempMod:-10,  thirstMod:0.6, hungerMod:1.0, speedPct:0.88,visionMod:0.9, dmg:0, duration:[20,45] },
  storm:    { label:'Orage',       icon:'⛈', tempMod:-18,  thirstMod:0.5, hungerMod:1.0, speedPct:0.72,visionMod:0.7, dmg:2, duration:[12,25] },
  snowfall: { label:'Neige',       icon:'❄️', tempMod:-25,  thirstMod:0.7, hungerMod:1.3, speedPct:0.76,visionMod:0.85,dmg:0, duration:[15,35] },
  heatwave: { label:'Canicule',    icon:'🔥', tempMod:+22,  thirstMod:1.9, hungerMod:1.2, speedPct:0.90,visionMod:1.0, dmg:0, duration:[15,28] },
  fog:      { label:'Brouillard',  icon:'🌫', tempMod:  0,  thirstMod:1.0, hungerMod:1.0, speedPct:1.0, visionMod:0.5, dmg:0, duration:[10,22] },
};
const WEATHER_BIOME_POOL = {
  'forêt':    ['clear','clear','rain','rain','storm','fog'],
  'désert':   ['clear','clear','clear','heatwave','heatwave','storm'],
  'toundra':  ['clear','snowfall','snowfall','storm','fog'],
  'marais':   ['rain','rain','fog','fog','storm','clear'],
  'montagne': ['clear','snowfall','storm','fog','clear'],
};

// ── Traits de personnalité (style Project Zomboid) ────────────────────────
// type: 'pos' = vert, 'neg' = rouge, 'neu' = ambre
// statMod: modifs permanentes aux stats à la création
// hpMod: modif permanente du HP max
// cost: coût en points de build (pos = négatif, neg = positif ~½ de l'inverse)
const BASE_TRAIT_POINTS = 2; // budget de départ — doit finir à 0
const TRAITS = {
  // ── Positifs (coûtent des points) ───────────────────────────────────
  athlete:       { label:'Athlète',          icon:'🏃', type:'pos', cost:-3, statMod:{speed:+1,endurance:+1} },
  strong:        { label:'Costaud',          icon:'💪', type:'pos', cost:-4, statMod:{strength:+2}, hpMod:+30 },
  fast_healer:   { label:'Guérison rapide',  icon:'🩹', type:'pos', cost:-3 },
  eagle_eye:     { label:'Œil de faucon',    icon:'🦅', type:'pos', cost:-2, statMod:{instinct:+1} },
  forager:       { label:'Cueilleur',        icon:'🌿', type:'pos', cost:-2, statMod:{survival:+1} },
  light_eater:   { label:'Petit appétit',    icon:'🥗', type:'pos', cost:-2 },
  hydrated:      { label:'Économe en eau',   icon:'💧', type:'pos', cost:-2 },
  night_owl:     { label:'Nocturne',         icon:'🦉', type:'pos', cost:-3 },
  lucky:         { label:'Chanceux',         icon:'🍀', type:'pos', cost:-4 },
  honorable:     { label:'Honorable',        icon:'⚜️', type:'pos', cost:-1 },
  // ── Négatifs (redonnent des points — ~moitié de l'inverse) ──────────
  anxious:       { label:'Anxieux',          icon:'😰', type:'neg', cost:+1 },
  heavy_eater:   { label:'Gros mangeur',     icon:'🍖', type:'neg', cost:+1 },
  thirsty_trait: { label:'Assoiffé',         icon:'🫗', type:'neg', cost:+1 },
  lazy:          { label:'Paresseux',        icon:'😴', type:'neg', cost:+1 },
  fragile:       { label:'Fragile',          icon:'🦴', type:'neg', cost:+2, hpMod:-50 },
  slow_trait:    { label:'Lent',             icon:'🐌', type:'neg', cost:+2, statMod:{speed:-2} },
  shortsighted:  { label:'Myope',            icon:'👓', type:'neg', cost:+1 },
  hemophiliac:   { label:'Hémophile',        icon:'🩸', type:'neg', cost:+2 },
  impulsive:     { label:'Impulsif',         icon:'😤', type:'neg', cost:+2 },
  cold_sensitive:{ label:'Frileux',          icon:'🥶', type:'neg', cost:+1 },
  // ── Ambivalents (avantage ET inconvénient) ──────────────────────────
  paranoid:      { label:'Paranoïaque',      icon:'👁', type:'neu', cost: 0 },
  loner:         { label:'Solitaire',        icon:'🌑', type:'neu', cost: 0 },
  bloodthirsty:  { label:'Sanguinaire',      icon:'💀', type:'neu', cost:-1 },
  protector:     { label:'Protecteur',       icon:'🫂', type:'neu', cost: 0 },
  gladiator:     { label:'Gladiateur',       icon:'🗡', type:'neu', cost:-1, statMod:{strength:+1,defense:-1} },
};
const TRAIT_KEYS  = Object.keys(TRAITS);
const TRAIT_INCOMPAT = [
  ['bloodthirsty','impulsive'],['bloodthirsty','anxious'],
  ['slow_trait','athlete'],['light_eater','heavy_eater'],
  ['hydrated','thirsty_trait'],['loner','protector'],
  ['honorable','bloodthirsty'],['night_owl','shortsighted'],
];
// Points restants dans le budget de build (doit finir à 0)
function traitsRemainingPoints(selected) {
  return BASE_TRAIT_POINTS + selected.reduce((s,t)=>s+(TRAITS[t]?.cost||0),0);
}

// ── Progression XP / Niveaux ──────────────────────────────────────────────
const XP_PER_TICK  = 0.3;   // gain passif par tick de survie
const XP_PER_KILL  = 20;
const XP_PER_CRAFT = 8;
const XP_PER_HUNT  = 5;
const XP_PER_FLORA = 2;
const XP_PER_CAMP  = 0.5;   // bonus en camp par tick
const XP_LEVELS    = [0, 50, 120, 220, 350, 500]; // seuils levels 1→5
const LEVELUP_STATS = {
  berserker:   ['strength','endurance','strength','endurance'],
  hunter:      ['instinct','speed','instinct','speed'],
  survivor:    ['survival','endurance','survival','instinct'],
  opportunist: ['instinct','speed','instinct','survival'],
  tank:        ['defense','endurance','defense','strength'],
  soldier:     ['strength','defense','instinct','endurance'],
};

// ── Déplétion des POIs ────────────────────────────────────────────────────
const POI_DEPLETION = {
  water:   { maxUses: 30, recovery: 60, label:'asséchée'   },
  loot:    { maxUses: 15, recovery: 80, label:'épuisée'    },
  craft:   { maxUses: 25, recovery: 50, label:'pillée'     },
  cover:   { maxUses: 40, recovery: 40, label:'dévastée'   },
  shelter: { maxUses: 60, recovery:100, label:'surpeuplée' },
};

// ── Consignes preset ──────────────────────────────────────────────────────
const INSTRUCTION_PRESETS = [
  { key:'agressif',    label:'⚔️ Agressif',   instr:'agressif combat attaque' },
  { key:'furtif',      label:'👁 Furtif',      instr:'fuit évite cache discret' },
  { key:'survie',      label:'🌿 Survie',      instr:'survie nourriture ressource' },
  { key:'exploration', label:'🗺 Exploration', instr:'explor bouger découv' },
  { key:'camp',        label:'🏕 Camp',        instr:'repos camp calme' },
  { key:'chasse',      label:'🎯 Chasse',      instr:'chasse traque proie' },
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
  berserker:{ name:'Charge',        icon:'💥', cooldown:18,
    use(c,alive,state,ev){ const en=alive.filter(e=>e.id!==c.id&&e.hp>0); if(!en.length)return false;
      const t=en.reduce((p,e)=>dist(e,c)<dist(p,c)?e:p);
      const d=Math.max(6,c._eff.strength+rng(3,8)); t.hp-=d; t.simStats.dmgTaken+=d; c.simStats.dmgDealt+=d;
      c.x=t.x; c.y=t.y;
      ev.push({type:'narr',sub:'ability',id:c.id,name:c.name,tick:state.tick,
        text:`se précipite sur ${t.name} avec une Charge ! (−${d} PV)`});
      if(t.hp<=0){c.simStats.kills++;ev.push({type:'death',champion:t.id,name:t.name,killedBy:c.id,killedByName:c.name});}
      return true; }
  },
  hunter:{ name:'Piège Éclair', icon:'🪤', cooldown:15,
    use(c,alive,state,ev){ state.map.traps.push({id:`trap_ab_${state.tick}`,x:c.x,y:c.y,ownerId:c.id});
      ev.push({type:'narr',sub:'ability',id:c.id,name:c.name,tick:state.tick,
        text:`pose instantanément un piège à sa position`}); return true; }
  },
  opportunist:{ name:'Camouflage', icon:'🫥', cooldown:20,
    use(c,alive,state,ev){ c.buffs.push({stat:'_camo',value:1,ticks:8,special:'camo'});
      ev.push({type:'narr',sub:'ability',id:c.id,name:c.name,tick:state.tick,
        text:`disparaît dans les ombres — Camouflage actif (8 ticks)`}); return true; }
  },
  survivor:{ name:'Premiers Soins', icon:'💊', cooldown:16,
    use(c,alive,state,ev){ if(c.hp>=c.maxHp*0.85)return false;
      const h=60+Math.floor((c._eff||c.stats).survival*5); c.hp=Math.min(c.maxHp,c.hp+h);
      ev.push({type:'narr',sub:'ability',id:c.id,name:c.name,tick:state.tick,
        text:`applique des Premiers Soins d'urgence (+${h} PV)`}); return true; }
  },
  tank:{ name:'Fortifier', icon:'🛡️', cooldown:18,
    use(c,alive,state,ev){ c.buffs.push({stat:'defense',value:6,ticks:12});
      ev.push({type:'narr',sub:'ability',id:c.id,name:c.name,tick:state.tick,
        text:`adopte une posture Fortifiée (+6 déf, 12 ticks)`}); return true; }
  },
  soldier:{ name:'Tactique', icon:'🎯', cooldown:15,
    use(c,alive,state,ev){ const en=alive.filter(e=>e.id!==c.id&&e.hp>0); if(!en.length)return false;
      const t=en.reduce((p,e)=>dist(e,c)<dist(p,c)?e:p);
      t.buffs.push({stat:'strength',value:-2,ticks:10},{stat:'speed',value:-1,ticks:10});
      ev.push({type:'narr',sub:'ability',id:c.id,name:c.name,tick:state.tick,
        text:`applique Tactique sur ${t.name} (−2 str, −1 spd, 10t)`}); return true; }
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────
const rng   = (a,b) => a + Math.floor(Math.random()*(b-a+1));
const noise = (amp) => Math.floor(Math.random()*amp*2 - amp);
const dist  = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
const sign  = v => v>0?1:v<0?-1:0;
const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));

function timeOfDay(phase) {
  if (phase >= NIGHT_START)  return '🌙 Nuit';
  if (phase >= DUSK_START)   return '🌆 Crépuscule';
  if (phase >= DAWN_START)   return '☀️ Jour';
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
  // Vérifier prérequis items tier 2
  if (recipe.requires && !(champ.items||[]).includes(recipe.requires)) return 0;
  const s  = champ.stats;
  let   p  = 0.20;
  Object.entries(recipe.successStats).forEach(([stat,weight])=>{
    p += (s[stat]||0)/10 * weight * 0.8;
  });
  const req  = Array.isArray(recipe.requiredEffect) ? recipe.requiredEffect : [recipe.requiredEffect];
  const near = BASE_POIS.find(poi => req.includes(poi.effect) && dist(champ,poi)<poi.radius*1.5);
  if (near) p += 0.25;
  if ((champ.traits||[]).includes('lucky')) p += 0.20;
  return Math.min(0.95, p);
}

// ── Helpers traits / progression ─────────────────────────────────────────
// Génère aléatoirement des traits dont le coût total équilibre le budget à 0
// (style Project Zomboid : positifs coûtent, négatifs ~½ remboursent)
function pickTraits() {
  const isIncompat = (key, selected) =>
    TRAIT_INCOMPAT.some(pair => pair.includes(key) && selected.some(e => pair.includes(e)));

  for (let attempt = 0; attempt < 300; attempt++) {
    // Mélange aléatoire de tous les traits
    const shuffled = [...TRAIT_KEYS].sort(() => Math.random() - 0.5);
    const result = [];

    for (const key of shuffled) {
      if (result.length >= 4) break;
      if (isIncompat(key, result)) continue;
      // Vérifier que le budget ne passe pas en négatif
      const tentativePts = BASE_TRAIT_POINTS +
        [...result, key].reduce((s,t)=>s+(TRAITS[t].cost||0), 0);
      if (tentativePts < 0) continue;
      result.push(key);
      if (tentativePts === 0) break; // budget équilibré !
    }

    if (traitsRemainingPoints(result) === 0 && result.length > 0) return result;
  }

  // Fallback garanti : eagle_eye seul → 2 + (-2) = 0
  return ['eagle_eye'];
}

function levelUpChamp(c, tick, events) {
  const lvl     = c.level;
  const statArr = LEVELUP_STATS[c.archetype] || ['strength','endurance','speed','instinct'];
  const stat    = statArr[Math.min(lvl-2, statArr.length-1)];
  c.stats[stat] = Math.min(10, (c.stats[stat]||3) + 1);
  c.maxHp      += 20;
  c.hp          = Math.min(c.maxHp, c.hp + 20);
  c.morale      = Math.min(100, (c.morale||80) + 20);
  events.push({type:'narr',sub:'levelup',id:c.id,name:c.name,tick,
    text:`atteint le niveau ${lvl} ! (+1 ${STAT_LBL[stat]||stat}, +20 PV max) ⭐`});
}

function checkLevelUp(c, tick, events) {
  while (c.level < 5 && (c.xp||0) >= XP_LEVELS[c.level]) {
    c.level++;
    levelUpChamp(c, tick, events);
  }
}

// ── Make champion ─────────────────────────────────────────────────────────
function makeChamp(id, name, colorIdx, spawnRange=[200,700], forcedTraits=null) {
  const [sMin,sMax]=spawnRange;
  const stats = {
    strength:rng(3,8), speed:rng(3,8), defense:rng(2,6),
    endurance:rng(3,7), instinct:rng(2,7), survival:rng(2,7),
  };
  const traits = forcedTraits && forcedTraits.length > 0 ? forcedTraits : pickTraits();
  // Appliquer les modificateurs de stats des traits à la création
  traits.forEach(t => {
    const def = TRAITS[t];
    if (def?.statMod) Object.entries(def.statMod).forEach(([st,v])=>{
      if (stats[st]!==undefined) stats[st] = clamp(stats[st]+v, 1, 10);
    });
  });
  const endurance = stats.endurance || 3;
  let maxHp = 300 + endurance * 30;   // ×3 — parties longues
  traits.forEach(t => { if(TRAITS[t]?.hpMod) maxHp += TRAITS[t].hpMod; });
  maxHp = Math.max(150, maxHp);
  return {
    id, name, colorIdx,
    color: CHAMP_COLORS[colorIdx%CHAMP_COLORS.length],
    x:rng(sMin,sMax), y:rng(sMin,sMax),
    hp:maxHp, maxHp,
    hunger:100, thirst:100, temperature:50,
    fatigue:0,              // 0-100 : épuisement
    morale:80,              // 0-100 : moral
    reputation:0,           // nb de kills (provoque la peur chez les autres)
    weapon:'fists',
    stats,
    archetype: getArch(stats),
    buffs:[], items:[], statusEffects:[],
    simStats:{ kills:0, dmgDealt:0, dmgTaken:0, crafts:0, survivedTicks:0 },
    _memory:{ targetId:null, targetTicks:0, lastAttackerId:null, lastHealTick:-99 },
    _fear:   {},            // { champId: expiryTick } — peur apprise
    _grudge: {},            // { champId: intensity } — rancune
    _pursuitCooldown: 0,    // tick jusqu'auquel cet ennemi n'est pas pourchassé
    _approachTick: 0,       // tick de début de phase d'approche
    traits,
    level:    1,
    xp:       0,
    instructions: null,
    _activity:{ type:'idle', startTick:0, craftId:null },
    _mentalState:'normal', _mentalStateTick:0,
    _combatTicks:0, _journal:[], _lastNarrTick:-99,
    _abilityCooldown:0,
    sponsorUsername:'simulateur',
  };
}

// ── État initial ──────────────────────────────────────────────────────────
const MAP_SIZES = {
  S:{ spawn:[200, 700] },
  M:{ spawn:[150, 750] },
  L:{ spawn:[100, 800] },
};

function generateFauna(count) {
  const types = Object.keys(FAUNA_DEFS);
  return Array.from({length:count}, (_,i) => {
    const t = types[rng(0,types.length-1)];
    const d = FAUNA_DEFS[t];
    return {
      id:`fauna_${i}`, type:t, label:d.label,
      x:rng(ISLAND_EDGE+10, WORLD-ISLAND_EDGE-10),
      y:rng(ISLAND_EDGE+10, WORLD-ISLAND_EDGE-10),
      hp:d.maxHp, maxHp:d.maxHp,
      _fleeTick:0,
    };
  });
}

function generateFlora(biome, count) {
  const types = Object.keys(FLORA_DEFS);
  // biome weighting
  const biomeWeights = {
    'forêt':    ['berries','herbs','mushroom','waterSource'],
    'désert':   ['poisonPlant','herbs','waterSource'],
    'toundra':  ['herbs','mushroom','berries'],
    'marais':   ['mushroom','poisonPlant','waterSource','herbs'],
    'montagne': ['berries','herbs','mushroom'],
  };
  const pool = biomeWeights[biome] || types;
  return Array.from({length:count}, (_,i) => {
    const t = pool[rng(0,pool.length-1)];
    const d = FLORA_DEFS[t];
    return {
      id:`flora_${i}`, type:t, label:d.label,
      x:rng(ISLAND_EDGE+5, WORLD-ISLAND_EDGE-5),
      y:rng(ISLAND_EDGE+5, WORLD-ISLAND_EDGE-5),
      collected:false,
      respawnTick: -1,
    };
  });
}

function generateObstacles(biome, seed) {
  // Zones de terrain difficile (ralentissent / blessent)
  const rngO = (min,max) => min + Math.abs(Math.sin(seed*13.7+min+max)*99999%1) * (max-min) | 0;
  const defs = {
    'forêt':    [{type:'swamp',  label:'Marécage', color:'#2a4020', dmg:0.5, slowPct:0.7}],
    'désert':   [{type:'lava',   label:'Sable brûlant',color:'#8b2500',dmg:1,  slowPct:0.85}],
    'toundra':  [{type:'ice',    label:'Glace fine',  color:'#8ab4cc',dmg:0.3,slowPct:0.65}],
    'marais':   [{type:'swamp',  label:'Marécage',    color:'#2a4020',dmg:0.8,slowPct:0.6},
                 {type:'quicksand',label:'Sables mouvants',color:'#6b5530',dmg:1.2,slowPct:0.55}],
    'montagne': [{type:'lava',   label:'Lave',        color:'#cc3300',dmg:2,  slowPct:0.9}],
  };
  const pool = defs[biome] || defs['forêt'];
  const result = [];
  const nb = 3 + rngO(0,4);
  for (let i=0; i<nb; i++) {
    const def = pool[i%pool.length];
    result.push({
      id:`obs_${i}`, ...def,
      x: rngO(ISLAND_EDGE+60, WORLD-ISLAND_EDGE-60),
      y: rngO(ISLAND_EDGE+60, WORLD-ISLAND_EDGE-60),
      radius: rngO(30, 70),
    });
  }
  return result;
}

function createSimState(cfg={}) {
  const count      = clamp(cfg.champCount||8, 4, 24);
  const names      = (cfg.champNames||CHAMP_NAMES).slice(0,count);
  const sizeCfg    = MAP_SIZES[cfg.mapSize||'M'];
  const biome      = cfg.biome||['forêt','désert','toundra','marais','montagne'][rng(0,4)];
  const hasCornuco = cfg.cornucopia !== false; // activé par défaut
  const mapSeed    = Date.now() % 999983;

  // Champions : spawn centre si cornucopia, sinon carte entière
  const cornRange = [380, 520];
  const champs    = names.map((n,i)=>makeChamp(`sim_${i}`,n,i,
    hasCornuco ? cornRange : sizeCfg.spawn,
    cfg.champBuilds?.[i]?.traits || null));

  const faunaCount = 22 + count * 2;
  const floraCount = 40 + count * 3;

  // Loots de la cornucopia + loots dispersés
  const cornuLoots = hasCornuco ? Array.from({length:Math.min(count,12)},(_,i)=>({
    id:`corn_${i}`,
    x: 450 + rng(-60, 60),
    y: 450 + rng(-60, 60),
    type:['sword','spear','bow','shield','soin','soin','armure','festin','force','vitesse'][i%10],
    _dropTick: 0,
  })) : [];

  const scatterLoots = Array.from({length:6+count},(_,i)=>({
    id:`loot_${i}`,
    x:rng(ISLAND_EDGE+30, WORLD-ISLAND_EDGE-30),
    y:rng(ISLAND_EDGE+30, WORLD-ISLAND_EDGE-30),
    type:['sword','spear','bow','shield','soin','soin','armure','festin'][i%8],
    _dropTick: hasCornuco ? 20 + i * 3 : i * 4, // loot dispersé apparaît après cornucopia
  }));

  return {
    id:'sim_local', tick:0, status:'active', winner:null,
    events:[], narrative:[],
    dayPhase:0, alliances:[], activeEvent:null,
    lastEventTick:0,
    simPhase: hasCornuco ? 'cornucopia' : 'main',
    weather: 'clear', weatherTick: 0,
    sponsorPts: 15, // points sponsor disponibles
    matchStats:{ totalCombats:0, totalCrafts:0, waterDeaths:0, alliancesFormed:0, betrayals:0 },
    map:{
      biome,
      width:WORLD, height:WORLD,
      mapSeed,
      pois:BASE_POIS.map(p=>({...p, _uses:0, _depleted:false})),
      loots:[...cornuLoots, ...scatterLoots],
      supplies:[], traps:[],
      fauna:    generateFauna(faunaCount),
      flora:    generateFlora(biome, floraCount),
      obstacles:generateObstacles(biome, mapSeed),
    },
    champions:champs,
  };
}

// ── IA — nuage de probabilités ────────────────────────────────────────────
const toward = (t,c) => ({dx:sign(t.x-c.x)||noise(1), dy:sign(t.y-c.y)||noise(1)});
const away   = (t,c) => ({dx:sign(c.x-t.x)||noise(1), dy:sign(c.y-t.y)||noise(1)});

function aiMove(c, alive, _zone, supplies, pois, isNight, alliances, activeEvent, fauna, flora, tick) {
  const enemies = alive.filter(e=>e.id!==c.id&&e.hp>0);

  // Alliés : exclure des ennemis cibles
  const myAlly  = (alliances||[]).find(al=>al.ids.includes(c.id));
  const allyId  = myAlly?.ids.find(id=>id!==c.id);
  const targets = allyId ? enemies.filter(e=>e.id!==allyId) : enemies;
  const nearest = targets.length ? targets.reduce((p,e)=>dist(e,c)<dist(p,c)?e:p) : null;
  const weakest = targets.length ? targets.reduce((p,e)=>e.hp<p.hp?e:p) : null;

  const hpR      = c.hp / c.maxHp;
  const hungerR  = (c.hunger??100) / 100;
  const thirstR  = (c.thirst??100) / 100;
  const fatigueR = (c.fatigue??0) / 100;
  const morale   = (c.morale??80);

  // Ressources proches
  const nearSup   = supplies.length ? supplies.reduce((p,s)=>dist(s,c)<dist(p,c)?s:p) : null;
  const nearFauna = (fauna||[]).filter(f=>f.hp>0&&dist(f,c)<180);
  const nearFlora = (flora||[]).filter(f=>!f.collected&&dist(f,c)<120);
  const nearWater = nearFlora.find(f=>f.type==='waterSource');
  const nearFood  = nearFlora.find(f=>FLORA_DEFS[f.type]?.food>0);
  const prefPOI   = pois.find(p=>p.id===(ARCH[c.archetype]||ARCH.soldier).preferPOI);
  const shelterPOI= pois.find(p=>!p._disabled&&!p._depleted&&(p.effect==='shelter'||p.effect==='cover'));
  const waterPOI  = pois.find(p=>!p._disabled&&!p._depleted&&(p.effect==='water'));

  // Portée de détection — réduite la nuit et lors d'événements météo
  const traitDetectBonus = (c.traits||[]).includes('eagle_eye') ? 90
    : (c.traits||[]).includes('shortsighted') ? -90 : 0;
  const baseDetect = 270 + traitDetectBonus;
  const isNightOwl = (c.traits||[]).includes('night_owl');
  const detectRange = (activeEvent?.type==='fog'||activeEvent?.type==='sandstorm') ? 90
    : isNight && !isNightOwl ? 150 : baseDetect;
  const visTargets = targets.filter(e=>dist(e,c)<detectRange);

  // Ennemi le plus proche visible
  const closestEnemy = visTargets.length ? visTargets.reduce((p,e)=>dist(e,c)<dist(p,c)?e:p) : null;
  const enemyDist    = closestEnemy ? dist(closestEnemy,c) : 9999;
  const weapon       = WEAPON_DEFS[c.weapon||'fists'];

  // ── Scores d'action ───────────────────────────────────────────────────
  const scores = {
    attack_melee:   0,
    attack_ranged:  0,
    flee_enemy:     0,
    seek_food:      0,
    seek_water:     0,
    hunt_animal:    0,
    collect_supply: 0,
    explore:        0,
    seek_shelter:   0,
    rest_camp:      0,
  };

  // ── Fatigue → repos prioritaire ───────────────────────────────────────
  if (fatigueR > FATIGUE_THRESHOLD/100) {
    scores.rest_camp += Math.round(fatigueR * 10);
    scores.seek_shelter += Math.round(fatigueR * 4);
  }
  if (fatigueR > FATIGUE_PENALTY/100) {
    // Trop épuisé pour se battre efficacement
    scores.attack_melee  = 0;
    scores.attack_ranged = 0;
    scores.flee_enemy   += 4;
  }

  // ── Morale bas → comportement défensif ────────────────────────────────
  if (morale < 35) {
    scores.flee_enemy   += 3;
    scores.attack_melee  = Math.max(0, scores.attack_melee - 2);
    scores.seek_shelter += 2;
  }

  // ── Combat ────────────────────────────────────────────────────────────
  if (closestEnemy && fatigueR < FATIGUE_PENALTY/100) {
    // Peur apprise : si cet ennemi m'a déjà mis à genoux
    const fearExpiry = (c._fear||{})[closestEnemy.id];
    const isFeared   = fearExpiry && tick < fearExpiry;
    // Réputation : ennemi avec beaucoup de kills → on fuit
    const isScary    = (closestEnemy.reputation||0) >= 3;

    if (isFeared || isScary) {
      scores.flee_enemy += 5 + (isFeared?2:0) + (isScary?2:0);
    } else {
      const canMelee  = enemyDist <= weapon.meleeRange * 2.5;
      const canRanged = weapon.rangedRange > 0 && enemyDist <= weapon.rangedRange * 2.0;
      const isWeak    = (closestEnemy.hp/closestEnemy.maxHp) < 0.4;
      const iStrong   = hpR > 0.6 && morale > 50;

      if (iStrong || isWeak) {
        if (canMelee)  scores.attack_melee  += 4 + (isWeak?3:0);
        if (canRanged) scores.attack_ranged += 4 + (isWeak?2:0);
      }
      // Rancune : si cet ennemi a tué un allié → attaque prioritaire
      const grudge = (c._grudge||{})[closestEnemy.id]||0;
      if (grudge > 0) scores.attack_melee += grudge * 2;
    }

    // Fuite si blessé ou en danger
    if (hpR < 0.5)  scores.flee_enemy += Math.round((0.5-hpR)*12);
    if (hpR < 0.35) scores.flee_enemy += 5;
    if (hpR < 0.55 && enemyDist < 60) scores.flee_enemy += 2;
  }

  // ── Faim / soif ───────────────────────────────────────────────────────
  if (hungerR < 0.4) scores.seek_food  += Math.round((1-hungerR)*9);
  if (thirstR < 0.4) scores.seek_water += Math.round((1-thirstR)*11);
  if (hungerR < 0.65) scores.seek_food  += 2;
  if (thirstR < 0.65) scores.seek_water += 3;

  // ── Chasse ────────────────────────────────────────────────────────────
  if (nearFauna.length && hungerR < 0.75) {
    const prey = nearFauna.find(f=>!FAUNA_DEFS[f.type]?.aggressive);
    if (prey) scores.hunt_animal += 3 + (hungerR<0.5?4:0);
  }

  // ── Colis / arme ──────────────────────────────────────────────────────
  if (nearSup) scores.collect_supply += WEAPON_DEFS[nearSup.type] ? 6 : 3;

  // ── Nuit : tout le monde cherche un abri ──────────────────────────────
  if (isNight) {
    const hasFireOrShelter = c._activity?.type==='campfire' ||
      pois.some(p=>!p._disabled&&(p.effect==='shelter')&&dist(c,p)<p.radius*1.5);
    if (!hasFireOrShelter) {
      scores.seek_shelter += 4 + (c.stats.survival>=5 ? 2 : 0);
      scores.rest_camp    += 3;
    }
  }

  // ── Exploration ───────────────────────────────────────────────────────
  scores.explore += 1;

  // ── Modificateurs archétype ───────────────────────────────────────────
  switch(c.archetype) {
    case 'berserker':
      scores.attack_melee  = Math.round(scores.attack_melee * 1.8);
      scores.flee_enemy    = Math.round(scores.flee_enemy * 0.25);
      scores.rest_camp     = Math.round(scores.rest_camp * 0.5);
      scores.explore       += 2;
      break;
    case 'hunter':
      scores.attack_ranged = Math.round(scores.attack_ranged * 1.6);
      scores.hunt_animal   = Math.round(scores.hunt_animal   * 1.8);
      scores.flee_enemy    = Math.round(scores.flee_enemy * 1.1);
      break;
    case 'survivor':
      scores.flee_enemy    = Math.round(scores.flee_enemy * 1.6);
      scores.seek_food     = Math.round(scores.seek_food  * 1.5);
      scores.seek_water    = Math.round(scores.seek_water * 1.5);
      scores.rest_camp     = Math.round(scores.rest_camp  * 1.4);
      scores.attack_melee  = Math.round(scores.attack_melee * 0.4);
      break;
    case 'opportunist':
      scores.collect_supply = Math.round(scores.collect_supply * 1.6);
      scores.attack_melee   = closestEnemy && (closestEnemy.hp/closestEnemy.maxHp)<0.3
        ? scores.attack_melee*2 : Math.round(scores.attack_melee*0.65);
      break;
    case 'tank':
      scores.attack_melee  = Math.round(scores.attack_melee * 1.4);
      scores.flee_enemy    = Math.round(scores.flee_enemy * 0.3);
      scores.rest_camp     = Math.round(scores.rest_camp  * 0.7);
      break;
    case 'soldier':
      scores.explore += 1;
      if (c._memory?.lastAttackerId && targets.find(e=>e.id===c._memory.lastAttackerId))
        scores.attack_melee += 4;
      break;
  }

  // ── Modificateurs consigne ────────────────────────────────────────────
  const instr = (c.instructions||'').toLowerCase();
  if (instr.match(/agress|attaque|guerr|combat/)) {
    scores.attack_melee  += 4; scores.attack_ranged += 3;
    scores.flee_enemy     = Math.max(0, scores.flee_enemy-3);
    scores.rest_camp      = Math.max(0, scores.rest_camp-2);
  }
  if (instr.match(/fuit|évit|cache|discr/)) {
    scores.flee_enemy    += 4; scores.attack_melee = Math.max(0,scores.attack_melee-3);
    scores.seek_shelter  += 3;
  }
  if (instr.match(/survie|nourriture|ressource/)) {
    scores.seek_food     += 4; scores.seek_water += 3; scores.hunt_animal += 3;
    scores.rest_camp     += 2;
  }
  if (instr.match(/explor|bouger|découv/)) {
    scores.explore += 5; scores.rest_camp = Math.max(0,scores.rest_camp-2);
  }
  if (instr.match(/repos|dor|camp|calme/)) {
    scores.rest_camp += 5; scores.seek_shelter += 3;
  }
  if (instr.match(/chasse|traque|proie/)) {
    scores.hunt_animal += 5; scores.attack_ranged += 2; scores.explore += 2;
  }

  // ── Modificateurs traits ───────────────────────────────────────────────
  (c.traits||[]).forEach(t => {
    switch(t) {
      // Positifs
      case 'athlete':       scores.explore+=1; break;
      case 'forager':       scores.seek_food=Math.round(scores.seek_food*1.6); scores.seek_water=Math.round(scores.seek_water*1.4); scores.hunt_animal=Math.round(scores.hunt_animal*1.5); break;
      case 'night_owl':     if(isNight) { scores.explore+=2; scores.attack_melee+=1; } break;
      case 'lucky':         scores.collect_supply=Math.round(scores.collect_supply*1.4); break;
      case 'honorable':     break; // géré dans tryAlliance
      // Négatifs
      case 'anxious':       scores.flee_enemy=Math.round(scores.flee_enemy*1.6)+2; scores.seek_shelter+=2; scores.attack_melee=Math.round(scores.attack_melee*0.7); break;
      case 'impulsive':     scores.attack_melee=Math.round(scores.attack_melee*1.6); scores.flee_enemy=0; scores.rest_camp=Math.round(scores.rest_camp*0.3); break;
      case 'cold_sensitive':if(isNight||(c.temperature??50)<35) { scores.seek_shelter+=5; scores.rest_camp+=4; scores.attack_melee=Math.round(scores.attack_melee*0.5); } break;
      case 'heavy_eater':   if(hungerR<0.5) scores.seek_food+=3; break;
      case 'thirsty_trait': if(thirstR<0.5) scores.seek_water+=3; break;
      case 'lazy':          scores.rest_camp=Math.round(scores.rest_camp*1.5); scores.explore=Math.round(scores.explore*0.6); break;
      // Ambivalents
      case 'paranoid':      scores.flee_enemy=Math.round(scores.flee_enemy*1.5); scores.seek_shelter+=2; break; // eagle_eye bonus déjà dans detectRange
      case 'bloodthirsty':  scores.attack_melee=Math.round(scores.attack_melee*1.9); scores.attack_ranged=Math.round(scores.attack_ranged*1.5); scores.flee_enemy=0; scores.rest_camp=0; break;
      case 'gladiator':     scores.attack_melee=Math.round(scores.attack_melee*1.6); scores.attack_ranged=Math.max(0,scores.attack_ranged-2); break;
      case 'protector':
        if (allyId) {
          const allyCh=alive.find(e=>e.id===allyId);
          if (allyCh&&allyCh.hp/allyCh.maxHp<0.4) { scores.seek_shelter+=3; scores.flee_enemy+=2; }
        }
        break;
    }
  });

  // ── Tirage pondéré ────────────────────────────────────────────────────
  const entries = Object.entries(scores).filter(([,v])=>v>0);
  if (!entries.length) return {dx:noise(2),dy:noise(2)};
  const total = entries.reduce((s,[,v])=>s+v, 0);
  let pick = Math.random() * total, chosen = entries[entries.length-1][0];
  for (const [action, score] of entries) {
    pick -= score;
    if (pick <= 0) { chosen = action; break; }
  }

  // ── Exécution ─────────────────────────────────────────────────────────
  switch(chosen) {
    case 'attack_melee':
    case 'attack_ranged': {
      const t = chosen==='attack_ranged' && weakest ? weakest : (nearest||weakest);
      if (!t) return {dx:noise(2),dy:noise(2)};
      // Phase d'approche : circler légèrement avant de charger
      const d2 = dist(t,c);
      if (d2 > weapon.meleeRange * 3 && Math.random() < 0.35) {
        // Approche oblique — pas direct
        return { dx: sign(t.x-c.x)+noise(1), dy: sign(t.y-c.y)+noise(1) };
      }
      return toward(t,c);
    }
    case 'flee_enemy':
      return closestEnemy ? away(closestEnemy,c) : {dx:noise(2),dy:noise(2)};
    case 'seek_food': {
      if (nearFood) return toward(nearFood,c);
      const prey = nearFauna.find(f=>!FAUNA_DEFS[f.type]?.aggressive);
      if (prey) return toward(prey,c);
      if (nearSup && nearSup.type==='soin') return toward(nearSup,c);
      // Explorer vers une zone de forêt/couverte
      const cover = pois.find(p=>!p._disabled&&(p.effect==='cover'||p.effect==='water'));
      return cover ? toward(cover,c) : {dx:noise(2),dy:noise(2)};
    }
    case 'seek_water': {
      if (nearWater) return toward(nearWater,c);
      if (waterPOI)  return toward(waterPOI,c);
      return {dx:noise(2),dy:noise(2)};
    }
    case 'hunt_animal': {
      const prey = nearFauna.find(f=>!FAUNA_DEFS[f.type]?.aggressive&&dist(f,c)<180);
      return prey ? toward(prey,c) : {dx:noise(2),dy:noise(2)};
    }
    case 'collect_supply':
      return nearSup ? toward(nearSup,c) : {dx:noise(2),dy:noise(2)};
    case 'seek_shelter':
      return shelterPOI ? toward(shelterPOI,c) : {dx:noise(2),dy:noise(2)};
    case 'rest_camp': {
      // S'arrêter près d'un abri ou là où on est
      if (shelterPOI && dist(c,shelterPOI)>shelterPOI.radius*0.8)
        return toward(shelterPOI,c);
      return {dx:0,dy:0}; // rester sur place — allumer le feu
    }
    case 'explore':
    default:
      if (prefPOI&&!prefPOI._disabled&&dist(prefPOI,c)>90) return toward(prefPOI,c);
      return {dx:noise(2)*2, dy:noise(2)*2};
  }
}

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
      c.xp = (c.xp||0)+XP_PER_CRAFT*(recipe.tier===2?2:1);
      if (recipe.onSuccess.heal)            c.hp = Math.min(c.maxHp, c.hp+recipe.onSuccess.heal);
      if (recipe.onSuccess.stat)            c.buffs.push({stat:recipe.onSuccess.stat,value:recipe.onSuccess.value,ticks:recipe.onSuccess.ticks});
      if (recipe.onSuccess.placeTrap)       traps.push({id:`trap_${tick}_${c.id}`,x:c.x+rng(-4,4),y:c.y+rng(-4,4),ownerId:c.id,dmg:22});
      if (recipe.onSuccess.placeBoostedTrap)traps.push({id:`trap_${tick}_${c.id}`,x:c.x+rng(-4,4),y:c.y+rng(-4,4),ownerId:c.id,dmg:50,boosted:true});
      if (recipe.onSuccess.giveItem)        c.items.push(recipe.onSuccess.giveItem);
      if (recipe.onSuccess.removeItem)      c.items = (c.items||[]).filter(it=>it!==recipe.onSuccess.removeItem);
      if (recipe.onSuccess.clearPoison)     c.statusEffects = (c.statusEffects||[]).filter(se=>se.type!=='poison');
      events.push({type:'narr',sub:'craft_ok',id:c.id,name:c.name,craftId:recipe.id,tick,
        text:`réussit à fabriquer ${recipe.icon} ${recipe.name}${recipe.tier===2?' ✨ (Tier 2)':''}!`});
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
      if (dist(c,trap)<15 && !((c.traits||[]).includes('lucky')&&Math.random()<0.35)) {
        const dmg = trap.boosted ? rng(38,58) : rng(12,(trap.dmg||22));
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
    const hasHonorable = (c1.traits||[]).includes('honorable')||(c2.traits||[]).includes('honorable');
    const betrayChance = hasHonorable ? 0 :
      0.015*(elapsed/al.duration) +
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
      if ((a.traits||[]).includes('loner')||(b.traits||[]).includes('loner')) continue;
      if (dist(a,b)>135) continue;
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
      const r = ae.radius + elapsed*3;
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
        state.map.supplies.push({id:`ev_${i}_${state.tick}`,type:types[i%types.length],x:rng(250,650),y:rng(250,650)});
      events.push({type:'event',evType:'supply_rain',tick:state.tick,
        text:`📦 Les Organisateurs larguent ${count} colis en zone centrale !`});
      break;
    }
    case 'fire': {
      const p=state.map.pois.find(poi=>poi.effect==='cover')||{x:195,y:705};
      state.activeEvent={type:'fire',startTick:state.tick,duration:10,x:p.x+rng(-30,30),y:p.y+rng(-30,30),radius:54};
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
  const nearEnemy=enemies.some(e=>dist(e,c)<120);
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

// ── Météo ─────────────────────────────────────────────────────────────────
function tickWeather(state, events) {
  if (!state.weather) { state.weather='clear'; state.weatherTick=0; }
  const wDef   = WEATHER_TYPES[state.weather];
  const elapsed = state.tick - (state.weatherTick||0);
  const [minD, maxD] = wDef.duration;
  if (elapsed >= minD && (elapsed >= maxD || Math.random() < 0.025)) {
    const pool  = WEATHER_BIOME_POOL[state.map.biome] || ['clear','rain','storm'];
    const newW  = pool[Math.floor(Math.random()*pool.length)];
    if (newW !== state.weather) {
      state.weather    = newW;
      state.weatherTick= state.tick;
      const nd = WEATHER_TYPES[newW];
      events.push({type:'event',evType:'weather',tick:state.tick,
        text:`${nd.icon} Météo : ${nd.label} !`});
    }
  }
}

// ── Déplétion des POIs ────────────────────────────────────────────────────
function tickPoiDepletion(state, aliveChamps, events) {
  const pois = state.map.pois;
  // Récupération
  pois.forEach(p => {
    if (p._depleted && state.tick >= (p._recoverTick||0)) {
      p._depleted = false;
      p._uses = 0;
      events.push({type:'event',evType:'poi_recover',tick:state.tick,
        text:`🌱 ${p.name} s'est régénérée — ressources à nouveau disponibles !`});
    }
  });
  if (state.tick % 3 !== 0) return;
  // Déplétion par présence de champions
  pois.forEach(p => {
    if (p._depleted || !POI_DEPLETION[p.effect]) return;
    const lim  = POI_DEPLETION[p.effect];
    const here = aliveChamps.filter(c => dist(c, p) < p.radius).length;
    if (here > 0) {
      p._uses = (p._uses||0) + here;
      if (p._uses >= lim.maxUses) {
        p._depleted   = true;
        p._recoverTick = state.tick + lim.recovery;
        events.push({type:'event',evType:'poi_depleted',tick:state.tick,
          text:`⚠️ ${p.name} est ${lim.label} — ressources épuisées pour ${lim.recovery} ticks.`});
      }
    }
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

  // ── Phase Cornucopia → transition vers main ───────────────────────────
  if (state.simPhase === 'cornucopia' && state.tick >= 18) {
    state.simPhase = 'main';
    events.push({type:'event',evType:'cornucopia_end',tick:state.tick,
      text:`⚔️ La Cornucopia est terminée ! Les survivants fuient dans l'arène.`});
  }

  // ── Météo ─────────────────────────────────────────────────────────────
  tickWeather(state, events);
  const wDef = WEATHER_TYPES[state.weather] || WEATHER_TYPES.clear;

  // ── Sponsor regen ─────────────────────────────────────────────────────
  state.sponsorPts = Math.min(30, (state.sponsorPts||0) + 0.3);

  // Survie tick + XP passif
  alive.forEach(c => {
    c.simStats.survivedTicks++;
    c.xp = (c.xp||0) + XP_PER_TICK;
    if (c._activity?.type==='campfire') c.xp += XP_PER_CAMP;
    checkLevelUp(c, state.tick, events);
  });

  // ── Survie : faim / soif / température / fatigue ─────────────────────
  const biomeTemp = {forêt:50, désert:82, toundra:12, marais:55, montagne:18};
  alive.forEach(c=>{
    if (c.hp<=0) return;
    const hDrain = HUNGER_DRAIN * ((c.traits||[]).includes('heavy_eater')?1.7:(c.traits||[]).includes('light_eater')?0.55:1) * wDef.hungerMod;
    const tDrain = THIRST_DRAIN * ((c.traits||[]).includes('thirsty_trait')?1.7:(c.traits||[]).includes('hydrated')?0.55:1) * wDef.thirstMod;
    c.hunger = Math.max(0, (c.hunger??100) - hDrain);
    c.thirst = Math.max(0, (c.thirst??100) - tDrain);

    // Température cible selon biome + nuit + abri + météo
    const nearShelter = state.map.pois.find(p=>!p._disabled&&(p.effect==='shelter')&&dist(c,p)<p.radius*1.3);
    const hasFire     = c._activity?.type==='campfire' || c.items?.includes('torch');
    const tTarget = (biomeTemp[state.map.biome]||50) + wDef.tempMod + (isNight ? -15 : 0) + (hasFire ? 20 : 0) + (nearShelter ? 8 : 0);
    c.temperature = c.temperature==null ? 50 : c.temperature + (tTarget - c.temperature)*0.12 + noise(2);
    c.temperature = clamp(c.temperature, 0, 100);

    // Morale : baisse progressivement mais remonte si on mange/se repose
    const stormy = state.weather === 'storm';
    const moraleDecay = ((c.traits||[]).includes('anxious') ? 0.22 : 0.1) + (stormy ? 0.08 : 0);
    const moraleGain  = (c.hunger>60&&c.thirst>60 ? 0.3 : 0) + (c._activity?.type==='campfire' ? 0.5 : 0);
    c.morale = clamp((c.morale??80) - moraleDecay + moraleGain, 0, 100);

    // ── Dégâts météo directs (orage) ──────────────────────────────────
    if (wDef.dmg > 0 && !hasFire && !nearShelter && Math.random() < 0.04) {
      const wd = Math.round(wDef.dmg * rng(1,3));
      c.hp -= wd; c.simStats.dmgTaken += wd;
      if (state.tick%7===0) events.push({type:'narr',sub:'storm',id:c.id,name:c.name,tick:state.tick,
        text:`est frappé par la foudre ! (−${wd} PV)`});
    }

    // ── Obstacles de terrain (zones difficiles) ───────────────────────
    const inObstacle = (state.map.obstacles||[]).find(o=>dist(c,o)<o.radius);
    if (inObstacle && Math.random() < 0.08) {
      const od = Math.ceil(inObstacle.dmg * rng(1,3));
      if (od > 0) { c.hp -= od; c.simStats.dmgTaken += od;
        if (state.tick%10===0) events.push({type:'narr',sub:'terrain',id:c.id,name:c.name,tick:state.tick,
          text:`s'enlise dans ${inObstacle.label} (−${od} PV)`}); }
    }

    // ── Dégâts progressifs ────────────────────────────────────────────
    if (c.hunger <= 0) {
      const d = HUNGER_DMG; c.hp -= d; c.simStats.dmgTaken += d;
      if (state.tick%8===0) events.push({type:'narr',sub:'hunger',id:c.id,name:c.name,tick:state.tick,
        text:`souffre de faim sévère (−${d} PV)`});
    } else if (c.hunger < 20) {
      c.hp -= 0.3;  // dégâts doux avant la mort de faim
    }

    if (c.thirst <= 0) {
      const d = THIRST_DMG; c.hp -= d; c.simStats.dmgTaken += d;
      if (state.tick%6===0) events.push({type:'narr',sub:'thirst',id:c.id,name:c.name,tick:state.tick,
        text:`se déshydrate gravement (−${d} PV)`});
    } else if (c.thirst < 15) {
      c.hp -= 0.5;
    }

    // Température extrême — protégée par abri/feu
    if (!hasFire && !nearShelter) {
      if (c.temperature < 12 || c.temperature > 82) {
        const d = Math.round(TEMP_DMG * ((c.traits||[]).includes('cold_sensitive') ? 2.5 : 1));
        c.hp -= d; c.simStats.dmgTaken += d;
        const msg = c.temperature < 12 ? `gèle sans feu ni abri (−${d} PV)` : `souffre de la chaleur (−${d} PV)`;
        if (state.tick%5===0) events.push({type:'narr',sub:'temperature',id:c.id,name:c.name,tick:state.tick,text:msg});
      }
    }

    // Régénération passive HP si bien nourri et reposé
    const regenMult = (c.traits||[]).includes('fast_healer') ? 2.5 : 1;
    if (c.hunger > 50 && c.thirst > 50 && (c.fatigue||0) < 60) {
      c.hp = Math.min(c.maxHp, c.hp + HP_REGEN_RATE * regenMult);
    }
    // Regen bonus en camp
    if (c._activity?.type==='campfire') {
      c.hp = Math.min(c.maxHp, c.hp + HP_REGEN_RATE * 3 * regenMult);
      c.hunger = Math.min(100, c.hunger + 0.2);
      c.thirst = Math.min(100, c.thirst + 0.3);
    }

    // Ration consommable
    if (c.items?.includes('ration') && (c.hunger < 30 || c.thirst < 25)) {
      c.hunger = Math.min(100, c.hunger + 40);
      c.thirst = Math.min(100, c.thirst + 20);
      c.items  = c.items.filter(i=>i!=='ration');
      events.push({type:'narr',sub:'forage',id:c.id,name:c.name,tick:state.tick,
        text:`mange sa ration sèche (+40🍗 +20💧)`});
    }

    if (c.hp <= 0) events.push({type:'death',champion:c.id,name:c.name,killedBy:'survival',killedByName:'survie'});
  });

  // Stats effectives
  alive.forEach(c=>{
    c._eff = {...c.stats};
    c.buffs.forEach(b=>{ if(c._eff[b.stat]!==undefined) c._eff[b.stat]+=b.value; });
    const nearPOI = state.map.pois.find(p=>!p._disabled&&!p._depleted&&dist(c,p)<p.radius);
    if (nearPOI?.effect==='vision')  c._eff.instinct  = Math.min(10,c._eff.instinct+2);
    if (nearPOI?.effect==='water')   c._eff.endurance = Math.min(10,c._eff.endurance+1);
    if (nearPOI?.effect==='shelter'&&isNight) c._eff.defense=Math.min(10,c._eff.defense+2);
    if (nearPOI?.effect==='cover')   c._eff.instinct  = Math.min(10,c._eff.instinct+1);
    if (c.items?.includes('torch'))  c._coldProof=true;
    // Malus fatigue sur les stats
    const fatigueR = (c.fatigue||0)/100;
    if (fatigueR > FATIGUE_PENALTY/100) {
      c._eff.speed    = Math.max(1, c._eff.speed - 2);
      c._eff.strength = Math.max(1, c._eff.strength - 2);
      c._eff.instinct = Math.max(1, c._eff.instinct - 1);
    } else if (fatigueR > FATIGUE_THRESHOLD/100) {
      c._eff.speed    = Math.max(1, c._eff.speed - 1);
    }
    // Malus faim/soif sur les stats
    if ((c.hunger??100) < 30) c._eff.strength = Math.max(1, c._eff.strength - 1);
    if ((c.thirst??100) < 25) c._eff.instinct = Math.max(1, c._eff.instinct - 1);
    applyMentalEffects(c);
  });

  // Déplétion POIs
  tickPoiDepletion(state, alive.filter(c=>c.hp>0), events);

  // Heal survie — camp (cooldown plus long)
  alive.forEach(c=>{
    if (c._eff.survival<6||c.hp>=c.maxHp*0.80) return;
    if (state.tick-(c._memory.lastHealTick??-99)<15) return;
    const others=alive.filter(e=>e.id!==c.id&&e.hp>0);
    const close=others.length?others.reduce((p,e)=>dist(e,c)<dist(p,c)?e:p):null;
    if (close&&dist(close,c)<72) return;
    const heal=8+Math.floor(c._eff.survival*2);
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
    const nightSlow = isNight&&c.stats.instinct<=4&&!(c.traits||[]).includes('night_owl') ? 0.6 : 1;
    const weatherSlow = wDef.speedPct;
    const obstSlow  = (state.map.obstacles||[]).find(o=>dist(c,o)<o.radius) ? (state.map.obstacles.find(o=>dist(c,o)<o.radius).slowPct||0.7) : 1;
    const spd = Math.max(1,c._eff.speed) * stormSlow * nightSlow * weatherSlow * obstSlow;

    // ── Phase Cornucopia : IA rush vers centre + combat agressif ──────
    let dx, dy;
    if (state.simPhase === 'cornucopia') {
      const center = {x:450, y:450};
      const distC  = dist(c, center);
      const enemies = alive.filter(e=>e.id!==c.id&&e.hp>0);
      const nearest = enemies.length?enemies.reduce((p,e)=>dist(e,c)<dist(p,c)?e:p):null;
      const isFighter = ['berserker','gladiator','soldier'].includes(c.archetype);
      if (nearest && dist(nearest,c) < 80 && (isFighter||Math.random()<0.5)) {
        // Combat cornucopia agressif
        const t2 = nearest;
        dx = sign(t2.x-c.x)||noise(1); dy = sign(t2.y-c.y)||noise(1);
      } else if (distC > 40) {
        // Foncer vers la cornucopia
        dx = sign(center.x-c.x); dy = sign(center.y-c.y);
      } else {
        // Sur place : grab supplies
        dx = noise(1); dy = noise(1);
      }
    } else {
      const r = aiMove(c, alive, null, state.map.supplies, state.map.pois, isNight, state.alliances, state.activeEvent, state.map.fauna, state.map.flora, state.tick);
      dx = r.dx; dy = r.dy;
    }
    const fatMult = (c.traits||[]).includes('lazy') ? 1.7 : (c.traits||[]).includes('athlete') ? 0.6 : 1;
    const fatDelta = dx===0&&dy===0 ? -(FATIGUE_REST_IDLE * fatMult) : FATIGUE_SPRINT * fatMult;
    c.fatigue = clamp((c.fatigue||0) + fatDelta, 0, 100);
    if (dx===0 && dy===0) {
      // Repos actif — campfire si la nuit
      if (isNight && c._activity.type==='idle') c._activity = {type:'campfire', startTick:state.tick};
    } else {
      c.x = clamp(c.x+dx*spd+noise(1), ISLAND_EDGE, WORLD-ISLAND_EDGE-1);
      c.y = clamp(c.y+dy*spd+noise(1), ISLAND_EDGE, WORLD-ISLAND_EDGE-1);
    }
  });

  // ── Dégâts eau (bords de l'île) ──────────────────────────────────────
  alive.forEach(c=>{
    if (c.hp<=0) return;
    const inWater = c.x<ISLAND_EDGE||c.x>WORLD-ISLAND_EDGE||c.y<ISLAND_EDGE||c.y>WORLD-ISLAND_EDGE;
    if (inWater) {
      const dmg = WATER_DMG;
      c.hp -= dmg; c.simStats.dmgTaken += dmg;
      // Push vers le centre
      c.x = clamp(c.x + sign(WORLD/2 - c.x)*3, 0, WORLD-1);
      c.y = clamp(c.y + sign(WORLD/2 - c.y)*3, 0, WORLD-1);
      events.push({type:'narr',sub:'water',id:c.id,name:c.name,tick:state.tick,
        text:`se noie dans les eaux glacées qui entourent l'île (−${dmg} PV)`});
      if (c.hp<=0) {
        state.matchStats.waterDeaths = (state.matchStats.waterDeaths||0)+1;
        events.push({type:'death',champion:c.id,name:c.name,killedBy:'water',killedByName:'la mer'});
      }
    }
  });

  // ── Faune : comportement ──────────────────────────────────────────────
  const aliveFauna = (state.map.fauna||[]).filter(f=>f.hp>0);
  const aliveChamps = alive.filter(c=>c.hp>0);
  aliveFauna.forEach(f=>{
    const def = FAUNA_DEFS[f.type];
    if (!def) return;
    const nearChamp = aliveChamps.length ? aliveChamps.reduce((p,c)=>dist(c,f)<dist(p,f)?c:p) : null;
    const d = nearChamp ? dist(nearChamp,f) : 999;

    if (def.aggressive) {
      // Loups/sangliers : attaquent si à portée
      if (nearChamp && d < def.attackRange) {
        const dmg = rng(Math.floor(def.dmg*0.6), def.dmg);
        nearChamp.hp -= dmg; nearChamp.simStats.dmgTaken += dmg;
        events.push({type:'narr',sub:'fauna_attack',id:nearChamp.id,name:nearChamp.name,tick:state.tick,
          text:`est attaqué(e) par un ${def.label} (−${dmg} PV) !`});
        if (nearChamp.hp <= 0) events.push({type:'death',champion:nearChamp.id,name:nearChamp.name,killedBy:'fauna',killedByName:def.label});
        // Mouvement vers la proie
        if (d > 3) { f.x+=sign(nearChamp.x-f.x)*def.speed*0.5; f.y+=sign(nearChamp.y-f.y)*def.speed*0.5; }
      } else if (nearChamp && d < 60) {
        f.x += sign(nearChamp.x-f.x)*def.speed*0.3+noise(1);
        f.y += sign(nearChamp.y-f.y)*def.speed*0.3+noise(1);
      } else {
        f.x += noise(2); f.y += noise(2);
      }
    } else {
      // Cerfs/lapins : fuient si proche
      if (nearChamp && d < def.fearRange) {
        f.x += sign(f.x - nearChamp.x)*def.speed*0.5+noise(1);
        f.y += sign(f.y - nearChamp.y)*def.speed*0.5+noise(1);
      } else {
        f.x += noise(2); f.y += noise(2);
      }
    }
    f.x = clamp(f.x, ISLAND_EDGE+5, WORLD-ISLAND_EDGE-5);
    f.y = clamp(f.y, ISLAND_EDGE+5, WORLD-ISLAND_EDGE-5);
  });

  // Chasse : champion à portée d'une proie non-aggressive → kill + nourriture
  aliveChamps.forEach(c=>{
    if (c.hp<=0) return;
    const eff = c._eff || c.stats;
    const weapon = WEAPON_DEFS[c.weapon||'fists'];
    for (const f of aliveFauna) {
      if (f.hp<=0) continue;
      const def = FAUNA_DEFS[f.type];
      if (!def || def.aggressive) continue;
      if (dist(f,c) > weapon.meleeRange * 2) continue;
      // Chance de chasse basée sur instinct
      if (Math.random() > 0.3 + (eff.instinct||3)*0.04) continue;
      f.hp = 0; // tuer l'animal
      c.hunger  = Math.min(100, (c.hunger??100) + def.food);
      c.thirst  = Math.min(100, (c.thirst??100) + def.water);
      c.xp = (c.xp||0)+XP_PER_HUNT; checkLevelUp(c, state.tick, events);
      events.push({type:'narr',sub:'hunt',id:c.id,name:c.name,tick:state.tick,
        text:`chasse et abat un ${def.label} (+${def.food} 🍗 +${def.water} 💧)`});
      break;
    }
  });

  // Respawn faune toutes les 30 ticks
  if (state.tick % 30 === 0) {
    const types = Object.keys(FAUNA_DEFS);
    const t = types[rng(0,types.length-1)];
    const d = FAUNA_DEFS[t];
    state.map.fauna.push({
      id:`fauna_r_${state.tick}`, type:t, label:d.label,
      x:rng(ISLAND_EDGE+10,WORLD-ISLAND_EDGE-10),
      y:rng(ISLAND_EDGE+10,WORLD-ISLAND_EDGE-10),
      hp:d.maxHp, maxHp:d.maxHp, _fleeTick:0,
    });
  }

  // ── Flore : collecte ─────────────────────────────────────────────────
  (state.map.flora||[]).forEach(f=>{
    if (f.collected) {
      // Repousse après 20 ticks
      if (f.respawnTick > 0 && state.tick >= f.respawnTick) { f.collected=false; f.respawnTick=-1; }
      return;
    }
    for (const c of aliveChamps) {
      if (c.hp<=0||dist(c,f)>24) continue;
      const def = FLORA_DEFS[f.type];
      if (!def) continue;
      // Poison
      const instinct = (c._eff||c.stats).instinct || 3;
      const poisonR  = Math.max(0, def.poisonChance - instinct*0.05);
      if (Math.random() < poisonR) {
        c.statusEffects.push({type:'poison',ticks:10,srcId:'flora'});
        events.push({type:'narr',sub:'poison',id:c.id,name:c.name,tick:state.tick,
          text:`mange une ${def.label} toxique ! Empoisonné.`});
      } else {
        if (def.food > 0)  c.hunger = Math.min(100,(c.hunger??100)+def.food);
        if (def.water > 0) c.thirst = Math.min(100,(c.thirst??100)+def.water);
        if (def.heal > 0)  c.hp     = Math.min(c.maxHp, c.hp+def.heal);
        if (def.food+def.water+def.heal > 0) {
          const parts = [];
          if (def.food>0)  parts.push(`+${def.food} 🍗`);
          if (def.water>0) parts.push(`+${def.water} 💧`);
          if (def.heal>0)  parts.push(`+${def.heal} ❤️`);
          events.push({type:'narr',sub:'forage',id:c.id,name:c.name,tick:state.tick,
            text:`cueille des ${def.label} (${parts.join(' ')})`});
        }
      }
      c.xp = (c.xp||0)+XP_PER_FLORA; checkLevelUp(c, state.tick, events);
      f.collected = true;
      f.respawnTick = state.tick + 80;
      break;
    }
  });

  // Collecte colis / loots
  const allDrops = [...(state.map.supplies||[]), ...(state.map.loots||[]).filter(l=>l._dropTick!=null && state.tick >= l._dropTick)];
  const collectedIds = new Set();
  allDrops.forEach(s=>{
    if (collectedIds.has(s.id)) return;
    for (const c of alive) {
      if (c.hp<=0||collectedIds.has(s.id)) continue;
      if (dist(s,c)<10) {
        if (s.type==='soin')    { c.hp=Math.min(c.maxHp,c.hp+45); c.hunger=Math.min(100,(c.hunger??100)+15); }
        if (s.type==='force')   c.buffs.push({stat:'strength',value:3,ticks:7});
        if (s.type==='vitesse') c.buffs.push({stat:'speed',value:3,ticks:7});
        if (s.type==='armure')  c.buffs.push({stat:'defense',value:3,ticks:7});
        if (s.type==='festin')  { c.hunger=Math.min(100,(c.hunger??100)+60); c.thirst=Math.min(100,(c.thirst??100)+40); }
        // Armes : remplacer si meilleure
        if (WEAPON_DEFS[s.type]) {
          const curW  = WEAPON_DEFS[c.weapon||'fists'];
          const newW  = WEAPON_DEFS[s.type];
          const better = (newW.dmgMax + newW.def + newW.rangedRange*0.2) > (curW.dmgMax + curW.def + curW.rangedRange*0.2);
          if (better) {
            c.weapon = s.type;
            events.push({type:'narr',sub:'loot_weapon',id:c.id,name:c.name,tick:state.tick,
              text:`ramasse ${newW.name} ! ⚔️`});
          }
        } else {
          events.push({type:'collect',champion:c.id,name:c.name,supply:s.type});
        }
        collectedIds.add(s.id);
        break;
      }
    }
  });
  state.map.supplies = (state.map.supplies||[]).filter(s=>!collectedIds.has(s.id));
  state.map.loots    = (state.map.loots||[]).filter(l=>!collectedIds.has(l.id));

  // Pièges
  state.map.traps = checkTraps(alive, state.map.traps, events, state.tick);

  // Combats
  const fighters = alive.filter(c=>c.hp>0);
  for (let i=0;i<fighters.length;i++) {
    for (let j=i+1;j<fighters.length;j++) {
      const a=fighters[i], b=fighters[j];
      if (a.hp<=0||b.hp<=0) continue;
      const d = dist(a,b);
      const wA = WEAPON_DEFS[a.weapon||'fists'];
      const wB = WEAPON_DEFS[b.weapon||'fists'];
      const aCanHit = d <= wA.meleeRange || (wA.rangedRange > 0 && d <= wA.rangedRange);
      const bCanHit = d <= wB.meleeRange || (wB.rangedRange > 0 && d <= wB.rangedRange);
      if (!aCanHit && !bCanHit) continue;
      // Alliance → pas de combat
      const allied=(state.alliances||[]).some(al=>al.ids.includes(a.id)&&al.ids.includes(b.id));
      if (allied) continue;

      // ── Cooldown de poursuite : on laisse fuir ──────────────────────
      const aOnCooldown = (a._pursuitCooldown||0) > state.tick;
      const bOnCooldown = (b._pursuitCooldown||0) > state.tick;
      if (aOnCooldown && bOnCooldown) continue;

      // ── Fuite à 50% HP — instinct de survie fort ────────────────────
      const aNoFlee = a.archetype==='berserker'||(a.traits||[]).includes('bloodthirsty')||(a.traits||[]).includes('impulsive');
      const bNoFlee = b.archetype==='berserker'||(b.traits||[]).includes('bloodthirsty')||(b.traits||[]).includes('impulsive');
      const aFlees = a.hp/a.maxHp < 0.50 && !aNoFlee && Math.random()<0.65;
      const bFlees = b.hp/b.maxHp < 0.50 && !bNoFlee && Math.random()<0.65;
      if (aFlees) {
        const fd = away(b,a); a.x=clamp(a.x+fd.dx*a._eff.speed*1.5,0,WORLD-1); a.y=clamp(a.y+fd.dy*a._eff.speed*1.5,0,WORLD-1);
        a._pursuitCooldown = state.tick + 12;
        if (Math.random()<0.4) events.push({type:'narr',sub:'flee',id:a.id,name:a.name,tick:state.tick,
          text:`bat en retraite — trop blessé pour continuer !`});
        continue;
      }
      if (bFlees) {
        const fd = away(a,b); b.x=clamp(b.x+fd.dx*b._eff.speed*1.5,0,WORLD-1); b.y=clamp(b.y+fd.dy*b._eff.speed*1.5,0,WORLD-1);
        b._pursuitCooldown = state.tick + 12;
        if (Math.random()<0.4) events.push({type:'narr',sub:'flee',id:b.id,name:b.name,tick:state.tick,
          text:`bat en retraite — trop blessé pour continuer !`});
        continue;
      }

      // ── Trêve si les deux très blessés ──────────────────────────────
      if (a.hp/a.maxHp<0.28&&b.hp/b.maxHp<0.28&&Math.random()<0.60) {
        events.push({type:'narr',sub:'truce',id:a.id,name:a.name,tick:state.tick,
          text:`et ${b.name} s'effondrent, trop épuisés pour combattre`});
        a._pursuitCooldown = b._pursuitCooldown = state.tick + 20;
        continue;
      }

      // ── Intimidation par la réputation ───────────────────────────────
      if ((b.reputation||0) >= 3 && Math.random() < 0.25 && a.archetype!=='berserker') {
        const fd = away(b,a); a.x=clamp(a.x+fd.dx*a._eff.speed,0,WORLD-1); a.y=clamp(a.y+fd.dy*a._eff.speed,0,WORLD-1);
        events.push({type:'narr',sub:'flee',id:a.id,name:a.name,tick:state.tick,
          text:`recule face à ${b.name} — sa réputation fait peur`}); continue;
      }
      if ((a.reputation||0) >= 3 && Math.random() < 0.25 && b.archetype!=='berserker') {
        const fd = away(a,b); b.x=clamp(b.x+fd.dx*b._eff.speed,0,WORLD-1); b.y=clamp(b.y+fd.dy*b._eff.speed,0,WORLD-1);
        events.push({type:'narr',sub:'flee',id:b.id,name:b.name,tick:state.tick,
          text:`recule face à ${a.name} — sa réputation fait peur`}); continue;
      }

      // Traumatisé ne contre-attaque pas les 5 premiers ticks
      const aPanic = a._mentalState==='traumatized'&&(state.tick-a._mentalStateTick)<5;
      const bPanic = b._mentalState==='traumatized'&&(state.tick-b._mentalStateTick)<5;
      if (aPanic) { const fd=away(b,a); a.x=clamp(a.x+fd.dx*a._eff.speed,0,WORLD-1); a.y=clamp(a.y+fd.dy*a._eff.speed,0,WORLD-1); continue; }
      if (bPanic) { const fd=away(a,b); b.x=clamp(b.x+fd.dx*b._eff.speed,0,WORLD-1); b.y=clamp(b.y+fd.dy*b._eff.speed,0,WORLD-1); continue; }
      // Désengagement survivor
      if (a.archetype==='survivor'&&a.hp/a.maxHp>0.5&&Math.random()<0.45) {
        const fd=away(b,a); a.x=clamp(a.x+fd.dx*a._eff.speed,0,WORLD-1); a.y=clamp(a.y+fd.dy*a._eff.speed,0,WORLD-1); continue;
      }
      if (b.archetype==='survivor'&&b.hp/b.maxHp>0.5&&Math.random()<0.45) {
        const fd=away(a,b); b.x=clamp(b.x+fd.dx*b._eff.speed,0,WORLD-1); b.y=clamp(b.y+fd.dy*b._eff.speed,0,WORLD-1); continue;
      }
      const sA=a._eff, sB=b._eff;
      const bA=a._mentalState==='berserk'?4:a.archetype==='berserker'?2:0;
      const bB=b._mentalState==='berserk'?4:b.archetype==='berserker'?2:0;
      const dA=Math.random()<sA.instinct*0.04, dB=Math.random()<sB.instinct*0.04;
      // Dégâts arme
      const wDmgA = aCanHit ? rng(wA.dmgMin, wA.dmgMax) : 0;
      const wDmgB = bCanHit ? rng(wB.dmgMin, wB.dmgMax) : 0;
      const rA=dA?0:Math.max(1, sA.strength+bA + wDmgA - Math.floor((sB.defense+wB.def)*.5));
      const rB=dB?0:Math.max(1, sB.strength+bB + wDmgB - Math.floor((sA.defense+wA.def)*.5));
      // Si seul A peut frapper
      const dmgToB = bCanHit||aCanHit ? Math.max(1, rA - Math.floor(sB.endurance*.3)) : 0;
      const dmgToA = (aCanHit&&bCanHit)||(bCanHit&&!aCanHit) ? Math.max(1, rB - Math.floor(sA.endurance*.3)) : 0;
      const finalDmgA = dA ? 0 : dmgToA;
      const finalDmgB = dB ? 0 : dmgToB;
      a.hp-=finalDmgA; b.hp-=finalDmgB;
      a.simStats.dmgTaken+=finalDmgA; b.simStats.dmgTaken+=finalDmgB;
      a.simStats.dmgDealt+=finalDmgB; b.simStats.dmgDealt+=finalDmgA;
      a._combatTicks=(a._combatTicks||0)+1; b._combatTicks=(b._combatTicks||0)+1;
      if (finalDmgA>0&&a._memory) a._memory.lastAttackerId=b.id;
      if (finalDmgB>0&&b._memory) b._memory.lastAttackerId=a.id;
      // Fatigue de combat (modulée par traits)
      const cFatA = FATIGUE_COMBAT * ((a.traits||[]).includes('lazy')?1.5:(a.traits||[]).includes('athlete')?0.6:1);
      const cFatB = FATIGUE_COMBAT * ((b.traits||[]).includes('lazy')?1.5:(b.traits||[]).includes('athlete')?0.6:1);
      a.fatigue = clamp((a.fatigue||0)+cFatA, 0, 100);
      b.fatigue = clamp((b.fatigue||0)+cFatB, 0, 100);
      // Blessure si coup lourd (malus speed durable)
      if (finalDmgA > a.maxHp*0.15) a.buffs.push({stat:'speed',value:-1,ticks:WOUND_TICKS});
      if (finalDmgB > b.maxHp*0.15) b.buffs.push({stat:'speed',value:-1,ticks:WOUND_TICKS});
      // Mémoire de peur : si réduit à <30% → on se souvient de cet ennemi
      if (a.hp/a.maxHp < 0.30) { b._fear=b._fear||{}; b._fear[a.id]=state.tick+40; }
      if (b.hp/b.maxHp < 0.30) { a._fear=a._fear||{}; a._fear[b.id]=state.tick+40; }
      state.matchStats.totalCombats++;
      // Poison (hunter/survivor) et saignement (berserker) au toucher
      if (!dA&&finalDmgB>0&&a.archetype==='hunter'&&Math.random()<0.25&&!b.statusEffects?.some(se=>se.type==='poison'))
        b.statusEffects.push({type:'poison',ticks:8,srcId:a.id});
      if (!dB&&finalDmgA>0&&b.archetype==='hunter'&&Math.random()<0.25&&!a.statusEffects?.some(se=>se.type==='poison'))
        a.statusEffects.push({type:'poison',ticks:8,srcId:b.id});
      const bBleedCh = (b.traits||[]).includes('hemophiliac')?0.65:a.archetype==='berserker'?0.30:0;
      if (!dA&&finalDmgB>0&&bBleedCh>0&&Math.random()<bBleedCh&&!b.statusEffects?.some(se=>se.type==='bleed'))
        b.statusEffects.push({type:'bleed',ticks:14,srcId:a.id});
      const aBleedCh = (a.traits||[]).includes('hemophiliac')?0.65:b.archetype==='berserker'?0.30:0;
      if (!dB&&finalDmgA>0&&aBleedCh>0&&Math.random()<aBleedCh&&!a.statusEffects?.some(se=>se.type==='bleed'))
        a.statusEffects.push({type:'bleed',ticks:14,srcId:b.id});
      // Étourdissement (tank sur gros coup)
      if (!dA&&finalDmgB>=Math.floor(b.maxHp*0.22)&&a.archetype==='tank'&&Math.random()<0.20&&!b.statusEffects?.some(se=>se.type==='stun'))
        b.statusEffects.push({type:'stun',ticks:3,srcId:a.id});
      events.push({type:'combat',a:a.id,aName:a.name,b:b.id,bName:b.name,dmgA:finalDmgB,dmgB:finalDmgA,dodgeA:dA,dodgeB:dB,tick:state.tick,wA:wA.name,wB:wB.name});
      // Gros coup → berserk
      if (finalDmgA>=Math.floor(a.maxHp*0.3)&&a._mentalState==='normal'&&Math.random()<0.35) {
        a._mentalState='berserk'; a._mentalStateTick=state.tick;
        events.push({type:'narr',sub:'berserk',id:a.id,name:a.name,tick:state.tick,text:`entre en rage après un coup dévastateur !`});
      }
      if (finalDmgB>=Math.floor(b.maxHp*0.3)&&b._mentalState==='normal'&&Math.random()<0.35) {
        b._mentalState='berserk'; b._mentalStateTick=state.tick;
        events.push({type:'narr',sub:'berserk',id:b.id,name:b.name,tick:state.tick,text:`entre en rage après un coup dévastateur !`});
      }
      if (a.hp<=0) {
        b.simStats.kills++;
        b.reputation = (b.reputation||0)+1;
        b.xp = (b.xp||0)+XP_PER_KILL; checkLevelUp(b, state.tick, events);
        if(b._memory)b._memory.lastAttackerId=null;
        events.push({type:'death',champion:a.id,name:a.name,killedBy:b.id,killedByName:b.name});
        // Trauma pour témoins proches
        alive.filter(x=>x.id!==a.id&&x.id!==b.id&&dist(x,a)<120&&x._mentalState==='normal').forEach(w=>{
          w._mentalState='traumatized'; w._mentalStateTick=state.tick;
          events.push({type:'narr',sub:'traumatized',id:w.id,name:w.name,tick:state.tick,
            text:`est traumatisé(e) d'avoir assisté à la mort de ${a.name}`});
        });
        // Rancune des alliés du mort
        const dalA = (state.alliances||[]).find(al=>al.ids.includes(a.id));
        if (dalA) {
          const allA = alive.find(c=>c.id===dalA.ids.find(id=>id!==a.id));
          if (allA) { allA._grudge=allA._grudge||{}; allA._grudge[b.id]=(allA._grudge[b.id]||0)+2; }
        }
      }
      if (b.hp<=0) {
        a.simStats.kills++;
        a.reputation = (a.reputation||0)+1;
        a.xp = (a.xp||0)+XP_PER_KILL; checkLevelUp(a, state.tick, events);
        if(a._memory)a._memory.lastAttackerId=null;
        events.push({type:'death',champion:b.id,name:b.name,killedBy:a.id,killedByName:a.name});
        alive.filter(x=>x.id!==b.id&&x.id!==a.id&&dist(x,b)<120&&x._mentalState==='normal').forEach(w=>{
          w._mentalState='traumatized'; w._mentalStateTick=state.tick;
          events.push({type:'narr',sub:'traumatized',id:w.id,name:w.name,tick:state.tick,
            text:`est traumatisé(e) d'avoir assisté à la mort de ${b.name}`});
        });
        // Rancune des alliés du mort
        const dalB = (state.alliances||[]).find(al=>al.ids.includes(b.id));
        if (dalB) {
          const allB = alive.find(c=>c.id===dalB.ids.find(id=>id!==b.id));
          if (allB) { allB._grudge=allB._grudge||{}; allB._grudge[a.id]=(allB._grudge[a.id]||0)+2; }
        }
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
  {type:'soin',    label:'🧪 Soin',   color:'#2ecc71'},
  {type:'force',   label:'💪 Force',  color:'#e74c3c'},
  {type:'vitesse', label:'⚡ Vit.',   color:'#3498db'},
  {type:'armure',  label:'🛡 Arm.',   color:'#f39c12'},
  {type:'sword',   label:'⚔️ Épée',   color:'#bdc3c7'},
  {type:'bow',     label:'🏹 Arc',    color:'#8e44ad'},
];
const NARR_COLORS = {
  campfire:'#3d1f00', scout:'#0a1f3d', treat:'#0d2b1a', craft_start:'#2a1a0a',
  craft_ok:'#0d2a0d', craft_fail:'#2a0d0d', forage:'#0a2a12', truce:'#1a1a2e',
  betrayal:'#2a0000', alliance:'#1a1500', berserk:'#3d0000',
  traumatized:'#0d0d2a', exhausted:'#1a1a1a', cold:'#001a2a',
  fire_damage:'#2a0d00', trap_trigger:'#1a1a00', cold_snap:'#001520',
  ability:'#0d1a2a', poison:'#0d1a0d', bleed:'#2a0808', stun_end:'#1a1a1a',
  hunger:'#2a1500', thirst:'#001a2e', temperature:'#1a000d',
  water:'#00111a', fauna_attack:'#1a1200', hunt:'#0a1a0a',
  loot_weapon:'#1a1505', survival:'#1a0a00',
  levelup:'#0d1a05', flee:'#1a1a00',
};

export default function SimulateurScreen() {
  const [gamePhase, setGamePhase] = useState('config'); // 'config' | 'sim'
  const [cfg,       setCfg]       = useState({champCount:8, mapSize:'M', biome:null});
  const [sim,       setSim]       = useState(()=>createSimState());
  const [autoRun,   setAuto]      = useState(false);
  const [speed,     setSpeed]     = useState(1500);
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
      if (chunks < 50) setTimeout(runChunk, 0); // 50×100 = 5000 ticks max
    };
    runChunk();
  },[]);
  const [sponsorTarget, setSponsorTarget] = useState(null); // champId ciblé

  const drop   = useCallback((type, targetChampId=null, cost=2)=>setSim(p=>{
    const s=JSON.parse(JSON.stringify(p));
    if ((s.sponsorPts||0) < cost) return p; // pas assez de pts
    s.sponsorPts = (s.sponsorPts||0) - cost;
    if (targetChampId) {
      // Colis ciblé : spawn près du champion
      const tc = s.champions.find(c=>c.id===targetChampId&&c.hp>0);
      const tx = tc ? clamp(tc.x+rng(-30,30),ISLAND_EDGE+10,WORLD-ISLAND_EDGE-10) : rng(ISLAND_EDGE+10,WORLD-ISLAND_EDGE-10);
      const ty = tc ? clamp(tc.y+rng(-30,30),ISLAND_EDGE+10,WORLD-ISLAND_EDGE-10) : rng(ISLAND_EDGE+10,WORLD-ISLAND_EDGE-10);
      s.map.supplies.push({id:`sup_${Date.now()}`,type,x:tx,y:ty,_targeted:targetChampId});
      s.events.push({type:'event',evType:'sponsor',tick:s.tick,text:`🎁 Colis sponsor pour ${tc?.name||'?'} !`});
    } else {
      s.map.supplies.push({id:`sup_${Date.now()}`,type,x:rng(ISLAND_EDGE+10,WORLD-ISLAND_EDGE-10),y:rng(ISLAND_EDGE+10,WORLD-ISLAND_EDGE-10)});
    }
    return s;
  }),[]);

  const sponsorHeal = useCallback((champId)=>setSim(p=>{
    const s=JSON.parse(JSON.stringify(p));
    const cost = 5;
    if ((s.sponsorPts||0) < cost) return p;
    const c = s.champions.find(x=>x.id===champId&&x.hp>0);
    if (!c) return p;
    s.sponsorPts -= cost;
    const heal = 120;
    c.hp = Math.min(c.maxHp, c.hp+heal);
    c.hunger = Math.min(100, (c.hunger||100)+30);
    c.thirst = Math.min(100, (c.thirst||100)+30);
    s.events.push({type:'event',evType:'sponsor',tick:s.tick,
      text:`💉 Colis médical sponsor pour ${c.name} ! (+${heal} PV)`});
    return s;
  }),[]);
  const setInstruction = useCallback((champId, instr) => {
    setSim(p => {
      const s = JSON.parse(JSON.stringify(p));
      const c = s.champions.find(x=>x.id===champId);
      if (c) c.instructions = c.instructions===instr ? null : instr; // toggle off
      return s;
    });
  }, []);
  const cycSpd = useCallback(()=>setSpeed(s=>s===1500?800:s===800?300:s===300?100:1500),[]);

  const speedLabel = {1500:'🐢 Posé',800:'⚡ Normal',300:'🚀 Rapide',100:'⏩ Turbo'}[speed]||`${speed}ms`;
  const alive  = sim.champions.filter(c=>c.hp>0);
  const events = sim.events.slice(-20).reverse();
  const winner = sim.status==='finished' ? sim.champions.find(c=>c.id===sim.winner) : null;
  const sel    = selId ? sim.champions.find(c=>c.id===selId) : null;
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
        <Chip val={`${timeIcon} J${Math.floor(sim.tick/DAY_LEN)+1}`} lbl="Jour" />
        {sim.weather&&sim.weather!=='clear'
          ? <Chip val={`${WEATHER_TYPES[sim.weather]?.icon} ${WEATHER_TYPES[sim.weather]?.label}`} lbl="Météo" color="#74b9ff" small/>
          : <Chip val="☀️" lbl="Météo" small/>}
        {sim.simPhase==='cornucopia'
          ? <Chip val="⚔️ CORNUCOPIA" lbl="Phase" color="#e2b96f"/>
          : <Chip val={sim.map.biome} lbl="Biome" small/>}
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
                      <View style={s.hpT}>
                        <View style={[s.hpF,{width:`${Math.round((c.hunger??100))}%`,backgroundColor:'#e67e22'}]}/>
                      </View>
                      <View style={s.hpT}>
                        <View style={[s.hpF,{width:`${Math.round((c.thirst??100))}%`,backgroundColor:'#3498db'}]}/>
                      </View>
                      <Text style={s.cKills}>
                        ⭐Lv{c.level||1} {c.simStats?.kills??0}💀 {WEAPON_DEFS[c.weapon||'fists']?.name?.slice(0,4)||'✊'}{msIco}{seIco}{inAl?' 🤝':''}{act&&act!=='idle'?` ${actIcon(act)}`:''}</Text>
                      {(c.traits||[]).length>0&&<Text style={s.cTraits}>{(c.traits||[]).map(t=>`${TRAITS[t]?.icon||''}`).join(' ')}{c.instructions?' 📋':''}</Text>}
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
            <Btn label={speedLabel} onPress={cycSpd} color="#2c3e50" flex={0.85}/>
            <Btn label="🔄" onPress={reset} color="#1a1a2e" flex={0.6}/>
          </View>

          {/* ── MODE SPONSOR ──────────────────────────────────────────── */}
          <View style={s.sup}>
            <View style={s.supHeader}>
              <Text style={s.supLbl}>🎭 SPONSOR</Text>
              <View style={s.spPtsBox}>
                <Text style={[s.spPts,{color:(sim.sponsorPts||0)>=5?'#2ecc71':'#e74c3c'}]}>
                  ⭐{Math.floor(sim.sponsorPts||0)} pts
                </Text>
              </View>
              {/* Ciblage champion */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{maxWidth:160}}>
                {alive.map(c=>(
                  <TouchableOpacity key={c.id}
                    style={[s.spTarget,sponsorTarget===c.id&&{borderColor:c.color,backgroundColor:c.color+'22'}]}
                    onPress={()=>setSponsorTarget(t=>t===c.id?null:c.id)}>
                    <View style={[s.nameDot,{backgroundColor:c.color,width:7,height:7,borderRadius:4}]}/>
                    <Text style={[s.spTargetTxt,sponsorTarget===c.id&&{color:c.color}]} numberOfLines={1}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={s.supRow}>
              {SUPPLY_LIST.map(sl=>{
                const cost = sl.type==='soin'?2:sl.type==='armure'?3:3;
                const canAfford = (sim.sponsorPts||0) >= cost;
                return (
                  <TouchableOpacity key={sl.type}
                    style={[s.supBtn,{borderColor:sl.color+'77'},!canAfford&&{opacity:0.35}]}
                    onPress={()=>canAfford&&drop(sl.type,sponsorTarget,cost)}>
                    <Text style={[s.supTxt,{color:sl.color}]}>{sl.label}</Text>
                    <Text style={s.spCost}>{cost}⭐</Text>
                  </TouchableOpacity>
                );
              })}
              {/* Soin direct */}
              <TouchableOpacity
                style={[s.supBtn,{borderColor:'#ff6b9d77'},(sim.sponsorPts||0)<5&&{opacity:0.35}]}
                onPress={()=>sponsorTarget&&sponsorHeal(sponsorTarget)}>
                <Text style={[s.supTxt,{color:'#ff6b9d'}]}>💉 Soin</Text>
                <Text style={s.spCost}>5⭐</Text>
              </TouchableOpacity>
            </View>
            {sponsorTarget&&<Text style={s.spTargetInfo}>
              🎯 Ciblé : {alive.find(c=>c.id===sponsorTarget)?.name||'?'} · Drops atterrissent près de lui
            </Text>}
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

              {/* Niveau / XP */}
              <View style={s.lvRow}>
                <Text style={s.lvTxt}>⭐ Niveau {sel.level||1}</Text>
                <View style={s.lvBar}>
                  <View style={[s.lvFill,{
                    width:`${Math.round(Math.min(100,((sel.xp||0)-XP_LEVELS[(sel.level||1)-1])/(((sel.level||1)<5?XP_LEVELS[sel.level||1]:XP_LEVELS[4]+150)-XP_LEVELS[(sel.level||1)-1])*100))}%`
                  }]}/>
                </View>
                <Text style={s.lvXp}>{Math.round(sel.xp||0)} XP{(sel.level||1)<5?` / ${XP_LEVELS[sel.level||1]}`:' MAX'}</Text>
              </View>

              {/* Traits */}
              {(sel.traits||[]).length>0&&(
                <View style={s.traitRow}>
                  {(sel.traits||[]).map(t=>{
                    const tr = TRAITS[t]||{};
                    const col = tr.type==='pos'?'#2ecc71':tr.type==='neg'?'#e74c3c':'#f39c12';
                    return (
                      <View key={t} style={[s.traitBadge,{borderColor:col+'66'}]}>
                        <Text style={s.traitIco}>{tr.icon}</Text>
                        <Text style={[s.traitLbl,{color:col}]}>{tr.label}</Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Consigne */}
              <Text style={s.ms}>CONSIGNE</Text>
              <View style={s.instrRow}>
                {INSTRUCTION_PRESETS.map(p=>{
                  const active = sel.instructions === p.instr;
                  return (
                    <TouchableOpacity key={p.key}
                      style={[s.instrBtn, active&&s.instrBtnActive]}
                      onPress={()=>setInstruction(sel.id, p.instr)}>
                      <Text style={[s.instrTxt, active&&s.instrTxtActive]}>{p.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Survie */}
              <Text style={s.ms}>SURVIE</Text>
              <View style={s.sr}>
                <Text style={s.sl}>🍗 Faim</Text>
                <View style={s.st}><View style={[s.sb,{width:`${Math.round(sel.hunger??100)}%`,backgroundColor:'#e67e22'}]}/></View>
                <Text style={s.sv}>{Math.round(sel.hunger??100)}</Text>
              </View>
              <View style={s.sr}>
                <Text style={s.sl}>💧 Soif</Text>
                <View style={s.st}><View style={[s.sb,{width:`${Math.round(sel.thirst??100)}%`,backgroundColor:'#3498db'}]}/></View>
                <Text style={s.sv}>{Math.round(sel.thirst??100)}</Text>
              </View>
              <View style={s.sr}>
                <Text style={s.sl}>😴 Fatigue</Text>
                <View style={s.st}><View style={[s.sb,{width:`${Math.round(sel.fatigue??0)}%`,backgroundColor:'#8e44ad'}]}/></View>
                <Text style={s.sv}>{Math.round(sel.fatigue??0)}</Text>
              </View>
              <View style={s.sr}>
                <Text style={s.sl}>💛 Moral</Text>
                <View style={s.st}><View style={[s.sb,{width:`${Math.round(sel.morale??80)}%`,backgroundColor:'#f1c40f'}]}/></View>
                <Text style={s.sv}>{Math.round(sel.morale??80)}</Text>
              </View>
              {(sel.reputation||0)>0&&(
                <Text style={[s.bl,{color:'#e74c3c'}]}>☠️ Réputation : {sel.reputation} kill{sel.reputation>1?'s':''} — craint par les autres</Text>
              )}
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
                <MS l="Morts eau"  v={sim.matchStats.waterDeaths||0}/>
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
    case 'death':        icon='💀';big=true;
      txt=e.killedBy==='water'?`${e.name} se noie dans la mer`
        :e.killedBy==='survival'?`${e.name} succombe à l'épuisement`
        :e.killedBy==='fauna'?`${e.name} dévoré par ${e.killedByName}`
        :`${e.name} tué par ${e.killedByName}`; break;
    case 'combat':       icon='⚔️'; txt=`${e.aName}(−${e.dmgB}) vs ${e.bName}(−${e.dmgA})`+(e.dodgeA?' 🌀':'')+(e.dodgeB?' 🌀':'')+(e.wA&&e.wA!=='Poings'?` [${e.wA}]`:''); break;
    case 'collect':      icon='📦'; txt=`${e.name} → ${e.supply}`; break;
    case 'heal':         icon='💚'; txt=`${e.name} +${e.amount} PV`; break;
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
               ability:'⚡',poison:'☠️',bleed:'🩸',stun_end:'💫',
               hunger:'🍗',thirst:'💧',temperature:'🌡️',water:'🌊',
               fauna_attack:'🐺',hunt:'🏹',loot_weapon:'⚔️',
               flee:'🏃',survival:'💀',levelup:'⭐',poi_depleted:'⚠️',poi_recover:'🌱'}[sub]||'📌';
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
  const [count,       setCount]      = useState(8);
  const [mapSize,     setMapSz]      = useState('M');
  const [biome,       setBiome]      = useState(null);
  const [names,       setNames]      = useState([...CHAMP_NAMES.slice(0,8)]);
  const [editIdx,     setEditIdx]    = useState(null);
  const [editVal,     setEditVal]    = useState('');
  const [cornucopia,  setCornucopia] = useState(true); // cérémonie d'ouverture
  // builds[i] = { traits: string[] } — un build par champion
  const [builds,      setBuilds]     = useState(()=>Array.from({length:8},()=>({traits:pickTraits()})));
  const [traitPicker, setTraitPicker]= useState(null); // index du champion en cours d'édition

  // Sync names + builds quand le count change
  const changeCount = v => {
    setCount(v);
    setNames(prev => {
      const next=[...prev];
      while(next.length<v) next.push(CHAMP_NAMES[next.length]||`Tribut${next.length+1}`);
      return next.slice(0,v);
    });
    setBuilds(prev => {
      const next=[...prev];
      while(next.length<v) next.push({traits:pickTraits()});
      return next.slice(0,v);
    });
  };

  // Basculer un trait dans le build d'un champion
  const toggleTrait = (champIdx, traitKey) => {
    setBuilds(prev => {
      const next = prev.map((b,i)=>{
        if (i !== champIdx) return b;
        const sel = b.traits;
        if (sel.includes(traitKey)) {
          // Retirer le trait
          return {...b, traits: sel.filter(t=>t!==traitKey)};
        }
        // Ajouter le trait — vérifications
        const tentative = [...sel, traitKey];
        const pts = BASE_TRAIT_POINTS + tentative.reduce((s,t)=>s+(TRAITS[t].cost||0),0);
        const incompat = TRAIT_INCOMPAT.some(pair=>
          pair.includes(traitKey) && sel.some(e=>pair.includes(e)));
        if (incompat) return b; // incompatible, on ignore
        if (pts < 0)  return b; // budget dépassé, on ignore
        return {...b, traits: tentative};
      });
      return next;
    });
  };

  const launch = () => onStart({champCount:count, mapSize, biome, champNames:names, champBuilds:builds, cornucopia});

  // Données du picker actuellement ouvert
  const pickerBuild = traitPicker !== null ? builds[traitPicker] : null;
  const pickerPts   = pickerBuild ? traitsRemainingPoints(pickerBuild.traits) : 0;

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

      {/* ── Options de partie ───────────────────────────────────────── */}
      <Text style={cs.sec}>OPTIONS DE PARTIE</Text>
      <TouchableOpacity style={[cs.optionRow, cornucopia && cs.optionRowOn]}
        onPress={()=>setCornucopia(v=>!v)}>
        <Text style={cs.optionIco}>⚔️</Text>
        <View style={{flex:1}}>
          <Text style={[cs.optionLbl, cornucopia&&cs.optionLblOn]}>Cérémonie Cornucopia</Text>
          <Text style={cs.optionDesc}>Tous les tributs spawn au centre — ruée initiale vers les ressources</Text>
        </View>
        <View style={[cs.toggle, cornucopia&&cs.toggleOn]}>
          <Text style={cs.toggleTxt}>{cornucopia?'ON':'OFF'}</Text>
        </View>
      </TouchableOpacity>

      {/* ── Traits des tributs ───────────────────────────────────────── */}
      <Text style={cs.sec}>TRAITS DES TRIBUTS <Text style={cs.secSub}>(budget : {BASE_TRAIT_POINTS} pts → 0)</Text></Text>
      {names.map((n,i) => {
        const pts = traitsRemainingPoints(builds[i]?.traits||[]);
        const balanced = pts === 0;
        return (
          <View key={i} style={cs.buildRow}>
            <View style={cs.buildLeft}>
              <View style={[cs.nameDot,{backgroundColor:CHAMP_COLORS[i%CHAMP_COLORS.length]}]}/>
              <Text style={cs.buildName}>{n}</Text>
              <Text style={[cs.buildPts, balanced ? cs.buildPtsOk : cs.buildPtsKo]}>
                {balanced ? '✓ 0' : (pts > 0 ? `+${pts}` : `${pts}`)}
              </Text>
            </View>
            <View style={cs.buildTraits}>
              {(builds[i]?.traits||[]).map(t=>(
                <View key={t} style={[cs.tBadge,
                  TRAITS[t].type==='pos' ? cs.tPos :
                  TRAITS[t].type==='neg' ? cs.tNeg : cs.tNeu]}>
                  <Text style={cs.tBadgeIco}>{TRAITS[t].icon}</Text>
                  <Text style={cs.tBadgeLbl}>{TRAITS[t].label}</Text>
                </View>
              ))}
              {(!builds[i]?.traits?.length) &&
                <Text style={cs.buildNone}>Aucun trait</Text>}
            </View>
            <TouchableOpacity style={cs.buildEdit} onPress={()=>setTraitPicker(i)}>
              <Text style={cs.buildEditTxt}>✎</Text>
            </TouchableOpacity>
          </View>
        );
      })}

      <TouchableOpacity style={cs.launch} onPress={launch}>
        <Text style={cs.launchTxt}>⚔️  LANCER LA PARTIE  ⚔️</Text>
        <Text style={cs.launchSub}>{count} tributs · Carte {mapSize} · {biome||'Biome aléatoire'}</Text>
      </TouchableOpacity>

      {/* ── Modal sélecteur de traits ────────────────────────────────── */}
      <Modal visible={traitPicker !== null} transparent animationType="slide"
        onRequestClose={()=>setTraitPicker(null)}>
        <View style={cs.tpBg}>
          <View style={cs.tpBox}>
            {/* En-tête */}
            <View style={cs.tpHead}>
              {traitPicker !== null && (
                <View style={[cs.nameDot,{backgroundColor:CHAMP_COLORS[traitPicker%CHAMP_COLORS.length],width:12,height:12,borderRadius:6}]}/>
              )}
              <Text style={cs.tpTitle}>
                {traitPicker !== null ? names[traitPicker] : ''}
              </Text>
              <View style={[cs.tpBudget, pickerPts===0 ? cs.tpBudgetOk : pickerPts>0 ? cs.tpBudgetOver : cs.tpBudgetKo]}>
                <Text style={cs.tpBudgetTxt}>
                  {pickerPts === 0 ? '✓ Équilibré' : pickerPts > 0 ? `+${pickerPts} à dépenser` : `${pickerPts} dépassé!`}
                </Text>
              </View>
              <TouchableOpacity onPress={()=>setTraitPicker(null)} style={cs.tpClose}>
                <Text style={cs.tpCloseTxt}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={cs.tpHint}>
              Budget : {BASE_TRAIT_POINTS} pts de base · Positifs coûtent · Négatifs remboursent (~½)
            </Text>

            <ScrollView style={cs.tpScroll} showsVerticalScrollIndicator={false}>
              {/* Positifs */}
              <Text style={cs.tpSec}>✅ POSITIFS</Text>
              <View style={cs.tpGrid}>
                {TRAIT_KEYS.filter(k=>TRAITS[k].type==='pos').map(k=>{
                  const t = TRAITS[k];
                  const sel = pickerBuild?.traits?.includes(k);
                  const incompat = TRAIT_INCOMPAT.some(pair=>
                    pair.includes(k) && (pickerBuild?.traits||[]).filter(e=>e!==k).some(e=>pair.includes(e)));
                  const wouldOverflow = !sel && (pickerPts + t.cost) < 0;
                  const disabled = !sel && (incompat || wouldOverflow);
                  return (
                    <TouchableOpacity key={k}
                      style={[cs.tpTrait, sel ? cs.tpSel : cs.tpUnsel, disabled && cs.tpDisabled]}
                      onPress={()=>!disabled && toggleTrait(traitPicker, k)}>
                      <Text style={cs.tpIco}>{t.icon}</Text>
                      <Text style={[cs.tpLbl, sel && cs.tpLblSel, disabled && cs.tpLblDis]}>{t.label}</Text>
                      <Text style={[cs.tpCost, t.cost < 0 ? cs.tpCostPos : cs.tpCostNeg]}>
                        {t.cost > 0 ? `+${t.cost}` : `${t.cost}`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Négatifs */}
              <Text style={cs.tpSec}>❌ NÉGATIFS</Text>
              <View style={cs.tpGrid}>
                {TRAIT_KEYS.filter(k=>TRAITS[k].type==='neg').map(k=>{
                  const t = TRAITS[k];
                  const sel = pickerBuild?.traits?.includes(k);
                  const incompat = TRAIT_INCOMPAT.some(pair=>
                    pair.includes(k) && (pickerBuild?.traits||[]).filter(e=>e!==k).some(e=>pair.includes(e)));
                  const disabled = !sel && incompat;
                  return (
                    <TouchableOpacity key={k}
                      style={[cs.tpTrait, sel ? cs.tpSelNeg : cs.tpUnsel, disabled && cs.tpDisabled]}
                      onPress={()=>!disabled && toggleTrait(traitPicker, k)}>
                      <Text style={cs.tpIco}>{t.icon}</Text>
                      <Text style={[cs.tpLbl, sel && cs.tpLblSel, disabled && cs.tpLblDis]}>{t.label}</Text>
                      <Text style={[cs.tpCost, cs.tpCostNeg]}>+{t.cost}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Ambivalents */}
              <Text style={cs.tpSec}>⚖️ AMBIVALENTS</Text>
              <View style={cs.tpGrid}>
                {TRAIT_KEYS.filter(k=>TRAITS[k].type==='neu').map(k=>{
                  const t = TRAITS[k];
                  const sel = pickerBuild?.traits?.includes(k);
                  const incompat = TRAIT_INCOMPAT.some(pair=>
                    pair.includes(k) && (pickerBuild?.traits||[]).filter(e=>e!==k).some(e=>pair.includes(e)));
                  const wouldOverflow = !sel && t.cost < 0 && (pickerPts + t.cost) < 0;
                  const disabled = !sel && (incompat || wouldOverflow);
                  return (
                    <TouchableOpacity key={k}
                      style={[cs.tpTrait, sel ? cs.tpSelNeu : cs.tpUnsel, disabled && cs.tpDisabled]}
                      onPress={()=>!disabled && toggleTrait(traitPicker, k)}>
                      <Text style={cs.tpIco}>{t.icon}</Text>
                      <Text style={[cs.tpLbl, sel && cs.tpLblSel, disabled && cs.tpLblDis]}>{t.label}</Text>
                      <Text style={[cs.tpCost, t.cost===0 ? cs.tpCostNeu : t.cost<0 ? cs.tpCostPos : cs.tpCostNeg]}>
                        {t.cost===0 ? '0' : t.cost>0 ? `+${t.cost}` : `${t.cost}`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Boutons bas */}
            <View style={cs.tpFoot}>
              <TouchableOpacity style={cs.tpRandom} onPress={()=>{
                if (traitPicker !== null) {
                  setBuilds(prev => prev.map((b,i)=>i===traitPicker ? {traits:pickTraits()} : b));
                }
              }}>
                <Text style={cs.tpRandomTxt}>🎲 Aléatoire</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[cs.tpConfirm, pickerPts!==0 && cs.tpConfirmDis]}
                onPress={()=>{ if(pickerPts===0) setTraitPicker(null); }}>
                <Text style={cs.tpConfirmTxt}>
                  {pickerPts===0 ? '✓ Confirmer' : `Équilibrez (${pickerPts>0?'+':''}${pickerPts})`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  supHeader:{flexDirection:'row',alignItems:'center',marginBottom:4,gap:6},
  supLbl:{color:'#333',fontSize:8,marginRight:4},
  spPtsBox:{backgroundColor:'#1a1a2e',borderRadius:6,paddingHorizontal:6,paddingVertical:2,borderWidth:1,borderColor:'#2a2a4a'},
  spPts:{fontSize:10,fontWeight:'bold'},
  spTarget:{flexDirection:'row',alignItems:'center',backgroundColor:'#1a1a2e',borderRadius:8,
    paddingHorizontal:5,paddingVertical:3,marginRight:4,borderWidth:1,borderColor:'#2a2a4a',gap:4},
  spTargetTxt:{color:'#666',fontSize:9,fontWeight:'bold',maxWidth:44},
  spTargetInfo:{color:'#e2b96f',fontSize:9,marginTop:3,fontStyle:'italic'},
  spCost:{color:'#666',fontSize:8,marginTop:1},
  supRow:{flexDirection:'row',gap:4,flexWrap:'wrap'},
  supBtn:{backgroundColor:'#1a1a2e',borderRadius:6,paddingVertical:5,paddingHorizontal:6,alignItems:'center',borderWidth:1,minWidth:46},
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
  // Niveau / XP
  lvRow:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:6,marginTop:4},
  lvTxt:{color:'#e2b96f',fontSize:12,fontWeight:'bold',minWidth:70},
  lvBar:{flex:1,height:6,backgroundColor:'#1a1a2e',borderRadius:3,overflow:'hidden'},
  lvFill:{height:6,backgroundColor:'#e2b96f',borderRadius:3},
  lvXp:{color:'#666',fontSize:9,minWidth:56,textAlign:'right'},
  // Traits
  traitRow:{flexDirection:'row',flexWrap:'wrap',gap:6,marginBottom:6},
  traitBadge:{flexDirection:'row',alignItems:'center',backgroundColor:'#1a1a2e',
    borderRadius:12,paddingHorizontal:8,paddingVertical:4,gap:4,
    borderWidth:1,borderColor:'#2a2a4a'},
  traitIco:{fontSize:14},
  traitLbl:{color:'#aaa',fontSize:10,fontWeight:'bold'},
  // Consignes
  instrRow:{flexDirection:'row',flexWrap:'wrap',gap:5,marginBottom:4},
  instrBtn:{backgroundColor:'#1a1a2e',borderRadius:8,paddingHorizontal:8,paddingVertical:5,
    borderWidth:1,borderColor:'#2a2a4a'},
  instrBtnActive:{backgroundColor:'#e2b96f22',borderColor:'#e2b96f'},
  instrTxt:{color:'#666',fontSize:10,fontWeight:'bold'},
  instrTxtActive:{color:'#e2b96f'},
  // Champion card traits mini
  cTraits:{color:'#666',fontSize:9,marginTop:1},
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

  // ── Options toggle ─────────────────────────────────────────────────
  optionRow:{flexDirection:'row',alignItems:'center',backgroundColor:'#111122',
    borderRadius:10,padding:10,marginBottom:6,borderWidth:1,borderColor:'#1a1a2e',gap:8},
  optionRowOn:{backgroundColor:'#0d1f0d',borderColor:'#2ecc7155'},
  optionIco:{fontSize:20},
  optionLbl:{color:'#666',fontSize:13,fontWeight:'bold'},
  optionLblOn:{color:'#2ecc71'},
  optionDesc:{color:'#333',fontSize:9,marginTop:2},
  toggle:{backgroundColor:'#1a1a2e',borderRadius:8,paddingHorizontal:8,paddingVertical:4,
    borderWidth:1,borderColor:'#2a2a4a'},
  toggleOn:{backgroundColor:'#0d2a0d',borderColor:'#2ecc71'},
  toggleTxt:{color:'#555',fontSize:11,fontWeight:'bold'},

  // ── Trait builds list ──────────────────────────────────────────────
  buildRow:{flexDirection:'row',alignItems:'center',backgroundColor:'#111122',
    borderRadius:10,padding:8,marginBottom:6,borderWidth:1,borderColor:'#1a1a2e',gap:6},
  buildLeft:{flexDirection:'row',alignItems:'center',gap:6,minWidth:110},
  buildName:{color:'#ccc',fontSize:11,fontWeight:'bold',flex:1},
  buildPts:{fontSize:10,fontWeight:'bold',minWidth:28,textAlign:'right'},
  buildPtsOk:{color:'#2ecc71'},
  buildPtsKo:{color:'#e74c3c'},
  buildTraits:{flex:1,flexDirection:'row',flexWrap:'wrap',gap:4},
  buildNone:{color:'#333',fontSize:10,fontStyle:'italic'},
  buildEdit:{backgroundColor:'#1a1a2e',borderRadius:7,padding:7,borderWidth:1,borderColor:'#2a2a4a'},
  buildEditTxt:{color:'#666',fontSize:12},
  // trait mini badges in build row
  tBadge:{flexDirection:'row',alignItems:'center',borderRadius:10,
    paddingHorizontal:6,paddingVertical:2,gap:2},
  tPos:{backgroundColor:'#0d2a0d',borderWidth:1,borderColor:'#2ecc7133'},
  tNeg:{backgroundColor:'#2a0d0d',borderWidth:1,borderColor:'#e74c3c33'},
  tNeu:{backgroundColor:'#1a1a0d',borderWidth:1,borderColor:'#f39c1233'},
  tBadgeIco:{fontSize:10},
  tBadgeLbl:{color:'#aaa',fontSize:9,fontWeight:'bold'},

  // ── Trait picker modal ─────────────────────────────────────────────
  tpBg:{flex:1,backgroundColor:'#000000cc',justifyContent:'flex-end'},
  tpBox:{backgroundColor:'#111122',borderTopLeftRadius:20,borderTopRightRadius:20,
    borderWidth:1,borderColor:'#2a2a4a',maxHeight:'88%'},
  tpHead:{flexDirection:'row',alignItems:'center',padding:14,gap:8,
    borderBottomWidth:1,borderColor:'#1a1a2e'},
  tpTitle:{color:'#fff',fontSize:16,fontWeight:'bold',flex:1},
  tpBudget:{borderRadius:8,paddingHorizontal:8,paddingVertical:4},
  tpBudgetOk:{backgroundColor:'#0d2a0d',borderWidth:1,borderColor:'#2ecc71'},
  tpBudgetOver:{backgroundColor:'#1a1a0d',borderWidth:1,borderColor:'#f39c12'},
  tpBudgetKo:{backgroundColor:'#2a0d0d',borderWidth:1,borderColor:'#e74c3c'},
  tpBudgetTxt:{fontSize:11,fontWeight:'bold',color:'#fff'},
  tpClose:{backgroundColor:'#1a1a2e',borderRadius:16,width:28,height:28,
    alignItems:'center',justifyContent:'center'},
  tpCloseTxt:{color:'#666',fontSize:14},
  tpHint:{color:'#333',fontSize:9,paddingHorizontal:14,paddingVertical:6,
    letterSpacing:0.5},
  tpScroll:{paddingHorizontal:12},
  tpSec:{color:'#444',fontSize:9,letterSpacing:3,marginTop:14,marginBottom:6,
    paddingHorizontal:2},
  tpGrid:{flexDirection:'row',flexWrap:'wrap',gap:7},
  tpTrait:{flexDirection:'row',alignItems:'center',borderRadius:10,
    paddingHorizontal:8,paddingVertical:6,gap:5,borderWidth:1,
    minWidth:'45%',maxWidth:'48%',flex:1},
  tpUnsel:{backgroundColor:'#1a1a2e',borderColor:'#2a2a4a'},
  tpSel:{backgroundColor:'#0d2a0d',borderColor:'#2ecc71'},
  tpSelNeg:{backgroundColor:'#2a0d0d',borderColor:'#e74c3c'},
  tpSelNeu:{backgroundColor:'#1a1a0d',borderColor:'#f39c12'},
  tpDisabled:{opacity:0.25},
  tpIco:{fontSize:16},
  tpLbl:{color:'#888',fontSize:11,fontWeight:'bold',flex:1},
  tpLblSel:{color:'#fff'},
  tpLblDis:{color:'#333'},
  tpCost:{fontSize:10,fontWeight:'bold',minWidth:22,textAlign:'right'},
  tpCostPos:{color:'#e74c3c'},   // coûte (négatif pour budget)
  tpCostNeg:{color:'#2ecc71'},   // rembourse (positif pour budget)
  tpCostNeu:{color:'#666'},
  tpFoot:{flexDirection:'row',gap:10,padding:14,borderTopWidth:1,borderColor:'#1a1a2e'},
  tpRandom:{flex:1,backgroundColor:'#1a1a2e',borderRadius:10,paddingVertical:12,
    alignItems:'center',borderWidth:1,borderColor:'#2a2a4a'},
  tpRandomTxt:{color:'#888',fontWeight:'bold',fontSize:13},
  tpConfirm:{flex:2,backgroundColor:'#e2b96f',borderRadius:10,paddingVertical:12,alignItems:'center'},
  tpConfirmDis:{backgroundColor:'#333',opacity:0.5},
  tpConfirmTxt:{color:'#0d0d1a',fontWeight:'bold',fontSize:13},
});
