import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Modal, Pressable, TextInput,
  LayoutAnimation, useWindowDimensions, Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import BattleMap from '../components/BattleMap';
import ChampionSprite from '../components/ChampionSprite';
import { useGame } from '../context/GameContext';

// ── Haptique — wrappers silencieux (no-op si non supporté) ───────────────
const haptic = {
  light:   () => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);  } catch {} },
  medium:  () => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {} },
  heavy:   () => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);  } catch {} },
  success: () => { try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {} },
  warning: () => { try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {} },
  error:   () => { try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);   } catch {} },
};

// ── Constantes monde ──────────────────────────────────────────────────────
// WORLD = taille active de la map. Variable selon mapSize (S/M/L).
// Mise à jour par createSimState : S=1800, M=2250, L=2700.
// Toutes les fonctions qui clampent les mouvements/spawns lisent WORLD courant.
let WORLD          = 1800;         // taille initiale S (référence)
let ISLAND_EDGE    = 168;          // bords = eau (scale avec WORLD)
const WORLD_BASE   = 1800;         // référence S immuable
const EDGE_BASE    = 168;
function _applyMapScale(scale) {
  WORLD       = Math.round(WORLD_BASE * scale);
  ISLAND_EDGE = Math.round(EDGE_BASE  * scale);
}
const WATER_DMG    = 3;
const COMBAT_RANGE = 54;           // référence (combat utilise portées arme)
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

// ── Diminishing Returns sur les stats ────────────────────────────────────
// Linéaire de 1→5 (plein rendement), puis ×0.6 par point supplémentaire.
// stat=1→1  stat=5→5  stat=8→6.8  stat=10→8
// But: la différence 3→4 vaut 1.0, la différence 9→10 vaut seulement 0.6.
function dr(stat) {
  const s = Math.max(1, Math.min(10, stat || 1));
  return s <= 5 ? s : 5 + (s - 5) * 0.6;
}

// ── Armes — arbre progressif (craftables + drops Cornucopia) ─────────────
// tier 0 = départ  |  tier 1 = craft basique  |  tier 2 = craft avancé  |  tier 3 = supply-grade
// special: 'bleed'|'armor_break'|'stun'|'block'|'poison' — déclenchement au toucher
const WEAPON_DEFS = {
  // ── Tier 0 : départ ────────────────────────────────────────────────────
  fists:         { tier:0, name:'Poings',            meleeRange:22, rangedRange:0,   dmgMin:1, dmgMax:3,  def:0, special:null           },
  stone_knife:   { tier:0, name:'Couteau de pierre',  meleeRange:22, rangedRange:0,   dmgMin:2, dmgMax:5,  def:0, special:null           },
  // ── Tier 1 : premiers crafts ───────────────────────────────────────────
  club:          { tier:1, name:'Massue de bois',     meleeRange:26, rangedRange:0,   dmgMin:5, dmgMax:10, def:0, special:'armor_break'  },
  hunting_knife: { tier:1, name:'Couteau de chasse',  meleeRange:20, rangedRange:0,   dmgMin:4, dmgMax:8,  def:0, special:'bleed'        },
  crude_spear:   { tier:1, name:'Lance grossière',    meleeRange:42, rangedRange:42,  dmgMin:4, dmgMax:9,  def:1, special:null           },
  sling:         { tier:1, name:'Fronde',             meleeRange:14, rangedRange:72,  dmgMin:3, dmgMax:7,  def:0, special:'stun'         },
  // ── Tier 2 : craft intermédiaire ───────────────────────────────────────
  stone_axe:     { tier:2, name:'Hache de pierre',    meleeRange:28, rangedRange:0,   dmgMin:8, dmgMax:15, def:0, special:'bleed'        },
  wooden_bow:    { tier:2, name:'Arc de bois',        meleeRange:14, rangedRange:140, dmgMin:6, dmgMax:13, def:0, special:null           },
  wooden_shield: { tier:2, name:'Bouclier de bois',   meleeRange:22, rangedRange:0,   dmgMin:2, dmgMax:4,  def:5, special:'block'        },
  // ── Tier 3 : supply-grade (Cornucopia / colis) ─────────────────────────
  sword:         { tier:3, name:'Épée',               meleeRange:32, rangedRange:0,   dmgMin:7, dmgMax:14, def:2, special:null           },
  spear:         { tier:3, name:'Lance de fer',       meleeRange:54, rangedRange:54,  dmgMin:6, dmgMax:13, def:1, special:null           },
  bow:           { tier:3, name:'Arc composite',      meleeRange:14, rangedRange:170, dmgMin:8, dmgMax:18, def:0, special:null           },
  shield:        { tier:3, name:'Bouclier de fer',    meleeRange:27, rangedRange:0,   dmgMin:2, dmgMax:5,  def:7, special:'block'        },
};
const WEAPON_LOOT = ['sword','spear','bow','shield'];
// Valeur comparative d'une arme pour l'IA (plus = mieux)
function weaponScore(wId) {
  const w = WEAPON_DEFS[wId||'stone_knife'];
  if (!w) return 0;
  return w.dmgMax + w.def + (w.rangedRange||0)*0.08;
}

// ── Faune — portées ×3 ────────────────────────────────────────────────────
const FAUNA_DEFS = {
  deer:   { maxHp:50,  speed:6, dmg:0,  food:55, water:12, aggressive:false, fearRange:84,  label:'Cerf'     },
  wolf:   { maxHp:70,  speed:7, dmg:5,  food:30, water:5,  aggressive:true,  attackRange:60, label:'Loup'    },
  rabbit: { maxHp:12,  speed:9, dmg:0,  food:18, water:5,  aggressive:false, fearRange:120, label:'Lapin'    },
  boar:   { maxHp:90,  speed:5, dmg:8,  food:60, water:10, aggressive:true,  attackRange:72, label:'Sanglier' },
};

// ── Flore ─────────────────────────────────────────────────────────────────
const FLORA_DEFS = {
  berries:     { food:32,  water:10, heal:0,  poisonChance:0,    label:'Baies'          },
  herbs:       { food:5,   water:0,  heal:28, poisonChance:0,    label:'Herbes'         },
  mushroom:    { food:22,  water:0,  heal:0,  poisonChance:0.35, label:'Champignon'     },
  waterSource: { food:0,   water:60, heal:0,  poisonChance:0,    label:'Source d\'eau'  },
  poisonPlant: { food:0,   water:0,  heal:0,  poisonChance:1.0,  label:'Plante toxique' },
};

// ── POIs — coords pour la map S (1800×1800). Scalés dans createSimState pour M/L
const BASE_POIS = [
  { id:'caves',      name:'Grottes',        icon:'🌑', x:330,  y:360,  radius:132, effect:'shelter' },
  { id:'ruins',      name:'Ruines',         icon:'🏚', x:1410, y:510,  radius:108, effect:'craft'   },
  { id:'river',      name:'Rivière',        icon:'🌊', x:630,  y:1140, radius:96,  effect:'water'   },
  { id:'watchtower', name:'Tour de guet',   icon:'🗼', x:1530, y:1290, radius:72,  effect:'vision'  },
  { id:'forest',     name:'Forêt Dense',    icon:'🌲', x:390,  y:1410, radius:168, effect:'cover'   },
  { id:'village',    name:'Village',        icon:'🏘', x:1110, y:1620, radius:120, effect:'loot'    },
  { id:'marsh',      name:'Marécage',       icon:'💧', x:240,  y:900,  radius:140, effect:'water'   },
  { id:'highland',   name:'Hauteurs',       icon:'⛰', x:1500, y:360,  radius:90,  effect:'vision'  },
  { id:'oldcamp',    name:'Vieux Camp',     icon:'🏕', x:900,  y:1500, radius:110, effect:'shelter' },
  { id:'hotspring',  name:'Source Chaude',  icon:'♨️', x:1360, y:1000, radius:80,  effect:'water'   },
  { id:'deadforest', name:'Bois Mort',      icon:'🌵', x:500,  y:700,  radius:150, effect:'cover'   },
];

// ── Ressources collectables ────────────────────────────────────────────────
// Taux de collecte par biome (unités/tick quand champion sur bonne zone)
const RESOURCE_GATHER_RATES = {
  wood:          { base:1, biome:{ 'forêt':2,'marais':1,'montagne':0,'désert':0,'toundra':1,'volcan':0,'jungle':3 }, poiEffect:'cover'  },
  stone:         { base:1, biome:{ 'montagne':2,'forêt':0,'marais':0,'désert':1,'toundra':1,'volcan':2,'jungle':0 }, poiEffect:'vision' },
  fiber:         { base:1, biome:{ 'marais':2,'forêt':1,'montagne':1,'désert':0,'toundra':1,'volcan':0,'jungle':2 }, poiEffect:'water'  },
  medicinalPlant:{ base:0, biome:{ 'forêt':1,'marais':1,'montagne':0,'désert':0,'toundra':0,'volcan':0,'jungle':2 }, poiEffect:'water'  },
};
// Skinning donne en plus rawMeat + bone (après chasse, sur carcasse animale)
const ANIMAL_LOOT = {
  deer:   { hide:1, rawMeat:2, bone:1 },
  rabbit: { hide:0, rawMeat:1, bone:0 },
  boar:   { hide:1, rawMeat:3, bone:2 },
  wolf:   { hide:1, rawMeat:1, bone:1 },
};

// ── Craft — système basé sur ressources ───────────────────────────────────
// type: 'weapon'|'armor'|'item'|'trap'|'food'|'heal'
// cost: ressources dépensées  |  time: ticks  |  requiresItem: item nécessaire sans être consommé (outil)
// failCost: fraction des ressources perdues en cas d'échec (0 = rien perdu, 1 = tout perdu)
const CRAFT_RECIPES = [
  // ════ ARMES — Tier 1 ════
  { id:'club',          icon:'🏏', name:'Massue',           type:'weapon', weaponId:'club',
    cost:{ wood:3 },                    time:3,  failCost:0.5,
    desc:'Lourd, brise l\'armure. Se craft n\'importe où.' },
  { id:'hunting_knife', icon:'🗡', name:'Couteau de chasse', type:'weapon', weaponId:'hunting_knife',
    cost:{ stone:2, bone:1 },           time:3,  failCost:0.5,
    desc:'Rapide, applique saignement.' },
  { id:'crude_spear',   icon:'🔱', name:'Lance grossière',   type:'weapon', weaponId:'crude_spear',
    cost:{ wood:2, stone:1 },           time:4,  failCost:0.5,
    desc:'Portée allongée, peut lancer.' },
  { id:'sling',         icon:'🪃', name:'Fronde',            type:'weapon', weaponId:'sling',
    cost:{ fiber:2 },                   time:2,  failCost:0,
    desc:'Attaque à distance basique, peut étourdir.' },
  // ════ ARMES — Tier 2 ════
  { id:'stone_axe',     icon:'🪓', name:'Hache de pierre',   type:'weapon', weaponId:'stone_axe',
    cost:{ stone:2, wood:1, fiber:1 },  time:5,  failCost:0.5,
    desc:'Dégâts élevés + saignement. Coupe le bois plus vite.' },
  { id:'wooden_bow',    icon:'🏹', name:'Arc de bois',        type:'weapon', weaponId:'wooden_bow',
    cost:{ wood:3, fiber:3 },           time:6,  failCost:0.5,
    desc:'Attaque à distance efficace.' },
  { id:'wooden_shield', icon:'🛡', name:'Bouclier de bois',   type:'weapon', weaponId:'wooden_shield',
    cost:{ wood:4, fiber:2 },           time:5,  failCost:0.5,
    desc:'Défense passive élevée.' },
  // ════ ARMURE ════
  { id:'leather_vest',  icon:'🥋', name:'Gilet de cuir',      type:'armor',
    cost:{ hide:2, fiber:1 },           time:5,  failCost:0.5,
    onSuccess:{ stat:'defense', value:3, ticks:999 },
    desc:'+3 défense quasi-permanente.' },
  { id:'bone_helmet',   icon:'💀', name:'Casque d\'os',       type:'armor',
    cost:{ bone:3, fiber:1 },           time:4,  failCost:0.5,
    onSuccess:{ stat:'defense', value:2, ticks:999, resistStun:true },
    desc:'+2 défense, résiste aux étourdissements.' },
  { id:'leather_boots', icon:'👢', name:'Bottes de cuir',     type:'armor',
    cost:{ hide:1, fiber:1 },           time:3,  failCost:0.5,
    onSuccess:{ stat:'speed', value:1, ticks:999 },
    desc:'+1 vitesse quasi-permanente.' },
  // ════ PIÈGES ════
  { id:'snare',         icon:'🪤', name:'Collet',             type:'trap',   trapDmg:0, animalOnly:true,
    cost:{ fiber:2, wood:1 },           time:2,  failCost:0,
    desc:'Piège passif pour animaux — nourriture automatique.' },
  { id:'trap',          icon:'⚙',  name:'Piège de chasse',    type:'trap',   trapDmg:22,
    cost:{ wood:2, stone:1, fiber:1 }, time:4,  failCost:0.5,
    desc:'Piège pour ennemis — dégâts modérés.' },
  { id:'boosted_trap',  icon:'💣', name:'Piège explosif',      type:'trap',   trapDmg:50, requiresItem:'trap',
    cost:{ stone:2, fiber:2 },          time:5,  failCost:0.5,
    desc:'Piège puissant — nécessite un piège de base.' },
  // ════ OUTILS ════
  { id:'torch',         icon:'🔦', name:'Torche',              type:'item',   itemId:'torch',
    cost:{ wood:1, fiber:1 },           time:2,  failCost:0,
    desc:'Chaleur + vision nocturne améliorée.' },
  { id:'rope',          icon:'🪢', name:'Corde',               type:'item',   itemId:'rope',
    cost:{ fiber:4 },                   time:2,  failCost:0,
    desc:'Utile pour renforcer pièges et armes.' },
  { id:'campfire_kit',  icon:'🔥', name:'Kit de feu',          type:'item',   itemId:'campfire_kit',
    cost:{ wood:2, stone:1 },           time:2,  failCost:0,
    desc:'Allumer un feu n\'importe où, même loin d\'un abri.' },
  // ════ NOURRITURE ════
  { id:'cooked_meat',   icon:'🍖', name:'Viande cuite',        type:'food',   needsFire:true,
    cost:{ rawMeat:1 },                 time:2,  failCost:0,
    onSuccess:{ hunger:60, water:10 },
    desc:'Meilleure nutrition que la viande crue.' },
  { id:'ration',        icon:'🥜', name:'Ration sèche',        type:'food',
    cost:{ rawMeat:1, fiber:1 },        time:3,  failCost:0.5,
    onSuccess:{ hunger:40, water:20, giveItem:'ration' },
    desc:'Portable, stockable.' },
  // ════ MÉDECINE ════
  { id:'bandage',       icon:'🩹', name:'Bandage',             type:'heal',
    cost:{ fiber:2 },                   time:1,  failCost:0,
    onSuccess:{ heal:30 },
    desc:'Soin rapide basique.' },
  { id:'herbal_poultice',icon:'🌿',name:'Cataplasme herbal',   type:'heal',
    cost:{ medicinalPlant:2, fiber:1 }, time:3,  failCost:0.5,
    onSuccess:{ heal:80 },
    desc:'Soin puissant.' },
  { id:'antidote',      icon:'🧪', name:'Antidote',            type:'heal',
    cost:{ medicinalPlant:3 },          time:3,  failCost:0.5,
    onSuccess:{ heal:20, clearPoison:true },
    desc:'Élimine le poison.' },
];

// ── Ressources requises pour un craft — lookup rapide ────────────────────
function hasResources(c, recipe) {
  const res = c.resources || {};
  return Object.entries(recipe.cost).every(([k,v]) => (res[k]||0) >= v);
}
function deductResources(c, recipe, fraction=1) {
  c.resources = c.resources || {};
  Object.entries(recipe.cost).forEach(([k,v]) => {
    c.resources[k] = Math.max(0, (c.resources[k]||0) - Math.ceil(v * fraction));
  });
}
// Recette la plus utile disponible pour l'IA selon son état
function bestAvailableRecipe(c, type) {
  const wScore = weaponScore(c.weapon||'stone_knife');
  const candidates = CRAFT_RECIPES.filter(r => {
    if (type && r.type !== type) return false;
    if (!hasResources(c, r)) return false;
    if (r.requiresItem && !(c.items||[]).includes(r.requiresItem)) return false;
    if (r.needsFire && c._activity?.type !== 'campfire') return false;
    if (r.type === 'weapon' && weaponScore(r.weaponId) <= wScore) return false;
    return true;
  });
  if (!candidates.length) return null;
  // Priorité : amélioration d'arme > soin > nourriture > autre
  const prio = { weapon:5, armor:4, heal:3, food:2, trap:2, item:1 };
  return candidates.sort((a,b)=>(prio[b.type]||0)-(prio[a.type]||0))[0];
}

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
  'volcan':   ['clear','heatwave','heatwave','storm','fog'],
  'jungle':   ['rain','rain','fog','storm','clear','rain'],
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
const XP_LEVELS = [0, 50, 120, 220, 350, 500]; // seuils levels 1→5

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
  berserker:   { icon:'⚔️',  label:'Berserker',   preferCraft:'club',         preferPOI:'cornucopia' },
  hunter:      { icon:'🏹',  label:'Chasseur',    preferCraft:'trap',         preferPOI:'watchtower' },
  opportunist: { icon:'🦊',  label:'Opportuniste',preferCraft:'trap',         preferPOI:'village'    },
  survivor:    { icon:'🌿',  label:'Survivant',   preferCraft:'bandage',      preferPOI:'caves'      },
  tank:        { icon:'🛡',  label:'Tank',        preferCraft:'wooden_shield',preferPOI:'ruins'      },
  soldier:     { icon:'🗡',  label:'Soldat',      preferCraft:'crude_spear',  preferPOI:'ruins'      },
};
const ARCH_QUOTES = {
  berserker:   ['Rien ne peut m\'arrêter.','Le sang appelle le sang.'],
  hunter:      ['La patience est ma force.','J\'ai choisi mes cibles.'],
  opportunist: ['J\'ai joué le jeu parfaitement.','Les idiots se sont battus pour moi.'],
  survivor:    ['La forêt m\'a sauvé.','Pas besoin de tuer pour survivre... presque.'],
  tank:        ['Ils se sont brisés sur moi.','J\'ai encaissé chaque coup.'],
  soldier:     ['Discipline et stratégie.','Un guerrier ne faiblit pas.'],
};

// ── Interviews pré-jeux (style Capitol) ──────────────────────────────────
const INTERVIEW_POOL = {
  berserker:[
    n=>`Je suis là pour une chose : la victoire. Quiconque se met en travers de ma route — qu'il se prépare.`,
    n=>`${n} a peur ? Non. La peur, c'est pour les autres. Moi, j'ai la rage.`,
    n=>`Je ne rentrerai pas les mains vides. Du sang coulera, et ce ne sera pas le mien.`,
  ],
  hunter:[
    n=>`L'arène est ma forêt. Je connais chaque bruit, chaque ombre. Ils ne me verront jamais venir.`,
    n=>`La patience est ma plus grande arme. Je peux attendre indéfiniment. Eux, non.`,
    n=>`Chaque proie finit par faire une erreur. Je serai là quand ça arrivera.`,
  ],
  survivor:[
    n=>`Je n'ai pas besoin de tuer pour gagner. L'arène m'appartient autant qu'à eux.`,
    n=>`Je rentrerai à la maison. C'est la seule chose qui compte.`,
    n=>`Ils me sous-estiment. C'est leur plus grave erreur.`,
  ],
  opportunist:[
    n=>`J'ai déjà planifié chaque étape. Les autres feront le sale boulot à ma place.`,
    n=>`Sourires, alliances, trahisons... c'est un jeu, et je joue mieux que tous.`,
    n=>`Le Capitole adore le spectacle. Je vais leur offrir quelque chose d'inoubliable.`,
  ],
  tank:[
    n=>`Frappez-moi. Je vous invite. On verra qui tient le plus longtemps.`,
    n=>`Ma résistance n'a pas de limite. J'ai survécu à pire que cette arène.`,
    n=>`Je suis un roc. Et les vagues finissent toujours par se briser.`,
  ],
  soldier:[
    n=>`Discipline, stratégie, exécution. Rien d'autre n'est nécessaire.`,
    n=>`J'ai un plan. Et un plan de secours. Et encore un autre.`,
    n=>`Les émotions tuent. Je raisonne à froid. C'est pour ça que je gagnerai.`,
  ],
};
const TRAIT_INTERVIEW_SUFFIX = {
  lucky:       `Et franchement ? La chance est avec moi depuis toujours.`,
  paranoid:    `(Ses yeux scrutent la salle.) Je me méfie de tout le monde ici. Même de vous.`,
  honorable:   `Je me battrai avec honneur. Jusqu'au dernier souffle.`,
  bloodthirsty:`J'espère que ce sera long. Plus il y aura de sang, mieux ce sera.`,
  loner:       `Ne comptez pas sur moi pour faire des alliances. Je suis plus efficace seul.`,
  anxious:     `(Sa voix tremble légèrement, mais il/elle soutient le regard de César.)`,
  gladiator:   `J'ai été entraîné pour ça. Ce n'est pas une compétition pour moi — c'est une vocation.`,
  night_owl:   `Je préfère agir la nuit. C'est là que je suis le plus dangereux.`,
  forager:     `L'arène ne manque de rien pour qui sait regarder. Je survivrai par la terre.`,
};
function generateInterview(champ) {
  const pool = INTERVIEW_POOL[champ.archetype] || INTERVIEW_POOL.soldier;
  let txt = pool[Math.floor(Math.random()*pool.length)](champ.name);
  for (const t of (champ.traits||[])) {
    if (TRAIT_INTERVIEW_SUFFIX[t]) { txt += ' ' + TRAIT_INTERVIEW_SUFFIX[t]; break; }
  }
  return txt;
}

// ── Derniers mots (mort) ──────────────────────────────────────────────────
const LAST_WORDS = {
  berserker:   ['Impossible... je ne devais pas perdre !','Au moins je suis mort en combattant.','C\'était... un beau combat.'],
  hunter:      ['Je les ai vus venir... trop tard.','La forêt ne m\'a pas suffi.','Bonne chasse... à toi.'],
  survivor:    ['Je voulais juste rentrer chez moi...','Ce n\'est pas juste.','J\'ai fait de mon mieux.'],
  opportunist: ['Mon plan était parfait...','Qui l\'aurait prévu ?','Bien joué.'],
  tank:        ['Je... n\'aurais pas... dû tomber.','Impressionnant.','Je pensais être invincible.'],
  soldier:     ['Mission échouée.','Je n\'aurais pas dû sous-estimer...','Stratégie... incorrecte.'],
};
function getLastWords(champ) {
  if ((champ.traits||[]).includes('honorable'))   return `Je meurs sans honte. Prenez soin des miens.`;
  if ((champ.traits||[]).includes('bloodthirsty'))return `Au moins... j'ai vu du sang.`;
  if ((champ.traits||[]).includes('paranoid'))    return `Je savais que ça finirait ainsi. Je savais...`;
  if ((champ.traits||[]).includes('anxious'))     return `J'avais trop peur depuis le début...`;
  const pool = LAST_WORDS[champ.archetype]||LAST_WORDS.soldier;
  return pool[Math.floor(Math.random()*pool.length)];
}
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

// ── Helpers ───────────────────────────────────────────────────────────────
const rng   = (a,b) => a + Math.floor(Math.random()*(b-a+1));
const noise = (amp) => Math.floor(Math.random()*amp*2 - amp);

// ── RNG déterministe (génération procédurale cohérente) ───────────────────
function seededRandGen(seed) {
  let s = ((seed ^ 0xdeadbeef) >>> 0) || 1;
  return function() {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    s = s >>> 0;
    return s / 4294967296;
  };
}

// ── Estimation terrain pour placement procédural (cohérente avec le biome) ─
// wx,wy en coordonnées WORLD (0-1800), retourne h∈[0..7]
function simTerrainH(wx, wy, biome, seed) {
  const ix = (wx / WORLD) * 20;
  const iy = (wy / WORLD) * 20;
  const edgeDist = Math.min(ix, iy, 20 - ix, 20 - iy);
  if (edgeDist < 1.5) return 0;
  const baseH = {'forêt':3,'désert':2.5,'toundra':4,'marais':1.5,
                 'montagne':5,'volcan':5.5,'jungle':2}[biome] ?? 3;
  const n1 = Math.sin(wx*0.0137 + seed*0.0007) * Math.cos(wy*0.0119 - seed*0.0011);
  const n2 = Math.sin(wx*0.0253 - seed*0.0013) * Math.cos(wy*0.0197 + seed*0.0009);
  const edgePen = edgeDist < 3 ? (3 - edgeDist) * 0.7 : 0;
  return Math.max(0, Math.min(7, Math.round(baseH + (n1*0.6 + n2*0.4)*2.5 - edgePen)));
}
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
  const s = champ.stats;
  // Base selon type de craft
  const base = recipe.type === 'weapon' ? 0.55
             : recipe.type === 'armor'  ? 0.50
             : recipe.type === 'heal'   ? 0.65
             : 0.60;
  // Bonus stats via DR : instinct + survival + stat spécifique
  // DR/10 au lieu de stat/10 → diminishing returns aussi sur craft
  const statBonus = dr(s.instinct||3)/10 * 0.14 + dr(s.survival||3)/10 * 0.14
    + (recipe.type==='weapon' ? dr(s.strength||3)/10*0.07
     : recipe.type==='armor'  ? dr(s.endurance||3)/10*0.07
     : 0);
  // Bonus POI craft
  const nearCraftPOI = BASE_POIS.find(p=>p.effect==='craft'&&dist(champ,p)<p.radius*1.4);
  const poiBonus = nearCraftPOI ? 0.18 : 0;
  // Traits
  const luckyBonus = (champ.traits||[]).includes('lucky')    ? 0.10 : 0;
  const foragBonus = (champ.traits||[]).includes('forager')  ? 0.08 : 0;
  return Math.min(0.95, base + statBonus + poiBonus + luckyBonus + foragBonus);
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

// ── Level-up interactif — l'IA choisit parmi 3 options selon sa vision ───────
// Poids d'archétype pour chaque stat (0-5)
const ARCH_STAT_WEIGHTS = {
  berserker:   { strength:5, endurance:4, speed:3, defense:2, instinct:2, survival:1 },
  hunter:      { instinct:5, speed:4, survival:3, endurance:2, strength:2, defense:1 },
  survivor:    { survival:5, endurance:4, instinct:3, speed:2, defense:2, strength:1 },
  opportunist: { instinct:5, speed:5, survival:3, endurance:2, strength:2, defense:1 },
  tank:        { defense:5, endurance:5, strength:3, survival:2, instinct:1, speed:1 },
  soldier:     { strength:4, defense:4, endurance:3, instinct:3, speed:2, survival:2 },
};

// Génère 3 choix variés — toujours 2 stats + 1 au choix de l'IA
function generateLevelUpChoices(c) {
  const ALL_STATS = ['strength','speed','defense','endurance','instinct','survival'];
  const weights   = ARCH_STAT_WEIGHTS[c.archetype] || ARCH_STAT_WEIGHTS.soldier;

  // Trier par poids décroissant + légère variance aléatoire pour variété
  const ranked = ALL_STATS
    .map(s => ({ s, w: (weights[s]||1) + Math.random() * 1.5 }))
    .sort((a,b) => b.w - a.w);

  // Choisir 2 stats parmi les 4 meilleures + 1 parmi les moins bonnes (surprises)
  const top2 = ranked.slice(0,2).map(x => ({ type:'stat', stat:x.s, bonus:1 }));
  // Troisième choix : bonus HP si archétype résistant, sinon stat surprise
  const isTank = c.archetype==='tank'||c.archetype==='berserker';
  const hpChoice = { type:'hp', bonus:40 };
  const surpriseStat = ranked[3+Math.floor(Math.random()*2)];
  const third = isTank ? hpChoice : { type:'stat', stat:surpriseStat?.s||ranked[2].s, bonus:1 };
  return [top2[0], top2[1], third];
}

// L'IA évalue chaque choix et sélectionne le meilleur selon sa situation actuelle
function aiPickLevelUpChoice(c, choices) {
  const weights  = ARCH_STAT_WEIGHTS[c.archetype] || ARCH_STAT_WEIGHTS.soldier;
  const hpRatio  = c.hp / (c.maxHp||100);

  return choices.reduce((best, choice) => {
    let score = 0;
    if (choice.type === 'stat') {
      score = (weights[choice.stat] || 1) * 10;
      // Bonus si la stat est sous-développée (min-maxing)
      const cur = c.stats[choice.stat] || 3;
      if (cur <= 3) score += 15;
      else if (cur <= 5) score += 5;
      // Situation : blessé → endurance, survivant en fuite → speed/instinct
      if (choice.stat === 'endurance' && hpRatio < 0.5) score += 12;
      if (choice.stat === 'speed'     && c.archetype === 'hunter')     score += 5;
      if (choice.stat === 'strength'  && (c.simStats?.kills||0) >= 2)  score += 8;
      if (choice.stat === 'survival'  && c.archetype === 'survivor')   score += 8;
      if (choice.stat === 'defense'   && hpRatio < 0.6)                score += 6;
    } else if (choice.type === 'hp') {
      score = 25;
      if (hpRatio < 0.5)  score += 20;
      if (hpRatio < 0.35) score += 15;
      if (c.archetype==='tank'||c.archetype==='berserker') score += 10;
    }
    return score > best.score ? { choice, score } : best;
  }, { choice: choices[0], score: -1 }).choice;
}

// Textes IA pour justifier le choix (narration immersive)
const LEVELUP_REASON = {
  strength:  ['forge ses muscles', 'décuple sa puissance', 'affûte sa brutalité'],
  speed:     ['aiguise ses réflexes', 'accélère sa cadence', 'devient plus rapide que l\'ombre'],
  defense:   ['renforce sa résistance', 'durcit son armure mentale', 'encaisse davantage'],
  endurance: ['développe son endurance', 'repousse ses limites physiques', 'résiste à l\'épuisement'],
  instinct:  ['aiguise ses sens', 'perçoit les moindres détails', 'devine les dangers'],
  survival:  ['maîtrise l\'art de la survie', 'lit la nature comme un livre', 'vit en harmonie avec l\'arène'],
  hp:        ['consolide sa constitution', 'renforce sa robustesse', 'se blinde contre la mort'],
};
function lvlReason(stat) {
  const pool = LEVELUP_REASON[stat] || ['évolue'];
  return pool[Math.floor(Math.random()*pool.length)];
}

function levelUpChamp(c, tick, events) {
  const lvl = c.level;
  // Base permanente : petit boost HP + morale
  c.maxHp += 10;
  c.hp     = Math.min(c.maxHp, c.hp + 10);
  c.morale = Math.min(100, (c.morale||80) + 15);

  // IA choisit parmi 3 options
  const choices = generateLevelUpChoices(c);
  const picked  = aiPickLevelUpChoice(c, choices);

  let effectTxt = '';
  if (picked.type === 'stat') {
    c.stats[picked.stat] = Math.min(10, (c.stats[picked.stat]||3) + picked.bonus);
    effectTxt = `+1 ${STAT_LBL[picked.stat]||picked.stat}`;
  } else if (picked.type === 'hp') {
    c.maxHp  += picked.bonus;
    c.hp      = Math.min(c.maxHp, c.hp + picked.bonus);
    effectTxt = `+${picked.bonus} PV max`;
  }

  const reason = picked.type === 'hp' ? lvlReason('hp') : lvlReason(picked.stat);
  events.push({ type:'narr', sub:'levelup', id:c.id, name:c.name, tick,
    text:`atteint le niveau ${lvl} — ${reason} (${effectTxt}, +10 PV) ⭐` });
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
  // HP via DR : end=1→330, end=5→450, end=10→540
  // (était end*30 linéaire : end=10→600 — DR plafonne à 540, +10% diff max)
  let maxHp = 300 + Math.round(dr(endurance) * 30);
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
    weapon:'stone_knife',   // tout le monde part avec un couteau de pierre
    stats,
    archetype: getArch(stats),
    buffs:[], items:[], statusEffects:[],
    resources:{ wood:0, stone:0, fiber:0, hide:0, rawMeat:0, bone:0, medicinalPlant:0 },
    simStats:{ kills:0, dmgDealt:0, dmgTaken:0, crafts:0, survivedTicks:0, resourcesGathered:0 },
    _memory:{ targetId:null, targetTicks:0, lastAttackerId:null, lastHealTick:-99 },
    _fear:   {},            // { champId: expiryTick } — peur apprise
    _grudge: {},            // { champId: intensity } — rancune
    _pursuitCooldown: 0,    // tick jusqu'auquel cet ennemi n'est pas pourchassé
    _approachTick: 0,       // tick de début de phase d'approche
    _gatherCooldown:0,      // tick de dernière collecte
    _skinTarget:null,       // id carcasse animale à dépouiller
    traits,
    level:    1,
    xp:       0,
    instructions: null,
    _activity:{ type:'idle', startTick:0, craftId:null },
    _mentalState:'normal', _mentalStateTick:0,
    _combatTicks:0, _journal:[], _lastNarrTick:-99,
    sponsorUsername:'simulateur',
  };
}

// ── État initial ──────────────────────────────────────────────────────────
// Tailles de map. scale = facteur appliqué à WORLD, ISLAND_EDGE et POIs.
// S = référence, M = S×1.25, L = S×1.5.
const MAP_SIZES = {
  S:{ scale: 1.00, spawn:[200, 1600] },   // 1800
  M:{ scale: 1.25, spawn:[225, 2025] },   // 2250
  L:{ scale: 1.50, spawn:[270, 2430] },   // 2700
};

// ── Génération faune — procédurale terrain-aware ──────────────────────────
// Les animaux apparaissent selon la hauteur du terrain et le biome.
// Loups/sangliers → zones boisées/mi-hauteur. Lapins → zones ouvertes/basses.
// Cerfs → terrains variés selon biome.
function generateFauna(biome, mapSeed) {
  const rnd = seededRandGen(mapSeed ^ 0x5a3b7c);

  // Nombre total par biome (volontairement modéré)
  const total = {'forêt':8,'désert':5,'toundra':7,'marais':6,
                 'montagne':6,'volcan':4,'jungle':7}[biome] ?? 6;

  // Pool par biome : type, poids relatif, hauteur terrain préférée [hMin, hMax]
  const biomePools = {
    'forêt':    [{t:'deer',w:3,hMin:2,hMax:4},{t:'wolf',w:2,hMin:3,hMax:5},
                 {t:'boar',w:2,hMin:2,hMax:4},{t:'rabbit',w:2,hMin:1,hMax:3}],
    'désert':   [{t:'rabbit',w:4,hMin:1,hMax:3},{t:'deer',w:2,hMin:2,hMax:3},
                 {t:'wolf',w:1,hMin:2,hMax:4}],
    'toundra':  [{t:'wolf',w:3,hMin:3,hMax:6},{t:'deer',w:2,hMin:2,hMax:5},
                 {t:'rabbit',w:3,hMin:2,hMax:4}],
    'marais':   [{t:'boar',w:3,hMin:1,hMax:3},{t:'deer',w:2,hMin:2,hMax:3},
                 {t:'rabbit',w:2,hMin:1,hMax:2}],
    'montagne': [{t:'wolf',w:3,hMin:4,hMax:7},{t:'deer',w:2,hMin:3,hMax:5},
                 {t:'rabbit',w:2,hMin:2,hMax:4}],
    'volcan':   [{t:'wolf',w:3,hMin:3,hMax:6},{t:'boar',w:2,hMin:2,hMax:4}],
    'jungle':   [{t:'boar',w:3,hMin:2,hMax:4},{t:'deer',w:2,hMin:2,hMax:4},
                 {t:'rabbit',w:2,hMin:1,hMax:3}],
  };
  const pool = biomePools[biome] ?? biomePools['forêt'];
  const totalW = pool.reduce((s,p) => s + p.w, 0);

  const result = [];
  let attempts = 0;
  while (result.length < total && attempts < total * 30) {
    attempts++;
    // Tirage pondéré
    let rw = rnd() * totalW, chosen = pool[0];
    for (const p of pool) { rw -= p.w; if (rw <= 0) { chosen = p; break; } }
    // Position dans la zone habitable
    const wx = ISLAND_EDGE + 20 + rnd() * (WORLD - 2*ISLAND_EDGE - 40);
    const wy = ISLAND_EDGE + 20 + rnd() * (WORLD - 2*ISLAND_EDGE - 40);
    // Filtre terrain
    const h = simTerrainH(wx, wy, biome, mapSeed);
    if (h < chosen.hMin || h > chosen.hMax) continue;
    // Espacement min par type
    const minDist = chosen.t === 'wolf' ? 300 : chosen.t === 'boar' ? 250 : 200;
    if (result.some(e => e.type === chosen.t && Math.hypot(e.x-wx, e.y-wy) < minDist)) continue;
    const d = FAUNA_DEFS[chosen.t];
    result.push({id:`fauna_${result.length}`, type:chosen.t, label:d.label,
      x:wx, y:wy, hp:d.maxHp, maxHp:d.maxHp, _fleeTick:0});
  }
  return result;
}

// ── Génération flore — procédurale terrain-aware ──────────────────────────
// Baies/champignons → mi-hauteur. Sources d'eau → terrain bas. Plantes toxiques
// → zones humides/basses. Herbes → partout. Clusters naturels par type.
function generateFlora(biome, mapSeed) {
  const rnd = seededRandGen(mapSeed ^ 0x9f2e4a);

  const total = {'forêt':14,'désert':7,'toundra':10,'marais':12,
                 'montagne':9,'volcan':6,'jungle':16}[biome] ?? 10;

  const biomePools = {
    'forêt':    [{t:'berries',w:3,hMin:2,hMax:4},{t:'herbs',w:3,hMin:2,hMax:5},
                 {t:'mushroom',w:3,hMin:2,hMax:4},{t:'waterSource',w:2,hMin:0,hMax:2}],
    'désert':   [{t:'herbs',w:2,hMin:1,hMax:3},{t:'poisonPlant',w:3,hMin:1,hMax:3},
                 {t:'waterSource',w:1,hMin:0,hMax:1}],
    'toundra':  [{t:'herbs',w:3,hMin:2,hMax:5},{t:'berries',w:2,hMin:2,hMax:4},
                 {t:'mushroom',w:2,hMin:2,hMax:4}],
    'marais':   [{t:'mushroom',w:3,hMin:1,hMax:3},{t:'poisonPlant',w:3,hMin:0,hMax:2},
                 {t:'waterSource',w:2,hMin:0,hMax:1},{t:'herbs',w:2,hMin:1,hMax:3}],
    'montagne': [{t:'berries',w:2,hMin:3,hMax:5},{t:'herbs',w:3,hMin:2,hMax:6},
                 {t:'mushroom',w:2,hMin:2,hMax:4}],
    'volcan':   [{t:'herbs',w:2,hMin:2,hMax:5},{t:'poisonPlant',w:3,hMin:1,hMax:4},
                 {t:'mushroom',w:1,hMin:2,hMax:4}],
    'jungle':   [{t:'berries',w:2,hMin:1,hMax:3},{t:'poisonPlant',w:3,hMin:1,hMax:3},
                 {t:'herbs',w:2,hMin:1,hMax:4},{t:'waterSource',w:2,hMin:0,hMax:2},
                 {t:'mushroom',w:2,hMin:1,hMax:3}],
  };
  const pool = biomePools[biome] ?? biomePools['forêt'];
  const totalW = pool.reduce((s,p) => s + p.w, 0);

  const result = [];
  let attempts = 0;
  while (result.length < total && attempts < total * 25) {
    attempts++;
    let rw = rnd() * totalW, chosen = pool[0];
    for (const p of pool) { rw -= p.w; if (rw <= 0) { chosen = p; break; } }
    const wx = ISLAND_EDGE + 10 + rnd() * (WORLD - 2*ISLAND_EDGE - 20);
    const wy = ISLAND_EDGE + 10 + rnd() * (WORLD - 2*ISLAND_EDGE - 20);
    const h = simTerrainH(wx, wy, biome, mapSeed);
    if (h < chosen.hMin || h > chosen.hMax) continue;
    // Espacement : sources d'eau très espacées, resto regroupé en petits clusters
    const minDist = chosen.t === 'waterSource' ? 380 : 75;
    if (result.some(e => e.type === chosen.t && Math.hypot(e.x-wx, e.y-wy) < minDist)) continue;
    const d = FLORA_DEFS[chosen.t];
    result.push({id:`flora_${result.length}`, type:chosen.t, label:d.label,
      x:wx, y:wy, collected:false, respawnTick:-1});
  }
  return result;
}

function generateObstacles(biome, seed) {
  // Zones de terrain difficile (ralentissent / blessent)
  const rngO = (min,max) => min + Math.abs(Math.sin(seed*13.7+min+max)*99999%1) * (max-min) | 0;
  const defs = {
    'forêt':    [{type:'swamp',     label:'Marécage',        color:'#2a4020',dmg:0.5,slowPct:0.70}],
    'désert':   [{type:'quicksand', label:'Sable mouvant',   color:'#8b2500',dmg:1.0,slowPct:0.85}],
    'toundra':  [{type:'ice',       label:'Glace fine',      color:'#8ab4cc',dmg:0.3,slowPct:0.65}],
    'marais':   [{type:'swamp',     label:'Marécage',        color:'#2a4020',dmg:0.8,slowPct:0.60},
                 {type:'quicksand', label:'Sables mouvants', color:'#6b5530',dmg:1.2,slowPct:0.55}],
    'montagne': [{type:'rockfall',  label:'Pierriers',       color:'#555566',dmg:1.5,slowPct:0.80}],
    // ── Nouveaux biomes ───────────────────────────────────────────────────
    'volcan':   [{type:'lava',      label:'Coulée de lave',  color:'#cc2200',dmg:3.0,slowPct:0.90,
                  _expanding:true},  // zone qui grandit au fil du temps
                 {type:'ash',       label:'Cendres chaudes', color:'#555555',dmg:0.5,slowPct:0.75}],
    'jungle':   [{type:'thicket',   label:'Fourré dense',    color:'#0d3d0d',dmg:0.0,slowPct:0.55,
                  _poisonChance:0.12},  // chance de poison en traversant
                 {type:'swamp',     label:'Boue toxique',    color:'#1a3520',dmg:0.6,slowPct:0.65,
                  _poisonChance:0.08}],
  };
  const pool = defs[biome] || defs['forêt'];
  const result = [];
  const nb = 4 + rngO(0,5);  // un peu plus d'obstacles sur la grande map
  for (let i=0; i<nb; i++) {
    const def = pool[i%pool.length];
    result.push({
      id:`obs_${i}`, ...def,
      x: rngO(ISLAND_EDGE+120, WORLD-ISLAND_EDGE-120),
      y: rngO(ISLAND_EDGE+120, WORLD-ISLAND_EDGE-120),
      radius: rngO(60, 140),   // radii ×2 pour la grande map
    });
  }
  return result;
}

function createSimState(cfg={}) {
  const count      = clamp(cfg.champCount||8, 4, 24);
  const names      = (cfg.champNames||CHAMP_NAMES).slice(0,count);
  const sizeCfg    = MAP_SIZES[cfg.mapSize||'M'];
  const biome      = cfg.biome||['forêt','désert','toundra','marais','montagne','volcan','jungle'][rng(0,6)];
  const mapSeed    = Date.now() % 999983;
  // Scale appliqué selon mapSize : S=1.0, M=1.25, L=1.5
  const scale      = sizeCfg.scale || 1.0;
  _applyMapScale(scale);   // met à jour WORLD et ISLAND_EDGE globaux
  const scaledPOIs = BASE_POIS.map(p => ({
    ...p,
    x: Math.round(p.x * scale),
    y: Math.round(p.y * scale),
    radius: Math.round(p.radius * scale),
    _uses: 0, _depleted: false,
  }));

  // Spawn équidistant sur le périmètre du carré [sMin, sMax]
  const [sMin, sMax] = sizeCfg.spawn;
  const side = sMax - sMin;
  const perim = side * 4;
  const champs = names.map((n,i)=>{
    // progression 0..1 sur le périmètre, légèrement décalée pour éviter coin (i+0.5)
    const t = ((i + 0.5) / count) * perim;
    let sx, sy;
    if (t < side)            { sx = sMin + t;             sy = sMin; }              // haut
    else if (t < 2*side)     { sx = sMax;                 sy = sMin + (t - side); } // droite
    else if (t < 3*side)     { sx = sMax - (t - 2*side);  sy = sMax; }              // bas
    else                     { sx = sMin;                 sy = sMax - (t - 3*side); } // gauche
    const c = makeChamp(`sim_${i}`, n, i, sizeCfg.spawn, cfg.champBuilds?.[i]?.traits || null);
    c.x = sx; c.y = sy;
    return c;
  });

  return {
    id:'sim_local', tick:0, status:'active', winner:null,
    events:[], narrative:[],
    dayPhase:0, alliances:[], activeEvent:null,
    lastEventTick:0,
    simPhase: 'main',
    weather: 'clear', weatherTick: 0,
    sponsorPts: 15, // points sponsor disponibles
    packageInventory: { soin:3, festin:2, torch:2, force:1, vitesse:1, armure:1, sword:0, bow:0 },
    highlights: [], caesarLog: [],
    firstBloodDone: false, _alert3: false, _alert2: false,
    matchStats:{ totalCombats:0, totalCrafts:0, waterDeaths:0, alliancesFormed:0, betrayals:0 },
    map:{
      biome,
      width:mapW, height:mapW,    // mapW = WORLD × scale
      mapSeed,
      pois:scaledPOIs,
      loots:[],
      supplies:[], traps:[], corpses:[],
      fauna:    generateFauna(biome, mapSeed),
      flora:    generateFlora(biome, mapSeed),
      obstacles:generateObstacles(biome, mapSeed),
    },
    champions:champs,
  };
}

// ── IA — nuage de probabilités ────────────────────────────────────────────
const toward = (t,c) => ({dx:sign(t.x-c.x)||noise(1), dy:sign(t.y-c.y)||noise(1)});
const away   = (t,c) => ({dx:sign(c.x-t.x)||noise(1), dy:sign(c.y-t.y)||noise(1)});

function aiMove(c, alive, _zone, supplies, pois, isNight, alliances, activeEvent, fauna, flora, tick, corpses, biome) {
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
  const nearFauna = (fauna||[]).filter(f=>f.hp>0&&dist(f,c)<360);
  const nearFlora = (flora||[]).filter(f=>!f.collected&&dist(f,c)<240);
  const nearWater = nearFlora.find(f=>f.type==='waterSource');
  const nearFood  = nearFlora.find(f=>FLORA_DEFS[f.type]?.food>0);
  const prefPOI   = pois.find(p=>p.id===(ARCH[c.archetype]||ARCH.soldier).preferPOI);
  const shelterPOI= pois.find(p=>!p._disabled&&!p._depleted&&(p.effect==='shelter'||p.effect==='cover'));
  const waterPOI  = pois.find(p=>!p._disabled&&!p._depleted&&(p.effect==='water'));

  // Portée de détection — réduite la nuit et lors d'événements météo
  const traitDetectBonus = (c.traits||[]).includes('eagle_eye') ? 180
    : (c.traits||[]).includes('shortsighted') ? -180 : 0;
  const baseDetect = 540 + traitDetectBonus;
  const isNightOwl = (c.traits||[]).includes('night_owl');
  const detectRange = (activeEvent?.type==='fog'||activeEvent?.type==='sandstorm') ? 180
    : isNight && !isNightOwl ? 300 : baseDetect;
  const visTargets = targets.filter(e=>dist(e,c)<detectRange);

  // Ennemi le plus proche visible
  const closestEnemy = visTargets.length ? visTargets.reduce((p,e)=>dist(e,c)<dist(p,c)?e:p) : null;
  const enemyDist    = closestEnemy ? dist(closestEnemy,c) : 9999;
  const weapon       = WEAPON_DEFS[c.weapon||'fists'];

  // ── Pré-calculs craft / ressources ───────────────────────────────────
  const curWeaponTier = WEAPON_DEFS[c.weapon||'stone_knife']?.tier ?? 0;
  const res           = c.resources || {};
  const totalRes      = (res.wood||0)+(res.stone||0)+(res.fiber||0)+(res.hide||0)+(res.rawMeat||0)+(res.bone||0);
  const nearCraftPOI  = pois.find(p=>!p._disabled&&p.effect==='craft'&&dist(c,p)<p.radius*1.5);
  const canCraftWeapon= !!bestAvailableRecipe(c,'weapon');
  const canCraftHeal  = !!bestAvailableRecipe(c,'heal');
  const canCraftFood  = !!bestAvailableRecipe(c,'food');
  const canCraftTrap  = !!bestAvailableRecipe(c,'trap');
  const canCraftArmor = !!bestAvailableRecipe(c,'armor');
  // Ressource la plus manquante pour l'arme la moins chère crafable
  const nextWeaponRecipe = CRAFT_RECIPES.find(r=>r.type==='weapon'&&weaponScore(r.weaponId)>weaponScore(c.weapon||'stone_knife'));
  const needsWood   = nextWeaponRecipe ? Math.max(0,(nextWeaponRecipe.cost.wood||0)-(res.wood||0)) : 0;
  const needsStone  = nextWeaponRecipe ? Math.max(0,(nextWeaponRecipe.cost.stone||0)-(res.stone||0)) : 0;
  const needsFiber  = nextWeaponRecipe ? Math.max(0,(nextWeaponRecipe.cost.fiber||0)-(res.fiber||0)) : 0;
  const needsHide   = Math.max(0, 2-(res.hide||0));
  const nearCorpse  = (corpses||[]).find(cp=>dist(cp,c)<360);
  const waterPOI2   = pois.find(p=>!p._disabled&&!p._depleted&&(p.effect==='water'));
  const coverPOI    = pois.find(p=>!p._disabled&&(p.effect==='cover'||p.effect==='shelter'));

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
    // Nouvelles actions actives
    gather_wood:    0,   // collecter bois
    gather_stone:   0,   // collecter pierre
    gather_fiber:   0,   // collecter fibre
    gather_hide:    0,   // dépouiller une carcasse animale
    craft_now:      0,   // démarrer un craft disponible immédiatement
    fish:           0,   // pêcher près d'un POI eau
    loot_corpse:    0,   // fouiller le corps d'un champion mort
    ambush:         0,   // se mettre à l'affût dans un couvert
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
      scores.seek_shelter += 4 + (c._eff.survival>=4 ? 2 : 0);
      scores.rest_camp    += 3;
    }
  }

  // ── Exploration ───────────────────────────────────────────────────────
  scores.explore += 1;

  // ── Collecte de ressources — motivée par besoin de craft ─────────────
  // Pas de collecte si danger immédiat ou trop blessé
  const safeToCraft = !closestEnemy || enemyDist > 280;
  if (safeToCraft && curWeaponTier < 2) {
    // Arme faible → fort besoin de ressources pour upgrader
    if (needsWood  > 0) scores.gather_wood  += 3 + needsWood  * 2;
    if (needsStone > 0) scores.gather_stone += 3 + needsStone * 2;
    if (needsFiber > 0) scores.gather_fiber += 2 + needsFiber * 2;
  }
  if (safeToCraft && curWeaponTier < 3 && totalRes < 6) {
    // Stock bas : collecter en prévention (biome passé en paramètre)
    const _biome = biome || 'forêt';
    scores.gather_wood  += (_biome==='forêt'||_biome==='marais') ? 2 : 1;
    scores.gather_stone += (_biome==='montagne') ? 2 : 1;
    scores.gather_fiber += (_biome==='marais') ? 2 : 1;
  }
  // Cuir manquant pour armure
  if (safeToCraft && needsHide > 0 && nearFauna.length > 0) {
    const deadAnimal = (fauna||[]).find(f=>f.hp<=0&&dist(f,c)<240);
    if (deadAnimal) scores.gather_hide += 5 + needsHide * 2;
  }

  // ── Craft immédiat — si ressources disponibles ────────────────────────
  if (safeToCraft && c._activity.type === 'idle') {
    if (canCraftWeapon) scores.craft_now += 6 + (curWeaponTier===0 ? 4 : 2);
    else if (canCraftHeal && hpR < 0.65) scores.craft_now += 5;
    else if (canCraftFood && hungerR < 0.50) scores.craft_now += 4;
    else if (canCraftArmor) scores.craft_now += 3;
    else if (canCraftTrap) scores.craft_now += 2;
  }

  // ── Pêche ─────────────────────────────────────────────────────────────
  if (hungerR < 0.6 && waterPOI2 && dist(c, waterPOI2) < waterPOI2.radius * 2.5) {
    scores.fish += 3 + (hungerR < 0.35 ? 3 : 0);
  }

  // ── Fouiller un corps ─────────────────────────────────────────────────
  if (nearCorpse && safeToCraft) {
    scores.loot_corpse += 4 + (nearCorpse.hasWeapon ? 4 : 0);
  }

  // ── Embuscade — attendre en couvert ──────────────────────────────────
  if (closestEnemy && hpR > 0.55 && coverPOI && dist(c, coverPOI) < coverPOI.radius * 2) {
    const w = WEAPON_DEFS[c.weapon||'stone_knife'];
    if (w.rangedRange > 0) scores.ambush += 3; // arc/fronde : embuscade efficace
  }

  // ── Modificateurs archétype ───────────────────────────────────────────
  switch(c.archetype) {
    case 'berserker':
      scores.attack_melee  = Math.round(scores.attack_melee * 1.8);
      scores.flee_enemy    = Math.round(scores.flee_enemy * 0.25);
      scores.rest_camp     = Math.round(scores.rest_camp * 0.5);
      scores.gather_wood  += 1; scores.gather_stone += 1; // craft arme en priorité
      scores.craft_now     = Math.round(scores.craft_now * 1.4);
      scores.explore      += 2;
      break;
    case 'hunter':
      scores.attack_ranged = Math.round(scores.attack_ranged * 1.6);
      scores.hunt_animal   = Math.round(scores.hunt_animal   * 1.8);
      scores.gather_hide  += 3; // dépouille les animaux en priorité
      scores.ambush        = Math.round(scores.ambush * 2.0);
      scores.fish         += 2;
      scores.flee_enemy    = Math.round(scores.flee_enemy * 1.1);
      break;
    case 'survivor':
      scores.flee_enemy    = Math.round(scores.flee_enemy * 1.6);
      scores.seek_food     = Math.round(scores.seek_food  * 1.5);
      scores.seek_water    = Math.round(scores.seek_water * 1.5);
      scores.rest_camp     = Math.round(scores.rest_camp  * 1.4);
      scores.gather_fiber += 3; scores.gather_wood += 2; // craft médecine/outil
      scores.fish         += 3; scores.craft_now = Math.round(scores.craft_now * 1.5);
      scores.attack_melee  = Math.round(scores.attack_melee * 0.4);
      break;
    case 'opportunist':
      scores.collect_supply = Math.round(scores.collect_supply * 1.6);
      scores.loot_corpse   += 4; // pille les morts
      scores.ambush         = Math.round(scores.ambush * 1.5);
      scores.attack_melee   = closestEnemy && (closestEnemy.hp/closestEnemy.maxHp)<0.3
        ? scores.attack_melee*2 : Math.round(scores.attack_melee*0.65);
      break;
    case 'tank':
      scores.attack_melee  = Math.round(scores.attack_melee * 1.4);
      scores.flee_enemy    = Math.round(scores.flee_enemy * 0.3);
      scores.gather_stone += 2; scores.gather_wood += 1; // craft bouclier/armure
      scores.rest_camp     = Math.round(scores.rest_camp  * 0.7);
      break;
    case 'soldier':
      scores.gather_wood  += 1; scores.gather_stone += 1; scores.gather_fiber += 1;
      scores.craft_now     = Math.round(scores.craft_now * 1.3);
      scores.explore      += 1;
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
    scores.gather_wood   += 2; scores.gather_fiber += 2; scores.craft_now += 2;
    scores.rest_camp     += 2;
  }
  if (instr.match(/craft|fabr|construire|outil/)) {
    scores.craft_now     += 5; scores.gather_wood += 3; scores.gather_stone += 3; scores.gather_fiber += 3;
    scores.attack_melee   = Math.max(0, scores.attack_melee-2);
  }
  if (instr.match(/explor|bouger|découv/)) {
    scores.explore += 5; scores.rest_camp = Math.max(0,scores.rest_camp-2);
  }
  if (instr.match(/repos|dor|camp|calme/)) {
    scores.rest_camp += 5; scores.seek_shelter += 3;
  }
  if (instr.match(/chasse|traque|proie/)) {
    scores.hunt_animal += 5; scores.gather_hide += 3; scores.attack_ranged += 2; scores.fish += 2; scores.explore += 2;
  }
  if (instr.match(/embuscade|piège|guet/)) {
    scores.ambush += 5; scores.craft_now += 2;
  }

  // ── Modificateurs traits ───────────────────────────────────────────────
  (c.traits||[]).forEach(t => {
    switch(t) {
      // Positifs
      case 'athlete':       scores.explore+=1; scores.gather_wood+=1; scores.gather_stone+=1; break;
      case 'forager':       scores.seek_food=Math.round(scores.seek_food*1.6); scores.seek_water=Math.round(scores.seek_water*1.4);
                            scores.hunt_animal=Math.round(scores.hunt_animal*1.5); scores.gather_fiber=Math.round(scores.gather_fiber*1.8);
                            scores.gather_wood=Math.round(scores.gather_wood*1.4); scores.fish+=2; break;
      case 'night_owl':     if(isNight) { scores.explore+=2; scores.attack_melee+=1; scores.ambush+=2; } break;
      case 'lucky':         scores.collect_supply=Math.round(scores.collect_supply*1.4); scores.loot_corpse+=1; break;
      case 'honorable':     break; // géré dans tryAlliance
      // Négatifs
      case 'anxious':       scores.flee_enemy=Math.round(scores.flee_enemy*1.6)+2; scores.seek_shelter+=2;
                            scores.attack_melee=Math.round(scores.attack_melee*0.7); scores.craft_now+=1; break;
      case 'impulsive':     scores.attack_melee=Math.round(scores.attack_melee*1.6); scores.flee_enemy=0;
                            scores.rest_camp=Math.round(scores.rest_camp*0.3); scores.gather_wood=Math.round(scores.gather_wood*0.4); break;
      case 'cold_sensitive':if(isNight||(c.temperature??50)<35) { scores.seek_shelter+=5; scores.rest_camp+=4; scores.attack_melee=Math.round(scores.attack_melee*0.5); } break;
      case 'heavy_eater':   if(hungerR<0.5) { scores.seek_food+=3; scores.fish+=2; scores.hunt_animal+=2; } break;
      case 'thirsty_trait': if(thirstR<0.5) scores.seek_water+=3; break;
      case 'lazy':          scores.rest_camp=Math.round(scores.rest_camp*1.5); scores.explore=Math.round(scores.explore*0.6);
                            scores.gather_wood=Math.round(scores.gather_wood*0.5); scores.gather_stone=Math.round(scores.gather_stone*0.5); break;
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
      const prey = nearFauna.find(f=>!FAUNA_DEFS[f.type]?.aggressive&&dist(f,c)<360);
      return prey ? toward(prey,c) : {dx:noise(2),dy:noise(2)};
    }
    case 'collect_supply':
      return nearSup ? toward(nearSup,c) : {dx:noise(2),dy:noise(2)};
    case 'seek_shelter':
      return shelterPOI ? toward(shelterPOI,c) : {dx:noise(2),dy:noise(2)};
    case 'rest_camp': {
      if (shelterPOI && dist(c,shelterPOI)>shelterPOI.radius*0.8)
        return toward(shelterPOI,c);
      return {dx:0,dy:0};
    }

    // ── Nouvelles actions ──────────────────────────────────────────────
    case 'gather_wood': {
      // Forêt Dense ou Bois Mort = meilleure source de bois
      const woodPOI = pois.find(p=>!p._disabled&&(p.effect==='cover')&&dist(c,p)<p.radius*2.5);
      return woodPOI ? toward(woodPOI,c) : {dx:noise(2),dy:noise(2)};
    }
    case 'gather_stone': {
      // Hauteurs ou Ruines = pierre
      const stonePOI = pois.find(p=>!p._disabled&&(p.effect==='vision'||p.effect==='craft')&&dist(c,p)<p.radius*3);
      return stonePOI ? toward(stonePOI,c) : {dx:noise(2),dy:noise(2)};
    }
    case 'gather_fiber': {
      // Marécage ou source d'eau = fibre
      const fiberPOI = pois.find(p=>!p._disabled&&(p.effect==='water')&&dist(c,p)<p.radius*3);
      return fiberPOI ? toward(fiberPOI,c) : {dx:noise(2),dy:noise(2)};
    }
    case 'gather_hide': {
      // Trouver une carcasse d'animal tué (hp=0)
      const carcass = (fauna||[]).find(f=>f.hp<=0&&dist(f,c)<400);
      return carcass ? toward(carcass,c) : {dx:noise(2),dy:noise(2)};
    }
    case 'craft_now': {
      // Rester sur place ou aller au POI craft pour le bonus
      if (nearCraftPOI && dist(c, nearCraftPOI) > nearCraftPOI.radius * 0.9)
        return toward(nearCraftPOI, c);
      return {dx:0,dy:0}; // commencera en tryNarrative ce tick-ci
    }
    case 'fish': {
      // Aller à la rivière ou au marécage
      return waterPOI2 ? toward(waterPOI2,c) : {dx:noise(2),dy:noise(2)};
    }
    case 'loot_corpse': {
      return nearCorpse ? toward(nearCorpse,c) : {dx:noise(2),dy:noise(2)};
    }
    case 'ambush': {
      // Se placer dans le couvert le plus proche
      if (coverPOI && dist(c, coverPOI) > coverPOI.radius * 0.7)
        return toward(coverPOI,c);
      return {dx:0,dy:0}; // en position — attendre
    }

    case 'explore':
    default:
      if (prefPOI&&!prefPOI._disabled&&dist(prefPOI,c)>180) return toward(prefPOI,c);
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
  if (c._activity.type==='idle' && rand<0.14) {
    // Priorité archétype: arme > soin > autre
    const typeOrder = {
      berserker:['weapon','heal','food'],
      hunter:   ['trap','weapon','food'],
      survivor: ['heal','food','armor'],
      tank:     ['armor','weapon','heal'],
      soldier:  ['weapon','armor','heal'],
      opportunist:['trap','weapon','food'],
    }[c.archetype] || ['weapon','heal','food'];
    let recipe = null;
    for (const t of typeOrder) {
      recipe = bestAvailableRecipe(c, t);
      if (recipe) break;
    }
    if (!recipe) recipe = bestAvailableRecipe(c, null);
    if (recipe) {
      c._activity = { type:'crafting', startTick:state.tick, craftId:recipe.id };
      c._lastNarrTick = state.tick;
      const loc = nearPOI ? ` dans les ${nearPOI.name}` : '';
      events.push({ type:'narr', sub:'craft_start', id:c.id, name:c.name, tick:state.tick,
        text:`commence à fabriquer ${recipe.icon} ${recipe.name}${loc}…` });
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
    if (c._activity.type !== 'crafting') return;
    const recipe = CRAFT_RECIPES.find(r => r.id === c._activity.craftId);
    if (!recipe) { c._activity = { type:'idle', startTick:tick }; return; }
    if (tick - c._activity.startTick < recipe.time) return;

    c._activity = { type:'idle', startTick:tick };

    // Vérifier ressources encore disponibles (peuvent avoir été perdues)
    if (!hasResources(c, recipe)) {
      events.push({ type:'narr', sub:'craft_fail', id:c.id, name:c.name, tick,
        text:`n'a plus les ressources pour finir ${recipe.icon} ${recipe.name}.` });
      return;
    }

    const success = Math.random() < craftSuccessChance(c, recipe);

    if (success) {
      deductResources(c, recipe, 1);
      matchStats.totalCrafts++;
      c.simStats.crafts++;
      c.xp = (c.xp || 0) + XP_PER_CRAFT;

      // ── Effets selon type ─────────────────────────────────────────────
      if (recipe.type === 'weapon') {
        c.weapon = recipe.weaponId;
        events.push({ type:'narr', sub:'craft_ok', id:c.id, name:c.name, craftId:recipe.id, tick,
          text:`fabrique ${recipe.icon} ${recipe.name} ! ⚔️ (tier ${WEAPON_DEFS[recipe.weaponId]?.tier||1})` });
      }
      else if (recipe.type === 'armor') {
        const eff = recipe.onSuccess || {};
        if (eff.stat) c.buffs.push({ stat:eff.stat, value:eff.value, ticks:eff.ticks||999 });
        if (eff.resistStun) c._resistStun = true;
        events.push({ type:'narr', sub:'craft_ok', id:c.id, name:c.name, craftId:recipe.id, tick,
          text:`fabrique ${recipe.icon} ${recipe.name} ! 🛡` });
      }
      else if (recipe.type === 'trap') {
        if (recipe.id === 'snare') {
          traps.push({ id:`snare_${tick}_${c.id}`, x:c.x+rng(-10,10), y:c.y+rng(-10,10), ownerId:c.id, dmg:0, animalOnly:true });
        } else if (recipe.id === 'boosted_trap') {
          c.items = (c.items||[]).filter(it=>it!=='trap');
          traps.push({ id:`trap_${tick}_${c.id}`, x:c.x+rng(-6,6), y:c.y+rng(-6,6), ownerId:c.id, dmg:50, boosted:true });
        } else {
          c.items.push('trap');
          traps.push({ id:`trap_${tick}_${c.id}`, x:c.x+rng(-6,6), y:c.y+rng(-6,6), ownerId:c.id, dmg:22 });
        }
        events.push({ type:'narr', sub:'craft_ok', id:c.id, name:c.name, craftId:recipe.id, tick,
          text:`pose ${recipe.icon} ${recipe.name} !` });
      }
      else if (recipe.type === 'item') {
        c.items.push(recipe.itemId);
        events.push({ type:'narr', sub:'craft_ok', id:c.id, name:c.name, craftId:recipe.id, tick,
          text:`fabrique ${recipe.icon} ${recipe.name}.` });
      }
      else if (recipe.type === 'food') {
        const eff = recipe.onSuccess || {};
        if (eff.hunger) c.hunger = Math.min(100, (c.hunger||100) + eff.hunger);
        if (eff.water)  c.thirst = Math.min(100, (c.thirst||100) + eff.water);
        if (eff.giveItem) c.items.push(eff.giveItem);
        events.push({ type:'narr', sub:'craft_ok', id:c.id, name:c.name, craftId:recipe.id, tick,
          text:`prépare ${recipe.icon} ${recipe.name} 🍽` });
      }
      else if (recipe.type === 'heal') {
        const eff = recipe.onSuccess || {};
        if (eff.heal)        c.hp = Math.min(c.maxHp, c.hp + eff.heal);
        if (eff.clearPoison) c.statusEffects = (c.statusEffects||[]).filter(se=>se.type!=='poison');
        events.push({ type:'narr', sub:'craft_ok', id:c.id, name:c.name, craftId:recipe.id, tick,
          text:`utilise ${recipe.icon} ${recipe.name} (+${(recipe.onSuccess?.heal||0)} PV).` });
      }
    } else {
      // Échec : perte partielle de ressources
      deductResources(c, recipe, recipe.failCost || 0);
      const failMsgs = [
        `rate la fabrication de ${recipe.icon} ${recipe.name}…`,
        `gâche les matériaux pour ${recipe.icon} ${recipe.name}.`,
        `échoue à assembler ${recipe.icon} ${recipe.name}.`,
      ];
      events.push({ type:'narr', sub:'craft_fail', id:c.id, name:c.name, craftId:recipe.id, tick,
        text:failMsgs[rng(0,failMsgs.length-1)] });
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
      if (dist(c,trap)<30 && !((c.traits||[]).includes('lucky')&&Math.random()<0.35)) {
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
      if (dist(a,b)>270) continue;
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
        state.map.supplies.push({id:`ev_${i}_${state.tick}`,type:types[i%types.length],x:rng(500,1300),y:rng(500,1300)});
      events.push({type:'event',evType:'supply_rain',tick:state.tick,
        text:`📦 Les Organisateurs larguent ${count} colis en zone centrale !`});
      break;
    }
    case 'fire': {
      const p=state.map.pois.find(poi=>poi.effect==='cover')||{x:390,y:1410};
      state.activeEvent={type:'fire',startTick:state.tick,duration:10,x:p.x+rng(-60,60),y:p.y+rng(-60,60),radius:108};
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

// ── Clone rapide : structuredClone > JSON.parse/stringify (≈3× plus vite) ─
// On plafonne aussi les tableaux qui grossissent sans limite.
function fastClone(prev) {
  // Tronquer avant clone pour éviter que les gros tableaux explosent le temps de clone
  const MAX_EVENTS = 400;
  const MAX_NARR   = 200;
  const evLen = prev.events?.length  || 0;
  const nrLen = prev.narrative?.length || 0;
  if (evLen > MAX_EVENTS || nrLen > MAX_NARR) {
    // Shallow-copy root puis tronquer les tableaux concernés avant le vrai clone
    const tmp = {
      ...prev,
      events:    evLen > MAX_EVENTS ? prev.events.slice(-MAX_EVENTS) : prev.events,
      narrative: nrLen > MAX_NARR   ? prev.narrative.slice(-MAX_NARR): prev.narrative,
    };
    return typeof structuredClone === 'function'
      ? structuredClone(tmp)
      : JSON.parse(JSON.stringify(tmp));
  }
  return typeof structuredClone === 'function'
    ? structuredClone(prev)
    : JSON.parse(JSON.stringify(prev));
}

// ── tickSim ───────────────────────────────────────────────────────────────
function tickSim(prev) {
  if (prev.status!=='active') return prev;
  const state = fastClone(prev);
  state.tick++;
  state.dayPhase = state.tick % DAY_LEN;
  const isNight = state.dayPhase >= NIGHT_START;
  const events  = [];
  const alive   = state.champions.filter(c=>c.hp>0);

  if (alive.length<=1) {
    state.status='finished'; state.winner=alive[0]?.id??null;
    state.events=[...state.events,...events].slice(-400);
    return state;
  }


  // ── Météo ─────────────────────────────────────────────────────────────
  tickWeather(state, events);
  const wDef = WEATHER_TYPES[state.weather] || WEATHER_TYPES.clear;

  // ── Biome Volcan : les coulées de lave s'étendent progressivement ─────
  if (state.map.biome === 'volcan' && state.tick % 15 === 0) {
    (state.map.obstacles||[]).forEach(o => {
      if (o._expanding && o.radius < 280) {
        o.radius += 8;  // ~+8 unités tous les 15 ticks
        if (state.tick % 60 === 0) events.push({type:'event',evType:'lava_expand',tick:state.tick,
          text:`🌋 Les coulées de lave s'étendent — la zone devient plus dangereuse !`});
      }
    });
  }

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
    if (inObstacle) {
      // Dégâts de terrain
      if (inObstacle.dmg > 0 && Math.random() < 0.08) {
        const od = Math.ceil(inObstacle.dmg * rng(1,3));
        c.hp -= od; c.simStats.dmgTaken += od;
        if (state.tick%10===0) events.push({type:'narr',sub:'terrain',id:c.id,name:c.name,tick:state.tick,
          text:`traverse ${inObstacle.label} (−${od} PV)`});
      }
      // Jungle : poison dans les fourrés/boue
      if (inObstacle._poisonChance && Math.random() < inObstacle._poisonChance) {
        if (!c.statusEffects?.some(se=>se.type==='poison')) {
          c.statusEffects = c.statusEffects||[];
          c.statusEffects.push({type:'poison',ticks:8,srcId:`obs_${inObstacle.id}`});
          if (state.tick%15===0) events.push({type:'narr',sub:'poison',id:c.id,name:c.name,tick:state.tick,
            text:`est empoisonné(e) par les plantes de la jungle 🌿`});
        }
      }
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
  // Seuil abaissé à 4 (était 6) — survival utile dès le milieu de gamme
  // Montant via DR : surv=4→15 HP, surv=5→18 HP, surv=10→26 HP
  alive.forEach(c=>{
    if (c._eff.survival < 4 || c.hp >= c.maxHp * 0.80) return;
    if (state.tick-(c._memory.lastHealTick??-99)<15) return;
    const others=alive.filter(e=>e.id!==c.id&&e.hp>0);
    const close=others.length?others.reduce((p,e)=>dist(e,c)<dist(p,c)?e:p):null;
    if (close&&dist(close,c)<144) return;
    const heal = Math.round(4 + dr(c._eff.survival) * 2.8);
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

  // ── Collecte de ressources ────────────────────────────────────────────
  if (!state.map.corpses) state.map.corpses = [];
  alive.filter(c=>c.hp>0).forEach(c => {
    if (state.tick - (c._gatherCooldown||0) < 2) return; // cooldown collecte
    const biome = state.map.biome;
    const pois2 = state.map.pois.filter(p=>!p._disabled&&!p._depleted);

    // ── Bois : près d'un POI cover ou biome forêt ───────────────────
    const nearWood = pois2.find(p=>(p.effect==='cover')&&dist(c,p)<p.radius*1.1);
    const woodRate = (RESOURCE_GATHER_RATES.wood.biome[biome]||1) * (nearWood?1.5:0.4);
    if (Math.random() < 0.25 * woodRate) {
      c.resources.wood = (c.resources.wood||0)+1;
      c.simStats.resourcesGathered++;
      c._gatherCooldown = state.tick;
      if (Math.random()<0.18) events.push({type:'narr',sub:'gather',id:c.id,name:c.name,tick:state.tick,
        text:`ramasse du bois 🪵 (${c.resources.wood} en stock)`});
    }

    // ── Pierre : près d'un POI vision/craft ou biome montagne ───────
    const nearStone = pois2.find(p=>(p.effect==='vision'||p.effect==='craft')&&dist(c,p)<p.radius*1.1);
    const stoneRate = (RESOURCE_GATHER_RATES.stone.biome[biome]||1) * (nearStone?1.5:0.3);
    if (Math.random() < 0.20 * stoneRate) {
      c.resources.stone = (c.resources.stone||0)+1;
      c.simStats.resourcesGathered++;
      c._gatherCooldown = state.tick;
      if (Math.random()<0.18) events.push({type:'narr',sub:'gather',id:c.id,name:c.name,tick:state.tick,
        text:`ramasse de la pierre 🪨 (${c.resources.stone} en stock)`});
    }

    // ── Fibre : près eau/marais ou partout si biome marais ──────────
    const nearFiber = pois2.find(p=>(p.effect==='water')&&dist(c,p)<p.radius*1.2);
    const fiberRate = (RESOURCE_GATHER_RATES.fiber.biome[biome]||1) * (nearFiber?1.5:0.5);
    if (Math.random() < 0.22 * fiberRate) {
      c.resources.fiber = (c.resources.fiber||0)+1;
      c.simStats.resourcesGathered++;
      c._gatherCooldown = state.tick;
    }

    // ── Plante médicinale : flore de type herbs ou waterSource ──────
    const nearMed = state.map.flora?.find(f=>!f.collected&&(f.type==='herbs'||f.type==='waterSource')&&dist(c,f)<56);
    if (nearMed && Math.random()<0.35) {
      c.resources.medicinalPlant = (c.resources.medicinalPlant||0)+1;
      nearMed.collected=true; nearMed.respawnTick=state.tick+80;
      c.simStats.resourcesGathered++;
      if (Math.random()<0.25) events.push({type:'narr',sub:'gather',id:c.id,name:c.name,tick:state.tick,
        text:`cueille une plante médicinale 🌿`});
    }

    // ── Dépouiller une carcasse animale (hide, rawMeat, bone) ───────
    const carcass = state.map.fauna?.find(f=>f.hp<=0&&!f._skinned&&dist(c,f)<56);
    if (carcass && Math.random()<0.45) {
      const loot = ANIMAL_LOOT[carcass.type]||{ hide:0, rawMeat:1, bone:0 };
      if (loot.hide)    c.resources.hide    = (c.resources.hide||0)+loot.hide;
      if (loot.rawMeat) c.resources.rawMeat = (c.resources.rawMeat||0)+loot.rawMeat;
      if (loot.bone)    c.resources.bone    = (c.resources.bone||0)+loot.bone;
      carcass._skinned = true;
      c.simStats.resourcesGathered++;
      const parts = [];
      if (loot.hide)    parts.push(`${loot.hide}🐾`);
      if (loot.rawMeat) parts.push(`${loot.rawMeat}🥩`);
      if (loot.bone)    parts.push(`${loot.bone}🦴`);
      events.push({type:'narr',sub:'gather',id:c.id,name:c.name,tick:state.tick,
        text:`dépouille la carcasse (${parts.join(' ')})`});
    }

    // ── Fouiller un cadavre ennemi ───────────────────────────────────
    const corpse = state.map.corpses.find(cp=>!cp._looted&&dist(cp,c)<44);
    if (corpse && Math.random()<0.60) {
      corpse._looted = true;
      const gains = [];
      if (corpse.weapon && weaponScore(corpse.weapon) > weaponScore(c.weapon||'stone_knife')) {
        c.weapon = corpse.weapon;
        gains.push(`${WEAPON_DEFS[corpse.weapon]?.name} ⚔️`);
      }
      (corpse.items||[]).forEach(it=>{ c.items.push(it); gains.push(it); });
      if (corpse.resources) {
        Object.entries(corpse.resources).forEach(([k,v])=>{
          if (v>0) { c.resources[k]=(c.resources[k]||0)+Math.ceil(v/2); gains.push(`${Math.ceil(v/2)} ${k}`); }
        });
      }
      if (gains.length) events.push({type:'narr',sub:'loot',id:c.id,name:c.name,tick:state.tick,
        text:`fouille le corps de ${corpse.name} → ${gains.join(', ')}`});
    }

    // ── Pêche près d'un POI eau ──────────────────────────────────────
    const wPOI = state.map.pois.find(p=>!p._disabled&&!p._depleted&&p.effect==='water'&&dist(c,p)<p.radius*1.1);
    if (wPOI && Math.random()<0.12) {
      const fishFood = rng(18,35);
      c.hunger = Math.min(100,(c.hunger||100)+fishFood);
      c.resources.rawMeat = (c.resources.rawMeat||0)+1;
      c.xp = (c.xp||0)+XP_PER_HUNT;
      if (Math.random()<0.30) events.push({type:'narr',sub:'fish',id:c.id,name:c.name,tick:state.tick,
        text:`pêche dans la ${wPOI.name} (+${fishFood}🍗, +1🥩)`});
    }
  });

  // ── Mise à jour corpses champions (créée à la mort) ──────────────────
  // (le push vers state.map.corpses se fait dans la boucle combat ci-dessous)
  // Nettoyer les corps trop vieux
  state.map.corpses = state.map.corpses.filter(cp=>state.tick - cp.deathTick < 60);

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
      if (close&&dist(close,c)<40) c._activity={type:'idle',startTick:state.tick};
      else return;
    }
    const stormSlow = (state.activeEvent?.type==='sandstorm'||state.activeEvent?.type==='fog') ? 0.55 : 1;
    // Nuit : pénalité si instinct bas — seuil à 4 (DR(4)=4) pour cohérence
    const nightSlow = isNight&&c._eff.instinct<=4&&!(c.traits||[]).includes('night_owl') ? 0.6 : 1;
    const weatherSlow = wDef.speedPct;
    const obstSlow  = (state.map.obstacles||[]).find(o=>dist(c,o)<o.radius) ? (state.map.obstacles.find(o=>dist(c,o)<o.radius).slowPct||0.7) : 1;
    // Speed via DR : speed=10 ne donne plus 10 cases/tick mais 8 (DR plafonne)
    const spd = Math.max(1, dr(c._eff.speed)) * stormSlow * nightSlow * weatherSlow * obstSlow;

    let dx, dy;
    {
      const r = aiMove(c, alive, null, state.map.supplies, state.map.pois, isNight, state.alliances, state.activeEvent, state.map.fauna, state.map.flora, state.tick, state.map.corpses, state.map.biome);
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

    const prevX = f.x, prevY = f.y;
    if (def.aggressive) {
      // Loups/sangliers : attaquent si à portée
      if (nearChamp && d < def.attackRange) {
        const dmg = rng(Math.floor(def.dmg*0.6), def.dmg);
        nearChamp.hp -= dmg; nearChamp.simStats.dmgTaken += dmg;
        events.push({type:'narr',sub:'fauna_attack',id:nearChamp.id,name:nearChamp.name,tick:state.tick,
          text:`est attaqué(e) par un ${def.label} (−${dmg} PV) !`});
        if (nearChamp.hp <= 0) events.push({type:'death',champion:nearChamp.id,name:nearChamp.name,killedBy:'fauna',killedByName:def.label});
        // Mouvement vers la proie
        if (d > 3) { f.x+=sign(nearChamp.x-f.x)*def.speed*5; f.y+=sign(nearChamp.y-f.y)*def.speed*5; }
      } else if (nearChamp && d < 180) {
        f.x += sign(nearChamp.x-f.x)*def.speed*4+noise(3);
        f.y += sign(nearChamp.y-f.y)*def.speed*4+noise(3);
      } else {
        // Déambulation : cible persistante pour éviter le surplace
        if (!f._wX || !f._wY || Math.hypot(f.x-f._wX, f.y-f._wY) < 60) {
          f._wX = rng(ISLAND_EDGE+100, WORLD-ISLAND_EDGE-100);
          f._wY = rng(ISLAND_EDGE+100, WORLD-ISLAND_EDGE-100);
        }
        // Vitesse réduite (*2.5 au lieu de *6) — animaux moins frénétiques
        f.x += sign(f._wX-f.x)*def.speed*2.5 + noise(2);
        f.y += sign(f._wY-f.y)*def.speed*2.5 + noise(2);
      }
    } else {
      // Cerfs/lapins : fuient si proche, sinon déambulent vers cible
      if (nearChamp && d < def.fearRange) {
        f.x += sign(f.x - nearChamp.x)*def.speed*2.2+noise(2);
        f.y += sign(f.y - nearChamp.y)*def.speed*2.2+noise(2);
      } else {
        if (!f._wX || !f._wY || Math.hypot(f.x-f._wX, f.y-f._wY) < 60) {
          f._wX = rng(ISLAND_EDGE+100, WORLD-ISLAND_EDGE-100);
          f._wY = rng(ISLAND_EDGE+100, WORLD-ISLAND_EDGE-100);
        }
        // Vitesse réduite
        f.x += sign(f._wX-f.x)*def.speed*2.5 + noise(2);
        f.y += sign(f._wY-f.y)*def.speed*2.5 + noise(2);
      }
    }
    f.x = clamp(f.x, ISLAND_EDGE+5, WORLD-ISLAND_EDGE-5);
    f.y = clamp(f.y, ISLAND_EDGE+5, WORLD-ISLAND_EDGE-5);
    // Animation : isMoving + direction 4-way isométrique
    // Sprites animaux : row 0=SE, 1=SW, 2=NE, 3=NW (vu de 3/4 caméra)
    // IMPORTANT : il faut projeter (dx, dy) MONDE en deltas SCREEN iso :
    //   screenDx = dx - dy   (positif = vers la droite de l'écran)
    //   screenDy = dx + dy   (positif = vers le bas de l'écran = vers caméra)
    const dx = f.x - prevX, dy = f.y - prevY;
    f.isMoving = Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5;
    if (f.isMoving) {
      const screenDx = dx - dy;
      const screenDy = dx + dy;
      const isRight  = screenDx >= 0;     // direction visuelle E/W
      const isDown   = screenDy >= 0;     // S (vers cam) ou N (loin)
      if      ( isRight &&  isDown) f.dirRow = 0;  // SE — vers cam-droite
      else if (!isRight &&  isDown) f.dirRow = 1;  // SW — vers cam-gauche
      else if ( isRight && !isDown) f.dirRow = 2;  // NE — loin-droite
      else                          f.dirRow = 3;  // NW — loin-gauche
    }
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
      // Chasse via DR instinct : inst=5→50%, inst=8→58%, inst=10→62%
      if (Math.random() > 0.3 + dr(eff.instinct||3)*0.04) continue;
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
      if (c.hp<=0||dist(c,f)>48) continue;
      const def = FLORA_DEFS[f.type];
      if (!def) continue;
      // Poison
      const instinct = (c._eff||c.stats).instinct || 3;
      // DR sur instinct : inst=10 réduit le poison de 48% (dr(10)*0.06=0.48) vs 50% avant
      const poisonR  = Math.max(0, def.poisonChance - dr(instinct)*0.06);
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
  const allDrops = [...(state.map.supplies||[]), ...(state.map.loots||[]).filter(l=>l._dropTick==null || state.tick >= l._dropTick)];
  const collectedIds = new Set();
  allDrops.forEach(s=>{
    if (collectedIds.has(s.id)) return;
    for (const c of alive) {
      if (c.hp<=0||collectedIds.has(s.id)) continue;
      if (dist(s,c)<20) {
        if (s.type==='soin')    { c.hp=Math.min(c.maxHp,c.hp+45); c.hunger=Math.min(100,(c.hunger??100)+15); }
        if (s.type==='force')   c.buffs.push({stat:'strength',value:3,ticks:7});
        if (s.type==='vitesse') c.buffs.push({stat:'speed',value:3,ticks:7});
        if (s.type==='armure')  c.buffs.push({stat:'defense',value:3,ticks:7});
        if (s.type==='festin')  { c.hunger=Math.min(100,(c.hunger??100)+60); c.thirst=Math.min(100,(c.thirst??100)+40); }
        if (s.type==='torch')   {
          if (!c.items.includes('torch')) c.items.push('torch');
          c.buffs.push({stat:'instinct',value:2,ticks:12}); // vision nuit
          events.push({type:'narr',sub:'loot_weapon',id:c.id,name:c.name,tick:state.tick,
            text:`allume sa torche 🔦 — le froid ne l'atteindra plus cette nuit`});
        }
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
        const fd = away(b,a); a.x=clamp(a.x+fd.dx*dr(a._eff.speed)*1.5,0,WORLD-1); a.y=clamp(a.y+fd.dy*dr(a._eff.speed)*1.5,0,WORLD-1);
        a._pursuitCooldown = state.tick + 12;
        if (Math.random()<0.4) events.push({type:'narr',sub:'flee',id:a.id,name:a.name,tick:state.tick,
          text:`bat en retraite — trop blessé pour continuer !`});
        continue;
      }
      if (bFlees) {
        const fd = away(a,b); b.x=clamp(b.x+fd.dx*dr(b._eff.speed)*1.5,0,WORLD-1); b.y=clamp(b.y+fd.dy*dr(b._eff.speed)*1.5,0,WORLD-1);
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
        const fd = away(b,a); a.x=clamp(a.x+fd.dx*dr(a._eff.speed),0,WORLD-1); a.y=clamp(a.y+fd.dy*dr(a._eff.speed),0,WORLD-1);
        events.push({type:'narr',sub:'flee',id:a.id,name:a.name,tick:state.tick,
          text:`recule face à ${b.name} — sa réputation fait peur`}); continue;
      }
      if ((a.reputation||0) >= 3 && Math.random() < 0.25 && b.archetype!=='berserker') {
        const fd = away(a,b); b.x=clamp(b.x+fd.dx*dr(b._eff.speed),0,WORLD-1); b.y=clamp(b.y+fd.dy*dr(b._eff.speed),0,WORLD-1);
        events.push({type:'narr',sub:'flee',id:b.id,name:b.name,tick:state.tick,
          text:`recule face à ${a.name} — sa réputation fait peur`}); continue;
      }

      // Traumatisé ne contre-attaque pas les 5 premiers ticks
      const aPanic = a._mentalState==='traumatized'&&(state.tick-a._mentalStateTick)<5;
      const bPanic = b._mentalState==='traumatized'&&(state.tick-b._mentalStateTick)<5;
      if (aPanic) { const fd=away(b,a); a.x=clamp(a.x+fd.dx*dr(a._eff.speed),0,WORLD-1); a.y=clamp(a.y+fd.dy*dr(a._eff.speed),0,WORLD-1); continue; }
      if (bPanic) { const fd=away(a,b); b.x=clamp(b.x+fd.dx*dr(b._eff.speed),0,WORLD-1); b.y=clamp(b.y+fd.dy*dr(b._eff.speed),0,WORLD-1); continue; }
      // Désengagement survivor
      if (a.archetype==='survivor'&&a.hp/a.maxHp>0.5&&Math.random()<0.45) {
        const fd=away(b,a); a.x=clamp(a.x+fd.dx*dr(a._eff.speed),0,WORLD-1); a.y=clamp(a.y+fd.dy*dr(a._eff.speed),0,WORLD-1); continue;
      }
      if (b.archetype==='survivor'&&b.hp/b.maxHp>0.5&&Math.random()<0.45) {
        const fd=away(a,b); b.x=clamp(b.x+fd.dx*dr(b._eff.speed),0,WORLD-1); b.y=clamp(b.y+fd.dy*dr(b._eff.speed),0,WORLD-1); continue;
      }
      const sA=a._eff, sB=b._eff;
      const bA=a._mentalState==='berserk'?4:a.archetype==='berserker'?2:0;
      const bB=b._mentalState==='berserk'?4:b.archetype==='berserker'?2:0;

      // ── Esquive : instinct via DR, plafonné à 28% (était 40% à inst=10) ──
      const dA = Math.random() < Math.min(0.28, dr(sA.instinct) * 0.035);
      const dB = Math.random() < Math.min(0.28, dr(sB.instinct) * 0.035);

      // ── Dégâts arme ──────────────────────────────────────────────────────
      const wDmgA = aCanHit ? rng(wA.dmgMin, wA.dmgMax) : 0;
      const wDmgB = bCanHit ? rng(wB.dmgMin, wB.dmgMax) : 0;

      // ── Force : bonus de dégâts via DR ───────────────────────────────────
      // str=5→+7, str=8→+9.5, str=10→+11.2  (était str+1 direct = 10 à str=10)
      const strBonusA = Math.round(dr(sA.strength) * 1.4) + bA;
      const strBonusB = Math.round(dr(sB.strength) * 1.4) + bB;

      // ── Défense : réduction % via DR + plat arme ─────────────────────────
      // def=5→-22.5%, def=8→-30.6%, def=10→-36%   max capé à 55%
      // Plus de "absorption plate" par endurance en combat (c'est dans les HP)
      const defMitBonA = aCanHit ? Math.min(0.55, dr(sB.defense) * 0.045) : 0;
      const defMitBonB = bCanHit ? Math.min(0.55, dr(sA.defense) * 0.045) : 0;

      // Dégâts bruts A→B
      const rawAonB = aCanHit ? Math.round((wDmgA + strBonusA) * (1 - defMitBonA)) - wB.def : 0;
      const rawBonA = bCanHit ? Math.round((wDmgB + strBonusB) * (1 - defMitBonB)) - wA.def : 0;

      const rA = dA ? 0 : Math.max(1, rawAonB);
      const rB = dB ? 0 : Math.max(1, rawBonA);

      // Si seul A peut frapper / les deux peuvent frapper
      const dmgToB = bCanHit||aCanHit ? rA : 0;
      const dmgToA = (aCanHit&&bCanHit)||(bCanHit&&!aCanHit) ? rB : 0;
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

      // ── Effets spéciaux par arme (weapon.special) ──────────────────
      // Saignement : hunting_knife, stone_axe + berserker + hemophiliac
      const bleedSrcA = wA.special==='bleed' || a.archetype==='berserker';
      const bleedSrcB = wB.special==='bleed' || b.archetype==='berserker';
      const bBleedCh = (b.traits||[]).includes('hemophiliac')?0.65:bleedSrcA?0.30:0;
      const aBleedCh = (a.traits||[]).includes('hemophiliac')?0.65:bleedSrcB?0.30:0;
      if (!dA&&finalDmgB>0&&bBleedCh>0&&Math.random()<bBleedCh&&!b.statusEffects?.some(se=>se.type==='bleed'))
        b.statusEffects.push({type:'bleed',ticks:14,srcId:a.id});
      if (!dB&&finalDmgA>0&&aBleedCh>0&&Math.random()<aBleedCh&&!a.statusEffects?.some(se=>se.type==='bleed'))
        a.statusEffects.push({type:'bleed',ticks:14,srcId:b.id});

      // Étourdissement : sling + tank + bone_helmet réduit durée
      const stunSrcA = wA.special==='stun' || (a.archetype==='tank'&&finalDmgB>=Math.floor(b.maxHp*0.22));
      const stunSrcB = wB.special==='stun' || (b.archetype==='tank'&&finalDmgA>=Math.floor(a.maxHp*0.22));
      if (!dA&&finalDmgB>0&&stunSrcA&&Math.random()<0.22&&!b.statusEffects?.some(se=>se.type==='stun'))
        b.statusEffects.push({type:'stun',ticks:b._resistStun?1:3,srcId:a.id});
      if (!dB&&finalDmgA>0&&stunSrcB&&Math.random()<0.22&&!a.statusEffects?.some(se=>se.type==='stun'))
        a.statusEffects.push({type:'stun',ticks:a._resistStun?1:3,srcId:b.id});

      // Poison : hunter (arc/couteau de chasse empoisonné)
      if (!dA&&finalDmgB>0&&a.archetype==='hunter'&&Math.random()<0.25&&!b.statusEffects?.some(se=>se.type==='poison'))
        b.statusEffects.push({type:'poison',ticks:8,srcId:a.id});
      if (!dB&&finalDmgA>0&&b.archetype==='hunter'&&Math.random()<0.25&&!a.statusEffects?.some(se=>se.type==='poison'))
        a.statusEffects.push({type:'poison',ticks:8,srcId:b.id});

      // Armor break : club — retire temporairement la defense
      if (!dA&&finalDmgB>0&&wA.special==='armor_break'&&Math.random()<0.30)
        b.buffs.push({stat:'defense',value:-2,ticks:8});
      if (!dB&&finalDmgA>0&&wB.special==='armor_break'&&Math.random()<0.30)
        a.buffs.push({stat:'defense',value:-2,ticks:8});

      // Block : bouclier de bois/fer — annule un hit sur 4
      if (wB.special==='block'&&Math.random()<0.18&&finalDmgA>0) {
        a.hp += Math.floor(finalDmgA*0.5); // annule 50% des dégâts reçus
        events.push({type:'narr',sub:'block',id:b.id,name:b.name,tick:state.tick,
          text:`bloque le coup de ${a.name} avec son bouclier !`});
      }
      if (wA.special==='block'&&Math.random()<0.18&&finalDmgB>0) {
        b.hp += Math.floor(finalDmgB*0.5);
        events.push({type:'narr',sub:'block',id:a.id,name:a.name,tick:state.tick,
          text:`bloque le coup de ${b.name} avec son bouclier !`});
      }
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
        // Corps laissé sur la carte (pillable)
        state.map.corpses.push({ id:`corpse_${a.id}`, name:a.name, x:a.x, y:a.y,
          weapon:a.weapon!=='stone_knife'?a.weapon:null, items:[...(a.items||[])],
          resources:{...a.resources}, deathTick:state.tick, _looted:false });
        // Trauma pour témoins proches
        alive.filter(x=>x.id!==a.id&&x.id!==b.id&&dist(x,a)<240&&x._mentalState==='normal').forEach(w=>{
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
        state.map.corpses.push({ id:`corpse_${b.id}`, name:b.name, x:b.x, y:b.y,
          weapon:b.weapon!=='stone_knife'?b.weapon:null, items:[...(b.items||[])],
          resources:{...b.resources}, deathTick:state.tick, _looted:false });
        alive.filter(x=>x.id!==b.id&&x.id!==a.id&&dist(x,b)<240&&x._mentalState==='normal').forEach(w=>{
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

  // Moments clés + commentaire César
  detectHighlights(state, events);

  // Journal
  distributeToJournals(state.champions, events);

  // Merge events — on garde les 400 derniers (fastClone tronque avant le clone)
  const allEvents = [...state.events, ...events].slice(-400);
  const narr = [...(state.narrative||[]), ...events.filter(e=>e.type==='narr')].slice(-150);
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
  {type:'soin',    label:'🧪 Soin',    color:'#2ecc71', cost:2, desc:'+45 PV, +15 🍗'},
  {type:'festin',  label:'🍱 Festin',  color:'#e67e22', cost:2, desc:'+60 🍗 +40 💧'},
  {type:'torch',   label:'🔦 Torche',  color:'#fdcb6e', cost:2, desc:'Protection froid + vision nuit'},
  {type:'force',   label:'💪 Force',   color:'#e74c3c', cost:3, desc:'+3 Force (7t)'},
  {type:'vitesse', label:'⚡ Vitesse', color:'#3498db', cost:3, desc:'+3 Vitesse (7t)'},
  {type:'armure',  label:'🛡 Armure',  color:'#f39c12', cost:3, desc:'+3 Défense (7t)'},
  {type:'sword',   label:'⚔️ Épée',    color:'#bdc3c7', cost:4, desc:'Tier 3 — 7-14 dmg'},
  {type:'bow',     label:'🏹 Arc',     color:'#8e44ad', cost:4, desc:'Portée 170 — 8-18 dmg'},
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

// ── Commentateur César Flickerman ────────────────────────────────────────
const CAESAR_T = {
  kill:[
    (a,b)=>`⚔️ ${a} vient d'éliminer ${b} sans merci — la foule est en délire !`,
    (a,b)=>`Incroyable ! ${a} abat ${b} d'un coup décisif. Quel guerrier !`,
    (a,b)=>`${b} tombe sous les coups de ${a}. La partie se resserre considérablement !`,
    (a,b)=>`Le Capitole exulte — ${a} fait tomber ${b} ! La puissance de ce tribut est redoutable.`,
  ],
  betrayal:[
    (a,b)=>`💔 Trahison ! ${a} retourne son arme contre ${b} — personne n'est à l'abri !`,
    (a,b)=>`Quelle cruauté ! ${a} poignarde ${b} dans le dos. Le Capitole adore ce genre de drama.`,
    (a,b)=>`${a} brise l'alliance avec ${b}... la confiance ne survit jamais dans l'arène !`,
  ],
  alliance:[
    (a,b)=>`🤝 Alliance inattendue : ${a} et ${b} unissent leurs forces. Mais pour combien de temps ?`,
    (a,b)=>`${a} et ${b} forment une équipe redoutable. Les autres feraient bien de se méfier !`,
    (a,b)=>`Voilà qui est intéressant — ${a} tend la main à ${b}. Tactique ou désespoir ?`,
  ],
  near_death:[
    (n,hp)=>`😱 ${n} survit de justesse avec seulement ${hp} PV ! Une résistance incroyable !`,
    (n,hp)=>`Le Capitole retient son souffle — ${n} frôle la mort (${hp} PV). Indestructible !`,
    (n,hp)=>`Personne ne croyait ${n} capable de tenir. Et pourtant : ${hp} PV, encore debout !`,
  ],
  first_blood:[
    n=>`🩸 Le premier sang vient d'être versé par ${n} ! Les Jeux ont vraiment commencé !`,
    n=>`${n} frappe le premier coup fatal — la chasse est ouverte. Que les Jeux commencent !`,
  ],
  last3:[
    ()=>`🎺 Plus que 3 tributs en vie ! Le dénouement est IMMINENT — restez à l'écoute !`,
    ()=>`Trois ! Seulement trois combattants restent en lice. Qui remportera la victoire ?`,
  ],
  last2:[
    ()=>`🔥 La finale approche — 2 tributs face à face. L'arène retient son souffle !`,
  ],
  levelup:[
    (n,l)=>`⭐ ${n} atteint le niveau ${l} ! Ce tribut devient de plus en plus dangereux !`,
  ],
  weather:[
    w=>`${w} Les conditions changent — qui saura s'adapter à cette nouvelle donne ?`,
  ],
  cornucopia_end:[
    ()=>`⚔️ La Cornucopia s'achève dans un bain de sang. Les survivants fuient… l'arène les attend !`,
  ],
};
function caesarPick(type, ...args) {
  const pool = CAESAR_T[type]; if(!pool) return null;
  return pool[Math.floor(Math.random()*pool.length)](...args);
}

// ── Pensées intimes (journal) ─────────────────────────────────────────────
const THOUGHTS = {
  low_hp:    c=>[ `Je ne sais pas si je vais tenir encore longtemps...`,
                  `${Math.round(c.hp)} PV. Il faut trouver de l'aide, vite.`,
                  `La peur me ronge. Je dois survivre.` ],
  hungry:    c=>[ `Mon estomac crie famine. Il faut trouver de quoi manger.`,
                  `La faim commence à obscurcir mon jugement...` ],
  thirsty:   c=>[ `Ma gorge est sèche comme du parchemin. Où est l'eau ?`,
                  `Je donnerais tout pour une gorgée d'eau fraîche.` ],
  kill:      (c,v)=>[ `J'ai fait ce qu'il fallait faire. ${v?.name||'cet ennemi'} ou moi.`,
                       `${v?.name||'Il'} ne représentait qu'un obstacle. Je ne regrette rien.`,
                       `Je n'oublierai jamais le visage de ${v?.name||'ma victime'}.` ],
  night:     _=>[ `La nuit cache des dangers que le jour ne montre pas.`,
                  `Dans l'obscurité, chaque bruit peut être le dernier.` ],
  ally:      (c,a)=>[ `${a?.name||'Mon allié'} me semble digne de confiance... pour l'instant.`,
                       `Je surveille ${a?.name||'mon allié'} du coin de l'œil. On ne sait jamais.` ],
  strong:    _=>[ `Je me sens invincible. Que tous tremblent !`,
                  `Niveau ${_?.level||1}. L'arène me craint maintenant.` ],
  cold:      _=>[ `Le froid s'insinue dans mes os. Il faut trouver un abri.` ],
  weather:   w=>[ `${w} — l'arène elle-même se retourne contre nous.` ],
};
function generateThought(c, state) {
  const alive = state.champions.filter(x=>x.hp>0);
  const myAlly = (state.alliances||[]).find(al=>al.ids.includes(c.id));
  const allyChamp = myAlly ? alive.find(x=>x.id===myAlly.ids.find(id=>id!==c.id)) : null;
  const isNight = state.dayPhase >= NIGHT_START;
  const lastKill = state.events?.slice(-30).find(e=>e.type==='death'&&e.killedBy===c.id);
  const victim = lastKill ? state.champions.find(x=>x.id===lastKill.champion) : null;
  let pool;
  if (c.hp/c.maxHp < 0.18)   pool = THOUGHTS.low_hp(c);
  else if (c.hunger < 20)     pool = THOUGHTS.hungry(c);
  else if (c.thirst < 20)     pool = THOUGHTS.thirsty(c);
  else if (victim)            pool = THOUGHTS.kill(c, victim);
  else if (allyChamp)         pool = THOUGHTS.ally(c, allyChamp);
  else if (isNight)           pool = THOUGHTS.night(c);
  else if (c.level >= 4)      pool = THOUGHTS.strong(c);
  else if (state.weather==='snowfall'||state.weather==='storm') pool = THOUGHTS.weather(WEATHER_TYPES[state.weather]?.icon||'');
  else                        pool = [`Tick ${state.tick}. Je reste en alerte.`];
  const txt = pool[Math.floor(Math.random()*pool.length)];
  return { text:txt, tick:state.tick, sub:'thought' };
}

// ── Détection des moments clés + commentaires César ───────────────────────
function detectHighlights(state, newEvents) {
  if (!state.highlights) state.highlights = [];
  if (!state.caesarLog)  state.caesarLog  = [];
  const alive = state.champions.filter(c=>c.hp>0);
  const addCaesar = (text) => {
    state.caesarLog = [{ text, tick:state.tick }, ...(state.caesarLog||[])].slice(0,8);
  };
  const addHighlight = (type, text, champId) => {
    state.highlights.push({ type, text, tick:state.tick, champId });
    if (state.highlights.length > 30) state.highlights.shift();
  };

  // Analyser les events du tick
  newEvents.forEach(ev => {
    if (ev.type === 'death' && ev.killedBy && ev.killedBy !== 'water' && ev.killedBy !== 'survival') {
      const killer = state.champions.find(c=>c.id===ev.killedBy);
      const txt = caesarPick('kill', killer?.name||'?', ev.name);
      if (txt) { addCaesar(txt); addHighlight('kill', txt, ev.killedBy); }
      // Premier sang ?
      if (!state.firstBloodDone) {
        state.firstBloodDone = true;
        const fb = caesarPick('first_blood', killer?.name||'?');
        if (fb) { addCaesar(fb); addHighlight('first_blood', fb, ev.killedBy); }
      }
    }
    if (ev.sub === 'betrayal') {
      const betrayer = state.champions.find(c=>c.id===ev.id);
      const txt = caesarPick('betrayal', betrayer?.name||ev.name, '');
      if (txt) { addCaesar(txt); addHighlight('betrayal', txt, ev.id); }
    }
    if (ev.sub === 'alliance') {
      const c1 = state.champions.find(c=>c.id===ev.id);
      const txt = caesarPick('alliance', c1?.name||ev.name, '');
      if (txt) addCaesar(txt);
    }
    if (ev.sub === 'levelup') {
      const txt = caesarPick('levelup', ev.name, ev.text?.match(/niveau (\d)/)?.[1]||'?');
      if (txt) addCaesar(txt);
    }
    if (ev.evType === 'cornucopia_end') {
      const txt = caesarPick('cornucopia_end');
      if (txt) { addCaesar(txt); addHighlight('cornucopia', txt, null); }
    }
    if (ev.evType === 'weather') {
      const txt = caesarPick('weather', ev.text);
      if (txt) addCaesar(txt);
    }
  });

  // Jalons vivants
  if (alive.length === 3 && !(state._alert3)) {
    state._alert3 = true;
    const txt = caesarPick('last3');
    if (txt) { addCaesar(txt); addHighlight('last3', txt, null); }
  }
  if (alive.length === 2 && !(state._alert2)) {
    state._alert2 = true;
    const txt = caesarPick('last2');
    if (txt) { addCaesar(txt); addHighlight('last2', txt, null); }
  }

  // Come-back (HP critique → survivant)
  alive.forEach(c => {
    if (c.hp/c.maxHp < 0.05 && !c._nearDeathLogged) {
      c._nearDeathLogged = true;
      const txt = caesarPick('near_death', c.name, Math.round(c.hp));
      if (txt) { addCaesar(txt); addHighlight('near_death', txt, c.id); }
    }
    if (c.hp/c.maxHp > 0.25 && c._nearDeathLogged) c._nearDeathLogged = false;

    // Pensées personnelles (toutes les 25 ticks par champion)
    if (state.tick % 25 === (c.id.charCodeAt(4)||0) % 25) {
      const thought = generateThought(c, state);
      if (!c._journal) c._journal = [];
      // Ajouter en tant que pensée intime (différent du journal de combat)
      const exists = c._journal.find(j=>j.sub==='thought'&&j.tick===state.tick);
      if (!exists) { c._journal.unshift(thought); if(c._journal.length>8) c._journal.length=8; }
    }
  });
}

// ── Génération du récit narratif complet ─────────────────────────────────
function generateNarrative(sim) {
  const winner = sim.champions.find(c=>c.id===sim.winner);
  const days   = Math.floor(sim.tick/DAY_LEN)+1;
  const lines  = [];

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`⚔️  RAPPORT DES HUNGER GAMES`);
  lines.push(`Arène : ${(sim.map.biome||'inconnue').toUpperCase()} · ${sim.champions.length} tributs`);
  lines.push(`Durée : ${sim.tick} ticks · ${days} jour${days>1?'s':''}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // Cornucopia
  const cornEv = sim.events.find(e=>e.evType==='cornucopia_end');
  if (cornEv) {
    const early = sim.events.filter(e=>e.type==='death'&&(e.tick||0)<=18);
    lines.push(`🏟️  LA CORNUCOPIA`);
    lines.push(`La cérémonie d'ouverture a été féroce. ${early.length} tribut${early.length>1?'s':''} ${early.length>1?'ont':'a'} péri dans la ruée initiale vers les ressources.`);
    early.forEach(d=>lines.push(`  • ${d.name} ${d.killedBy&&d.killedBy!=='survival'?`éliminé par ${d.killedByName}`:`succombe à ses blessures`}`));
    lines.push('');
  }

  // Météo
  const wEvs = sim.events.filter(e=>e.evType==='weather');
  if (wEvs.length>0) {
    lines.push(`🌦️  CONDITIONS CLIMATIQUES`);
    lines.push(`L'arène a subi ${wEvs.length} changement${wEvs.length>1?'s':''} climatique${wEvs.length>1?'s':''} au cours des Jeux.`);
    wEvs.forEach(e=>lines.push(`  • ${e.text}`));
    lines.push('');
  }

  // Alliances & trahisons
  const {alliancesFormed:af, betrayals:bt} = sim.matchStats;
  if (af>0) {
    lines.push(`🤝  ALLIANCES & TRAHISONS`);
    lines.push(`${af} alliance${af>1?'s':''} se sont formées. ${bt>0?`${bt} se sont soldée${bt>1?'s':''} par une trahison.`:'Toutes furent honorées.'}`);
    lines.push('');
  }

  // Moments clés
  if ((sim.highlights||[]).length>0) {
    lines.push(`⭐  MOMENTS MARQUANTS`);
    sim.highlights.forEach(h=>lines.push(`  [${tickLabel(h.tick||0)}] ${h.text}`));
    lines.push('');
  }

  // César
  if ((sim.caesarLog||[]).length>0) {
    lines.push(`🎙️  COMMENTAIRES DE CÉSAR FLICKERMAN`);
    sim.caesarLog.slice().reverse().slice(0,5).forEach(c=>lines.push(`  "${c.text}"`));
    lines.push('');
  }

  // Classement final
  const sorted = [...sim.champions].sort((a,b)=>
    a.id===sim.winner?-1:b.id===sim.winner?1:
    b.simStats.kills-a.simStats.kills||b.simStats.survivedTicks-a.simStats.survivedTicks);
  lines.push(`📋  CLASSEMENT FINAL`);
  sorted.forEach((c,i)=>{
    const rank = i===0?'👑':i===1?'🥈':i===2?'🥉':`${i+1}`;
    lines.push(`${rank} ${c.name} (${ARCH[c.archetype]?.label||'?'}) — ${c.simStats.kills} élim. — Lv${c.level||1} — survécu ${c.simStats.survivedTicks}t`);
  });
  lines.push('');

  // Épilogue vainqueur
  if (winner) {
    const q = (ARCH_QUOTES[winner.archetype]||['…'])[0];
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`🏆  VAINQUEUR : ${winner.name.toUpperCase()}`);
    lines.push(`${ARCH[winner.archetype]?.icon} ${ARCH[winner.archetype]?.label} · Niveau ${winner.level||1} · ${winner.simStats.kills} élimination${winner.simStats.kills>1?'s':''}`);
    lines.push(`\n"${q}"\n— ${winner.name}, vainqueur des Hunger Games.`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  return lines.join('\n');
}

export default function SimulateurScreen() {
  const { width: ww, height: wh } = useWindowDimensions();
  const isLandscape = ww > wh;
  const { champion: myChampion } = useGame();

  const [gamePhase,    setGamePhase]   = useState('config'); // 'config'|'interviews'|'sim'
  const [cfg,          setCfg]         = useState({champCount:8, mapSize:'M', biome:null});
  const [pendingCfg,   setPendingCfg]  = useState(null);    // cfg en attente pendant interviews
  const [interviews,   setInterviews]  = useState([]);      // [{champ, quote}]
  const [sim,          setSim]         = useState(()=>createSimState());
  const [autoRun,      setAuto]        = useState(false);
  const [speed,        setSpeed]       = useState(1500);
  const [selId,        setSelId]       = useState(null);
  const [panelTab,     setPanelTab]    = useState('events');
  const [panelOpen,    setPanelOpen]   = useState(true);
  const [narrFilter,   setNarrFilter]  = useState(null);
  const [endOpen,      setEndOpen]     = useState(false);
  const [sponsorTarget,setSponsorTarget]=useState(null);
  const [selectedPkg,  setSelectedPkg] = useState(null); // { type, label, icon, color } — colis sélectionné pour drop
  const [deathQueue,   setDeathQueue]  = useState([]);      // cartes de mort à afficher
  const [showNarrative,setShowNarrative]=useState(false);   // modal récit complet
  const intRef      = useRef(null);
  const hpHistory   = useRef({});
  const aliveSetRef = useRef(new Set()); // IDs vivants au tick précédent

  useEffect(()=>{
    clearInterval(intRef.current);
    if (autoRun&&sim.status==='active')
      intRef.current=setInterval(()=>setSim(p=>tickSim(p)),speed);
    return ()=>clearInterval(intRef.current);
  },[autoRun,speed,sim.status]);

  // Mise à jour historique HP
  useEffect(()=>{
    if (sim.status!=='active') return;
    sim.champions.forEach(c=>{
      if (!hpHistory.current[c.id]) hpHistory.current[c.id]=[];
      const pct = c.maxHp>0 ? Math.round(c.hp/c.maxHp*100) : 0;
      hpHistory.current[c.id].push(pct);
      if (hpHistory.current[c.id].length>40) hpHistory.current[c.id].shift();
    });

    // Détection des nouveaux morts → carte de mort + haptique
    const currentAlive = new Set(sim.champions.filter(c=>c.hp>0).map(c=>c.id));
    const newDeaths = [];
    aliveSetRef.current.forEach(id=>{
      if (!currentAlive.has(id)) {
        const dead = sim.champions.find(c=>c.id===id);
        if (dead) {
          const deathEv = [...sim.events].reverse().find(e=>e.type==='death'&&e.champion===id);
          newDeaths.push({ champ:dead, killerName:deathEv?.killedByName||null, tick:sim.tick });
          // Haptique mort : fort si c'est mon champion, moyen sinon
          if (mySimChamp && dead.id === mySimChamp.id) haptic.error();
          else haptic.medium();
        }
      }
    });
    aliveSetRef.current = currentAlive;
    if (newDeaths.length>0) setDeathQueue(q=>[...q, ...newDeaths]);

    // Haptique level-up
    const lastEvents = sim.events.slice(-8);
    const hasLevelUp = lastEvents.some(e=>e.sub==='levelup');
    if (hasLevelUp) {
      if (mySimChamp && lastEvents.some(e=>e.sub==='levelup'&&e.id===mySimChamp.id)) haptic.success();
      else haptic.light();
    }

    // Haptique danger (mon champion < 30% HP)
    if (mySimChamp && mySimChamp.hp > 0 && mySimChamp.hp/mySimChamp.maxHp < 0.30) {
      if (sim.tick % 10 === 0) haptic.warning();
    }
  },[sim.tick]);

  useEffect(()=>{ if(sim.status==='finished') { haptic.success(); setEndOpen(true); } },[sim.status]);

  const togglePanel = useCallback(()=>{
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPanelOpen(o=>!o);
  },[]);

  const startGame = useCallback((newCfg)=>{
    // Préparer les interviews pré-jeux
    const tmpSim = createSimState(newCfg);
    const ivList = tmpSim.champions.map(c=>({ champ:c, quote:generateInterview(c) }));
    setPendingCfg(newCfg);
    setInterviews(ivList);
    setGamePhase('interviews');
  },[]);

  const launchSim = useCallback(()=>{
    if (!pendingCfg) return;
    setCfg(pendingCfg);
    const newSim = createSimState(pendingCfg);
    setSim(newSim);
    hpHistory.current   = {};
    aliveSetRef.current = new Set(newSim.champions.filter(c=>c.hp>0).map(c=>c.id));
    setAuto(false); setSelId(null); setEndOpen(false); setDeathQueue([]);
    setNarrFilter(null); setPanelTab('events'); setPanelOpen(true);
    setGamePhase('sim');
  },[pendingCfg]);

  const reset  = useCallback(()=>{ clearInterval(intRef.current); setAuto(false); setSelId(null); setEndOpen(false); setNarrFilter(null); setDeathQueue([]); setShowNarrative(false); setGamePhase('config'); },[]);
  const tick   = useCallback(()=>{ haptic.light(); setSim(p=>tickSim(p)); },[]);
  const turbo  = useCallback((n=10)=>{ haptic.medium(); setAuto(false); setSim(p=>{ let s=p; for(let i=0;i<n&&s.status==='active';i++)s=tickSim(s); return s; }); },[]);
  const finish = useCallback(()=>{
    setAuto(false);
    let chunks = 0;
    const runChunk = () => {
      setSim(p => { let s=p; for(let i=0;i<100&&s.status==='active';i++)s=tickSim(s); return s; });
      chunks++;
      if (chunks < 50) setTimeout(runChunk, 0);
    };
    runChunk();
  },[]);

  // drop(type, wx, wy) — largue un colis aux coordonnées monde (wx,wy)
  const drop = useCallback((type, wx=null, wy=null)=>setSim(p=>{
    const s=fastClone(p);
    // Vérifier inventaire
    const inv = s.packageInventory || {};
    if ((inv[type] ?? 0) <= 0) return p;
    // Décrémenter inventaire
    s.packageInventory = { ...inv, [type]: (inv[type]||0) - 1 };
    const dropX = wx != null ? clamp(wx, ISLAND_EDGE+10, WORLD-ISLAND_EDGE-10) : rng(ISLAND_EDGE+10, WORLD-ISLAND_EDGE-10);
    const dropY = wy != null ? clamp(wy, ISLAND_EDGE+10, WORLD-ISLAND_EDGE-10) : rng(ISLAND_EDGE+10, WORLD-ISLAND_EDGE-10);
    const sl2 = SUPPLY_LIST.find(x=>x.type===type);
    s.map.supplies.push({ id:`sup_${Date.now()}`, type, x:dropX, y:dropY, _dropTick: s.tick });
    s.events.push({ type:'event', evType:'sponsor', tick:s.tick, text:`🎁 Colis ${sl2?.label||type} largué !` });
    return s;
  }),[]);

  const setInstruction = useCallback((champId, instr) => {
    setSim(p => {
      const s = fastClone(p);
      const c = s.champions.find(x=>x.id===champId);
      if (c) c.instructions = c.instructions===instr ? null : instr;
      return s;
    });
  }, []);
  const cycSpd = useCallback(()=>setSpeed(s=>s===1500?800:s===800?300:s===300?100:1500),[]);

  const speedLabel = {1500:'🐢',800:'⚡',300:'🚀',100:'⏩'}[speed]||`${speed}`;
  const alive     = sim.champions.filter(c=>c.hp>0);
  const events    = sim.events.slice(-20).reverse();
  const winner    = sim.status==='finished' ? sim.champions.find(c=>c.id===sim.winner) : null;
  const sel       = selId ? sim.champions.find(c=>c.id===selId) : null;
  const active    = sim.status==='active';

  // Champion du joueur dans la simulation (correspond par nom)
  const mySimChamp = myChampion
    ? sim.champions.find(c=>c.name===myChampion.name) ?? null
    : null;
  const myChampInDanger = mySimChamp && mySimChamp.hp > 0 &&
    mySimChamp.hp / mySimChamp.maxHp < 0.30;
  const phase     = sim.dayPhase ?? 0;
  const timeIcon  = phase>=NIGHT_START?'🌙':phase>=DUSK_START?'🌆':'☀️';
  const filteredNarr = (sim.narrative||[]).slice(-50).reverse().filter(e=>!narrFilter||e.id===narrFilter);

  // ── Dernier commentaire César ─────────────────────────────────────────────
  const lastCaesar = (sim.caesarLog||[])[0] || null;

  if (gamePhase==='config') return <ConfigScreen onStart={startGame}/>;
  if (gamePhase==='interviews') return <InterviewScreen interviews={interviews} onLaunch={launchSim} onBack={()=>setGamePhase('config')}/>;

  // ── LAYOUT PAYSAGE ────────────────────────────────────────────────────────
  if (isLandscape) {
    const panelW = panelOpen ? Math.min(320, ww * 0.38) : 28;
    return (
      <View style={[s.root,{flexDirection:'row'}]}>
        {/* ── ZONE GAUCHE : map ─────────────────────────────────────────── */}
        <View style={{flex:1,position:'relative'}}>
          <BattleMap
            battleState={sim}
            onChampionTap={id=>{ if(selectedPkg){setSelectedPkg(null);return;} setSelId(prev=>prev===id?null:id); }}
            dropMode={selectedPkg}
            onDropRelease={(wx,wy)=>{ drop(selectedPkg.type,wx,wy); setSelectedPkg(null); }}
          />
          {selectedPkg&&(
            <TouchableOpacity style={s.dropCancelBtn} onPress={()=>setSelectedPkg(null)}>
              <Text style={s.dropCancelTxt}>✕ Annuler</Text>
            </TouchableOpacity>
          )}

          {/* Bandeau météo/phase en bas de map */}
          <View style={s.lMapBar}>
            <Text style={s.lMapBarTxt}>{timeIcon} J{Math.floor(sim.tick/DAY_LEN)+1}</Text>
            <Text style={s.lMapBarTxt}>{WEATHER_TYPES[sim.weather]?.icon||'☀️'} {WEATHER_TYPES[sim.weather]?.label||'Dégagé'}</Text>
            <Text style={s.lMapBarTxt}>{alive.length} vivants</Text>
            {sim.alliances.length>0&&<Text style={s.lMapBarTxt}>🤝{sim.alliances.length}</Text>}
          </View>

          {/* Bulle César flottante */}
          {lastCaesar&&(
            <View style={s.caesarBubble} pointerEvents="none">
              <Text style={s.caesarIco}>🎙</Text>
              <Text style={s.caesarTxt} numberOfLines={2}>{lastCaesar.text}</Text>
            </View>
          )}

          {/* Alerte danger champion du joueur */}
          {myChampInDanger&&(
            <TouchableOpacity style={s.dangerAlert} onPress={()=>setPanelTab('sponsor')}>
              <Text style={s.dangerAlertTxt}>⚠️ {mySimChamp.name} EN DANGER — {Math.round(mySimChamp.hp)}/{mySimChamp.maxHp} PV</Text>
            </TouchableOpacity>
          )}
          {/* Bannière vainqueur */}
          {winner&&(
            <TouchableOpacity style={s.winBanner} onPress={()=>setEndOpen(true)}>
              <Text style={s.winCrown}>👑</Text>
              <Text style={s.winName}>{winner.name}</Text>
              <Text style={s.winSub}>{ARCH[winner.archetype]?.icon} VAINQUEUR</Text>
            </TouchableOpacity>
          )}

          {/* Bouton toggle panel (onglet vertical) */}
          <TouchableOpacity style={s.panelToggle} onPress={togglePanel}>
            <Text style={s.panelToggleTxt}>{panelOpen?'›':'‹'}</Text>
          </TouchableOpacity>
        </View>

        {/* ── PANNEAU DROIT collapsible ─────────────────────────────────── */}
        {panelOpen && (
          <View style={[s.panel,{width:panelW}]}>
            {/* Strip champions verticale */}
            <ScrollView style={s.lStrip} showsVerticalScrollIndicator={false}>
              {sim.champions.map(c=>{
                const m   = ARCH[c.archetype]||{};
                const hpPct = c.maxHp>0 ? c.hp/c.maxHp : 0;
                const hist  = hpHistory.current[c.id]||[];
                return (
                  <TouchableOpacity key={c.id}
                    style={[s.lCard, !c.hp&&{opacity:0.3}, selId===c.id&&{borderColor:c.color,borderWidth:1}]}
                    onPress={()=>setSelId(selId===c.id?null:c.id)}>
                    <View style={{flexDirection:'row',alignItems:'center',gap:5}}>
                      <View style={[s.dot,{backgroundColor:c.hp?c.color:'#333',width:7,height:7}]}/>
                      <Text style={[s.cName,{flex:1,textAlign:'left'}]} numberOfLines={1}>{m.icon}{c.name}</Text>
                      <Text style={[s.cKills,{color:'#888'}]}>Lv{c.level||1} {c.simStats?.kills||0}💀</Text>
                    </View>
                    {c.hp>0&&<>
                      <View style={[s.hpT,{marginTop:3}]}>
                        <View style={[s.hpF,{width:`${Math.round(hpPct*100)}%`,
                          backgroundColor:hpPct>.6?'#2ecc71':hpPct>.3?'#f39c12':'#e74c3c'}]}/>
                      </View>
                      <SparkLine data={hist} color={c.color}/>
                    </>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Contrôles compacts */}
            <View style={s.lCtrl}>
              <TouchableOpacity style={[s.lBtn,{backgroundColor:'#e2b96f'}]} onPress={tick} disabled={!active}>
                <Text style={[s.lBtnTxt,{color:'#0d0d1a'}]}>⏭</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.lBtn,{backgroundColor:autoRun?'#c0392b':'#27ae60'}]} onPress={()=>setAuto(a=>!a)} disabled={!active}>
                <Text style={s.lBtnTxt}>{autoRun?'⏸':'▶'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.lBtn,{backgroundColor:'#8e44ad'}]} onPress={()=>turbo(10)} disabled={!active}>
                <Text style={s.lBtnTxt}>×10</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.lBtn,{backgroundColor:'#d35400'}]} onPress={finish} disabled={!active}>
                <Text style={s.lBtnTxt}>FIN</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.lBtn,{backgroundColor:'#2c3e50'}]} onPress={cycSpd}>
                <Text style={s.lBtnTxt}>{speedLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.lBtn,{backgroundColor:'#1a1a2e'}]} onPress={reset}>
                <Text style={s.lBtnTxt}>🔄</Text>
              </TouchableOpacity>
            </View>

            {/* Tabs du panneau */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.lTabRow}>
              {[['events','⚔️'],['cesar','🎙'],['moments','⭐'],['sponsor','🎁']].map(([k,ico])=>(
                <TouchableOpacity key={k} style={[s.lTab,panelTab===k&&s.lTabActive]} onPress={()=>setPanelTab(k)}>
                  <Text style={[s.lTabTxt,panelTab===k&&{color:'#e2b96f'}]}>{ico}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Contenu tab */}
            <View style={{flex:1}}>
              {panelTab==='events'&&(
                <ScrollView style={s.lLog} contentContainerStyle={{padding:4}}>
                  {events.length===0
                    ? <Text style={s.logE}>Lance ▶ Auto</Text>
                    : events.map((e,i)=><EvLine key={i} e={e}/>)}
                </ScrollView>
              )}
              {panelTab==='cesar'&&(
                <ScrollView style={s.lLog} contentContainerStyle={{padding:6}}>
                  {(sim.caesarLog||[]).length===0
                    ? <Text style={s.logE}>Le commentateur attend...</Text>
                    : (sim.caesarLog||[]).map((c,i)=>(
                        <View key={i} style={s.caesarEntry}>
                          <Text style={s.caesarEntryTick}>{tickLabel(c.tick||0)}</Text>
                          <Text style={s.caesarEntryTxt}>{c.text}</Text>
                        </View>
                      ))}
                </ScrollView>
              )}
              {panelTab==='moments'&&(
                <ScrollView style={s.lLog} contentContainerStyle={{padding:6}}>
                  {(sim.highlights||[]).length===0
                    ? <Text style={s.logE}>Aucun moment clé...</Text>
                    : [...(sim.highlights||[])].reverse().map((h,i)=>(
                        <View key={i} style={[s.hlEntry,{borderLeftColor:
                          h.type==='kill'?'#e74c3c':h.type==='first_blood'?'#c0392b':
                          h.type==='betrayal'?'#9b59b6':h.type==='near_death'?'#f39c12':
                          h.type==='last3'||h.type==='last2'?'#e2b96f':'#3498db'}]}>
                          <Text style={s.hlTick}>{tickLabel(h.tick||0)}</Text>
                          <Text style={s.hlTxt}>{h.text}</Text>
                        </View>
                      ))}
                </ScrollView>
              )}
              {panelTab==='sponsor'&&(
                <SponsorPanel
                  sim={sim} alive={alive} mySimChamp={mySimChamp}
                  active={active} compact
                  onSelectPackage={pkg=>{ setSelectedPkg(pkg); setPanelTab('events'); }}
                />
              )}
            </View>
          </View>
        )}

        {/* Onglet d'ouverture quand panneau fermé */}
        {!panelOpen&&(
          <TouchableOpacity style={s.panelClosedTab} onPress={togglePanel}>
            <Text style={s.panelToggleTxt}>‹</Text>
          </TouchableOpacity>
        )}

        {/* Modals partagés (hors layout flex) */}
        {sel&&<ChampModal sel={sel} sim={sim} setSelId={setSelId} setInstruction={setInstruction}/>}
        {endOpen&&winner&&<EndModal sim={sim} winner={winner} reset={reset} setEndOpen={setEndOpen} onNarrative={()=>setShowNarrative(true)} mySimChamp={mySimChamp}/>}
        {deathQueue.length>0&&<DeathCard entry={deathQueue[0]} onDismiss={()=>setDeathQueue(q=>q.slice(1))}/>}
        {showNarrative&&<NarrativeModal text={generateNarrative(sim)} onClose={()=>setShowNarrative(false)}/>}
      </View>
    );
  }

  // ── LAYOUT PORTRAIT (original) ────────────────────────────────────────────
  return (
    <View style={s.root}>
      {/* MAP */}
      <View style={s.map}>
        <BattleMap
          battleState={sim}
          onChampionTap={id=>{ if(selectedPkg){setSelectedPkg(null);return;} setSelId(prev=>prev===id?null:id); }}
          dropMode={selectedPkg}
          onDropRelease={(wx,wy)=>{ drop(selectedPkg.type,wx,wy); setSelectedPkg(null); }}
        />
        {/* Bouton annuler le drop */}
        {selectedPkg&&(
          <TouchableOpacity style={s.dropCancelBtn} onPress={()=>setSelectedPkg(null)}>
            <Text style={s.dropCancelTxt}>✕ Annuler</Text>
          </TouchableOpacity>
        )}
        {lastCaesar&&!selectedPkg&&(
          <View style={s.caesarBubble} pointerEvents="none">
            <Text style={s.caesarIco}>🎙</Text>
            <Text style={s.caesarTxt} numberOfLines={2}>{lastCaesar.text}</Text>
          </View>
        )}
        {/* Alerte danger champion du joueur */}
        {myChampInDanger&&!selectedPkg&&(
          <TouchableOpacity style={s.dangerAlert} onPress={()=>setPanelTab('sponsor')}>
            <Text style={s.dangerAlertTxt}>⚠️ {mySimChamp.name} EN DANGER — {Math.round(mySimChamp.hp)}/{mySimChamp.maxHp} PV</Text>
          </TouchableOpacity>
        )}
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
        <Chip val={sim.map.biome} lbl="Biome" small/>
        {sim.alliances.length>0&&<Chip val={`🤝${sim.alliances.length}`} lbl="Alliances" color="#e2b96f"/>}
      </View>

      {/* TABS */}
      <View style={s.tabs}>
        {[['events','⚔️ COMBAT'],['cesar','🎙 CÉSAR'],['moments','⭐ MOMENTS'],['sponsor','🎁 SPONSOR']].map(([t,lbl])=>(
          <TouchableOpacity key={t} style={[s.tab,panelTab===t&&s.tabActive]} onPress={()=>setPanelTab(t)}>
            <Text style={[s.tabTxt,panelTab===t&&s.tabTxtActive]}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {panelTab==='events' ? (
        <>
          {/* STRIP CHAMPIONS */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={s.strip} contentContainerStyle={s.stripInner}>
            {sim.champions.map(c=>{
              const m   = ARCH[c.archetype]||{};
              const act = c._activity?.type;
              const ms  = c._mentalState;
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
                      <View style={s.hpT}><View style={[s.hpF,{width:`${Math.round(c.hp/c.maxHp*100)}%`,
                        backgroundColor:c.hp/c.maxHp>.6?'#2ecc71':c.hp/c.maxHp>.3?'#f39c12':'#e74c3c'}]}/></View>
                      <View style={s.hpT}><View style={[s.hpF,{width:`${Math.round((c.hunger??100))}%`,backgroundColor:'#e67e22'}]}/></View>
                      <View style={s.hpT}><View style={[s.hpF,{width:`${Math.round((c.thirst??100))}%`,backgroundColor:'#3498db'}]}/></View>
                      <Text style={s.cKills}>⭐Lv{c.level||1} {c.simStats?.kills??0}💀 {WEAPON_DEFS[c.weapon||'fists']?.name?.slice(0,4)||'✊'}{msIco}{seIco}{inAl?' 🤝':''}{act&&act!=='idle'?` ${actIcon(act)}`:''}</Text>
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
          <ScrollView style={s.log} contentContainerStyle={{padding:5}}>
            {events.length===0
              ? <Text style={s.logE}>Lance la sim avec ▶ Auto ou ⏭ Tick</Text>
              : events.map((e,i)=><EvLine key={i} e={e}/>)}
          </ScrollView>
        </>
      ) : panelTab==='cesar' ? (
        <ScrollView style={s.story} contentContainerStyle={{padding:10}}>
          {(sim.caesarLog||[]).length===0
            ? <Text style={s.storyE}>Le commentateur attend...</Text>
            : (sim.caesarLog||[]).map((c,i)=>(
                <View key={i} style={s.caesarEntry}>
                  <Text style={s.caesarEntryTick}>{tickLabel(c.tick||0)}</Text>
                  <Text style={s.caesarEntryTxt}>{c.text}</Text>
                </View>
              ))}
        </ScrollView>
      ) : panelTab==='moments' ? (
        <ScrollView style={s.story} contentContainerStyle={{padding:10}}>
          {(sim.highlights||[]).length===0
            ? <Text style={s.storyE}>Aucun moment clé encore...</Text>
            : [...(sim.highlights||[])].reverse().map((h,i)=>(
                <View key={i} style={[s.hlEntry,{borderLeftColor:
                  h.type==='kill'?'#e74c3c':h.type==='first_blood'?'#c0392b':
                  h.type==='betrayal'?'#9b59b6':h.type==='near_death'?'#f39c12':
                  h.type==='last3'||h.type==='last2'?'#e2b96f':'#3498db'}]}>
                  <Text style={s.hlTick}>{tickLabel(h.tick||0)}</Text>
                  <Text style={s.hlTxt}>{h.text}</Text>
                </View>
              ))}
        </ScrollView>
      ) : /* sponsor */ (
        <SponsorPanel
          sim={sim} alive={alive} mySimChamp={mySimChamp}
          active={active}
          onSelectPackage={pkg=>{ setSelectedPkg(pkg); setPanelTab('events'); }}
        />
      )}

      {sel&&<ChampModal sel={sel} sim={sim} setSelId={setSelId} setInstruction={setInstruction}/>}
      {endOpen&&winner&&<EndModal sim={sim} winner={winner} reset={reset} setEndOpen={setEndOpen} onNarrative={()=>setShowNarrative(true)} mySimChamp={mySimChamp}/>}
      {deathQueue.length>0&&<DeathCard entry={deathQueue[0]} onDismiss={()=>setDeathQueue(q=>q.slice(1))}/>}
      {showNarrative&&<NarrativeModal text={generateNarrative(sim)} onClose={()=>setShowNarrative(false)}/>}
    </View>
  );
}

// ── Modal champion (extrait) ──────────────────────────────────────────────
function ChampModal({sel, sim, setSelId, setInstruction}) {
  return (
    <Modal transparent animationType="slide" onRequestClose={()=>setSelId(null)}>
      <View style={s.mb}>
        {/* Backdrop — tap pour fermer */}
        <Pressable style={StyleSheet.absoluteFill} onPress={()=>setSelId(null)} />
        {/* Panneau modal (sur le backdrop) */}
        <View style={s.mx}>
          {/* Bouton fermer (✕) en haut à droite */}
          <TouchableOpacity style={s.mClose} onPress={()=>setSelId(null)}>
            <Text style={s.mCloseTxt}>✕</Text>
          </TouchableOpacity>
          <ScrollView contentContainerStyle={{padding:16}} showsVerticalScrollIndicator={false}>
          <ChampionSprite
                key={sel.id}
                name={sel.name}
                archetype={sel.archetype}
                isDead={sel.hp<=0}
                color={sel.color}
                animState={sel.hp<=0?'death':'idle'}
                height={200}
                showTag
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
              {/* Ressources collectées */}
              {sel.resources&&Object.values(sel.resources).some(v=>v>0)&&<>
                <Text style={s.ms}>RESSOURCES</Text>
                <View style={{flexDirection:'row',flexWrap:'wrap',gap:4}}>
                  {sel.resources.wood>0&&<Text style={s.resBadge}>🪵 ×{sel.resources.wood}</Text>}
                  {sel.resources.stone>0&&<Text style={s.resBadge}>🪨 ×{sel.resources.stone}</Text>}
                  {sel.resources.fiber>0&&<Text style={s.resBadge}>🌾 ×{sel.resources.fiber}</Text>}
                  {sel.resources.hide>0&&<Text style={s.resBadge}>🐾 ×{sel.resources.hide}</Text>}
                  {sel.resources.rawMeat>0&&<Text style={s.resBadge}>🥩 ×{sel.resources.rawMeat}</Text>}
                  {sel.resources.bone>0&&<Text style={s.resBadge}>🦴 ×{sel.resources.bone}</Text>}
                  {sel.resources.medicinalPlant>0&&<Text style={s.resBadge}>🌿 ×{sel.resources.medicinalPlant}</Text>}
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
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Modal résultats enrichi ───────────────────────────────────────────────
function computeAwards(sim) {
  const c = sim.champions;
  const awards = [];
  // Vainqueur
  const winner = c.find(x=>x.id===sim.winner);
  if (winner) awards.push({icon:'👑', lbl:'Vainqueur', name:winner.name, col:winner.color, val:null});
  // Premier sang
  const fbEv = sim.events.find(e=>e.type==='death'&&e.killedBy&&e.killedBy!=='water'&&e.killedBy!=='survival'&&e.killedBy!=='fauna');
  if (fbEv) {
    const killer = c.find(x=>x.id===fbEv.killedBy);
    if (killer) awards.push({icon:'🩸', lbl:'Premier sang', name:killer.name, col:killer.color, val:null});
  }
  // Plus de kills
  const topKills = [...c].sort((a,b)=>b.simStats.kills-a.simStats.kills)[0];
  if (topKills?.simStats.kills>0) awards.push({icon:'⚔️', lbl:'Bourreau', name:topKills.name, col:topKills.color, val:`${topKills.simStats.kills} élim.`});
  // Plus de dégâts
  const topDmg = [...c].sort((a,b)=>b.simStats.dmgDealt-a.simStats.dmgDealt)[0];
  if (topDmg?.simStats.dmgDealt>0) awards.push({icon:'💥', lbl:'Agresseur', name:topDmg.name, col:topDmg.color, val:`${topDmg.simStats.dmgDealt} dmg`});
  // Meilleur artisan
  const topCraft = [...c].sort((a,b)=>b.simStats.crafts-a.simStats.crafts)[0];
  if (topCraft?.simStats.crafts>0) awards.push({icon:'⚒️', lbl:'Artisan', name:topCraft.name, col:topCraft.color, val:`${topCraft.simStats.crafts} crafts`});
  // Survivant (non-vainqueur le plus long)
  const surv2 = c.filter(x=>x.id!==sim.winner).sort((a,b)=>b.simStats.survivedTicks-a.simStats.survivedTicks)[0];
  if (surv2) awards.push({icon:'🌿', lbl:'Survivant', name:surv2.name, col:surv2.color, val:`${surv2.simStats.survivedTicks}t`});
  // Comeback (hp crit mais a survécu longtemps)
  const comeback = c.filter(c2=>c2._nearDeathLogged&&c2.simStats.survivedTicks>20).sort((a,b)=>b.simStats.survivedTicks-a.simStats.survivedTicks)[0];
  if (comeback) awards.push({icon:'💪', lbl:'Comeback', name:comeback.name, col:comeback.color, val:'<5% PV→survécu'});
  return awards;
}

function EndModal({sim, winner, reset, setEndOpen, onNarrative, mySimChamp}) {
  const [tab, setTab] = useState('winner');
  const quote = (ARCH_QUOTES[winner.archetype]||['…'])[Math.floor(Math.random()*(ARCH_QUOTES[winner.archetype]?.length||1))];
  const days  = Math.floor(sim.tick/DAY_LEN)+1;
  const awards = computeAwards(sim);

  // Classement pour l'onglet stats
  const ranked = [...sim.champions].sort((a,b)=>
    a.id===sim.winner?-1:b.id===sim.winner?1:
    b.simStats.kills-a.simStats.kills||b.simStats.survivedTicks-a.simStats.survivedTicks);

  // Timeline des morts
  const deaths = sim.events.filter(e=>e.type==='death')
    .sort((a,b)=>(a.tick||0)-(b.tick||0));

  // Max valeurs pour les barres comparatives
  const maxKills   = Math.max(1, ...sim.champions.map(c=>c.simStats.kills));
  const maxDmg     = Math.max(1, ...sim.champions.map(c=>c.simStats.dmgDealt));
  const maxTicks   = Math.max(1, ...sim.champions.map(c=>c.simStats.survivedTicks));

  return (
    <Modal transparent animationType="fade" onRequestClose={()=>setEndOpen(false)}>
      <View style={es.bg}>
        <View style={es.box}>
          {/* Header compact */}
          <View style={[es.header, {borderBottomColor: winner.color+'55'}]}>
            <Text style={es.headerCrown}>👑</Text>
            <View style={{flex:1}}>
              <Text style={[es.headerName, {color: winner.color}]}>{winner.name}</Text>
              <Text style={es.headerSub}>{ARCH[winner.archetype]?.icon} {ARCH[winner.archetype]?.label?.toUpperCase()} · Jour {days} · {sim.tick} ticks</Text>
            </View>
            <TouchableOpacity onPress={()=>setEndOpen(false)} style={es.closeBtn}>
              <Text style={es.closeTxt}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={es.tabRow}>
            {[['winner','🏆 Victoire'],['stats','📊 Stats'],['timeline','⚰️ Chronique']].map(([k,lbl])=>(
              <TouchableOpacity key={k} style={[es.tab, tab===k&&es.tabActive]} onPress={()=>setTab(k)}>
                <Text style={[es.tabTxt, tab===k&&{color:'#e2b96f'}]}>{lbl}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Onglet Victoire ─────────────────────────────────────── */}
          {tab==='winner'&&(
            <ScrollView style={es.body} contentContainerStyle={{padding:16}}>
              {/* Sprite winner */}
              <ChampionSprite
                name={winner.name}
                archetype={winner.archetype}
                isDead={false}
                color={winner.color}
                animState="idle"
                height={180}
                showTag
              />
              {/* Quote */}
              <View style={[es.quoteBox, {borderLeftColor: winner.color}]}>
                <Text style={es.quoteText}>"{quote}"</Text>
                <Text style={es.quoteBy}>— {winner.name}, vainqueur des Hunger Games</Text>
              </View>
              {/* Stats du vainqueur */}
              <View style={es.winStats}>
                <WinStat icon="💀" val={winner.simStats.kills}      lbl="Kills"   col="#e74c3c"/>
                <WinStat icon="⚔️" val={winner.simStats.dmgDealt}   lbl="Dégâts"  col="#f39c12"/>
                <WinStat icon="⚒️" val={winner.simStats.crafts}     lbl="Crafts"  col="#1abc9c"/>
                <WinStat icon="⭐" val={`Lv${winner.level||1}`}     lbl="Niveau"  col="#e2b96f"/>
                <WinStat icon="❤️" val={`${Math.round(winner.hp)}/${winner.maxHp}`} lbl="HP final" col="#2ecc71"/>
              </View>
              {/* Awards */}
              <Text style={es.sectionTitle}>DISTINCTIONS</Text>
              <View style={es.awardsGrid}>
                {awards.map((a,i)=>(
                  <View key={i} style={[es.awardCard, {borderColor: a.col+'55'}]}>
                    <Text style={es.awardIco}>{a.icon}</Text>
                    <Text style={[es.awardName, {color: a.col}]} numberOfLines={1}>{a.name}</Text>
                    <Text style={es.awardLbl}>{a.lbl}</Text>
                    {a.val&&<Text style={es.awardVal}>{a.val}</Text>}
                  </View>
                ))}
              </View>
              {/* Stats de partie */}
              <Text style={es.sectionTitle}>BILAN DE PARTIE</Text>
              <View style={es.matchGrid}>
                <MatchStat l="⚔️ Combats"   v={sim.matchStats.totalCombats}/>
                <MatchStat l="⚒️ Crafts"     v={sim.matchStats.totalCrafts}/>
                <MatchStat l="🌊 Noyades"    v={sim.matchStats.waterDeaths||0}/>
                <MatchStat l="🤝 Alliances"  v={sim.matchStats.alliancesFormed}/>
                <MatchStat l="🗡️ Trahisons"  v={sim.matchStats.betrayals}/>
                <MatchStat l="☀️ Jours"       v={days}/>
              </View>
              {/* Top moments */}
              {(sim.highlights||[]).length>0&&<>
                <Text style={es.sectionTitle}>MOMENTS MARQUANTS</Text>
                {[...(sim.highlights||[])].reverse().slice(0,4).map((h,i)=>(
                  <View key={i} style={[es.momentRow, {borderLeftColor:
                    h.type==='kill'?'#e74c3c':h.type==='betrayal'?'#9b59b6':
                    h.type==='near_death'?'#f39c12':'#3498db'}]}>
                    <Text style={es.momentTick}>{tickLabel(h.tick||0)}</Text>
                    <Text style={es.momentTxt} numberOfLines={2}>{h.text}</Text>
                  </View>
                ))}
              </>}
            </ScrollView>
          )}

          {/* ── Onglet Stats ─────────────────────────────────────────── */}
          {tab==='stats'&&(
            <ScrollView style={es.body} contentContainerStyle={{padding:16}}>
              <Text style={es.sectionTitle}>KILLS</Text>
              {ranked.map((c,i)=>(
                <View key={c.id} style={es.statRow}>
                  <Text style={es.statRank}>{i===0?'👑':i===1?'🥈':i===2?'🥉':`${i+1}`}</Text>
                  <View style={[es.statDot,{backgroundColor:c.color}]}/>
                  <Text style={es.statName} numberOfLines={1}>{c.name}</Text>
                  <View style={es.statBarBg}>
                    <View style={[es.statBarFill,{width:`${c.simStats.kills/maxKills*100}%`,backgroundColor:'#e74c3c'}]}/>
                  </View>
                  <Text style={[es.statVal,{color:'#e74c3c'}]}>{c.simStats.kills}</Text>
                </View>
              ))}
              <Text style={[es.sectionTitle,{marginTop:16}]}>DÉGÂTS INFLIGÉS</Text>
              {ranked.map((c,i)=>(
                <View key={c.id} style={es.statRow}>
                  <Text style={es.statRank}>{i===0?'👑':i===1?'🥈':i===2?'🥉':`${i+1}`}</Text>
                  <View style={[es.statDot,{backgroundColor:c.color}]}/>
                  <Text style={es.statName} numberOfLines={1}>{c.name}</Text>
                  <View style={es.statBarBg}>
                    <View style={[es.statBarFill,{width:`${c.simStats.dmgDealt/maxDmg*100}%`,backgroundColor:'#f39c12'}]}/>
                  </View>
                  <Text style={[es.statVal,{color:'#f39c12'}]}>{c.simStats.dmgDealt}</Text>
                </View>
              ))}
              <Text style={[es.sectionTitle,{marginTop:16}]}>TEMPS DE SURVIE</Text>
              {[...sim.champions].sort((a,b)=>b.simStats.survivedTicks-a.simStats.survivedTicks).map((c,i)=>(
                <View key={c.id} style={es.statRow}>
                  <Text style={es.statRank}>{i+1}</Text>
                  <View style={[es.statDot,{backgroundColor:c.color}]}/>
                  <Text style={es.statName} numberOfLines={1}>{c.name}</Text>
                  <View style={es.statBarBg}>
                    <View style={[es.statBarFill,{width:`${c.simStats.survivedTicks/maxTicks*100}%`,backgroundColor:'#3498db'}]}/>
                  </View>
                  <Text style={[es.statVal,{color:'#3498db'}]}>{c.simStats.survivedTicks}t</Text>
                </View>
              ))}
            </ScrollView>
          )}

          {/* ── Onglet Chronique ─────────────────────────────────────── */}
          {tab==='timeline'&&(
            <ScrollView style={es.body} contentContainerStyle={{padding:16}}>
              <Text style={es.sectionTitle}>{deaths.length} MORT{deaths.length>1?'S':''} EN {days} JOUR{days>1?'S':''}</Text>
              {deaths.map((d,i)=>{
                const dc = sim.champions.find(c=>c.id===d.champion);
                const killer = d.killedBy && d.killedBy!=='water'&&d.killedBy!=='survival'&&d.killedBy!=='fauna'
                  ? sim.champions.find(c=>c.id===d.killedBy) : null;
                const day = Math.floor((d.tick||0)/DAY_LEN)+1;
                const phase = (d.tick||0)%DAY_LEN >= NIGHT_START ? '🌙' : '☀️';
                return (
                  <View key={i} style={[es.tlRow, {borderLeftColor: dc?.color||'#555'}]}>
                    <View style={es.tlLeft}>
                      <Text style={es.tlDay}>{phase} J{day}</Text>
                      <Text style={es.tlTick}>{tickLabel(d.tick||0)}</Text>
                    </View>
                    <View style={es.tlRight}>
                      <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
                        <View style={[es.tlDot,{backgroundColor:dc?.color||'#555'}]}/>
                        <Text style={[es.tlName,{color:dc?.color||'#fff'}]}>{d.name}</Text>
                        <Text style={es.tlRank}>#{i+1}</Text>
                      </View>
                      <Text style={es.tlCause}>
                        {d.killedBy==='water' ? '🌊 Noyé'
                         :d.killedBy==='survival' ? '💀 Épuisement'
                         :d.killedBy==='fauna' ? `🐺 ${d.killedByName}`
                         :killer ? `⚔️ par ${killer.name}` : '?'}
                      </Text>
                      {dc&&<Text style={es.tlStats}>{dc.simStats.kills}💀 {dc.simStats.dmgDealt}dmg Lv{dc.level||1}</Text>}
                    </View>
                  </View>
                );
              })}
              {deaths.length===0&&<Text style={es.tlEmpty}>Personne n'est encore mort...</Text>}
            </ScrollView>
          )}

          {/* Boutons bas */}
          <View style={es.btns}>
            <TouchableOpacity style={es.btn} onPress={()=>setEndOpen(false)}>
              <Text style={es.btnTxt}>🗺 Carte</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[es.btn,{borderColor:'#3498db55'}]} onPress={()=>{setEndOpen(false);onNarrative&&onNarrative();}}>
              <Text style={[es.btnTxt,{color:'#74b9ff'}]}>📜 Récit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[es.btn,{backgroundColor:'#e2b96f'}]} onPress={reset}>
              <Text style={[es.btnTxt,{color:'#0d0d1a',fontWeight:'bold'}]}>🔄 Rejouer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
function WinStat({icon,val,lbl,col}) {
  return (
    <View style={es.winStatCell}>
      <Text style={es.winStatIco}>{icon}</Text>
      <Text style={[es.winStatVal,{color:col}]}>{val}</Text>
      <Text style={es.winStatLbl}>{lbl}</Text>
    </View>
  );
}
function MatchStat({l,v}) {
  return (
    <View style={es.matchCell}>
      <Text style={es.matchV}>{v}</Text>
      <Text style={es.matchL}>{l}</Text>
    </View>
  );
}

// ── Sponsor Panel — nouveau design : inventaire + drop sur carte ─────────
function SponsorPanel({sim, alive, mySimChamp, active, compact, onSelectPackage}) {
  const pts = sim.sponsorPts || 0;
  const inv = sim.packageInventory || {};
  const isDanger   = mySimChamp && mySimChamp.hp > 0 && mySimChamp.hp / mySimChamp.maxHp < 0.30;
  const isCritical = mySimChamp && mySimChamp.hp > 0 && mySimChamp.hp / mySimChamp.maxHp < 0.12;
  const nearThreats = mySimChamp ? alive.filter(c=>
    c.id!==mySimChamp.id && Math.hypot(c.x-mySimChamp.x, c.y-mySimChamp.y) < 120
  ) : [];

  return (
    <ScrollView
      style={compact ? sp.scrollCompact : sp.scroll}
      contentContainerStyle={{padding: compact ? 6 : 10}}
    >
      {/* ── Alerte danger (sans bouton soin direct) ──────────────────── */}
      {isDanger && mySimChamp && (
        <View style={[sp.dangerBox, isCritical && sp.dangerBoxCrit]}>
          <Text style={sp.dangerIco}>{isCritical?'🚨':'⚠️'}</Text>
          <View style={{flex:1}}>
            <Text style={[sp.dangerTitle,isCritical&&{color:'#ff4757'}]}>
              {isCritical?'ÉTAT CRITIQUE':'EN DANGER'}
            </Text>
            <Text style={sp.dangerHp}>
              {mySimChamp.name} — {Math.round(mySimChamp.hp)}/{mySimChamp.maxHp} PV
              ({Math.round(mySimChamp.hp/mySimChamp.maxHp*100)}%)
            </Text>
          </View>
        </View>
      )}

      {/* ── Surveillance champion ────────────────────────────────────── */}
      {mySimChamp && mySimChamp.hp > 0 && (
        <View style={[sp.champCard, {borderColor: mySimChamp.color+'66'}]}>
          <View style={sp.champCardHead}>
            <View style={[sp.champCardDot,{backgroundColor:mySimChamp.color}]}/>
            <Text style={[sp.champCardName,{color:mySimChamp.color}]}>{mySimChamp.name}</Text>
            <Text style={sp.champCardArch}>{ARCH[mySimChamp.archetype]?.icon} {ARCH[mySimChamp.archetype]?.label}</Text>
            <Text style={sp.champCardLv}>Lv{mySimChamp.level||1}</Text>
          </View>
          <View style={sp.champBarRow}>
            <Text style={sp.champBarLbl}>❤️</Text>
            <View style={sp.champBarBg}>
              <View style={[sp.champBarFill,{
                width:`${Math.round(mySimChamp.hp/mySimChamp.maxHp*100)}%`,
                backgroundColor: mySimChamp.hp/mySimChamp.maxHp>.5?'#2ecc71':mySimChamp.hp/mySimChamp.maxHp>.25?'#f39c12':'#e74c3c',
              }]}/>
            </View>
            <Text style={sp.champBarVal}>{Math.round(mySimChamp.hp)}</Text>
          </View>
          <View style={sp.champBarRow}>
            <Text style={sp.champBarLbl}>🍗</Text>
            <View style={sp.champBarBg}><View style={[sp.champBarFill,{width:`${Math.round(mySimChamp.hunger??100)}%`,backgroundColor:'#e67e22'}]}/></View>
            <Text style={sp.champBarVal}>{Math.round(mySimChamp.hunger??100)}</Text>
          </View>
          <View style={sp.champBarRow}>
            <Text style={sp.champBarLbl}>💧</Text>
            <View style={sp.champBarBg}><View style={[sp.champBarFill,{width:`${Math.round(mySimChamp.thirst??100)}%`,backgroundColor:'#3498db'}]}/></View>
            <Text style={sp.champBarVal}>{Math.round(mySimChamp.thirst??100)}</Text>
          </View>
          <View style={sp.champMeta}>
            <Text style={sp.champMetaTxt}>⚔️ {WEAPON_DEFS[mySimChamp.weapon||'fists']?.name||'Poings'}</Text>
            {mySimChamp._activity?.type&&mySimChamp._activity.type!=='idle'&&(
              <Text style={sp.champMetaTxt}>{actIconSp(mySimChamp._activity.type)}</Text>
            )}
            {nearThreats.length>0&&(
              <Text style={sp.champMetaTxt}>⚠️ {nearThreats.length} ennemi{nearThreats.length>1?'s':''}</Text>
            )}
          </View>
        </View>
      )}

      {/* ── Inventaire colis ─────────────────────────────────────────── */}
      <Text style={sp.sectionLbl}>📦 INVENTAIRE — TAPEZ POUR VISER LA CARTE</Text>
      <View style={sp.supGrid}>
        {SUPPLY_LIST.map(sl => {
          const qty = inv[sl.type] ?? 0;
          const available = qty > 0;
          return (
            <TouchableOpacity key={sl.type}
              style={[sp.supCard, {borderColor: sl.color+'88'}, !available && {opacity:0.30}]}
              onPress={()=>{
                if (!available) return;
                haptic.medium();
                onSelectPackage({ type:sl.type, label:sl.label, icon: sl.label.split(' ')[0], color:sl.color });
              }}
              activeOpacity={available ? 0.70 : 1}
            >
              {/* Badge quantité */}
              <View style={[sp.qtyBadge, { backgroundColor: available ? sl.color : '#333' }]}>
                <Text style={sp.qtyTxt}>{qty}</Text>
              </View>
              <Text style={[sp.supLabel, {color: available ? sl.color : '#555'}]}>{sl.label}</Text>
              <Text style={sp.supDesc}>{sl.desc}</Text>
              <Text style={[sp.supHint, {color: available ? '#aaa' : '#444'}]}>
                {available ? '👆 Toucher pour larguer' : 'Épuisé'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={sp.inventoryNote}>
        💡 Les colis dépendent de vos achats en boutique. Tapez sur un colis disponible puis visez la carte pour le larguer avec un parachute.
      </Text>
    </ScrollView>
  );
}
function actIconSp(t) { return {campfire:'🔥 Feu de camp',crafting:'⚒️ Fabrication',foraging:'🍃 Cueillette',idle:''}[t]||''; }

// ── Sous-composants ───────────────────────────────────────────────────────
function actIcon(t) { return {campfire:'🔥',crafting:'⚒️',foraging:'🍃',idle:''}[t]||''; }

// Mini graphique HP — barres verticales proportionnelles
function SparkLine({data, color}) {
  if (!data||data.length<2) return null;
  const pts = data.slice(-16);
  return (
    <View style={{flexDirection:'row',alignItems:'flex-end',height:10,gap:1,marginTop:2,opacity:0.75}}>
      {pts.map((v,i)=>{
        const h = Math.max(1, Math.round(v/100*10));
        const col = v>60?'#2ecc71':v>30?'#f39c12':'#e74c3c';
        return <View key={i} style={{width:3,height:h,backgroundColor:col,borderRadius:1}}/>;
      })}
    </View>
  );
}

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

// ── Carte de mort ─────────────────────────────────────────────────────────
function DeathCard({entry, onDismiss}) {
  const { champ, killerName, tick } = entry;
  const arch = ARCH[champ.archetype]||{};
  const lastWords = getLastWords(champ);
  const killMsg = killerName && killerName !== 'survival' && killerName !== 'water'
    ? `Éliminé par ${killerName}`
    : killerName === 'water' ? `Noyé dans les eaux de l'arène`
    : `Succombe à ses blessures`;
  const days = Math.floor(tick/DAY_LEN)+1;

  // Auto-dismiss après 4s
  useEffect(()=>{
    const t = setTimeout(onDismiss, 4000);
    return ()=>clearTimeout(t);
  },[]);

  return (
    <Pressable style={s.dcBg} onPress={onDismiss}>
      <View style={[s.dcCard,{borderColor:champ.color+'66'}]}>
        {/* Halo couleur */}
        <View style={[s.dcHalo,{backgroundColor:champ.color+'18'}]}/>
        {/* Skull + nom */}
        <Text style={s.dcSkull}>☠️</Text>
        <View style={[s.dcDot,{backgroundColor:champ.color}]}/>
        <Text style={[s.dcName,{color:champ.color}]}>{champ.name}</Text>
        <Text style={s.dcArch}>{arch.icon} {arch.label?.toUpperCase()}</Text>
        {/* Séparateur */}
        <View style={[s.dcLine,{backgroundColor:champ.color+'44'}]}/>
        {/* Stats */}
        <View style={s.dcStats}>
          <View style={s.dcStat}><Text style={[s.dcStatV,{color:'#e74c3c'}]}>{champ.simStats.kills}</Text><Text style={s.dcStatL}>éliminations</Text></View>
          <View style={s.dcStat}><Text style={[s.dcStatV,{color:'#f39c12'}]}>{champ.simStats.dmgDealt}</Text><Text style={s.dcStatL}>dégâts</Text></View>
          <View style={s.dcStat}><Text style={[s.dcStatV,{color:'#3498db'}]}>J{days}</Text><Text style={s.dcStatL}>survécu</Text></View>
          <View style={s.dcStat}><Text style={[s.dcStatV,{color:'#e2b96f'}]}>Lv{champ.level||1}</Text><Text style={s.dcStatL}>niveau</Text></View>
        </View>
        {/* Cause de mort */}
        <Text style={s.dcKill}>{killMsg}</Text>
        {/* Traits */}
        {(champ.traits||[]).length>0&&(
          <View style={s.dcTraits}>
            {champ.traits.map(t=><Text key={t} style={s.dcTraitIco}>{TRAITS[t]?.icon||''}</Text>)}
          </View>
        )}
        {/* Derniers mots */}
        <View style={s.dcQuoteBox}>
          <Text style={s.dcQuote}>"{lastWords}"</Text>
        </View>
        <Text style={s.dcHint}>Toucher pour continuer</Text>
      </View>
    </Pressable>
  );
}

// ── Modal récit complet ───────────────────────────────────────────────────
function NarrativeModal({text, onClose}) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.narBg}>
        <View style={s.narBox}>
          <View style={s.narHead}>
            <Text style={s.narTitle}>📜 RÉCIT DE PARTIE</Text>
            <TouchableOpacity style={s.narClose} onPress={onClose}>
              <Text style={s.narCloseTxt}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={s.narScroll} contentContainerStyle={{padding:16}}>
            <Text style={s.narText} selectable>{text}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Écran d'interviews pré-jeux ────────────────────────────────────────────
function InterviewScreen({interviews, onLaunch, onBack}) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const total = interviews.length;
  const item  = interviews[currentIdx];
  const arch  = item ? (ARCH[item.champ.archetype]||{}) : {};

  const next = () => {
    if (currentIdx < total-1) setCurrentIdx(i=>i+1);
    else onLaunch();
  };
  const prev = () => { if (currentIdx > 0) setCurrentIdx(i=>i-1); };

  if (!item) return null;
  return (
    <View style={ivs.root}>
      {/* Header */}
      <View style={ivs.header}>
        <TouchableOpacity onPress={onBack}><Text style={ivs.back}>← Config</Text></TouchableOpacity>
        <Text style={ivs.headerTitle}>🎤 INTERVIEWS</Text>
        <Text style={ivs.headerCount}>{currentIdx+1}/{total}</Text>
      </View>

      {/* Indicateur de progression */}
      <View style={ivs.progressRow}>
        {interviews.map((_,i)=>(
          <View key={i} style={[ivs.pip,
            i===currentIdx&&{backgroundColor:item.champ.color},
            i<currentIdx&&{backgroundColor:'#333'}]}/>
        ))}
      </View>

      {/* Carte interview */}
      <View style={{flex:1,justifyContent:'center',paddingHorizontal:20}}>
        {/* Couleur champion */}
        <View style={[ivs.champBanner,{backgroundColor:item.champ.color+'22',borderColor:item.champ.color+'55'}]}>
          <View style={{flexDirection:'row',alignItems:'center',gap:10,marginBottom:10}}>
            <View style={[ivs.champDot,{backgroundColor:item.champ.color}]}/>
            <View>
              <Text style={[ivs.champName,{color:item.champ.color}]}>{item.champ.name}</Text>
              <Text style={ivs.champArch}>{arch.icon} {arch.label}</Text>
            </View>
            <Text style={ivs.champLv}>Lv1</Text>
          </View>
          {/* Traits */}
          <View style={ivs.traitRow}>
            {(item.champ.traits||[]).map(t=>{
              const tr=TRAITS[t]||{};
              const col=tr.type==='pos'?'#2ecc71':tr.type==='neg'?'#e74c3c':'#f39c12';
              return (
                <View key={t} style={[ivs.traitBadge,{borderColor:col+'55'}]}>
                  <Text style={ivs.traitIco}>{tr.icon}</Text>
                  <Text style={[ivs.traitLbl,{color:col}]}>{tr.label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Quote */}
        <View style={ivs.quoteBox}>
          <Text style={ivs.quoteBy}>🎙 César Flickerman : "Alors, {item.champ.name}, comment te sens-tu ?"</Text>
          <Text style={ivs.quote}>"{item.quote}"</Text>
        </View>

        {/* Navigation */}
        <View style={ivs.nav}>
          <TouchableOpacity style={[ivs.navBtn,currentIdx===0&&{opacity:0.2}]} onPress={prev} disabled={currentIdx===0}>
            <Text style={ivs.navTxt}>← Précédent</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[ivs.navBtn,ivs.navNext,{backgroundColor:item.champ.color}]} onPress={next}>
            <Text style={[ivs.navTxt,{color:'#0d0d1a',fontWeight:'bold'}]}>
              {currentIdx===total-1?'⚔️ Que les Jeux commencent !':'Suivant →'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── Config Screen ─────────────────────────────────────────────────────────
const BIOMES = [null,'forêt','désert','toundra','marais','montagne','volcan','jungle'];
const BIOME_ICONS = {null:'🎲','forêt':'🌲','désert':'🏜️','toundra':'❄️','marais':'🌿','montagne':'⛰️','volcan':'🌋','jungle':'🌴'};

function ConfigScreen({onStart}) {
  const [count,       setCount]      = useState(8);
  const [mapSize,     setMapSz]      = useState('M');
  const [biome,       setBiome]      = useState(null);
  const [names,       setNames]      = useState([...CHAMP_NAMES.slice(0,8)]);
  const [editIdx,     setEditIdx]    = useState(null);
  const [editVal,     setEditVal]    = useState('');
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

  const launch = () => onStart({champCount:count, mapSize, biome, champNames:names, champBuilds:builds});

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
  dangerAlert:{position:'absolute',bottom:4,left:8,right:8,backgroundColor:'#2a0000ee',
    borderRadius:8,padding:8,borderWidth:1,borderColor:'#e74c3c88',alignItems:'center'},
  dangerAlertTxt:{color:'#ff4757',fontSize:11,fontWeight:'bold',letterSpacing:1},
  dropCancelBtn:{position:'absolute',bottom:10,right:10,backgroundColor:'rgba(0,0,0,0.85)',
    borderRadius:20,paddingVertical:8,paddingHorizontal:16,
    borderWidth:1,borderColor:'rgba(226,185,111,0.5)'},
  dropCancelTxt:{color:'#e2b96f',fontSize:12,fontWeight:'bold'},

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
    borderWidth:1,borderColor:'#2a2a4a',maxHeight:'90%'},
  mClose:{position:'absolute',top:10,right:14,zIndex:10,padding:8},
  mCloseTxt:{color:'#777',fontSize:20,fontWeight:'bold',lineHeight:22},
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
  resBadge:{backgroundColor:'#0d1a2a',color:'#aaa',fontSize:11,paddingHorizontal:6,paddingVertical:2,borderRadius:6,borderWidth:1,borderColor:'#333'},
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

  // ── Landscape layout ──────────────────────────────────────────────────
  lMapBar:{position:'absolute',bottom:0,left:0,right:0,flexDirection:'row',
    backgroundColor:'#0d0d1acc',paddingHorizontal:8,paddingVertical:4,gap:10,alignItems:'center'},
  lMapBarTxt:{color:'#a0a0c0',fontSize:9,fontWeight:'bold'},

  // Bulle César
  caesarBubble:{position:'absolute',top:8,left:8,right:50,backgroundColor:'#0d0d1aee',
    borderRadius:12,padding:8,borderWidth:1,borderColor:'#e2b96f33',
    flexDirection:'row',gap:6,alignItems:'flex-start'},
  caesarIco:{fontSize:14},
  caesarTxt:{color:'#e2b96f',fontSize:10,fontStyle:'italic',flex:1,lineHeight:14},

  // Bouton toggle panneau
  panelToggle:{position:'absolute',right:0,top:'40%',backgroundColor:'#1a1a2e',
    borderTopLeftRadius:8,borderBottomLeftRadius:8,paddingHorizontal:5,paddingVertical:10,
    borderWidth:1,borderColor:'#2a2a4a',borderRightWidth:0},
  panelClosedTab:{backgroundColor:'#1a1a2e',borderTopLeftRadius:8,borderBottomLeftRadius:8,
    paddingHorizontal:5,paddingVertical:14,borderWidth:1,borderColor:'#2a2a4a',
    borderRightWidth:0,alignItems:'center',justifyContent:'center'},
  panelToggleTxt:{color:'#e2b96f',fontSize:16,fontWeight:'bold'},

  // Panneau droit
  panel:{backgroundColor:'#0a0a12',borderLeftWidth:1,borderColor:'#1a1a2e',
    flexDirection:'column'},

  // Strip verticale champions dans panneau
  lStrip:{flex:0,maxHeight:160,backgroundColor:'#0a0a14'},
  lCard:{backgroundColor:'#111122',borderRadius:6,padding:5,marginHorizontal:4,
    marginVertical:2,borderWidth:1,borderColor:'#1a1a2e'},

  // Contrôles compacts (paysage)
  lCtrl:{flexDirection:'row',padding:4,gap:3,backgroundColor:'#07070f'},
  lBtn:{flex:1,borderRadius:6,paddingVertical:7,alignItems:'center',justifyContent:'center'},
  lBtnTxt:{color:'#fff',fontWeight:'bold',fontSize:10},

  // Tabs panneau
  lTabRow:{backgroundColor:'#0a0a14',flexGrow:0,flexShrink:0},
  lTab:{paddingHorizontal:12,paddingVertical:7,alignItems:'center'},
  lTabActive:{borderBottomWidth:2,borderBottomColor:'#e2b96f'},
  lTabTxt:{color:'#444',fontSize:12},

  // Log dans panneau
  lLog:{flex:1,backgroundColor:'#07070f'},

  // César entries
  caesarEntry:{backgroundColor:'#111122',borderRadius:8,padding:8,marginBottom:5,
    borderLeftWidth:3,borderLeftColor:'#e2b96f55'},
  caesarEntryTick:{color:'#444',fontSize:8,marginBottom:2},
  caesarEntryTxt:{color:'#e2b96f',fontSize:10,lineHeight:15,fontStyle:'italic'},

  // Highlights
  hlEntry:{backgroundColor:'#111122',borderRadius:8,padding:8,marginBottom:5,
    borderLeftWidth:3},
  hlTick:{color:'#444',fontSize:8,marginBottom:2},
  hlTxt:{color:'#ccc',fontSize:10,lineHeight:15},

  // Menaces
  threatRow:{flexDirection:'row',alignItems:'center',backgroundColor:'#111122',
    borderRadius:8,padding:7,marginBottom:4,gap:6},
  threatRank:{fontSize:14,width:22,textAlign:'center'},
  threatName:{flex:1,fontSize:11,fontWeight:'bold'},
  threatScore:{color:'#666',fontSize:10,fontWeight:'bold'},

  // Pensées intimes
  thoughtEntry:{backgroundColor:'#0d0d20',borderRadius:8,padding:8,marginBottom:5,
    borderLeftWidth:3},
  thoughtName:{fontSize:10,fontWeight:'bold',marginBottom:2},
  thoughtTxt:{color:'#7a8899',fontSize:10,fontStyle:'italic',lineHeight:14},

  logE2:{color:'#333',fontSize:8,letterSpacing:2,marginBottom:6,marginTop:4},

  // ── Carte de mort ──────────────────────────────────────────────────────
  dcBg:{position:'absolute',top:0,left:0,right:0,bottom:0,
    backgroundColor:'#000000cc',alignItems:'center',justifyContent:'center',zIndex:99},
  dcCard:{backgroundColor:'#0d0d1a',borderRadius:20,padding:24,
    width:'82%',alignItems:'center',borderWidth:2,overflow:'hidden'},
  dcHalo:{position:'absolute',top:0,left:0,right:0,bottom:0},
  dcSkull:{fontSize:42,marginBottom:8},
  dcDot:{width:14,height:14,borderRadius:7,marginBottom:8},
  dcName:{fontSize:26,fontWeight:'bold',letterSpacing:2,marginBottom:2},
  dcArch:{color:'#666',fontSize:11,letterSpacing:3,marginBottom:12},
  dcLine:{height:1,width:'80%',marginBottom:12},
  dcStats:{flexDirection:'row',gap:16,marginBottom:12},
  dcStat:{alignItems:'center',minWidth:54},
  dcStatV:{fontSize:20,fontWeight:'bold'},
  dcStatL:{color:'#444',fontSize:8,marginTop:2,letterSpacing:1},
  dcKill:{color:'#666',fontSize:11,fontStyle:'italic',marginBottom:10},
  dcTraits:{flexDirection:'row',gap:6,marginBottom:12},
  dcTraitIco:{fontSize:18},
  dcQuoteBox:{backgroundColor:'#111122',borderRadius:10,padding:12,
    borderWidth:1,borderColor:'#2a2a4a',marginBottom:12,width:'100%'},
  dcQuote:{color:'#8899aa',fontSize:12,fontStyle:'italic',lineHeight:18,textAlign:'center'},
  dcHint:{color:'#333',fontSize:9,letterSpacing:2},

  // ── Modal récit ────────────────────────────────────────────────────────
  narBg:{flex:1,backgroundColor:'#000000cc',justifyContent:'center',alignItems:'center'},
  narBox:{backgroundColor:'#0d0d1a',borderRadius:16,width:'92%',maxHeight:'88%',
    borderWidth:1,borderColor:'#1a2a4a'},
  narHead:{flexDirection:'row',alignItems:'center',padding:14,
    borderBottomWidth:1,borderColor:'#1a2a4a'},
  narTitle:{color:'#74b9ff',fontSize:14,fontWeight:'bold',flex:1,letterSpacing:1},
  narClose:{backgroundColor:'#1a1a2e',borderRadius:14,width:28,height:28,
    alignItems:'center',justifyContent:'center'},
  narCloseTxt:{color:'#666',fontSize:14},
  narScroll:{flex:1},
  narText:{color:'#8899aa',fontSize:11,lineHeight:18,fontFamily:'monospace'},
});

// ── Styles EndModal ───────────────────────────────────────────────────────
const es = StyleSheet.create({
  bg:   {flex:1,backgroundColor:'#000000cc',justifyContent:'flex-end'},
  box:  {backgroundColor:'#0d0d1a',borderTopLeftRadius:20,borderTopRightRadius:20,
         maxHeight:'92%',borderWidth:1,borderColor:'#1a2a4a'},
  header:{flexDirection:'row',alignItems:'center',padding:14,gap:10,
          borderBottomWidth:1},
  headerCrown:{fontSize:28},
  headerName: {color:'#e2b96f',fontSize:17,fontWeight:'bold'},
  headerSub:  {color:'#666',fontSize:10,marginTop:2},
  closeBtn:   {backgroundColor:'#1a1a2e',borderRadius:14,width:28,height:28,
               alignItems:'center',justifyContent:'center'},
  closeTxt:   {color:'#666',fontSize:13},

  tabRow:     {flexDirection:'row',borderBottomWidth:1,borderColor:'#1a2a4a',backgroundColor:'#0a0a14'},
  tab:        {flex:1,paddingVertical:10,alignItems:'center'},
  tabActive:  {borderBottomWidth:2,borderBottomColor:'#e2b96f'},
  tabTxt:     {color:'#555',fontSize:11,fontWeight:'bold'},

  body:       {flex:1},
  sectionTitle:{color:'#555',fontSize:10,letterSpacing:2,marginBottom:8,marginTop:14},

  // Onglet Victoire
  quoteBox:   {borderLeftWidth:3,paddingLeft:12,marginVertical:12,paddingVertical:4},
  quoteText:  {color:'#aaa',fontSize:12,fontStyle:'italic',lineHeight:20},
  quoteBy:    {color:'#555',fontSize:10,marginTop:6},
  winStats:   {flexDirection:'row',flexWrap:'wrap',gap:6,marginVertical:8},
  winStatCell:{flex:1,minWidth:60,backgroundColor:'#111122',borderRadius:8,
               padding:8,alignItems:'center',borderWidth:1,borderColor:'#1a1a2e'},
  winStatIco: {fontSize:16,marginBottom:2},
  winStatVal: {fontSize:14,fontWeight:'bold'},
  winStatLbl: {color:'#555',fontSize:9,marginTop:2},
  awardsGrid: {flexDirection:'row',flexWrap:'wrap',gap:6},
  awardCard:  {flex:1,minWidth:80,backgroundColor:'#111122',borderRadius:10,
               padding:10,alignItems:'center',borderWidth:1},
  awardIco:   {fontSize:22,marginBottom:4},
  awardName:  {fontSize:11,fontWeight:'bold',textAlign:'center'},
  awardLbl:   {color:'#555',fontSize:9,marginTop:2},
  awardVal:   {color:'#e2b96f',fontSize:9,marginTop:2},
  matchGrid:  {flexDirection:'row',flexWrap:'wrap',gap:6},
  matchCell:  {flex:1,minWidth:80,backgroundColor:'#111122',borderRadius:8,
               padding:10,alignItems:'center',borderWidth:1,borderColor:'#1a2a4a'},
  matchV:     {color:'#e2b96f',fontSize:18,fontWeight:'bold'},
  matchL:     {color:'#555',fontSize:9,marginTop:2},
  momentRow:  {borderLeftWidth:3,paddingLeft:10,marginBottom:8,paddingVertical:4},
  momentTick: {color:'#555',fontSize:9,marginBottom:2},
  momentTxt:  {color:'#888',fontSize:11,lineHeight:16},

  // Onglet Stats
  statRow:    {flexDirection:'row',alignItems:'center',gap:6,marginBottom:8},
  statRank:   {width:20,color:'#666',fontSize:10,textAlign:'center'},
  statDot:    {width:8,height:8,borderRadius:4},
  statName:   {width:68,color:'#ccc',fontSize:10},
  statBarBg:  {flex:1,height:10,backgroundColor:'#1a1a2e',borderRadius:5},
  statBarFill:{height:10,borderRadius:5},
  statVal:    {width:36,fontSize:10,fontWeight:'bold',textAlign:'right'},

  // Onglet Timeline
  tlRow:      {flexDirection:'row',borderLeftWidth:3,paddingLeft:10,marginBottom:12,paddingVertical:4,gap:8},
  tlLeft:     {width:36,alignItems:'center'},
  tlDay:      {color:'#666',fontSize:11},
  tlTick:     {color:'#444',fontSize:9},
  tlRight:    {flex:1},
  tlDot:      {width:8,height:8,borderRadius:4},
  tlName:     {fontSize:13,fontWeight:'bold'},
  tlRank:     {color:'#555',fontSize:9,marginLeft:'auto'},
  tlCause:    {color:'#888',fontSize:11,marginTop:2},
  tlStats:    {color:'#555',fontSize:9,marginTop:3},
  tlEmpty:    {color:'#555',fontSize:12,textAlign:'center',marginTop:20},

  btns:       {flexDirection:'row',gap:8,padding:12,borderTopWidth:1,borderColor:'#1a2a4a'},
  btn:        {flex:1,backgroundColor:'#111122',borderRadius:10,paddingVertical:12,
               alignItems:'center',borderWidth:1,borderColor:'#2a2a4a'},
  btnTxt:     {color:'#ccc',fontSize:12,fontWeight:'bold'},
});

// ── Styles SponsorPanel ───────────────────────────────────────────────────
const sp = StyleSheet.create({
  scroll:        {flex:1,backgroundColor:'#0a0a14'},
  scrollCompact: {flex:1},

  // Alerte danger
  dangerBox:     {flexDirection:'row',alignItems:'center',backgroundColor:'#2a0000',
                  borderRadius:10,padding:10,gap:8,marginBottom:10,
                  borderWidth:1,borderColor:'#e74c3c55'},
  dangerBoxCrit: {borderColor:'#ff4757',backgroundColor:'#350000'},
  dangerIco:     {fontSize:22},
  dangerTitle:   {color:'#e74c3c',fontSize:11,fontWeight:'bold',letterSpacing:1},
  dangerHp:      {color:'#888',fontSize:10,marginTop:2},
  dangerBtn:     {backgroundColor:'#e74c3c',borderRadius:8,paddingVertical:8,
                  paddingHorizontal:10,alignItems:'center'},
  dangerBtnTxt:  {color:'#fff',fontSize:10,fontWeight:'bold'},

  // Jauge points
  ptsRow:        {flexDirection:'row',alignItems:'center',gap:8,marginBottom:4},
  ptsLabel:      {color:'#666',fontSize:10,fontWeight:'bold',letterSpacing:1},
  ptsGauge:      {flex:1,height:8,backgroundColor:'#1a1a2e',borderRadius:4},
  ptsGaugeFill:  {height:8,borderRadius:4},
  ptsVal:        {fontSize:11,fontWeight:'bold',width:44,textAlign:'right'},
  ptsRegen:      {color:'#333',fontSize:9,marginBottom:12},

  // Carte champion
  champCard:     {backgroundColor:'#111122',borderRadius:12,padding:12,
                  marginBottom:12,borderWidth:1},
  champCardHead: {flexDirection:'row',alignItems:'center',gap:6,marginBottom:8},
  champCardDot:  {width:8,height:8,borderRadius:4},
  champCardName: {fontSize:13,fontWeight:'bold',flex:1},
  champCardArch: {color:'#666',fontSize:9},
  champCardLv:   {color:'#e2b96f',fontSize:9,fontWeight:'bold'},
  champBarRow:   {flexDirection:'row',alignItems:'center',gap:6,marginBottom:4},
  champBarLbl:   {width:16,fontSize:11},
  champBarBg:    {flex:1,height:7,backgroundColor:'#1a1a2e',borderRadius:3},
  champBarFill:  {height:7,borderRadius:3},
  champBarVal:   {color:'#888',fontSize:9,width:28,textAlign:'right'},
  champMeta:     {flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:6},
  champMetaTxt:  {color:'#666',fontSize:9,backgroundColor:'#0d0d1a',
                  borderRadius:4,paddingHorizontal:5,paddingVertical:2},
  champThreats:  {color:'#e74c3c',fontSize:9,marginTop:6,fontStyle:'italic'},
  healBtn:       {backgroundColor:'#ff6b9d22',borderRadius:8,paddingVertical:8,
                  alignItems:'center',marginTop:8,borderWidth:1,borderColor:'#ff6b9d55'},
  healBtnTxt:    {color:'#ff6b9d',fontSize:10,fontWeight:'bold'},

  // Ciblage
  sectionLbl:    {color:'#444',fontSize:9,letterSpacing:1.5,marginBottom:6,marginTop:4},
  targetChip:    {flexDirection:'row',alignItems:'center',gap:5,
                  backgroundColor:'#111122',borderRadius:7,paddingVertical:5,
                  paddingHorizontal:8,marginRight:6,borderWidth:1,borderColor:'#2a2a4a'},
  targetDot:     {width:7,height:7,borderRadius:4},
  targetName:    {color:'#888',fontSize:10},
  targetHp:      {color:'#555',fontSize:9},
  targetInfo:    {color:'#e2b96f',fontSize:9,marginBottom:8,fontStyle:'italic'},

  // Grille colis — nouveau design inventaire
  sectionLbl:    {color:'#444',fontSize:9,letterSpacing:1.5,marginBottom:8,marginTop:4},
  supGrid:       {flexDirection:'row',flexWrap:'wrap',gap:8},
  supCard:       {width:'47%',backgroundColor:'#111122',borderRadius:12,
                  padding:10,borderWidth:1.5,alignItems:'flex-start',
                  position:'relative', overflow:'visible'},
  supLabel:      {fontSize:12,fontWeight:'bold',marginBottom:3,marginTop:2},
  supDesc:       {color:'#555',fontSize:9,marginBottom:5,lineHeight:13},
  supCost:       {fontSize:11,fontWeight:'bold'},
  supHint:       {fontSize:9,fontStyle:'italic'},

  // Badge quantité (coin supérieur droit)
  qtyBadge:      {position:'absolute',top:-7,right:-7,
                  width:22,height:22,borderRadius:11,
                  alignItems:'center',justifyContent:'center',
                  borderWidth:2,borderColor:'#0a0a14'},
  qtyTxt:        {color:'#fff',fontSize:10,fontWeight:'bold'},

  // Note inventaire
  inventoryNote: {color:'#333',fontSize:9,marginTop:12,lineHeight:14,
                  paddingHorizontal:4,fontStyle:'italic'},
});

// ── Styles écran interviews ───────────────────────────────────────────────
const ivs = StyleSheet.create({
  root:{flex:1,backgroundColor:'#0d0d1a'},
  header:{flexDirection:'row',alignItems:'center',padding:14,
    borderBottomWidth:1,borderColor:'#1a1a2e'},
  back:{color:'#666',fontSize:12},
  headerTitle:{flex:1,color:'#e2b96f',fontSize:14,fontWeight:'bold',textAlign:'center',letterSpacing:2},
  headerCount:{color:'#444',fontSize:12},
  progressRow:{flexDirection:'row',gap:4,paddingHorizontal:20,paddingVertical:8},
  pip:{flex:1,height:3,backgroundColor:'#1a1a2e',borderRadius:2},
  champBanner:{borderRadius:14,padding:14,marginBottom:14,borderWidth:1},
  champDot:{width:14,height:14,borderRadius:7},
  champName:{fontSize:20,fontWeight:'bold'},
  champArch:{color:'#666',fontSize:11,marginTop:2},
  champLv:{color:'#444',fontSize:11,marginLeft:'auto'},
  traitRow:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:8},
  traitBadge:{flexDirection:'row',alignItems:'center',backgroundColor:'#1a1a2e',
    borderRadius:10,paddingHorizontal:7,paddingVertical:3,gap:4,borderWidth:1},
  traitIco:{fontSize:12},
  traitLbl:{fontSize:9,fontWeight:'bold'},
  quoteBox:{backgroundColor:'#111122',borderRadius:14,padding:16,
    borderWidth:1,borderColor:'#1a2a4a',marginBottom:20},
  quoteBy:{color:'#444',fontSize:10,fontStyle:'italic',marginBottom:8},
  quote:{color:'#ccc',fontSize:13,lineHeight:20,fontStyle:'italic'},
  nav:{flexDirection:'row',gap:10},
  navBtn:{flex:1,backgroundColor:'#1a1a2e',borderRadius:12,paddingVertical:13,
    alignItems:'center',borderWidth:1,borderColor:'#2a2a4a'},
  navNext:{flex:2,borderWidth:0},
  navTxt:{fontSize:12,fontWeight:'bold',color:'#888'},
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
