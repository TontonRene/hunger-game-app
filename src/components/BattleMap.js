/**
 * BattleMap — Vue ISOMÉTRIQUE Skia PictureRecorder
 * Tuiles cubes 3 faces, figurines géométriques, heightmap procédural
 * @shopify/react-native-skia 2.2.12 · Expo Go SDK 54
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import {
  Canvas, Picture, Skia,
  PaintStyle, BlendMode, useImage,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

// ClipOp.Intersect=1 (non re-exporté publiquement dans react-native-skia 2.2.12)
const _CLIP_INTERSECT = 1;

// ── Constantes isométriques ───────────────────────────────────────────────
const TILE_W   = 24;   // largeur du losange (en px, zoom=1)
const TILE_H   = 12;   // hauteur du losange
const TILE_Z   = 8;    // pixels par unité d'élévation
const HM_CELLS = 20;   // grille heightmap 20×20 (revert : était 60)
const HM_CELL  = 5;    // unités monde par cellule (100/20 = 5)

// ── Palettes champion / supply ────────────────────────────────────────────
const CHAMP_COLORS = [
  '#e74c3c','#3498db','#2ecc71','#f39c12',
  '#9b59b6','#1abc9c','#e67e22','#ff6b9d',
  '#00b894','#fd79a8','#6c5ce7','#fdcb6e',
  '#e17055','#74b9ff','#a29bfe','#55efc4',
];
const SUPPLY_COLORS = {
  soin:'#2ecc71', force:'#e74c3c', vitesse:'#3498db', armure:'#f39c12',
  festin:'#ff9f43', adrenaline:'#ee5a24', camouflage:'#6ab04c', carte:'#f9ca24',
};
const FAUNA_COLORS = {
  deer:'#d4a84b', wolf:'#7a8c8a', rabbit:'#ece8c0', boar:'#6a4020',
};

// ── Couleurs iso par biome — [top, droite(ombre), gauche(lumière)] ─────────
const BIOME_ISO = {
  'forêt': [
    ['#12220e','#0a140a','#0e1c0e'],   // h=0 eau/boue
    ['#1e3c1a','#102010','#182e14'],   // h=1
    ['#2a5224','#163014','#22421c'],   // h=2
    ['#347c2c','#1e4418','#2a6224'],   // h=3
    ['#3e9634','#245020','#32782a'],   // h=4
    ['#5e8a3a','#385428','#4e7430'],   // h=5
    ['#7a9c52','#4e6634','#668444'],   // h=6
    ['#a0b870','#6a7c4a','#88a05c'],   // h=7
  ],
  'désert': [
    ['#2a1e08','#180e04','#201408'],
    ['#5a4818','#38300e','#4a3c14'],
    ['#7e6a28','#52461a','#6a5820'],
    ['#a08830','#6a5c20','#887428'],
    ['#c0a03c','#806c28','#a08832'],
    ['#d4b44a','#8c7830','#b89c3e'],
    ['#e0c460','#968040','#c0a650'],
    ['#f0d888','#a09060','#d4bc6e'],
  ],
  'toundra': [
    ['#0e1424','#060c16','#0a1020'],
    ['#243662','#122038','#1c2c54'],
    ['#3a5488','#1e3050','#2e4470'],
    ['#8ab0d0','#5a7898','#74a0b8'],
    ['#b4d4ee','#7a9ab0','#98c0d4'],
    ['#cce4f8','#8aacbf','#aecce8'],
    ['#e0f0ff','#9ab4c4','#c8dcf0'],
    ['#f4faff','#b0c8d4','#d8ecf8'],
  ],
  'marais': [
    ['#0a1a10','#04100a','#08140e'],
    ['#183020','#0e1e14','#12261a'],
    ['#264830','#142a1c','#1e3c28'],
    ['#34603e','#1c3822','#2a5034'],
    ['#427848','#22422a','#346040'],
    ['#5a8850','#325236','#4a7044'],
    ['#729e62','#465e3c','#60885a'],
    ['#90b87a','#607248','#7ca068'],
  ],
  'montagne': [
    ['#101018','#080810','#0c0c14'],
    ['#28283e','#141420','#202034'],
    ['#3c3c5e','#1e1e30','#2e2e4e'],
    ['#58587e','#2c2c44','#484868'],
    ['#7878a0','#3e3e58','#686888'],
    ['#9898ba','#505068','#80809e'],
    ['#bcbcd4','#6e6e82','#a0a0b8'],
    ['#dcdce8','#9090a0','#c4c4d4'],
  ],
  'volcan': [
    ['#1a0600','#0e0200','#140400'],
    ['#3a0c00','#200600','#2c0800'],
    ['#5e1800','#360c00','#4a1000'],
    ['#8c2800','#501600','#701e00'],
    ['#aa3800','#641e00','#8a2a00'],
    ['#c44e0a','#7c2e04','#a03808'],
    ['#da6e20','#8a4010','#c05818'],
    ['#f09040','#a06020','#d87830'],
  ],
  'jungle': [
    ['#060e04','#020804','#040c04'],
    ['#0c1e08','#060e04','#081808'],
    ['#142e0e','#091808','#101a0c'],  // actually 0a1c0a
    ['#1e4214','#0e2408','#182e10'],
    ['#285a1a','#143010','#203e14'],
    ['#347420','#1a3e12','#28521a'],
    ['#40902a','#224e16','#326820'],
    ['#50a838','#2c6020','#3e7e2c'],
  ],
};

function tileColors(biome, h) {
  const pal = BIOME_ISO[biome] || BIOME_ISO['forêt'];
  const idx  = Math.max(0, Math.min(7, h));
  return pal[idx];
}


// ── Génération procédurale de rivières sur la heightmap ───────────────────
function addRivers(hm, biome, rng) {
  const nb = biome === 'marais' ? 3 : biome === 'forêt' ? 2 : biome === 'montagne' ? 2 : biome === 'jungle' ? 4 : 1;
  for (let r = 0; r < nb; r++) {
    // Départ sur un bord (h élevé)
    let gx = Math.floor(2 + rng() * (HM_CELLS - 4));
    let gy = Math.floor(2 + rng() * (HM_CELLS - 4));
    for (let step = 0; step < HM_CELLS * 2; step++) {
      gx = Math.max(1, Math.min(HM_CELLS - 2, gx));
      gy = Math.max(1, Math.min(HM_CELLS - 2, gy));
      if (hm[gy][gx] > 0) hm[gy][gx] = Math.max(0, hm[gy][gx] - 1);
      // Couler vers le voisin le plus bas
      const nbrs = [[gx+1,gy],[gx-1,gy],[gx,gy+1],[gx,gy-1]].filter(([nx,ny])=>
        nx>=1&&nx<HM_CELLS-1&&ny>=1&&ny<HM_CELLS-1);
      const lowest = nbrs.sort((a,b)=>(hm[a[1]]?.[a[0]]??9)-(hm[b[1]]?.[b[0]]??9))[0];
      if (!lowest) break;
      [gx,gy] = lowest;
      if (hm[gy][gx] === 0) break;
    }
  }
}

// ── HeightMap client (fallback si backend ne l'envoie pas) ────────────────
function seededRNG(seed) {
  let h = seed | 0;
  return () => {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
  };
}
function strHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  return h;
}

const _HM_CACHE = {};
function clientHeightMap(biome, seed) {
  const key = (biome || 'forêt') + (seed || 'x');
  if (_HM_CACHE[key]) return _HM_CACHE[key];
  const profiles = {
    'forêt':    { peaks:4,  maxH:4, spread:9,  water:false },
    'désert':   { peaks:3,  maxH:3, spread:11, water:false },
    'toundra':  { peaks:7,  maxH:6, spread:5,  water:false },
    'marais':   { peaks:2,  maxH:2, spread:13, water:true  },
    'montagne': { peaks:10, maxH:7, spread:4,  water:false },
    'volcan':   { peaks:12, maxH:7, spread:3,  water:false }, // très accidenté, cratère central
    'jungle':   { peaks:3,  maxH:3, spread:14, water:true  }, // plat, dense, humide
  };
  const cfg = profiles[biome] || profiles['forêt'];
  const rng = seededRNG(strHash(key));
  const peaks = [];
  for (let i = 0; i < cfg.peaks; i++) peaks.push({
    x: 2 + rng() * (HM_CELLS - 4), y: 2 + rng() * (HM_CELLS - 4),
    h: 1 + rng() * cfg.maxH, sp: cfg.spread * (0.5 + rng() * 0.8),
  });
  const hm = [];
  for (let gy = 0; gy < HM_CELLS; gy++) {
    hm[gy] = [];
    for (let gx = 0; gx < HM_CELLS; gx++) {
      let tw = 0, th = 0;
      peaks.forEach(p => {
        const d = Math.hypot(gx - p.x, gy - p.y);
        const w = 1 / (Math.pow(d / p.sp, 2) + 0.4);
        tw += w; th += p.h * w;
      });
      let elev = th / tw + (rng() - 0.5) * 0.9;
      // Île : bords forcés en eau (h=0)
      const edge = Math.min(gx, gy, HM_CELLS - 1 - gx, HM_CELLS - 1 - gy);
      if (edge === 0) elev = 0;
      else if (edge === 1) elev = Math.min(elev, 1);
      else if (edge === 2) elev = Math.min(elev, 2);
      hm[gy][gx] = Math.max(0, Math.min(7, Math.round(elev)));
    }
  }
  if (cfg.water) {
    for (let gy = 2; gy < HM_CELLS - 2; gy++)
      for (let gx = 2; gx < HM_CELLS - 2; gx++)
        if (hm[gy][gx] === 1 && rng() < 0.25) hm[gy][gx] = 0;
  }
  // Ajouter des rivières procédurales
  addRivers(hm, biome, rng);
  // Slope limiting : différence max 1 entre cases voisines → plus aucun trou vertical
  let changed = true;
  while (changed) {
    changed = false;
    for (let gy = 0; gy < HM_CELLS; gy++) {
      for (let gx = 0; gx < HM_CELLS; gx++) {
        [[gx+1,gy],[gx-1,gy],[gx,gy+1],[gx,gy-1]].forEach(([nx,ny]) => {
          if (nx < 0 || nx >= HM_CELLS || ny < 0 || ny >= HM_CELLS) return;
          if (hm[gy][gx] - hm[ny][nx] > 1) {
            hm[gy][gx] = hm[ny][nx] + 1;
            changed = true;
          }
        });
      }
    }
  }
  _HM_CACHE[key] = hm;
  return hm;
}

function getElev(wx, wy, hm) {
  if (!hm) return 1;
  const gx = Math.max(0, Math.min(HM_CELLS - 1, Math.floor(wx / HM_CELL)));
  const gy = Math.max(0, Math.min(HM_CELLS - 1, Math.floor(wy / HM_CELL)));
  return (hm[gy] || [])[gx] ?? 1;
}

// ── Projection isométrique ────────────────────────────────────────────────
// wx,wy en unités monde (0-100), wz en unités hauteur (0-7)
// → position iso en pixels (espace iso, avant zoom/caméra)
function wToIso(wx, wy, wz) {
  const gx = wx / HM_CELL;
  const gy = wy / HM_CELL;
  return {
    ix: (gx - gy) * (TILE_W / 2),
    iy: (gx + gy) * (TILE_H / 2) - (wz || 0) * TILE_Z,
  };
}

// iso → écran
function isoToScreen(ix, iy, camIx, camIy, zoom, W, H) {
  return {
    sx: W / 2 + (ix - camIx) * zoom,
    sy: H / 2 + (iy - camIy) * zoom,
  };
}

// Centre iso de la map (pour camera par défaut)
// Map interne 0-100 (HM_CELLS=20 × HM_CELL=5) → centre à 50
function mapCenterIso() {
  const { ix, iy } = wToIso(50, 50, 1);
  return { ix, iy: iy + 8 };
}

// ── Pool de paints ────────────────────────────────────────────────────────
let _FP = null, _AP = null, _SP = null, _SAP = null;
// Pool de paths réutilisables (évite GC intensif sur les tiles)
let _tp = null, _rp = null, _lp = null, _ep = null;  // top, right, left, edge
const _CC = {};

function _initPool() {
  if (_FP) return;
  _FP  = Skia.Paint();
  _AP  = Skia.Paint();
  _SP  = Skia.Paint(); _SP.setStyle(PaintStyle.Stroke);
  _SAP = Skia.Paint(); _SAP.setStyle(PaintStyle.Stroke);
  _tp  = Skia.Path.Make();
  _rp  = Skia.Path.Make();
  _lp  = Skia.Path.Make();
  _ep  = Skia.Path.Make();  // arêtes lumineuses
}
function _c(s) { return _CC[s] || (_CC[s] = Skia.Color(s)); }

// ── Sprite paint (dédié, non partagé) ────────────────────────────────────
let _SPRITE_P = null;
function _getSpriteP(alpha) {
  if (!_SPRITE_P) { _SPRITE_P = Skia.Paint(); }
  _SPRITE_P.setAlphaf(alpha);
  return _SPRITE_P;
}

function mkFill(col) { _FP.setColor(_c(col)); _FP.setAlphaf(1);    return _FP; }
function mkAlpha(col,a) { _AP.setColor(_c(col)); _AP.setAlphaf(a); return _AP; }
function mkStroke(col,w) {
  _SP.setPathEffect(null); _SP.setColor(_c(col));
  _SP.setStrokeWidth(w);   _SP.setAlphaf(1); return _SP;
}
function mkStrokeA(col,w,a) {
  _SAP.setPathEffect(null); _SAP.setColor(_c(col));
  _SAP.setStrokeWidth(w);   _SAP.setAlphaf(a); return _SAP;
}

// ── Système de particules (coordonnées monde) ─────────────────────────────
function spawnParticles(pool, wx, wy, type, color) {
  const cfgs = {
    combat: { n:6,  spd:[30,80],  lt:[0.35,0.65], r:[0.8,2.2], grav:20,  cols:[color,'#ff8844','#ffdd44'] },
    death:  { n:10, spd:[12,50],  lt:[0.7,1.6],   r:[0.7,2.8], grav:35,  cols:['#888','#555','#aaa','#ccc'] },
    heal:   { n:5,  spd:[5,18],   lt:[0.5,1.0],   r:[0.8,1.8], grav:-20, cols:['#2ecc71','#27ae60','#a8ffc8'] },
    supply: { n:4,  spd:[8,25],   lt:[0.5,1.1],   r:[1.0,2.5], grav:0,   cols:[color,'#ffffff','#e2b96f'] },
  };
  const cfg = cfgs[type] || cfgs.combat;
  const n   = Math.min(cfg.n, 42 - pool.length);
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = cfg.spd[0] + Math.random() * (cfg.spd[1] - cfg.spd[0]);
    const lt  = cfg.lt[0]  + Math.random() * (cfg.lt[1]  - cfg.lt[0]);
    pool.push({
      wx, wy,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      life: 1.0, decay: 1.0 / lt,
      r: cfg.r[0] + Math.random() * (cfg.r[1] - cfg.r[0]),
      color: cfg.cols[Math.floor(Math.random() * cfg.cols.length)],
      gravity: cfg.grav,
    });
  }
}

// ── Pseudo-random déterministe par tile (évite Math.random en draw loop) ──
function _tileRng(gx, gy, idx) {
  const s = ((gx * 73856093) ^ (gy * 19349663) ^ (idx * 83492791)) >>> 0;
  return ((s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

// ── Table de tiles par biome — iso_tiles.png (352×352, grille 11×11, 32×32/tile)
// Index i → col=i%11, row=floor(i/11)
// row0 (0-10)   : terre brune plate / variantes
// row1 (11-21)  : terre brune rocaille / fissures
// row2 (22-32)  : herbe verte sur terre / variantes
// row3 (33-43)  : végétation dense
// row4 (44-54)  : fleurs (44-46) / fleurs colorées (47) / rondins (48-52) / pierres (53-54)
// row5 (55-65)  : rochers bruns / variantes
// row6 (66-76)  : pierres plates bleues-grises (66-68) + glace (69-76)
// row7 (77-87)  : cailloux/glace (77-81) / particules eau (82-86) / vide (87)
// row8 (88-98)  : eau peu profonde (88-90) / eau claire variée (91-98)
// row9 (99-109) : eau profonde (99) + eau de surface variée (100-109)
// row10(110-120): eau claire vagues (110) / glace fine (111-117) / glace (118-120)
//
// Chaque biome × hauteur = liste de tiles possibles. Pick aléatoire avec hash gx,gy.
const _BTILES = {
  'forêt': [
    [99],                                                  // h0 : eau
    [0, 1, 4, 5, 6, 14, 15],                              // h1 : terre nue variée
    [1, 2, 3, 14, 15, 19, 25, 26],                        // h2 : terre + transition herbe
    [22, 23, 24, 27, 28, 29, 30],                         // h3 : herbe variée
    [22, 23, 24, 27, 28, 29, 30, 41, 47],                 // h4 : herbe + qq fleurs
    [33, 34, 35, 36, 37, 41, 42, 49, 51],                 // h5 : végétation dense + rondins
    [33, 34, 35, 36, 37, 49, 50, 51, 52],                 // h6 : forêt sombre + rondins moussus
    [55, 56, 57, 58, 59, 60],                             // h7 : rocher
  ],
  'désert': [
    [99],
    [0, 4, 5, 6, 7, 8, 9, 10],                            // sable varié
    [0, 4, 5, 6, 7, 14, 15, 16, 17, 18],                  // sable + dunes
    [1, 2, 3, 14, 15, 16, 17, 18, 19, 20],                // dunes mixtes
    [1, 2, 14, 15, 19, 20, 21, 53, 54],                   // dunes + pierres isolées
    [11, 12, 13, 14, 15, 19, 20, 53, 54],                 // sable rocailleux
    [55, 56, 57, 58, 59, 60],                             // rochers brûlés
    [55, 56, 57, 58, 59, 60, 61, 62],                     // rochers gris
  ],
  'toundra': [
    [110, 111, 112, 113, 114],                            // eau glacée variée
    [88, 89, 90, 91, 92, 93, 115, 116, 117],              // eau peu profonde glacée
    [88, 89, 90, 91, 92, 93, 100, 101, 118, 119, 120],    // glace fine
    [66, 67, 68, 75, 76, 80, 81],                         // pierre + glace
    [66, 67, 68, 75, 76, 80, 81],                         // idem
    [69, 70, 71, 72, 73, 74, 77, 78, 79],                 // rochers glacés
    [69, 70, 71, 72, 73, 74, 77, 78, 79],
    [55, 56, 57, 58, 59, 60],                             // pics rocheux
  ],
  'marais': [
    [99, 100, 101, 102, 103, 104],                        // eau profonde stagnante
    [88, 89, 90, 94, 95, 96, 97, 98],                     // eau peu profonde
    [0, 1, 2, 19, 25, 26],                                // boue
    [22, 23, 24, 27, 28, 29, 30],                         // herbe humide
    [22, 23, 24, 27, 28, 29, 30, 41, 47],                 // herbe + fleurs
    [33, 34, 35, 36, 37, 49, 50, 51, 52],                 // végétation + rondins moussus
    [66, 67, 68, 75, 76],                                 // pierre humide
    [77, 78, 79, 80, 81],                                 // cailloux
  ],
  'montagne': [
    [99],
    [0, 1, 4, 5, 6],                                      // terre montagne
    [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],         // rocaille
    [55, 56, 57, 58, 59, 60],                             // rochers bruns
    [55, 56, 57, 58, 59, 60, 61, 62],                     // rochers mixtes
    [66, 67, 68, 75, 76],                                 // pierre plate
    [66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76],         // pierre + glace
    [77, 78, 79, 80, 81],                                 // pics neigeux
  ],
  'volcan': [
    [99],
    [0, 4, 5, 6, 7],                                      // cendres
    [0, 4, 5, 6, 7, 14, 15, 16, 17, 18],                  // cendres + roche
    [1, 2, 3, 14, 15, 16, 17, 18, 19, 20],                // basalte fendu
    [11, 12, 13, 14, 15, 16, 17, 18],                     // roche volcanique
    [55, 56, 57, 58, 59, 60],                             // rochers chauds
    [55, 56, 57, 58, 59, 60, 61, 62],                     // rochers gris
    [66, 67, 68],                                         // sommets refroidis
  ],
  'jungle': [
    [99],
    [22, 23, 24, 27, 28, 29, 30],                         // herbe luxuriante
    [22, 23, 24, 27, 28, 29, 30, 31, 32],                 // herbe + arbustes
    [33, 34, 35, 36, 37, 38, 39, 40],                     // végétation dense
    [33, 34, 35, 36, 37, 38, 39, 40, 41, 42],             // dense + fleurs
    [44, 45, 46, 41, 42, 43, 47, 49, 51],                 // fleurs colorées + rondins
    [44, 45, 46, 41, 42, 49, 50, 51, 52],                 // fleurs + rondins moussus
    [55, 56, 57, 58, 59, 60],                             // rochers
  ],
};
function _isoTileIdx(biome, h, gx, gy) {
  const arr = _BTILES[biome] || _BTILES['forêt'];
  const opts = arr[Math.min(h, arr.length - 1)] || [0];
  if (opts.length <= 1) return opts[0];
  // Hash position pour pick déterministe (pas de scintillement)
  const r = _tileRng(gx, gy, 6);
  return opts[Math.floor(r * opts.length) % opts.length];
}

// Couleurs des flancs (droite/gauche) par rangée du tileset (11 rangées)
// Chaque rangée = un type de terrain. Les flancs polygon bouchent les trous de hauteur.
const _CLIFF_R = [
  '#3d2614', // row0 : terre brune
  '#2e1e0c', // row1 : terre brune variante
  '#2e1a0a', // row2 : herbe (flanc marron sous la verdure)
  '#1c1408', // row3 : végétation dense
  '#1c1408', // row4 : fleurs
  '#4a2c18', // row5 : rocher brun
  '#28334a', // row6 : pierre bleue-grise
  '#2a2a34', // row7 : cailloux gris
  '#121218', // row8 : dalle sombre
  '#0c1428', // row9 : eau profonde (jamais cliff)
  '#384ea0', // row10: glace / eau claire
];
const _CLIFF_L = [
  '#503020', // row0
  '#3c2410', // row1
  '#3c2010', // row2
  '#241808', // row3
  '#241808', // row4
  '#5c3820', // row5
  '#333e56', // row6
  '#383840', // row7
  '#1a1a22', // row8
  '#101c30', // row9
  '#4862b8', // row10
];

// ── Dessin d'un cube isométrique avec boucle d'empilement (Tile Stacking) ──
// Optimisation FPS : au dézoom (zoom < 3) on dessine seulement la couche supérieure
// → ~7× moins de drawImageRect sur tiles hautes (h=7). Les "sides" sont invisibles
// à ce niveau de zoom de toute façon.
function drawIsoCube(canvas, gx, gy, h, biome, fogA, camIx, camIy, zoom, W, H, t, isoTilesImg) {
  const tw = (TILE_W / 2) * zoom;
  const th = (TILE_H / 2) * zoom;
  const tW = tw * 2;
  const tH = tW;
  const dimA = fogA > 0.05 ? (1 - fogA * 0.78) : 1;

  // LOD : zoom faible = couche du haut seulement. Zoom moyen = top + base.
  // Zoom fort = pile complète.
  let zStart;
  if (zoom < 3.0)       zStart = h;          // zoom out fort : juste le haut
  else if (zoom < 5.0)  zStart = Math.max(0, h - 1);  // zoom moyen : 2 niveaux
  else                  zStart = 0;          // zoom fort : pile complète

  for (let z = zStart; z <= h; z++) {
    const { ix, iy } = wToIso(gx * HM_CELL, gy * HM_CELL, z);
    const tx = W / 2 + (ix - camIx) * zoom;
    const ty = H / 2 + (iy - camIy) * zoom;

    const tzCull = z * TILE_Z * zoom;

    if (tx < -tW || tx > W + tW || ty < -(tH + tzCull) || ty > H + tH) continue;

    const tIdx = _isoTileIdx(biome, z, gx, gy);

    
    if (isoTilesImg) {
      const srcCol = tIdx % 11;
      const srcRow = Math.floor(tIdx / 11);
      const src = Skia.XYWHRect(srcCol * 32, srcRow * 32, 32, 32);
      const dst = Skia.XYWHRect(tx - tw, ty - th, tW, tH);
      canvas.drawImageRect(isoTilesImg, src, dst, _getSpriteP(dimA));
    } else {

      const [topC] = tileColors(biome, z);
      _tp.rewind();
      _tp.moveTo(tx, ty - th); _tp.lineTo(tx + tw, ty);
      _tp.lineTo(tx, ty + th); _tp.lineTo(tx - tw, ty); _tp.close();
      canvas.drawPath(_tp, mkAlpha(topC, dimA));
    }

    // Eau animée uniquement sur la couche de base
    if (z === 0 && h === 0 && zoom > 0.8 && dimA > 0.15 && t != null) {
      const r0 = _tileRng(gx, gy, 0);
      for (let wi = 0; wi < 2; wi++) {
        const phase = ((t * 0.65 + r0 * 2.5 + wi * 0.5) % 1.0);
        const ringA = (1 - phase) * 0.18 * dimA;
        if (ringA < 0.010) continue;
        const rw = tw * (0.14 + phase * 0.60), rh = th * (0.14 + phase * 0.60);
        _ep.rewind(); _ep.addOval(Skia.XYWHRect(tx - rw, ty - rh, rw * 2, rh * 2));
        canvas.drawPath(_ep, mkStrokeA('#aad8f8', Math.max(0.4, zoom * 0.28), ringA));
      }
    }
  }
}

// ── Look déterministe par champion ───────────────────────────────────────
function _hashId(id) {
  let h = 0; const s = String(id || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
const _SHIRT_COLS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#ff6b9d','#00b894','#fd79a8','#6c5ce7','#fdcb6e','#e17055','#74b9ff','#a29bfe','#55efc4'];
const _PANTS_COLS = ['#2c3e50','#1a1a2e','#3d1c02','#0d3d56','#1e3c1a','#4a235a','#34495e','#403030'];
// Variations cheveux : noir, brun, châtain, blond, gris, blanc, rouge, brun-roux, etc.
const _HAIR_COLS  = ['#1a0800','#3d1c02','#5a2a08','#8b4513','#a0522d','#d4a017','#deb887','#f0e0c0','#505050','#c0c0c0','#800000','#c05000','#000000'];
const _SKIN_COLS  = ['#ffe0c8','#ffd8b0','#f5d0a0','#d4956a','#c08050','#a07050','#8a5030','#6a3820'];
// ── LPC look pools ───────────────────────────────────────────────────────
const _LPC_BODY  = ['male', 'female'];
const _LPC_HAIR  = ['bob', 'braid', 'bangs', 'afro', 'buzzcut', 'cornrows', 'curly', 'long'];
const _LPC_TORSO = ['shirt', 'tshirt', 'leather', 'plate'];
const _LPC_LEGS  = ['pants', 'shorts'];
function generateLook(id) {
  const h0 = _hashId(id);
  // Avalanche mixing — chaque étape brise la corrélation entre IDs séquentiels
  const h1 = (Math.imul(h0 ^ (h0 >>> 16), 0x45d9f3b)) >>> 0;
  const h2 = (Math.imul(h1 ^ (h1 >>> 16), 0x45d9f3b)) >>> 0;
  const h3 = (Math.imul(h2 ^ (h2 >>> 13), 0x9e3779b9)) >>> 0;
  const h4 = (Math.imul(h3 ^ (h3 >>> 11), 0x6c62272e)) >>> 0;
  const h5 = (Math.imul(h4 ^ (h4 >>> 15), 0x165667b1)) >>> 0;
  const h6 = (Math.imul(h5 ^ (h5 >>> 17), 0x27d4eb2f)) >>> 0;
  const h7 = (Math.imul(h6 ^ (h6 >>> 13), 0x85ebca6b)) >>> 0;
  return {
    skinTint:  _SKIN_COLS [h1 % _SKIN_COLS.length],
    hairTint:  _HAIR_COLS [h2 % _HAIR_COLS.length],
    shirtTint: _SHIRT_COLS[h3 % _SHIRT_COLS.length],
    pantsTint: _PANTS_COLS[h4 % _PANTS_COLS.length],
    bodyType:  _LPC_BODY  [h5 % _LPC_BODY.length],
    hair:      _LPC_HAIR  [h6 % _LPC_HAIR.length],
    torso:     _LPC_TORSO [h7 % _LPC_TORSO.length],
    legs:      _LPC_LEGS  [h1 % _LPC_LEGS.length],
    feet:      'boots',
  };
}
// _getTintPaint — applique une teinte couleur via ColorFilter.MakeBlend(Modulate)
// Fonctionne dans PictureRecorder contrairement à saveLayer+BlendMode
function _getTintPaint(col, alpha) {
  if (!col) return _getSpriteP(alpha);
  try {
    const p = Skia.Paint();
    p.setAlphaf(Math.max(0, Math.min(1, alpha)));
    p.setColorFilter(Skia.ColorFilter.MakeBlend(Skia.Color(col), BlendMode.Modulate));
    return p;
  } catch (_) {
    return _getSpriteP(alpha);
  }
}

// ── Figurine géométrique améliorée (fallback si pas de sprite) ────────────
function _drawGeoFigure(canvas, cv, sc, sx, sy, baseA, t, col) {
  const bob   = Math.sin(t * 4 + cv.idx) * 1.0 * sc;
  const legTop = sy - 2*sc;
  const legH   = 8*sc;
  // Jambes
  canvas.drawRect(Skia.XYWHRect(sx - 4.5*sc, legTop + bob,  2.5*sc, legH - bob), mkAlpha(col, 0.68 * baseA));
  canvas.drawRect(Skia.XYWHRect(sx + 2.0*sc, legTop - bob,  2.5*sc, legH + bob), mkAlpha(col, 0.68 * baseA));
  // Corps
  const bodyW = 8*sc, bodyH = 12*sc;
  const bodyX = sx - bodyW/2, bodyY = legTop - bodyH;
  canvas.drawRect(Skia.XYWHRect(bodyX, bodyY, bodyW, bodyH), mkAlpha(col, 0.92 * baseA));
  canvas.drawRect(Skia.XYWHRect(bodyX+1.2*sc, bodyY+1.5*sc, bodyW*0.32, bodyH*0.52), mkAlpha('#ffffff', 0.18*baseA));
  // Bras
  const armY   = bodyY + 2*sc;
  const armBob = Math.sin(t * 4 + cv.idx + Math.PI) * 1.0 * sc;
  canvas.drawRect(Skia.XYWHRect(bodyX-3*sc, armY+armBob, 3*sc, 8*sc), mkAlpha(col, 0.65*baseA));
  canvas.drawRect(Skia.XYWHRect(bodyX+bodyW, armY-armBob, 3*sc, 8*sc), mkAlpha(col, 0.65*baseA));
  // Tête
  const headR = 5.5*sc;
  const headY = bodyY - headR - 1*sc;
  canvas.drawCircle(sx, headY, headR, mkAlpha(col, 0.95*baseA));
  canvas.drawCircle(sx - headR*0.30, headY - headR*0.25, headR*0.36, mkAlpha('#ffffff', 0.24*baseA));
  return { headR, headY, topY: headY - headR };
}

// ── Figurine isométrique (sprite ou géométrique) ─────────────────────────
function drawIsoCharacter(canvas, cv, hm, t, camIx, camIy, zoom, W, H, fm, spriteImgs) {
  const wz = getElev(cv.x, cv.y, hm);
  const { ix, iy } = wToIso(cv.x, cv.y, wz);
  const sx = W / 2 + (ix - camIx) * zoom;
  const sy = H / 2 + (iy - camIy) * zoom;

  if (sx < -50 || sx > W + 50 || sy < -100 || sy > H + 50) return;

  const sc    = Math.min(1.8, Math.max(0.5, zoom * 0.28));  // échelle UI proportionnelle aux sprites (barres, ombres, anneaux)
  const baseA = cv.hasCamo ? 0.35 : 1.0;
  const col   = cv.color;

  // ── Glow aura ────────────────────────────────────────────────────────────
  const gPulse = cv.combatFlash > 0 ? 1.6 : 1.0;
  canvas.drawCircle(sx, sy - 10*sc, 20*sc, mkAlpha(col, 0.022 * baseA * gPulse));
  canvas.drawCircle(sx, sy - 10*sc, 13*sc, mkAlpha(col, 0.070 * baseA * gPulse));
  canvas.drawCircle(sx, sy - 10*sc,  7*sc, mkAlpha(col, 0.17  * baseA * gPulse));

  // Flash combat
  if (cv.combatFlash > 0) {
    canvas.drawCircle(sx, sy - 8*sc, 16*sc, mkAlpha('#ff6644', cv.combatFlash * 0.30));
  }

  // Ombre portée — plus opaque pour ancrer au sol
  const shadowP = Skia.Path.Make();
  shadowP.addOval(Skia.XYWHRect(sx - 7*sc, sy - 1.2*sc, 14*sc, 4.5*sc));
  canvas.drawPath(shadowP, mkAlpha('#000000', 0.48 * baseA));

  // ── Marqueur de contact au sol (losange iso fin coloré) ────────────────
  // Aide visuelle pour bien situer le perso sur la tile
  const cgw = 8 * sc, cgh = 4 * sc;
  const cgp = Skia.Path.Make();
  cgp.moveTo(sx,      sy - cgh);
  cgp.lineTo(sx+cgw,  sy);
  cgp.lineTo(sx,      sy + cgh);
  cgp.lineTo(sx-cgw,  sy);
  cgp.close();
  canvas.drawPath(cgp, mkStrokeA(col, 1.1 * sc, 0.55 * baseA));

  const look     = cv.look || generateLook(cv.id);
  const bodyType = look.bodyType || 'male';
  const hairKey  = look.hair     || 'bob';
  const torsoKey = look.torso    || 'shirt';
  const legsKey  = look.legs     || 'pants';

  // ── Figure morte ──────────────────────────────────────────────────────────
  if (cv.isDead) {
    const spH2  = Math.max(14, zoom * (TILE_H / 2) * 2.2);
    const spW2  = spH2;
    const dst2  = Skia.XYWHRect(sx - spW2 / 2, sy - spH2, spW2, spH2);
    const bodyImg2 = spriteImgs?.[`lpc_body_${bodyType}_hurt`];
    if (bodyImg2) {
      // hurt.png = 1 seule rangée (64px de haut) → toujours row 0
      const src2 = Skia.XYWHRect(0, 0, 64, 64);
      const p2   = _getSpriteP(0.28);
      const dead_layers = [
        `lpc_body_${bodyType}_hurt`,
        `lpc_legs_${legsKey}_hurt`,
        'lpc_feet_boots_hurt',
        `lpc_torso_${torsoKey}_hurt`,
        `lpc_hair_${hairKey}_hurt`,
      ];
      for (const key of dead_layers) {
        const img2 = spriteImgs?.[key];
        if (img2) canvas.drawImageRect(img2, src2, dst2, p2);
      }
    } else {
      // Fallback dead figure : croix simple si sprite LPC pas chargé
      const ds = Math.max(0.5, zoom * 0.45);
      const xp = Skia.Path.Make();
      xp.moveTo(sx-5*ds, sy-2*ds); xp.lineTo(sx+5*ds, sy+4*ds);
      xp.moveTo(sx+5*ds, sy-2*ds); xp.lineTo(sx-5*ds, sy+4*ds);
      canvas.drawPath(xp, mkStrokeA('#444444', 1.5*ds, 0.55));
    }
    return;
  }

  // ── Sprite animé LPC — 5 couches composées ───────────────────────────────
  const isMoving    = !!cv.isMoving;
  const isAttacking = cv.combatFlash > 0.4;

  // Animation : slash (attaque), walk (marche), idle (repos)
  // LPC frame counts : walk=9, idle=9, slash=6
  let animName, animFps, animFrames;
  if (isAttacking) {
    animName = 'slash'; animFps = 12; animFrames = 6;
  } else if (isMoving) {
    animName = 'walk';  animFps = 9;  animFrames = 9;
  } else {
    animName = 'idle';  animFps = 2;  animFrames = 2;
  }
  const frameIdx = Math.floor(t * animFps) % animFrames;

  // cv.dirRow     : 0=bas, 1=gauche, 2=droite, 3=haut
  // Sprites LPC standard : row0=back, row1=gauche, row2=front(face), row3=droite
  const _LPC_DIR_MAP = [2, 1, 3, 0];
  const lpcDirRow = _LPC_DIR_MAP[cv.dirRow ?? 0] ?? 2;

  const spH = Math.max(18, zoom * (TILE_H / 2) * 2.6);
  const spW = spH;
  const spX = sx - spW / 2;
  const bob = isMoving ? Math.sin(t * 10 + cv.idx) * 0.8*sc
                       : Math.sin(t * 2  + cv.idx) * 0.3*sc;
  const spYfinal = sy - spH + bob;

  let topY  = spYfinal;
  let headR = spW * 0.20;
  let headY = spYfinal + spH * 0.15;

  const bodyImg = spriteImgs?.[`lpc_body_${bodyType}_${animName}`];

  if (bodyImg) {
    // ── Rendu LPC (5 couches : body → legs → feet → torso → hair) ───────────
    const LPC_CELL = 64;
    const srcRect  = Skia.XYWHRect(frameIdx * LPC_CELL, lpcDirRow * LPC_CELL, LPC_CELL, LPC_CELL);
    const dst      = Skia.XYWHRect(spX, spYfinal, spW, spH);
    // Offsets relatifs à la taille du sprite, pour aligner cheveux/torso
    // avec le body modifié (têtes ajoutées). Cheveux légèrement vers le bas.
    const HAIR_DX  =  spW * 0.005;   // quasi centré
    const HAIR_DY  =  spH * 0.045;   // vers le bas pour poser sur la tête
    const TORSO_DX =  spW * 0.005;
    const TORSO_DY =  spH * 0.015;
    const dstHair  = Skia.XYWHRect(spX + HAIR_DX,  spYfinal + HAIR_DY,  spW, spH);
    const dstTorso = Skia.XYWHRect(spX + TORSO_DX, spYfinal + TORSO_DY, spW, spH);
    const {
      skinTint  = '#e8c49a', hairTint  = '#3d1c02',
      shirtTint = '#e74c3c', pantsTint = '#2c3e50',
    } = look;
    // Couches : [key, paint, dstOverride?]
    const lpc_layer_paints = [
      [  `lpc_body_${bodyType}_${animName}`, _getTintPaint(skinTint,  baseA), dst      ],
      [  `lpc_legs_${legsKey}_${animName}`,  _getTintPaint(pantsTint, baseA), dst      ],
      [  `lpc_feet_boots_${animName}`,       _getSpriteP(baseA),              dst      ],
      [  `lpc_torso_${torsoKey}_${animName}`,_getTintPaint(shirtTint, baseA), dstTorso ],
      [  `lpc_hair_${hairKey}_${animName}`,  _getTintPaint(hairTint,  baseA), dstHair  ],
    ];
    for (const [key, paint, layerDst] of lpc_layer_paints) {
      const img = spriteImgs?.[key];
      if (img) canvas.drawImageRect(img, srcRect, layerDst, paint);
    }
    // ── Zone tête (conservé uniquement pour positionner la barre HP au bon endroit) ──
    const faceR  = spW * 0.18;            // rayon du visage
    const faceY  = spYfinal + spH * 0.14; // haut du sprite = zone tête
    headY = faceY; headR = faceR;         // pour la HP bar
    topY  = faceY - faceR;

    // Ring indicateur sous les pieds
    canvas.drawCircle(sx, sy - 0.5*sc, spW * 0.48,
      mkStrokeA(cv.isFollowed ? '#ffffff' : col,
                cv.isFollowed ? 2.2*sc : 1.3*sc,
                (cv.isFollowed ? 0.95 : 0.55) * baseA));

  } else {
    // ── Fallback géométrique ─────────────────────────────────────────────────
    // const geo = _drawGeoFigure(canvas, cv, sc, sx, sy, baseA, t, col);
    // headR = geo.headR; headY = geo.headY; topY = geo.topY;
    // canvas.drawCircle(sx, headY, headR + 2.4*sc,
    //   mkStrokeA(cv.isFollowed ? '#ffffff' : col,
    //             cv.isFollowed ? 2.2*sc : 1.2*sc,
    //             (cv.isFollowed ? 1.0 : 0.45) * baseA));
  }

  // ── Status effects visuels ────────────────────────────────────────────────
  const se = cv.se || [];
  if (se.includes('bleed')) {
    // Gouttes rouges (2 petits cercles)
    canvas.drawCircle(sx - 3*sc, sy - 4*sc, 1.4*sc, mkAlpha('#e74c3c', 0.85));
    canvas.drawCircle(sx + 2*sc, sy - 6*sc, 1.0*sc, mkAlpha('#e74c3c', 0.70));
  }
  if (se.includes('stun')) {
    // Étoiles jaunes (petits losanges)
    for (let i=0;i<3;i++) {
      const ang = (t * 3 + i * 2.1) % (Math.PI*2);
      const sr = 7*sc;
      canvas.drawCircle(sx + Math.cos(ang)*sr, (topY||headY) - 3*sc + Math.sin(ang)*sr*0.4,
        1.8*sc, mkAlpha('#f1c40f', 0.90));
    }
  }
  if (se.includes('poison')) {
    canvas.drawCircle(sx, sy - 14*sc, 5*sc, mkAlpha('#27ae60', 0.25 + Math.sin(t*3)*0.08));
  }

  // ── Barre HP uniquement (faim/soif masquées sur la carte) ───────────────
  const bw = 26*sc, bh = 3.2*sc;
  const bx = sx - bw / 2;
  const by = (topY !== undefined ? topY : headY - headR) - 8*sc;

  // Bande couleur unique du champion (identifiant visuel garanti au-dessus de la HP bar)
  canvas.drawRect(Skia.XYWHRect(bx, by - bh * 0.9, bw, bh * 0.65), mkAlpha(col, baseA * 0.92));

  canvas.drawRect(Skia.XYWHRect(bx-1, by-1, bw+2, bh+2), mkAlpha('#000000', 0.80));
  const hpRatio = Math.max(0, cv.hp / cv.maxHp);
  const barC    = hpRatio > 0.6 ? '#2ecc71' : hpRatio > 0.3 ? '#f39c12' : '#e74c3c';
  canvas.drawRect(Skia.XYWHRect(bx, by, bw * hpRatio, bh), mkFill(barC));
  // Reflet HP bar
  canvas.drawRect(Skia.XYWHRect(bx, by, bw * hpRatio, bh*0.45), mkAlpha('#ffffff', 0.20));

  // ── Nom (zoom fort) ───────────────────────────────────────────────────────
  if (zoom > 1.6 && fm) {
    const approxW = cv.name.length * 4.5;
    canvas.drawText(cv.name, sx - approxW/2, by - 4, mkAlpha('#ffffff', 0.82*baseA), fm);
  }

  // ── Badge arme (zoom fort) ────────────────────────────────────────────────
  if (cv.weapon && cv.weapon !== 'stone_knife' && cv.weapon !== 'fists' && zoom > 1.4 && fm) {
    const wIcons = { bow:'🏹', wooden_bow:'🏹', sword:'⚔️', spear:'🗡️',
      crude_spear:'🗡️', club:'🪵', stone_axe:'🪓', hunting_knife:'🔪',
      wooden_shield:'🛡️', shield:'🛡️', sling:'🪨' };
    const icon = wIcons[cv.weapon];
    if (icon) canvas.drawText(icon, sx + headR + 1*sc, headY + 2, mkAlpha('#ffffff', 0.70*baseA), fm);
  }

  // ── Badge hauteur ─────────────────────────────────────────────────────────
  if (cv.elevation > 3 && zoom > 0.9 && fm) {
    canvas.drawText(`▲${cv.elevation}`, sx + (headR||5*sc) + 2*sc, (topY||headY) + 4,
      mkAlpha('#f39c12', 0.78), fm);
  }
}

// ── Scène isométrique principale ──────────────────────────────────────────
function drawIsoScene(canvas, t, v, sortedTilesRef, camIx, camIy, zoom, fm, fs, W, H, spriteImgs) {
  _initPool();

  const biome = v.biome || 'forêt';
  const hm    = v.heightMap;

  // Fond (ciel nuit/jour) — dégradé atmosphérique
  const dayPhase  = v.dayPhase || 0;
  const isNight   = dayPhase >= 18;
  const isDusk    = dayPhase >= 16 && dayPhase < 18;
  const isDawn    = dayPhase >= 5  && dayPhase < 7;
  const skyTop    = isNight ? '#010206' : isDusk ? '#1a0a1e' : isDawn ? '#0d1a2e' : '#040509';
  const skyMid    = isNight ? '#020412' : isDusk ? '#3d1445' : isDawn ? '#1a3a5c' : '#060a14';
  canvas.drawColor(Skia.Color(skyTop));
  // Gradient vertical (horizon plus clair)
  const skyP = Skia.Path.Make();
  skyP.addRect(Skia.XYWHRect(0, H*0.3, W, H*0.7));
  canvas.drawPath(skyP, mkAlpha(isNight ? '#0a0520' : isDusk ? '#4a1a55' : isDawn ? '#0d2040' : '#050c1a', 0.45));
  // Teinte biome sur l'ambiance (légère)
  const biomeAmb = { forêt:'#0a1a08', désert:'#1a1000', toundra:'#081020', marais:'#041408', montagne:'#080810', volcan:'#1a0400', jungle:'#031a03' };
  canvas.drawRect(Skia.XYWHRect(0,0,W,H), mkAlpha(biomeAmb[biome]||'#080810', 0.30));

  // Champion suivi → fog of war
  const followed   = v.followId ? v.champions.find(c => c.id === v.followId && !c.isDead) : null;
  const visionW    = followed ? (followed.visionRadius || 12) : 999;
  const visionSoft = 28; // marge de transition douce (évite l'écran noir brutal)

  // ── Tiles + champions entrelacés (painter's algorithm iso) ───────────────
  const sortedTiles = sortedTilesRef || [];

  // Trier les champions par profondeur iso
  const champsWithDepth = v.champions.map(cv => ({
    cv,
    depth: cv.x / HM_CELL + cv.y / HM_CELL + 0.5,  // +0.5 = toujours après le tile de même position
  })).sort((a, b) => a.depth - b.depth);

  let ci = 0;

  for (let ti = 0; ti < sortedTiles.length; ti++) {
    const tile = sortedTiles[ti];

    // Insérer les champions dont la profondeur est <= profondeur de ce tile
    while (ci < champsWithDepth.length && champsWithDepth[ci].depth <= tile.depth) {
      drawIsoCharacter(canvas, champsWithDepth[ci].cv, hm, t, camIx, camIy, zoom, W, H, fm, spriteImgs);
      ci++;
    }

    // Fog of war : distance du tile au champion suivi
    let fogA = 0;
    if (followed) {
      const tileWx = tile.gx * HM_CELL + HM_CELL / 2;
      const tileWy = tile.gy * HM_CELL + HM_CELL / 2;
      const dist   = Math.hypot(tileWx - followed.x, tileWy - followed.y);
      // Plafonné à 0.62 : jamais complètement noir, garde le contexte visible
      fogA = dist > visionW ? Math.min(0.62, (dist - visionW) / visionSoft) : 0;
    }

    drawIsoCube(canvas, tile.gx, tile.gy, tile.h, biome, fogA, camIx, camIy, zoom, W, H, t, spriteImgs?.isoTiles);
  }

  // Champions restants (premier plan)
  while (ci < champsWithDepth.length) {
    drawIsoCharacter(canvas, champsWithDepth[ci].cv, hm, t, camIx, camIy, zoom, W, H, fm, spriteImgs);
    ci++;
  }

  // ── Obstacles visuels (zones de terrain dangereux) ────────────────────────
  (v.obstacles || []).forEach(obs => {
    const oh  = hm ? getElev(obs.x, obs.y, hm) : 1;
    const { ix: oix, iy: oiy } = wToIso(obs.x, obs.y, oh);
    const osx = W / 2 + (oix - camIx) * zoom;
    const osy = H / 2 + (oiy - camIy) * zoom;
    if (osx < -obs.radius * 60 || osx > W + obs.radius * 60) return;
    const orW = (obs.radius / HM_CELL) * (TILE_W / 2) * zoom;
    const orH = (obs.radius / HM_CELL) * (TILE_H / 2) * zoom;
    if (orW < 2) return;

    const OBSCFG = {
      lava:      { col:'#cc2200', border:'#ff5500', pulse:true  },
      swamp:     { col:'#1a3018', border:'#2a5828', pulse:false },
      ice:       { col:'#90c8e8', border:'#c4e8ff', pulse:false },
      quicksand: { col:'#c89840', border:'#e0b858', pulse:false },
      rockfall:  { col:'#484848', border:'#686868', pulse:false },
      ash:       { col:'#707070', border:'#909090', pulse:false },
      thicket:   { col:'#1a2808', border:'#2a4010', pulse:false },
    };
    const ocfg  = OBSCFG[obs.type] || OBSCFG.rockfall;
    const pulse = ocfg.pulse ? (0.72 + Math.sin(t * 3.2) * 0.28) : 1.0;

    // Zone de fond (ellipse iso)
    _ep.rewind();
    _ep.addOval(Skia.XYWHRect(osx - orW, osy - orH, orW * 2, orH * 2));
    canvas.drawPath(_ep, mkAlpha(ocfg.col, 0.30 * pulse));
    canvas.drawPath(_ep, mkStrokeA(ocfg.border, Math.max(1.2, zoom * 0.7), 0.60 * pulse));

    // Décoration spécifique au type
    if (obs.type === 'lava') {
      canvas.drawCircle(osx, osy, orW * 0.32, mkAlpha('#ff4400', 0.38 * pulse));
      canvas.drawCircle(osx, osy, orW * 0.14, mkAlpha('#ffaa00', 0.58 * pulse));
      // Fissures (rayons)
      for (let ci2 = 0; ci2 < 5; ci2++) {
        const ang = (ci2 / 5) * Math.PI * 2 + t * 0.8;
        const cr = orW * (0.18 + Math.sin(t * 2.5 + ci2) * 0.08);
        _ep.rewind();
        _ep.moveTo(osx, osy);
        _ep.lineTo(osx + Math.cos(ang) * cr, osy + Math.sin(ang) * orH / orW * cr);
        canvas.drawPath(_ep, mkStrokeA('#ff6600', Math.max(1, zoom * 0.8), 0.55 * pulse));
      }
    } else if (obs.type === 'ice') {
      // Cristaux (6 rayons)
      const iceP = Skia.Path.Make();
      for (let ii = 0; ii < 6; ii++) {
        const a = (ii / 6) * Math.PI * 2;
        iceP.moveTo(osx, osy);
        iceP.lineTo(osx + Math.cos(a) * orW * 0.65, osy + Math.sin(a) * orH * 0.65);
      }
      canvas.drawPath(iceP, mkStrokeA('#c8e8f8', Math.max(1.2, zoom * 0.8), 0.65));
      canvas.drawCircle(osx, osy, orW * 0.18, mkAlpha('#e8f8ff', 0.70));
    } else if (obs.type === 'quicksand') {
      // Spirale animée
      const spP = Skia.Path.Make();
      let first = true;
      for (let si = 0; si < 30; si++) {
        const ang = (si / 6) * Math.PI * 2 + t * 1.8;
        const sr  = orW * (0.06 + si / 30 * 0.60);
        const px  = osx + Math.cos(ang) * sr;
        const py  = osy + Math.sin(ang) * sr * (orH / orW);
        if (first) { spP.moveTo(px, py); first = false; } else spP.lineTo(px, py);
      }
      canvas.drawPath(spP, mkStrokeA('#c89840', Math.max(0.8, zoom * 0.55), 0.55));
    } else if (obs.type === 'swamp') {
      // Bulles remontantes animées
      for (let bi = 0; bi < 5; bi++) {
        const bseed = _tileRng(Math.floor(obs.x * 3), Math.floor(obs.y * 3), bi);
        const bang  = bseed * Math.PI * 2;
        const bphase = ((t * 0.55 + bseed) % 1.0);
        const br    = orW * 0.065 * (1 - bphase);
        if (br < 0.5) continue;
        canvas.drawCircle(
          osx + Math.cos(bang) * orW * 0.40,
          osy + Math.sin(bang) * orH * 0.40,
          Math.max(1, br), mkAlpha('#2a5028', (1 - bphase) * 0.72)
        );
      }
    } else if (obs.type === 'thicket') {
      // Épines (×)
      for (let ti2 = 0; ti2 < 4; ti2++) {
        const tang = (ti2 / 4) * Math.PI * 2;
        const tx2 = osx + Math.cos(tang) * orW * 0.42;
        const ty2 = osy + Math.sin(tang) * orH * 0.42;
        const ts = orW * 0.12;
        const tp = Skia.Path.Make();
        tp.moveTo(tx2 - ts, ty2 - ts); tp.lineTo(tx2 + ts, ty2 + ts);
        tp.moveTo(tx2 + ts, ty2 - ts); tp.lineTo(tx2 - ts, ty2 + ts);
        canvas.drawPath(tp, mkStrokeA('#2a4010', Math.max(1.2, zoom * 0.8), 0.65));
      }
    }
  });

  // ── Colis au sol et parachutes ────────────────────────────────────────────
  const WEAPON_COLORS = { sword:'#bdc3c7', spear:'#95a5a6', bow:'#8e44ad', shield:'#7f8c8d' };
  const allDrops = [...(v.supplies || []), ...(v.loots || [])];
  allDrops.forEach(s => {
    const sh   = hm ? getElev(s.x, s.y, hm) : 1;
    // Animation de chute étendue (35 ticks, départ haut dans le ciel — descente douce)
    const isSupply = typeof s.id === 'string' && s.id.startsWith('sup_');
    const tickDiff = (isSupply && s._dropTick != null) ? Math.max(0, (v.tick || 0) - s._dropTick) : 999;
    const falling  = tickDiff < 35;
    const fallH    = falling ? Math.max(0, sh + 28 - tickDiff * 0.8) : sh + 0.6;
    const { ix, iy } = wToIso(s.x, s.y, fallH);
    const sx2 = W / 2 + (ix - camIx) * zoom;
    const sy2 = H / 2 + (iy - camIy) * zoom;
    if (sx2 < -40 || sx2 > W+40 || sy2 < -80 || sy2 > H+40) return;
    const col = WEAPON_COLORS[s.type] || SUPPLY_COLORS[s.type] || '#ffffff';
    const r2  = Math.max(3, zoom * 1.8);

    // Ombre portée au sol (s'agrandit pendant la chute)
    if (falling && fallH > sh + 0.5) {
      const { ix:six2, iy:siy2 } = wToIso(s.x, s.y, sh + 0.3);
      const shdx = W/2 + (six2 - camIx) * zoom;
      const shdy = H/2 + (siy2 - camIy) * zoom;
      const fallProgress = tickDiff / 35;
      const shadowA = (1 - fallProgress) * 0.25;
      canvas.drawCircle(shdx, shdy, r2 * (1 + (1 - fallProgress) * 3.0), mkAlpha('#000000', shadowA));
    }

    // ── Parachute (pendant la chute) ────────────────────────────────────────
    if (falling && fallH > sh + 0.8) {
      const pdR  = r2 * 3.2 * (1 - tickDiff / 37);  // se referme à l'atterrissage
      const pdx  = sx2;
      const pdy  = sy2 - pdR * 1.6;
      // Dôme (demi-ellipse via cubic bezier)
      const chutePath = Skia.Path.Make();
      chutePath.moveTo(pdx - pdR, pdy);
      chutePath.cubicTo(pdx - pdR, pdy - pdR * 1.0, pdx + pdR, pdy - pdR * 1.0, pdx + pdR, pdy);
      chutePath.close();
      canvas.drawPath(chutePath, mkAlpha(col, 0.68));
      canvas.drawPath(chutePath, mkStrokeA('#ffffff', Math.max(0.8, zoom * 0.45), 0.55));
      // Segments alternés (bandes du parachute)
      for (let si = 0; si < 4; si++) {
        const a1 = Math.PI + (si / 4) * Math.PI;
        const a2 = Math.PI + ((si + 0.88) / 4) * Math.PI;
        const segP = Skia.Path.Make();
        segP.moveTo(pdx + Math.cos(a1) * pdR, pdy + Math.sin(a1) * pdR * 0.5);
        segP.lineTo(pdx + Math.cos(a2) * pdR, pdy + Math.sin(a2) * pdR * 0.5);
        segP.lineTo(pdx, pdy);
        segP.close();
        canvas.drawPath(segP, mkAlpha(si % 2 === 0 ? '#ffffff' : col, 0.25));
      }
      // Cordes (3 fils du dôme vers le colis)
      const ropeY = pdy + pdR * 0.05;
      [-0.55, 0, 0.55].forEach(rx => {
        const rp3 = Skia.Path.Make();
        rp3.moveTo(pdx + pdR * rx, ropeY);
        rp3.lineTo(sx2, sy2);
        canvas.drawPath(rp3, mkStrokeA('#d0c898', Math.max(0.5, zoom * 0.32), 0.62));
      });
    }

    // Halo coloré
    canvas.drawCircle(sx2, sy2, r2 * 1.4, mkAlpha(col, 0.22));

    // ── Sprite distinct par type ─────────────────────────────────────────────
    canvas.save();
    canvas.translate(sx2, sy2);

    if (s.type === 'sword') {
      // Épée : lame effilée + garde + poignée
      canvas.rotate(-35, 0, 0);
      const blade = Skia.Path.Make();
      blade.moveTo(0, -r2*3.5); blade.lineTo(r2*0.5, -r2*0.6); blade.lineTo(-r2*0.5, -r2*0.6); blade.close();
      canvas.drawPath(blade, mkAlpha('#d8d8e8', 0.92));
      canvas.drawPath(blade, mkStrokeA('#9090a0', Math.max(0.6, zoom*0.4), 0.55));
      canvas.drawRect(Skia.XYWHRect(-r2*1.3, -r2*0.9, r2*2.6, r2*0.55), mkAlpha('#a06010', 0.90)); // garde
      canvas.drawRect(Skia.XYWHRect(-r2*0.28, -r2*0.5, r2*0.56, r2*1.25), mkAlpha('#8a6020', 0.92)); // poignée
    } else if (s.type === 'spear') {
      // Lance : hampe longue + fer de lance
      canvas.rotate(-55, 0, 0);
      canvas.drawRect(Skia.XYWHRect(-r2*0.28, -r2*3.6, r2*0.56, r2*3.8), mkAlpha('#8a6030', 0.90));
      const tip = Skia.Path.Make();
      tip.moveTo(0, -r2*5.0); tip.lineTo(r2*0.65, -r2*3.6); tip.lineTo(-r2*0.65, -r2*3.6); tip.close();
      canvas.drawPath(tip, mkAlpha('#c8d0d8', 0.94));
    } else if (s.type === 'bow') {
      // Arc : courbe + corde
      canvas.rotate(25, 0, 0);
      const arc = Skia.Path.Make();
      arc.moveTo(-r2*0.9, -r2*2.4);
      arc.cubicTo(-r2*3.0, -r2*1.0, -r2*3.0, r2*1.0, -r2*0.9, r2*2.4);
      canvas.drawPath(arc, mkStrokeA('#8a6030', Math.max(1.8, zoom*1.1), 0.92));
      const str = Skia.Path.Make();
      str.moveTo(-r2*0.9, -r2*2.4); str.lineTo(r2*1.1, 0); str.lineTo(-r2*0.9, r2*2.4);
      canvas.drawPath(str, mkStrokeA('#d8c890', Math.max(0.7, zoom*0.45), 0.78));
    } else if (s.type === 'shield') {
      // Bouclier : ovale allongé
      const shP = Skia.Path.Make();
      shP.moveTo(0,  r2*2.4);
      shP.cubicTo( r2*1.9, r2*1.2,  r2*1.9, -r2*1.2, 0, -r2*2.4);
      shP.cubicTo(-r2*1.9, -r2*1.2, -r2*1.9,  r2*1.2, 0,  r2*2.4);
      shP.close();
      canvas.drawPath(shP, mkAlpha('#7a5820', 0.90));
      canvas.drawPath(shP, mkStrokeA('#c8a840', Math.max(1, zoom*0.75), 0.82));
      canvas.drawCircle(0, 0, r2*0.58, mkAlpha('#c8a840', 0.78));
    } else if (s.type === 'soin') {
      // Croix médicale verte (statique)
      canvas.drawRect(Skia.XYWHRect(-r2*2.0, -r2*0.68, r2*4.0, r2*1.36), mkAlpha('#27ae60', 0.94));
      canvas.drawRect(Skia.XYWHRect(-r2*0.68, -r2*2.0, r2*1.36, r2*4.0), mkAlpha('#27ae60', 0.94));
      canvas.drawRect(Skia.XYWHRect(-r2*1.8, -r2*0.45, r2*3.6, r2*0.90), mkAlpha('#ffffff', 0.28));
    } else if (s.type === 'force') {
      // Haltère rouge
      canvas.rotate(90, 0, 0);
      canvas.drawCircle(-r2*1.6, 0, r2*1.1, mkAlpha('#e74c3c', 0.92));
      canvas.drawCircle( r2*1.6, 0, r2*1.1, mkAlpha('#e74c3c', 0.92));
      canvas.drawRect(Skia.XYWHRect(-r2*1.6, -r2*0.42, r2*3.2, r2*0.84), mkAlpha('#c0392b', 0.90));
    } else if (s.type === 'vitesse') {
      // Éclair jaune
      canvas.rotate(-15, 0, 0);
      const bolt = Skia.Path.Make();
      bolt.moveTo( r2*0.65, -r2*2.3); bolt.lineTo(-r2*0.42, -r2*0.2); bolt.lineTo( r2*0.85, -r2*0.2);
      bolt.lineTo(-r2*0.65,  r2*2.3); bolt.lineTo( r2*0.42,  r2*0.4); bolt.lineTo(-r2*0.85,  r2*0.4);
      bolt.close();
      canvas.drawPath(bolt, mkAlpha('#f1c40f', 0.94));
      canvas.drawPath(bolt, mkStrokeA('#3498db', Math.max(0.7, zoom*0.38), 0.55));
    } else if (s.type === 'armure') {
      // Hexagone gris métallique
      const hex = Skia.Path.Make();
      for (let hi = 0; hi < 6; hi++) {
        const a = hi * Math.PI / 3 + (t * 6 * Math.PI / 180);
        if (hi === 0) hex.moveTo(Math.cos(a)*r2*2.1, Math.sin(a)*r2*2.1);
        else          hex.lineTo(Math.cos(a)*r2*2.1, Math.sin(a)*r2*2.1);
      }
      hex.close();
      canvas.drawPath(hex, mkAlpha('#95a5a6', 0.90));
      canvas.drawPath(hex, mkStrokeA('#7f8c8d', Math.max(1, zoom*0.7), 0.82));
      canvas.drawCircle(0, 0, r2*0.72, mkAlpha('#dfe6e9', 0.65));
    } else if (s.type === 'festin') {
      // Assiette avec bouchées
      canvas.drawCircle(0, 0, r2*2.1, mkAlpha('#ff9f43', 0.88));
      canvas.drawCircle(0, 0, r2*1.45, mkAlpha('#ffd39b', 0.72));
      [[-0.72,-0.40],[0.72,-0.40],[0,0.72]].forEach(([px,py]) => {
        canvas.drawCircle(r2*px, r2*py, r2*0.40, mkAlpha('#e17055', 0.88));
      });
    } else if (s.type === 'adrenaline') {
      // Cœur rouge pulsant
      const hbeat = 1.0 + Math.sin(t * 5.5) * 0.18;
      const hs = r2 * 1.65 * hbeat;
      const heart = Skia.Path.Make();
      heart.moveTo(0, hs * 0.55);
      heart.cubicTo(-hs*0.04, hs*0.12, -hs*1.05, -hs*0.48, 0, -hs*1.05);
      heart.cubicTo( hs*1.05, -hs*0.48,  hs*0.04,  hs*0.12, 0,  hs*0.55);
      canvas.drawPath(heart, mkAlpha('#e74c3c', 0.92));
    } else if (s.type === 'camouflage') {
      // Silhouette fantôme (dégradé de transparence)
      canvas.drawCircle(0, 0, r2*2.2, mkAlpha('#6ab04c', 0.22));
      canvas.drawCircle(0, 0, r2*1.3, mkAlpha('#6ab04c', 0.48));
      canvas.drawCircle(0, 0, r2*0.55, mkAlpha('#6ab04c', 0.80));
    } else if (s.type === 'carte') {
      // Carte dépliée
      canvas.rotate(-10, 0, 0);
      canvas.drawRect(Skia.XYWHRect(-r2*1.7, -r2*2.1, r2*3.4, r2*4.2), mkAlpha('#f9ca24', 0.92));
      canvas.drawRect(Skia.XYWHRect(-r2*1.7, -r2*2.1, r2*3.4, r2*4.2), mkStrokeA('#8a7010', Math.max(0.8, zoom*0.5), 0.80));
      for (let li = 0; li < 3; li++) {
        const ly = -r2*(1.5 - li * 0.9);
        canvas.drawRect(Skia.XYWHRect(-r2*1.2, ly, r2*2.4, r2*0.38), mkAlpha('#8a7010', 0.38));
      }
    } else {
      // Fallback générique : diamant incliné
      canvas.rotate(45, 0, 0);
      const dp = Skia.Path.Make();
      dp.moveTo(0, -r2); dp.lineTo(r2, 0); dp.lineTo(0, r2); dp.lineTo(-r2, 0); dp.close();
      canvas.drawPath(dp, mkFill(col));
    }

    canvas.restore();

    // Ligne de descente (loot en chute, avant atterrissage)
    if (falling && fallH > sh + 1) {
      const { ix:grix, iy:griy } = wToIso(s.x, s.y, sh + 0.6);
      const grsx = W/2 + (grix - camIx)*zoom, grsy = H/2 + (griy - camIy)*zoom;
      const lineP = Skia.Path.Make();
      lineP.moveTo(sx2, sy2); lineP.lineTo(grsx, grsy);
      canvas.drawPath(lineP, mkStrokeA(col, 1.0, 0.28));
    }
  });

  // ── Lignes d'alliance ─────────────────────────────────────────────────────
  (v.alliances || []).forEach(al => {
    const c1 = v.champions.find(c => c.id === al.ids[0]);
    const c2 = v.champions.find(c => c.id === al.ids[1]);
    if (!c1 || !c2 || c1.isDead || c2.isDead) return;
    const h1 = hm ? getElev(c1.x, c1.y, hm) : 1;
    const h2 = hm ? getElev(c2.x, c2.y, hm) : 1;
    const { ix:ix1, iy:iy1 } = wToIso(c1.x, c1.y, h1 + 0.4);
    const { ix:ix2, iy:iy2 } = wToIso(c2.x, c2.y, h2 + 0.4);
    const alPath = Skia.Path.Make();
    alPath.moveTo(W/2 + (ix1 - camIx)*zoom, H/2 + (iy1 - camIy)*zoom);
    alPath.lineTo(W/2 + (ix2 - camIx)*zoom, H/2 + (iy2 - camIy)*zoom);
    canvas.drawPath(alPath, mkStrokeA('#e2b96f', 1.5, 0.40));
  });

  // ── Lueur des feux (activeEvent fire) ────────────────────────────────────
  if (v.activeEvent?.type === 'fire') {
    const ae  = v.activeEvent;
    const fwx = ae.x || 50, fwy = ae.y || 50;
    const fh  = hm ? getElev(fwx, fwy, hm) : 1;
    const { ix:fix, iy:fiy } = wToIso(fwx, fwy, fh);
    const fsx = W/2 + (fix - camIx) * zoom;
    const fsy = H/2 + (fiy - camIy) * zoom;
    const fPulse = 0.6 + Math.sin(t * 5.5) * 0.4;
    const fGlow  = 80 * zoom * 0.8;
    canvas.drawCircle(fsx, fsy, fGlow * 2.5, mkAlpha('#ff4400', 0.04 * fPulse));
    canvas.drawCircle(fsx, fsy, fGlow * 1.5, mkAlpha('#ff6600', 0.08 * fPulse));
    canvas.drawCircle(fsx, fsy, fGlow * 0.8, mkAlpha('#ffaa00', 0.14 * fPulse));
    canvas.drawCircle(fsx, fsy, fGlow * 0.3, mkAlpha('#ffcc44', 0.30 * fPulse));
  }

  // ── Faune — sprites animés (4 directions × N frames) ────────────────────
  // deer/boar/hare : frameSize=32 | wolf : frameSize=64
  // Vitesse d'animation réaliste par espèce
  const FAUNA_ANIM = {
    deer:   { idle:'animalDeerIdle', run:'animalDeerRun', sz:32,
              idleFps:2, runFps:7, scale:2.4 },   // galop fluide ~7fps
    boar:   { idle:'animalBoarIdle', run:'animalBoarRun', sz:32,
              idleFps:2, runFps:6, attack:'animalBoarAtk', atkFps:10, scale:2.1 },
    rabbit: { idle:'animalHareIdle', run:'animalHareRun', sz:32,
              idleFps:2, runFps:11, scale:1.5 },  // lapins : plus vifs que cerf
    wolf:   { idle:'animalWolfIdle', run:'animalWolfRun', sz:64,
              idleFps:3, runFps:7, attack:'animalWolfBite', atkFps:12, scale:3.6 },
  };
  (v.fauna || []).forEach(f => {
    if (f.hp <= 0) return;
    const fh  = hm ? getElev(f.x, f.y, hm) : 1;
    // Animaux collés au sol (anti-lévitation)
    const { ix:fix, iy:fiy } = wToIso(f.x, f.y, fh);
    const fsx = W/2 + (fix - camIx) * zoom;
    const fsy = H/2 + (fiy - camIy) * zoom;
    if (fsx < -80 || fsx > W+80 || fsy < -80 || fsy > H+80) return;

    const spec    = FAUNA_ANIM[f.type];
    const dirRow  = f.dirRow ?? 0;
    const isMov   = !!(f.isMoving);
    const isAtk   = !!(f.isAttacking);

    // Taille proportionnelle au type d'animal
    const spHF = Math.max(10, zoom * (TILE_H / 2) * (spec?.scale || 2.0));
    const spWF = spHF;

    // Ombre portée sous l'animal (ellipse aplatie) + marqueur contact
    const shW = spHF * 0.65, shH = spHF * 0.18;
    _ep.rewind(); _ep.addOval(Skia.XYWHRect(fsx - shW/2, fsy - shH*0.5, shW, shH));
    canvas.drawPath(_ep, mkAlpha('#000000', 0.50));
    // Losange iso fin pour ancrage visuel au sol
    const fcg = FAUNA_COLORS[f.type] || '#aaa';
    const cgwF = spHF * 0.28, cghF = spHF * 0.14;
    _tp.rewind();
    _tp.moveTo(fsx,       fsy - cghF);
    _tp.lineTo(fsx+cgwF,  fsy);
    _tp.lineTo(fsx,       fsy + cghF);
    _tp.lineTo(fsx-cgwF,  fsy);
    _tp.close();
    canvas.drawPath(_tp, mkStrokeA(fcg, 1.0, 0.45));

    // Sélection animation selon état
    const fps = isAtk ? (spec?.atkFps || 12)
              : isMov ? (spec?.runFps  || 8)
              :         (spec?.idleFps || 3);
    const imgKey = (isAtk && spec?.attack) ? spec.attack
                 : isMov ? (spec?.run || spec?.idle)
                 : spec?.idle;
    const img = imgKey ? (spriteImgs[imgKey] || (spec && spriteImgs[spec.idle])) : null;

    // Bob vertical : galop pour cerfs, trot pour loups, sautillement pour lapins
    const frames   = img ? Math.max(1, Math.floor(img.width() / (spec?.sz || 32))) : 1;
    // Phase individuelle — hash complet de l'ID pour éviter la synchro entre fauna_0..9
    // (fauna_0 à fauna_9 ont même 1er char et même longueur → l'ancienne formule donnait le même fSeed)
    const _fid = String(f.id || '');
    let _fh = 0;
    for (let _si = 0; _si < _fid.length; _si++) _fh = ((_fh * 31) + _fid.charCodeAt(_si)) | 0;
    const fSeed    = (Math.abs(_fh) % 10000) * 0.001;  // 0–10 range, unique par ID
    const frameIdx = Math.floor((t + fSeed) * fps) % frames;
    const bobAmp   = f.type === 'rabbit' ? 0.10 : f.type === 'deer' ? 0.07 : 0.04;
    const bob = isMov
      ? Math.sin((frameIdx / frames) * Math.PI * 2) * spHF * bobAmp
      : Math.sin(t * 1.4 + (f.id?.charCodeAt(0) || 0)) * spHF * 0.015; // respiration douce idle

    if (spec && img) {
      canvas.drawImageRect(
        img,
        Skia.XYWHRect(frameIdx * spec.sz, dirRow * spec.sz, spec.sz, spec.sz),
        Skia.XYWHRect(fsx - spWF/2, fsy - spHF + bob, spWF, spHF),
        _getSpriteP(0.95)
      );
    } else {
      // Fallback coloré (sprite pas encore chargé)
      const fr = Math.max(1.5, zoom * 0.60);
      const fc = f.type==='wolf'?'#4a6060':f.type==='boar'?'#5a3018':f.type==='deer'?'#d4a84b':'#ece8c0';
      canvas.drawCircle(fsx, fsy - fr * 1.2 + bob, fr * 1.8, mkAlpha(fc, 0.90));
      canvas.drawCircle(fsx + fr * 0.9, fsy - fr * 1.6 + bob, fr * 0.55, mkAlpha(fc, 0.80));
    }

    // HP bar si blessé
    if (f.hp != null && f.maxHp != null && f.hp < f.maxHp && zoom > 1.2) {
      const barW=spHF*0.9, barH=Math.max(2,zoom*1.2), bx=fsx-barW/2, by=fsy-spHF-3+bob;
      canvas.drawRect(Skia.XYWHRect(bx-0.5,by-0.5,barW+1,barH+1), mkAlpha('#000000',0.70));
      canvas.drawRect(Skia.XYWHRect(bx,by,barW,barH), mkAlpha('#330000',0.80));
      canvas.drawRect(Skia.XYWHRect(bx,by,barW*Math.max(0,f.hp/f.maxHp),barH), mkFill('#e74c3c'));
    }
  });


  // ── Flore (ressources bien visibles sur la carte) ─────────────────────────
  const FLORA_CFG = {
    berries:     { out:'#600030', body:'#c02860', bright:'#ff60a8', shine:'#ffc0d8' },
    herbs:       { out:'#083808', body:'#228a28', bright:'#44cc44', shine:'#a0f0a0' },
    mushroom:    { out:'#3a1c00', body:'#b85c10', bright:'#e88828', shine:'#ffc870' },
    waterSource: { out:'#001858', body:'#1060c8', bright:'#40a8ff', shine:'#a0d8ff' },
    poisonPlant: { out:'#1a1800', body:'#686000', bright:'#b0a800', shine:'#e0d840' },
  };
  (v.flora || []).forEach(fl => {
    if (fl.collected) return;
    const flh  = hm ? getElev(fl.x, fl.y, hm) : 1;
    const { ix:flix, iy:fliy } = wToIso(fl.x, fl.y, flh + 0.2);
    const flsx = W/2 + (flix - camIx) * zoom;
    const flsy = H/2 + (fliy - camIy) * zoom;
    if (flsx < -18 || flsx > W+18 || flsy < -18 || flsy > H+18) return;
    const cfg  = FLORA_CFG[fl.type] || { out:'#203010', body:'#507020', bright:'#80b040', shine:'#c0e880' };
    const fr2  = Math.max(4.5, zoom * 2.2);   // bien plus grand
    const idSeed = fl.id ? (fl.id.charCodeAt(5) || fl.id.charCodeAt(0) || 0) : 0;
    // Sway désactivé : la flore est statique au sol (plus de polygones mobiles)
    const sway   = 0;
    const gpulse = 0.82 + Math.sin(t * 2.2 + idSeed * 0.1) * 0.18;

    // Halo de distance (aide à repérer la ressource)
    canvas.drawCircle(flsx + sway, flsy, fr2 * 2.0, mkAlpha(cfg.bright, 0.14 * gpulse));

    // Ombre portée
    canvas.drawCircle(flsx + sway + 1, flsy + fr2 * 0.9, fr2 * 1.4, mkAlpha('#000000', 0.28));

    if (fl.type === 'mushroom') {
      // ── Champignon : pied + chapeau arrondi ─────────────────────────────
      // Pied (contour + corps)
      canvas.drawCircle(flsx + sway, flsy + fr2*0.3, fr2 * 0.65, mkAlpha(cfg.out, 0.90));
      canvas.drawCircle(flsx + sway, flsy + fr2*0.3, fr2 * 0.45, mkAlpha('#f0e8c0', 0.92));
      // Chapeau (contour puis couleur)
      canvas.drawCircle(flsx + sway, flsy - fr2*0.4, fr2 * 1.45, mkAlpha(cfg.out, 0.95));
      canvas.drawCircle(flsx + sway, flsy - fr2*0.4, fr2 * 1.20, mkAlpha(cfg.body, 0.95));
      // Tâches blanches
      canvas.drawCircle(flsx + sway - fr2*0.38, flsy - fr2*0.6, fr2 * 0.22, mkAlpha('#ffffff', 0.80));
      canvas.drawCircle(flsx + sway + fr2*0.28, flsy - fr2*0.72, fr2 * 0.15, mkAlpha('#ffffff', 0.70));
      canvas.drawCircle(flsx + sway - fr2*0.1,  flsy - fr2*0.25, fr2 * 0.12, mkAlpha('#ffffff', 0.65));
    } else if (fl.type === 'berries') {
      // ── Baies : tige + 3 petites baies rondes ────────────────────────────
      // Tige (contour + intérieur)
      canvas.drawCircle(flsx + sway, flsy, fr2 * 1.1, mkAlpha(cfg.out, 0.95));
      canvas.drawCircle(flsx + sway, flsy, fr2 * 0.85, mkAlpha('#3a5a20', 0.90));
      // Baies (contour noir + couleur vive)
      const bpos = [[-0.65,-0.55],[0.65,-0.55],[0,-0.95]];
      bpos.forEach(([bx,by]) => {
        canvas.drawCircle(flsx+sway+fr2*bx, flsy+fr2*by, fr2*0.52, mkAlpha(cfg.out, 0.95));
        canvas.drawCircle(flsx+sway+fr2*bx, flsy+fr2*by, fr2*0.38, mkAlpha(cfg.bright, 0.95));
        canvas.drawCircle(flsx+sway+fr2*(bx-0.1), flsy+fr2*(by-0.1), fr2*0.12, mkAlpha(cfg.shine, 0.75));
      });
    } else if (fl.type === 'waterSource') {
      // ── Source d'eau : anneaux concentriques pulsés ───────────────────────
      const wavePulse = Math.abs(Math.sin(t * 1.6 + idSeed));
      canvas.drawCircle(flsx+sway, flsy, fr2*3.0, mkAlpha(cfg.bright, 0.10*wavePulse));
      canvas.drawCircle(flsx+sway, flsy, fr2*2.0, mkAlpha(cfg.bright, 0.18*(1-wavePulse)));
      // Flaque centrale (contour + corps)
      canvas.drawCircle(flsx+sway, flsy, fr2*1.3, mkAlpha(cfg.out, 0.90));
      canvas.drawCircle(flsx+sway, flsy, fr2*1.1, mkAlpha(cfg.body, 0.92));
      canvas.drawCircle(flsx+sway, flsy, fr2*0.7, mkAlpha(cfg.bright, 0.85));
      // Reflet de lumière
      canvas.drawCircle(flsx+sway-fr2*0.25, flsy-fr2*0.25, fr2*0.25, mkAlpha(cfg.shine, 0.70));
    } else if (fl.type === 'herbs' || fl.type === 'poisonPlant') {
      // ── Herbes / plante toxique : touffe de feuilles ─────────────────────
      const isPoisonous = fl.type === 'poisonPlant';
      // Feuilles latérales (contour + corps)
      const leafPos = [[-0.75,-0.5],[0.75,-0.5],[-0.45,-0.9],[0.45,-0.9],[0,-0.85]];
      leafPos.forEach(([lx,ly]) => {
        canvas.drawCircle(flsx+sway+fr2*lx, flsy+fr2*ly, fr2*0.55, mkAlpha(cfg.out, 0.90));
        canvas.drawCircle(flsx+sway+fr2*lx, flsy+fr2*ly, fr2*0.38, mkAlpha(cfg.body, 0.92));
      });
      // Centre
      canvas.drawCircle(flsx+sway, flsy-fr2*0.3, fr2*0.70, mkAlpha(cfg.out, 0.92));
      canvas.drawCircle(flsx+sway, flsy-fr2*0.3, fr2*0.50, mkAlpha(cfg.bright, 0.92));
      // Symbole toxique (point jaune-vert si poisson)
      if (isPoisonous) {
        canvas.drawCircle(flsx+sway, flsy-fr2*0.95, fr2*0.30, mkAlpha('#ffee00', 0.90));
        canvas.drawCircle(flsx+sway, flsy-fr2*0.95, fr2*0.16, mkAlpha('#000000', 0.80));
      }
    }
  });

  // ── Particules ────────────────────────────────────────────────────────────
  for (let i = 0; i < (v.particles || []).length; i++) {
    const p  = v.particles[i];
    const ph = hm ? getElev(p.wx, p.wy, hm) : 1;
    const { ix:pix, iy:piy } = wToIso(p.wx, p.wy, ph + 0.5);
    const psx = W/2 + (pix - camIx) * zoom;
    const psy = H/2 + (piy - camIy) * zoom;
    if (psx < -8 || psx > W+8 || psy < -8 || psy > H+8) continue;
    canvas.drawCircle(psx, psy, Math.max(1, p.r * Math.max(0.4, zoom*0.55)), mkAlpha(p.color, p.life*0.85));
  }

  // ── Effets météo ─────────────────────────────────────────────────────────
  const weather = v.weather || 'clear';
  if (weather === 'fog') {
    // Brouillard : couche laiteuse + patches
    canvas.drawRect(Skia.XYWHRect(0,0,W,H), mkAlpha('#b0c8d4', 0.18 + Math.sin(t*0.4)*0.04));
    for (let fp=0; fp<6; fp++) {
      const fx = ((Math.sin(t*0.12+fp*1.7)*0.5+0.5)*W*1.3-W*0.15);
      const fy = ((Math.cos(t*0.08+fp*2.1)*0.5+0.5)*H*1.3-H*0.15);
      canvas.drawCircle(fx, fy, 80+fp*22, mkAlpha('#c8dce8', 0.07+Math.sin(t*0.3+fp)*0.03));
    }
  } else if (weather === 'rain' || weather === 'storm') {
    // Teinte bleue + lignes de pluie
    const intensity = weather === 'storm' ? 0.22 : 0.10;
    canvas.drawRect(Skia.XYWHRect(0,0,W,H), mkAlpha('#1a3050', intensity));
    const dropCount = weather === 'storm' ? 60 : 30;
    for (let d=0; d<dropCount; d++) {
      const angle = -75 * Math.PI / 180;
      const speed = weather === 'storm' ? 2.0 : 1.1;
      const dx = ((d*71 + t*speed*100*Math.cos(angle+Math.PI/2))%W);
      const dy = ((d*53 + t*speed*100*Math.sin(angle+Math.PI/2))%H);
      const len = (weather==='storm'?22:14)*(0.5+Math.random()*0.5);
      const rp2 = Skia.Path.Make();
      rp2.moveTo(dx, dy);
      rp2.lineTo(dx+len*Math.cos(angle), dy+len*Math.sin(angle));
      canvas.drawPath(rp2, mkStrokeA('#aad4f0', 0.8, weather==='storm'?0.55:0.28));
    }
    if (weather === 'storm') {
      // Éclair occasionnel
      const flashT = (t * 0.7) % 4;
      if (flashT < 0.08) {
        canvas.drawRect(Skia.XYWHRect(0,0,W,H), mkAlpha('#e8eeff', 0.35));
      }
    }
  } else if (weather === 'snowfall') {
    // Flocons tombants
    canvas.drawRect(Skia.XYWHRect(0,0,W,H), mkAlpha('#dce8f8', 0.07));
    for (let fl=0; fl<45; fl++) {
      const fx = ((fl*127 + Math.sin(t*0.3+fl)*18)%W);
      const fy = ((fl*73 + t*22*(0.5+fl*0.01))%H);
      const fr2 = 1.2 + (fl%3)*0.8;
      canvas.drawCircle(fx, fy, fr2, mkAlpha('#f0f8ff', 0.72));
    }
  } else if (weather === 'heatwave') {
    // Légère teinte orange + distorsion shimmer (simulé avec bandes semi-transparentes)
    canvas.drawRect(Skia.XYWHRect(0,0,W,H), mkAlpha('#ff8822', 0.06));
    for (let sh=0; sh<4; sh++) {
      const sy2 = (sh*H/4 + t*8)%H;
      canvas.drawRect(Skia.XYWHRect(0, sy2, W, 3), mkAlpha('#ffaa44', 0.04+Math.sin(t*2+sh)*0.02));
    }
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  if (fm) {
    const weatherIco = v.weather && v.weather!=='clear' ? ` ${v.weather==='rain'?'🌧':v.weather==='storm'?'⛈':v.weather==='snowfall'?'❄':v.weather==='heatwave'?'🔥':v.weather==='fog'?'🌫':''}` : '';
    canvas.drawText(`${biome.toUpperCase()}${weatherIco}  T${v.tick || 0}`, 8, 16, mkAlpha('#ffffff', 0.36), fm);
    if (followed) {
      const vLabel = `👁 ${followed.name}  ↑${followed.elevation||1}`;
      canvas.drawText(vLabel, 8, 32, mkAlpha('#e2b96f', 0.55), fm);
    }
  }

  // ── Minimap 2D (vue haut, en bas à gauche) ────────────────────────────────
  const MM = 72, MMP = 10;
  const mmx = MMP, mmy = H - MM - MMP - 2;
  const sc  = MM / 100;   // 100 = espace monde normalisé

  canvas.drawRect(Skia.XYWHRect(mmx-1, mmy-1, MM+2, MM+2), mkAlpha('#000000', 0.80));
  if (hm) {
    const cs = MM / HM_CELLS;
    for (let gy = 0; gy < HM_CELLS; gy++) {
      for (let gx = 0; gx < HM_CELLS; gx++) {
        const h = (hm[gy] || [])[gx] ?? 1;
        canvas.drawRect(Skia.XYWHRect(mmx + gx*cs, mmy + gy*cs, cs+0.5, cs+0.5),
          mkAlpha(tileColors(biome, h)[0], 0.80));
      }
    }
  }
  // Flore sur minimap
  const FLORA_MM_C = { berries:'#e04080', herbs:'#30a040', mushroom:'#c06818', waterSource:'#1870d8', poisonPlant:'#909000' };
  (v.flora || []).forEach(fl => {
    if (fl.collected) return;
    const fc2 = FLORA_MM_C[fl.type] || '#668844';
    canvas.drawCircle(mmx + fl.x*sc, mmy + fl.y*sc, 1.0, mkAlpha(fc2, 0.70));
  });
  // Faune sur minimap
  (v.fauna || []).forEach(f => {
    if (f.hp <= 0) return;
    const fc = FAUNA_COLORS[f.type] || '#888';
    canvas.drawCircle(mmx + f.x*sc, mmy + f.y*sc, 1.4, mkAlpha(fc, 0.70));
  });
  // Cercle vision sur minimap
  if (followed) {
    canvas.drawCircle(mmx + followed.x*sc, mmy + followed.y*sc,
      (followed.visionRadius || 12)*sc, mkStrokeA('#e2b96f', 0.7, 0.35));
  }
  v.champions.forEach(cv => {
    const mmr = cv.isDead ? 1.0 : 2.5;
    canvas.drawCircle(mmx + cv.x*sc, mmy + cv.y*sc, mmr, mkFill(cv.isDead ? '#333' : cv.color));
    if (v.followId === cv.id && !cv.isDead)
      canvas.drawCircle(mmx + cv.x*sc, mmy + cv.y*sc, mmr+1.8, mkStrokeA('#ffffff', 1, 0.9));
  });
  canvas.drawRect(Skia.XYWHRect(mmx-1, mmy-1, MM+2, MM+2), mkStrokeA('#ffffff', 1, 0.22));

  // ── Vignette (6 couches, falloff quadratique) ─────────────────────────────
  for (let i = 0; i < 6; i++) {
    const t2 = i / 6;
    const mg = t2 * Math.min(W, H) * 0.40;
    const a  = 0.20 * (1 - t2) * (1 - t2);
    canvas.drawRect(Skia.XYWHRect(0,         0,         W,    mg+1), mkAlpha('#000000', a));
    canvas.drawRect(Skia.XYWHRect(0,         H-mg-1,    W,    mg+1), mkAlpha('#000000', a));
    canvas.drawRect(Skia.XYWHRect(0,         0,         mg+1, H),    mkAlpha('#000000', a*0.8));
    canvas.drawRect(Skia.XYWHRect(W-mg-1,    0,         mg+1, H),    mkAlpha('#000000', a*0.8));
  }
}


// ═════════════════════════════════════════════════════════════════════════
export default function BattleMap({ battleState, onChampionTap, dropMode, onDropRelease }) {
  const { width: W, height: SH } = useWindowDimensions();
  // Hauteur réelle du canvas (≠ SH qui est la hauteur écran)
  const canvasHRef = useRef(SH);

  // ── Drop targeting (mode sponsor) ────────────────────────────────────────
  const [dropFingerPos, setDropFingerPos] = useState(null); // {x,y} screen coords
  const dropModeRef = useRef(dropMode);
  useEffect(() => { dropModeRef.current = dropMode; }, [dropMode]);
  const onDropReleaseRef = useRef(onDropRelease);
  useEffect(() => { onDropReleaseRef.current = onDropRelease; }, [onDropRelease]);

  // ── Tileset isométrique universel (352×352, grille 11×11 de tiles 32×32) ───
  const imgIsoTiles  = useImage(require('../../assets/sprites/tiles/iso_tiles.png'));
  // ── Animaux (faune) ────────────────────────────────────────────────────────
  const imgDeerIdle  = useImage(require('../../assets/sprites/animals/deer_idle.png'));
  const imgDeerRun   = useImage(require('../../assets/sprites/animals/deer_run.png'));
  const imgBoarIdle  = useImage(require('../../assets/sprites/animals/boar_idle.png'));
  const imgBoarRun   = useImage(require('../../assets/sprites/animals/boar_run.png'));
  const imgBoarAtk   = useImage(require('../../assets/sprites/animals/boar_attack.png'));
  const imgHareIdle  = useImage(require('../../assets/sprites/animals/hare_idle.png'));
  const imgHareRun   = useImage(require('../../assets/sprites/animals/hare_run.png'));
  const imgWolfIdle  = useImage(require('../../assets/sprites/animals/wolf_idle.png'));
  const imgWolfRun   = useImage(require('../../assets/sprites/animals/wolf_run.png'));
  const imgWolfBite  = useImage(require('../../assets/sprites/animals/wolf_bite.png'));
  // ── Sprites LPC — body (male + female) × 4 animations ────────────────────
  const lpcBodyMaleWalk     = useImage(require('../../assets/sprites/lpc/body/male_walk.png'));
  const lpcBodyMaleIdle     = useImage(require('../../assets/sprites/lpc/body/male_idle.png'));
  const lpcBodyMaleSlash    = useImage(require('../../assets/sprites/lpc/body/male_slash.png'));
  const lpcBodyMaleHurt     = useImage(require('../../assets/sprites/lpc/body/male_hurt.png'));
  const lpcBodyFemaleWalk   = useImage(require('../../assets/sprites/lpc/body/female_walk.png'));
  const lpcBodyFemaleIdle   = useImage(require('../../assets/sprites/lpc/body/female_idle.png'));
  const lpcBodyFemaleSlash  = useImage(require('../../assets/sprites/lpc/body/female_slash.png'));
  const lpcBodyFemaleHurt   = useImage(require('../../assets/sprites/lpc/body/female_hurt.png'));
  // ── LPC hair — 8 coiffures × 4 animations ────────────────────────────────
  const lpcHairBobWalk       = useImage(require('../../assets/sprites/lpc/hair/bob_walk.png'));
  const lpcHairBobIdle       = useImage(require('../../assets/sprites/lpc/hair/bob_idle.png'));
  const lpcHairBobSlash      = useImage(require('../../assets/sprites/lpc/hair/bob_slash.png'));
  const lpcHairBobHurt       = useImage(require('../../assets/sprites/lpc/hair/bob_hurt.png'));
  const lpcHairBraidWalk     = useImage(require('../../assets/sprites/lpc/hair/braid_walk.png'));
  const lpcHairBraidIdle     = useImage(require('../../assets/sprites/lpc/hair/braid_idle.png'));
  const lpcHairBraidSlash    = useImage(require('../../assets/sprites/lpc/hair/braid_slash.png'));
  const lpcHairBraidHurt     = useImage(require('../../assets/sprites/lpc/hair/braid_hurt.png'));
  const lpcHairBangsWalk     = useImage(require('../../assets/sprites/lpc/hair/bangs_walk.png'));
  const lpcHairBangsIdle     = useImage(require('../../assets/sprites/lpc/hair/bangs_idle.png'));
  const lpcHairBangsSlash    = useImage(require('../../assets/sprites/lpc/hair/bangs_slash.png'));
  const lpcHairBangsHurt     = useImage(require('../../assets/sprites/lpc/hair/bangs_hurt.png'));
  const lpcHairAfroWalk      = useImage(require('../../assets/sprites/lpc/hair/afro_walk.png'));
  const lpcHairAfroIdle      = useImage(require('../../assets/sprites/lpc/hair/afro_idle.png'));
  const lpcHairAfroSlash     = useImage(require('../../assets/sprites/lpc/hair/afro_slash.png'));
  const lpcHairAfroHurt      = useImage(require('../../assets/sprites/lpc/hair/afro_hurt.png'));
  const lpcHairBuzzcutWalk   = useImage(require('../../assets/sprites/lpc/hair/buzzcut_walk.png'));
  const lpcHairBuzzcutIdle   = useImage(require('../../assets/sprites/lpc/hair/buzzcut_idle.png'));
  const lpcHairBuzzcutSlash  = useImage(require('../../assets/sprites/lpc/hair/buzzcut_slash.png'));
  const lpcHairBuzzcutHurt   = useImage(require('../../assets/sprites/lpc/hair/buzzcut_hurt.png'));
  const lpcHairCornrowsWalk  = useImage(require('../../assets/sprites/lpc/hair/cornrows_walk.png'));
  const lpcHairCornrowsIdle  = useImage(require('../../assets/sprites/lpc/hair/cornrows_idle.png'));
  const lpcHairCornrowsSlash = useImage(require('../../assets/sprites/lpc/hair/cornrows_slash.png'));
  const lpcHairCornrowsHurt  = useImage(require('../../assets/sprites/lpc/hair/cornrows_hurt.png'));
  const lpcHairCurlyWalk     = useImage(require('../../assets/sprites/lpc/hair/curly_walk.png'));
  const lpcHairCurlyIdle     = useImage(require('../../assets/sprites/lpc/hair/curly_idle.png'));
  const lpcHairCurlySlash    = useImage(require('../../assets/sprites/lpc/hair/curly_slash.png'));
  const lpcHairCurlyHurt     = useImage(require('../../assets/sprites/lpc/hair/curly_hurt.png'));
  const lpcHairLongWalk      = useImage(require('../../assets/sprites/lpc/hair/long_walk.png'));
  const lpcHairLongIdle      = useImage(require('../../assets/sprites/lpc/hair/long_idle.png'));
  const lpcHairLongSlash     = useImage(require('../../assets/sprites/lpc/hair/long_slash.png'));
  const lpcHairLongHurt      = useImage(require('../../assets/sprites/lpc/hair/long_hurt.png'));
  // ── LPC torso — 4 types × 4 animations ───────────────────────────────────
  const lpcTorsoShirtWalk    = useImage(require('../../assets/sprites/lpc/torso/shirt_walk.png'));
  const lpcTorsoShirtIdle    = useImage(require('../../assets/sprites/lpc/torso/shirt_idle.png'));
  const lpcTorsoShirtSlash   = useImage(require('../../assets/sprites/lpc/torso/shirt_slash.png'));
  const lpcTorsoShirtHurt    = useImage(require('../../assets/sprites/lpc/torso/shirt_hurt.png'));
  const lpcTorsoTshirtWalk   = useImage(require('../../assets/sprites/lpc/torso/tshirt_walk.png'));
  const lpcTorsoTshirtIdle   = useImage(require('../../assets/sprites/lpc/torso/tshirt_idle.png'));
  const lpcTorsoTshirtSlash  = useImage(require('../../assets/sprites/lpc/torso/tshirt_slash.png'));
  const lpcTorsoTshirtHurt   = useImage(require('../../assets/sprites/lpc/torso/tshirt_hurt.png'));
  const lpcTorsoLeatherWalk  = useImage(require('../../assets/sprites/lpc/torso/leather_walk.png'));
  const lpcTorsoLeatherIdle  = useImage(require('../../assets/sprites/lpc/torso/leather_idle.png'));
  const lpcTorsoLeatherSlash = useImage(require('../../assets/sprites/lpc/torso/leather_slash.png'));
  const lpcTorsoLeatherHurt  = useImage(require('../../assets/sprites/lpc/torso/leather_hurt.png'));
  const lpcTorsoPlateWalk    = useImage(require('../../assets/sprites/lpc/torso/plate_walk.png'));
  const lpcTorsoPlateIdle    = useImage(require('../../assets/sprites/lpc/torso/plate_idle.png'));
  const lpcTorsoPlateSlash   = useImage(require('../../assets/sprites/lpc/torso/plate_slash.png'));
  const lpcTorsoPlateHurt    = useImage(require('../../assets/sprites/lpc/torso/plate_hurt.png'));
  // ── LPC legs — 2 types × 4 animations ────────────────────────────────────
  const lpcLegsPantsWalk    = useImage(require('../../assets/sprites/lpc/legs/pants_walk.png'));
  const lpcLegsPantsIdle    = useImage(require('../../assets/sprites/lpc/legs/pants_idle.png'));
  const lpcLegsPantsSlash   = useImage(require('../../assets/sprites/lpc/legs/pants_slash.png'));
  const lpcLegsPantsHurt    = useImage(require('../../assets/sprites/lpc/legs/pants_hurt.png'));
  const lpcLegsShortsWalk   = useImage(require('../../assets/sprites/lpc/legs/shorts_walk.png'));
  const lpcLegsShortsIdle   = useImage(require('../../assets/sprites/lpc/legs/shorts_idle.png'));
  const lpcLegsShortsSlash  = useImage(require('../../assets/sprites/lpc/legs/shorts_slash.png'));
  const lpcLegsShortsHurt   = useImage(require('../../assets/sprites/lpc/legs/shorts_hurt.png'));
  // ── LPC feet — boots × 4 animations ─────────────────────────────────────
  const lpcFeetBootsWalk    = useImage(require('../../assets/sprites/lpc/feet/boots_walk.png'));
  const lpcFeetBootsIdle    = useImage(require('../../assets/sprites/lpc/feet/boots_idle.png'));
  const lpcFeetBootsSlash   = useImage(require('../../assets/sprites/lpc/feet/boots_slash.png'));
  const lpcFeetBootsHurt    = useImage(require('../../assets/sprites/lpc/feet/boots_hurt.png'));

  const spriteImgsRef = useRef({});

  // Init spriteImgsRef (peuplé par les useImage ci-dessous)
  useEffect(() => {
    spriteImgsRef.current = {};
  }, []);

  // Mise à jour si useImage charge
  useEffect(() => {
    const cur = spriteImgsRef.current;
    // Animaux
    if (imgDeerIdle)  cur.animalDeerIdle = imgDeerIdle;
    if (imgDeerRun)   cur.animalDeerRun  = imgDeerRun;
    if (imgBoarIdle)  cur.animalBoarIdle = imgBoarIdle;
    if (imgBoarRun)   cur.animalBoarRun  = imgBoarRun;
    if (imgBoarAtk)   cur.animalBoarAtk  = imgBoarAtk;
    if (imgHareIdle)  cur.animalHareIdle = imgHareIdle;
    if (imgHareRun)   cur.animalHareRun  = imgHareRun;
    if (imgWolfIdle)  cur.animalWolfIdle = imgWolfIdle;
    if (imgWolfRun)   cur.animalWolfRun  = imgWolfRun;
    if (imgWolfBite)  cur.animalWolfBite = imgWolfBite;
    // Tileset
    if (imgIsoTiles)  cur.isoTiles       = imgIsoTiles;
  }, [imgDeerIdle, imgDeerRun, imgBoarIdle, imgBoarRun, imgBoarAtk,
      imgHareIdle, imgHareRun, imgWolfIdle, imgWolfRun, imgWolfBite,
      imgIsoTiles]);

  // Mise à jour sprites LPC (68 fichiers)
  useEffect(() => {
    const c = spriteImgsRef.current;
    // body
    if (lpcBodyMaleWalk)     c['lpc_body_male_walk']      = lpcBodyMaleWalk;
    if (lpcBodyMaleIdle)     c['lpc_body_male_idle']      = lpcBodyMaleIdle;
    if (lpcBodyMaleSlash)    c['lpc_body_male_slash']     = lpcBodyMaleSlash;
    if (lpcBodyMaleHurt)     c['lpc_body_male_hurt']      = lpcBodyMaleHurt;
    if (lpcBodyFemaleWalk)   c['lpc_body_female_walk']    = lpcBodyFemaleWalk;
    if (lpcBodyFemaleIdle)   c['lpc_body_female_idle']    = lpcBodyFemaleIdle;
    if (lpcBodyFemaleSlash)  c['lpc_body_female_slash']   = lpcBodyFemaleSlash;
    if (lpcBodyFemaleHurt)   c['lpc_body_female_hurt']    = lpcBodyFemaleHurt;
    // hair
    if (lpcHairBobWalk)      c['lpc_hair_bob_walk']       = lpcHairBobWalk;
    if (lpcHairBobIdle)      c['lpc_hair_bob_idle']       = lpcHairBobIdle;
    if (lpcHairBobSlash)     c['lpc_hair_bob_slash']      = lpcHairBobSlash;
    if (lpcHairBobHurt)      c['lpc_hair_bob_hurt']       = lpcHairBobHurt;
    if (lpcHairBraidWalk)    c['lpc_hair_braid_walk']     = lpcHairBraidWalk;
    if (lpcHairBraidIdle)    c['lpc_hair_braid_idle']     = lpcHairBraidIdle;
    if (lpcHairBraidSlash)   c['lpc_hair_braid_slash']    = lpcHairBraidSlash;
    if (lpcHairBraidHurt)    c['lpc_hair_braid_hurt']     = lpcHairBraidHurt;
    if (lpcHairBangsWalk)    c['lpc_hair_bangs_walk']     = lpcHairBangsWalk;
    if (lpcHairBangsIdle)    c['lpc_hair_bangs_idle']     = lpcHairBangsIdle;
    if (lpcHairBangsSlash)   c['lpc_hair_bangs_slash']    = lpcHairBangsSlash;
    if (lpcHairBangsHurt)    c['lpc_hair_bangs_hurt']     = lpcHairBangsHurt;
    if (lpcHairAfroWalk)     c['lpc_hair_afro_walk']      = lpcHairAfroWalk;
    if (lpcHairAfroIdle)     c['lpc_hair_afro_idle']      = lpcHairAfroIdle;
    if (lpcHairAfroSlash)    c['lpc_hair_afro_slash']     = lpcHairAfroSlash;
    if (lpcHairAfroHurt)     c['lpc_hair_afro_hurt']      = lpcHairAfroHurt;
    if (lpcHairBuzzcutWalk)  c['lpc_hair_buzzcut_walk']   = lpcHairBuzzcutWalk;
    if (lpcHairBuzzcutIdle)  c['lpc_hair_buzzcut_idle']   = lpcHairBuzzcutIdle;
    if (lpcHairBuzzcutSlash) c['lpc_hair_buzzcut_slash']  = lpcHairBuzzcutSlash;
    if (lpcHairBuzzcutHurt)  c['lpc_hair_buzzcut_hurt']   = lpcHairBuzzcutHurt;
    if (lpcHairCornrowsWalk)  c['lpc_hair_cornrows_walk']  = lpcHairCornrowsWalk;
    if (lpcHairCornrowsIdle)  c['lpc_hair_cornrows_idle']  = lpcHairCornrowsIdle;
    if (lpcHairCornrowsSlash) c['lpc_hair_cornrows_slash'] = lpcHairCornrowsSlash;
    if (lpcHairCornrowsHurt)  c['lpc_hair_cornrows_hurt']  = lpcHairCornrowsHurt;
    if (lpcHairCurlyWalk)    c['lpc_hair_curly_walk']     = lpcHairCurlyWalk;
    if (lpcHairCurlyIdle)    c['lpc_hair_curly_idle']     = lpcHairCurlyIdle;
    if (lpcHairCurlySlash)   c['lpc_hair_curly_slash']    = lpcHairCurlySlash;
    if (lpcHairCurlyHurt)    c['lpc_hair_curly_hurt']     = lpcHairCurlyHurt;
    if (lpcHairLongWalk)     c['lpc_hair_long_walk']      = lpcHairLongWalk;
    if (lpcHairLongIdle)     c['lpc_hair_long_idle']      = lpcHairLongIdle;
    if (lpcHairLongSlash)    c['lpc_hair_long_slash']     = lpcHairLongSlash;
    if (lpcHairLongHurt)     c['lpc_hair_long_hurt']      = lpcHairLongHurt;
    // torso
    if (lpcTorsoShirtWalk)    c['lpc_torso_shirt_walk']    = lpcTorsoShirtWalk;
    if (lpcTorsoShirtIdle)    c['lpc_torso_shirt_idle']    = lpcTorsoShirtIdle;
    if (lpcTorsoShirtSlash)   c['lpc_torso_shirt_slash']   = lpcTorsoShirtSlash;
    if (lpcTorsoShirtHurt)    c['lpc_torso_shirt_hurt']    = lpcTorsoShirtHurt;
    if (lpcTorsoTshirtWalk)   c['lpc_torso_tshirt_walk']   = lpcTorsoTshirtWalk;
    if (lpcTorsoTshirtIdle)   c['lpc_torso_tshirt_idle']   = lpcTorsoTshirtIdle;
    if (lpcTorsoTshirtSlash)  c['lpc_torso_tshirt_slash']  = lpcTorsoTshirtSlash;
    if (lpcTorsoTshirtHurt)   c['lpc_torso_tshirt_hurt']   = lpcTorsoTshirtHurt;
    if (lpcTorsoLeatherWalk)  c['lpc_torso_leather_walk']  = lpcTorsoLeatherWalk;
    if (lpcTorsoLeatherIdle)  c['lpc_torso_leather_idle']  = lpcTorsoLeatherIdle;
    if (lpcTorsoLeatherSlash) c['lpc_torso_leather_slash'] = lpcTorsoLeatherSlash;
    if (lpcTorsoLeatherHurt)  c['lpc_torso_leather_hurt']  = lpcTorsoLeatherHurt;
    if (lpcTorsoPlateWalk)    c['lpc_torso_plate_walk']    = lpcTorsoPlateWalk;
    if (lpcTorsoPlateIdle)    c['lpc_torso_plate_idle']    = lpcTorsoPlateIdle;
    if (lpcTorsoPlateSlash)   c['lpc_torso_plate_slash']   = lpcTorsoPlateSlash;
    if (lpcTorsoPlateHurt)    c['lpc_torso_plate_hurt']    = lpcTorsoPlateHurt;
    // legs
    if (lpcLegsPantsWalk)    c['lpc_legs_pants_walk']     = lpcLegsPantsWalk;
    if (lpcLegsPantsIdle)    c['lpc_legs_pants_idle']     = lpcLegsPantsIdle;
    if (lpcLegsPantsSlash)   c['lpc_legs_pants_slash']    = lpcLegsPantsSlash;
    if (lpcLegsPantsHurt)    c['lpc_legs_pants_hurt']     = lpcLegsPantsHurt;
    if (lpcLegsShortsWalk)   c['lpc_legs_shorts_walk']    = lpcLegsShortsWalk;
    if (lpcLegsShortsIdle)   c['lpc_legs_shorts_idle']    = lpcLegsShortsIdle;
    if (lpcLegsShortsSlash)  c['lpc_legs_shorts_slash']   = lpcLegsShortsSlash;
    if (lpcLegsShortsHurt)   c['lpc_legs_shorts_hurt']    = lpcLegsShortsHurt;
    // feet
    if (lpcFeetBootsWalk)    c['lpc_feet_boots_walk']     = lpcFeetBootsWalk;
    if (lpcFeetBootsIdle)    c['lpc_feet_boots_idle']     = lpcFeetBootsIdle;
    if (lpcFeetBootsSlash)   c['lpc_feet_boots_slash']    = lpcFeetBootsSlash;
    if (lpcFeetBootsHurt)    c['lpc_feet_boots_hurt']     = lpcFeetBootsHurt;
  }, [
    lpcBodyMaleWalk, lpcBodyMaleIdle, lpcBodyMaleSlash, lpcBodyMaleHurt,
    lpcBodyFemaleWalk, lpcBodyFemaleIdle, lpcBodyFemaleSlash, lpcBodyFemaleHurt,
    lpcHairBobWalk, lpcHairBobIdle, lpcHairBobSlash, lpcHairBobHurt,
    lpcHairBraidWalk, lpcHairBraidIdle, lpcHairBraidSlash, lpcHairBraidHurt,
    lpcHairBangsWalk, lpcHairBangsIdle, lpcHairBangsSlash, lpcHairBangsHurt,
    lpcHairAfroWalk, lpcHairAfroIdle, lpcHairAfroSlash, lpcHairAfroHurt,
    lpcHairBuzzcutWalk, lpcHairBuzzcutIdle, lpcHairBuzzcutSlash, lpcHairBuzzcutHurt,
    lpcHairCornrowsWalk, lpcHairCornrowsIdle, lpcHairCornrowsSlash, lpcHairCornrowsHurt,
    lpcHairCurlyWalk, lpcHairCurlyIdle, lpcHairCurlySlash, lpcHairCurlyHurt,
    lpcHairLongWalk, lpcHairLongIdle, lpcHairLongSlash, lpcHairLongHurt,
    lpcTorsoShirtWalk, lpcTorsoShirtIdle, lpcTorsoShirtSlash, lpcTorsoShirtHurt,
    lpcTorsoTshirtWalk, lpcTorsoTshirtIdle, lpcTorsoTshirtSlash, lpcTorsoTshirtHurt,
    lpcTorsoLeatherWalk, lpcTorsoLeatherIdle, lpcTorsoLeatherSlash, lpcTorsoLeatherHurt,
    lpcTorsoPlateWalk, lpcTorsoPlateIdle, lpcTorsoPlateSlash, lpcTorsoPlateHurt,
    lpcLegsPantsWalk, lpcLegsPantsIdle, lpcLegsPantsSlash, lpcLegsPantsHurt,
    lpcLegsShortsWalk, lpcLegsShortsIdle, lpcLegsShortsSlash, lpcLegsShortsHurt,
    lpcFeetBootsWalk, lpcFeetBootsIdle, lpcFeetBootsSlash, lpcFeetBootsHurt,
  ]);

  // ── Caméra en espace iso ───────────────────────────────────────────────
  const { ix: defIx, iy: defIy } = mapCenterIso();
  const camIx       = useRef(defIx);
  const camIy       = useRef(defIy);
  const zoom        = useRef(6.0);
  const targetZoom  = useRef(6.0);  // zoom cible (interpolé en douceur)
  const prevFollowId= useRef(null);  // détection changement follow → zoom auto
  const timeRef     = useRef(0);
  const lastTs      = useRef(null);
  const savedCam    = useRef({ ix: defIx, iy: defIy });
  const savedZoom   = useRef(6.0);

  // ── Interpolation tick ────────────────────────────────────────────────
  const lastTickRef = useRef(Date.now());
  const tickDurRef  = useRef(3000);

  // ── Tiles pré-triés (recalculé quand heightmap change) ────────────────
  const sortedTilesRef = useRef([]);

  // ── État visuel ───────────────────────────────────────────────────────
  const gvisRef = useRef({
    champions: [],
    alliances: [], dayPhase: 0, tick: 0,
    supplies: [], loots: [], biome: 'forêt', followId: null,
    particles: [], pendingSpawns: [],
    heightMap: null, fauna: [], flora: [], activeEvent: null,
    weather: 'clear', simPhase: 'main', obstacles: [],
  });

  // ── Suivi champion ────────────────────────────────────────────────────
  const [followInfo, setFollowInfo] = useState(null);

  const cycleFollow = useCallback((dir) => {
    const alive = (gvisRef.current.champions || []).filter(cv => !cv.isDead);
    if (alive.length === 0) return;
    const curId = gvisRef.current.followId;
    let idx = alive.findIndex(cv => cv.id === curId);
    idx = (idx + dir + alive.length) % alive.length;
    const target = alive[idx];
    gvisRef.current.followId = target.id;
    setFollowInfo({ id: target.id, name: target.name, color: target.color });
  }, []);

  const clearFollow = useCallback(() => {
    gvisRef.current.followId = null;
    setFollowInfo(null);
  }, []);

  // ── Polices Skia ─────────────────────────────────────────────────────
  const fontSmRef  = useRef(null);
  const fontMidRef = useRef(null);
  useEffect(() => {
    try { fontSmRef.current  = Skia.Font(undefined, 9);  } catch(e){}
    try { fontMidRef.current = Skia.Font(undefined, 11); } catch(e){}
  }, []);

  // ── RAF Loop ──────────────────────────────────────────────────────────
  const [picture, setPicture] = useState(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const animate = (ts) => {
      const delta = lastTs.current !== null ? ts - lastTs.current : 16;
      lastTs.current = ts;
      timeRef.current = ts / 1000;

      // Follow mode : caméra suit le champion + zoom auto doux
      const fId = gvisRef.current.followId;
      // Détection changement de follow → ajuster zoom cible
      if (fId !== prevFollowId.current) {
        if (fId) {
          // Zoom légèrement réduit (POV plus ouvert) — était 8.0
          targetZoom.current = 6.8;
          // Snap immédiat sur le champion (pas de lerp au 1er frame)
          const fcSnap = gvisRef.current.champions.find(cv => cv.id === fId && !cv.isDead);
          if (fcSnap) {
            const { ix: six, iy: siy } = wToIso(fcSnap.x, fcSnap.y, 0);
            camIx.current = six;
            camIy.current = siy - 25;  // décalage Y pour caméra plus haute (perso plus bas dans le frame)
          }
        } else {
          // Retour vue globale → recentrer la caméra sur la map
          targetZoom.current = 6.0;
          const { ix: cx, iy: cy } = mapCenterIso();
          // Snap rapide vers le centre (65% en 1 frame)
          camIx.current += (cx - camIx.current) * 0.65;
          camIy.current += (cy - camIy.current) * 0.65;
        }
        prevFollowId.current = fId;
      }
      // Interpolation douce du zoom (lerp 8% par frame)
      zoom.current += (targetZoom.current - zoom.current) * 0.08;

      if (fId) {
        const fc = gvisRef.current.champions.find(cv => cv.id === fId && !cv.isDead);
        if (fc) {
          const hm = gvisRef.current.heightMap;
          // Camera target : position au sol + offset Y pour caméra plus haute
          const { ix: tix, iy: tiy } = wToIso(fc.x, fc.y, 0);
          const camYOffset = -25;  // décalage caméra vers le haut
          camIx.current += (tix - camIx.current) * 0.18;
          camIy.current += ((tiy + camYOffset) - camIy.current) * 0.18;
        } else {
          // Champion mort → libérer caméra
          gvisRef.current.followId = null;
          setFollowInfo(null);
        }
      }

      // Spawn particules en attente
      if (gvisRef.current.pendingSpawns.length > 0) {
        gvisRef.current.pendingSpawns.forEach(s => {
          spawnParticles(gvisRef.current.particles, s.wx, s.wy, s.type, s.color);
        });
        gvisRef.current.pendingSpawns = [];
      }

      // Mise à jour particules
      const dtSec = delta / 1000;
      gvisRef.current.particles = gvisRef.current.particles.filter(p => {
        p.wx += p.vx * dtSec;
        p.wy += p.vy * dtSec;
        p.vy += (p.gravity || 0) * dtSec;
        p.life -= p.decay * dtSec;
        return p.life > 0;
      });

      // Interpolation linéaire des champions (timestamp-based)
      const now     = Date.now();
      const elapsed = now - lastTickRef.current;
      const alpha   = Math.min(1, elapsed / Math.max(500, tickDurRef.current));
      gvisRef.current.champions.forEach(cv => {
        cv.x = cv.prevX + (cv.tx - cv.prevX) * alpha;
        cv.y = cv.prevY + (cv.ty - cv.prevY) * alpha;
        if (cv.combatFlash > 0) cv.combatFlash = Math.max(0, cv.combatFlash - dtSec);
      });
      // Interpolation linéaire de la faune (même principe que les champions)
      gvisRef.current.fauna?.forEach(fv => {
        fv.x = fv.prevX + ((fv.tx ?? fv.x) - fv.prevX) * alpha;
        fv.y = fv.prevY + ((fv.ty ?? fv.y) - fv.prevY) * alpha;
      });

      // Rendu Skia — utilise la vraie hauteur canvas (pas la hauteur écran)
      const H = canvasHRef.current > 80 ? canvasHRef.current : SH;
      const rec = Skia.PictureRecorder();
      const cvs = rec.beginRecording(Skia.XYWHRect(0, 0, W, H));
      drawIsoScene(
        cvs, timeRef.current, gvisRef.current,
        sortedTilesRef.current,
        camIx.current, camIy.current, zoom.current,
        fontMidRef.current, fontSmRef.current, W, H,
        spriteImgsRef.current
      );
      setPicture(rec.finishRecordingAsPicture());
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [W, SH]);

  // ── Sync depuis battleState ───────────────────────────────────────────
  useEffect(() => {
    if (!battleState) return;

    // Auto-calibration tick
    const now = Date.now();
    const gap = now - lastTickRef.current;
    if (gap > 300 && gap < 60000) {
      tickDurRef.current = tickDurRef.current * 0.3 + gap * 0.7;
    }
    lastTickRef.current = now;

    const biome = battleState.map?.biome || 'forêt';
    const hm    = battleState.map?.heightMap
      || clientHeightMap(biome, battleState.id?.slice(0, 8) || 'default');

    // Normalisation → espace monde interne 0-100 (HM_CELLS=20 × HM_CELL=5)
    // backend = 100×100, simulateur = mapW×mapH → tout vient à 0-100 internes
    const mapW = battleState.map?.width  || 100;
    const mapH = battleState.map?.height || 100;
    const sX   = 100 / mapW;
    const sY   = 100 / mapH;

    // Pre-compute sorted tiles (une seule fois par heightmap)
    const prevHm = gvisRef.current.heightMap;
    if (hm !== prevHm) {
      const tiles = [];
      for (let gy = 0; gy < HM_CELLS; gy++) {
        for (let gx = 0; gx < HM_CELLS; gx++) {
          const h = (hm[gy] || [])[gx] ?? 1;
          tiles.push({ gx, gy, h, depth: gx + gy + h * 0.001 });
        }
      }
      tiles.sort((a, b) => a.depth - b.depth);
      sortedTilesRef.current = tiles;
    }

    const prevMap = new Map((gvisRef.current.champions || []).map(cv => [cv.id, cv]));
    const champs  = (battleState.champions || []).map((c, i) => {
      const ex     = prevMap.get(c.id);
      const tx     = c.x * sX, ty = c.y * sY;   // normalisé en 0-100
      const moveDx = ex ? tx - ex.prevX : 0;
      const moveDy = ex ? ty - ex.prevY : 0;
      const moved  = Math.hypot(moveDx, moveDy);
      // Direction row persistante : 0=bas, 1=gauche, 2=droite, 3=haut
      let dirRow = ex ? (ex.dirRow ?? 0) : 0;
      if (moved > 0.4) {
        const adx = Math.abs(moveDx), ady = Math.abs(moveDy);
        if (adx >= ady) dirRow = moveDx >= 0 ? 2 : 1;
        else            dirRow = moveDy >= 0 ? 0 : 3;
      }
      return {
        id: c.id,
        x: ex ? ex.x : tx, y: ex ? ex.y : ty,
        prevX: ex ? ex.x : tx, prevY: ex ? ex.y : ty,
        tx, ty,
        hp: c.hp, maxHp: c.maxHp,
        hunger: c.hunger != null ? c.hunger : null,
        thirst: c.thirst != null ? c.thirst : null,
        color: c.color || CHAMP_COLORS[i % CHAMP_COLORS.length],
        isDead: c.hp <= 0,
        combatFlash: ex ? ex.combatFlash : 0,
        name: c.name, idx: i,
        hasCamo: (c.buffs || []).some(b => b.stat === 'camouflage' && b.ticks > 0),
        se: (c.statusEffects || []).map(s => s.type),
        inAlliance: (battleState.alliances || []).some(al => al.ids.includes(c.id)),
        elevation: c.elevation || 1,
        visionRadius: c.visionRadius || 12,
        isFollowed: gvisRef.current.followId === c.id,
        isMoving: moved > 0.4,
        dirRow,
        weapon: c.weapon || 'stone_knife',
        // Look unique déterministe (préservé entre ticks)
        look: ex?.look || generateLook(c.id || String(i)),
      };
    });

    // Spawns particules
    const spawns = [];
    champs.forEach(cv => {
      const ex2 = prevMap.get(cv.id);
      if (ex2 && !ex2.isDead && cv.isDead)
        spawns.push({ wx: cv.tx, wy: cv.ty, type: 'death', color: cv.color });
    });
    (battleState.events || []).slice(-20).forEach(ev => {
      if (ev.type === 'combat') [ev.a, ev.b].forEach(id => {
        const cv = champs.find(c => c.id === id);
        if (cv) { cv.combatFlash = 0.75; spawns.push({ wx: cv.tx, wy: cv.ty, type: 'combat', color: cv.color }); }
      });
      if (ev.type === 'collect') {
        const cv = champs.find(c => c.id === ev.champion);
        if (cv) spawns.push({ wx: cv.tx, wy: cv.ty, type: 'heal', color: cv.color });
      }
    });

    gvisRef.current = {
      champions:     champs,
      alliances:     battleState.alliances || [],
      dayPhase:      battleState.dayPhase  || 0,
      tick:          battleState.tick      || 0,
      supplies:      (battleState.map?.supplies || []).map(s => ({ ...s, x: s.x * sX, y: s.y * sY })),
      loots:         (battleState.map?.loots    || []).map(l => ({ ...l, x: l.x * sX, y: l.y * sY })),
      biome,
      heightMap:     hm,
      followId:      gvisRef.current.followId,
      particles:     gvisRef.current.particles || [],
      pendingSpawns: spawns,
      fauna:         (() => {
        const prevFM = new Map((gvisRef.current.fauna || []).map(pf => [pf.id, pf]));
        return (battleState.map?.fauna || []).map(f => {
          const pf   = prevFM.get(f.id);
          const fx   = f.x * sX, fy = f.y * sY;
          const fdx  = pf ? fx - pf.x : 0, fdy = pf ? fy - pf.y : 0;
          const fmov = Math.hypot(fdx, fdy);
          let fDir   = pf ? (pf.dirRow ?? 0) : 0;
          if (fmov > 0.05) {
            const adx = Math.abs(fdx), ady = Math.abs(fdy);
            if (adx >= ady) fDir = fdx >= 0 ? 2 : 1;
            else            fDir = fdy >= 0 ? 0 : 3;
          }
          return {
            ...f,
            x:     pf ? pf.x : fx,   // position visuelle (à interpoler)
            y:     pf ? pf.y : fy,
            prevX: pf ? pf.x : fx,   // point de départ de l'interpolation
            prevY: pf ? pf.y : fy,
            tx: fx, ty: fy,          // cible (coordonnées sim)
            dirRow: fDir,
            // Double vérification : différence visuelle OU flag du simulateur
            isMoving: fmov > 0.05 || !!f.isMoving,
          };
        });
      })(),
      flora:         (battleState.map?.flora || []).filter(f => !f.collected).map(f => ({ ...f, x: f.x * sX, y: f.y * sY })),
      obstacles:     (battleState.map?.obstacles || []).map(o => ({ ...o, x: o.x * sX, y: o.y * sY, radius: (o.radius || 5) * sX })),
      activeEvent:   battleState.activeEvent || null,
      weather:       battleState.weather || 'clear',
      simPhase:      battleState.simPhase || 'main',
    };
  }, [battleState]);

  // ── Convertit coordonnées écran → monde (coords WORLD du simulateur) ─
  const screenToWorld = useCallback((ex, ey) => {
    const H   = canvasHRef.current > 80 ? canvasHRef.current : SH;
    const ix  = (ex - W / 2) / zoom.current + camIx.current;
    const iy  = (ey - H / 2) / zoom.current + camIy.current;
    const TW2 = TILE_W / 2, TH2 = TILE_H / 2;
    const gx  = (ix / TW2 + iy / TH2) / 2;
    const gy  = (iy / TH2 - ix / TW2) / 2;
    // Internal 0-INTERNAL_MAX → world 0-mapW
    const INTERNAL_MAX = HM_CELLS * HM_CELL;        // = 100 (HM_CELLS=20, HM_CELL=5)
    const mapW = battleState?.map?.width  || INTERNAL_MAX;
    const mapH = battleState?.map?.height || INTERNAL_MAX;
    const wxInternal = Math.max(0, Math.min(INTERNAL_MAX, gx * HM_CELL));
    const wyInternal = Math.max(0, Math.min(INTERNAL_MAX, gy * HM_CELL));
    const wx = wxInternal * (mapW / INTERNAL_MAX);
    const wy = wyInternal * (mapH / INTERNAL_MAX);
    return { wx, wy };
  }, [W, SH, battleState]);

  // ── Tap handler ───────────────────────────────────────────────────────
  const handleTap = useCallback((ex, ey) => {
    // Drop targeting mode : tap → drop supply
    if (dropModeRef.current && onDropReleaseRef.current) {
      const { wx, wy } = screenToWorld(ex, ey);
      setDropFingerPos(null);
      onDropReleaseRef.current(wx, wy);
      return;
    }
    const H  = canvasHRef.current > 80 ? canvasHRef.current : SH;
    const v  = gvisRef.current;
    const hm = v.heightMap;

    for (const cv of v.champions) {
      if (cv.isDead) continue;
      const wz  = hm ? getElev(cv.x, cv.y, hm) : 1;
      const { ix, iy } = wToIso(cv.x, cv.y, wz);
      const sx2 = W/2 + (ix - camIx.current) * zoom.current;
      const sy2 = H/2 + (iy - camIy.current) * zoom.current;
      if (Math.hypot(ex - sx2, ey - sy2) < Math.max(14, zoom.current * 9)) {
        const was = v.followId === cv.id;
        gvisRef.current.followId = was ? null : cv.id;
        setFollowInfo(was ? null : { id: cv.id, name: cv.name, color: cv.color });
        if (onChampionTap) onChampionTap(cv.id);
        return;
      }
    }

    // Tap minimap → déplace caméra iso
    const MM = 72, MMP = 10, mmy = H - MM - MMP - 2;
    if (ex >= MMP && ex <= MMP+MM && ey >= mmy && ey <= mmy+MM) {
      const sc = MM / (HM_CELLS * HM_CELL);
      const wx = (ex - MMP) / sc;
      const wy = (ey - mmy) / sc;
      const wz = hm ? getElev(wx, wy, hm) : 1;
      const { ix, iy } = wToIso(wx, wy, wz);
      camIx.current = ix; camIy.current = iy;
      return;
    }

    gvisRef.current.followId = null;
    setFollowInfo(null);
  }, [W, SH, onChampionTap]);

  // ── Gestes ───────────────────────────────────────────────────────────
  const panGesture = Gesture.Pan()
    .onStart(e => {
      savedCam.current = { ix: camIx.current, iy: camIy.current };
      if (dropModeRef.current) {
        setDropFingerPos({ x: e.x, y: e.y });
      }
    })
    .onUpdate(e => {
      if (dropModeRef.current) {
        // En mode drop : le doigt déplace le "viseur", pas la caméra
        setDropFingerPos({ x: e.x, y: e.y });
        return;
      }
      camIx.current = savedCam.current.ix - e.translationX / zoom.current;
      camIy.current = savedCam.current.iy - e.translationY / zoom.current;
      if (gvisRef.current.followId) { gvisRef.current.followId = null; setFollowInfo(null); }
    })
    .onEnd(e => {
      if (dropModeRef.current && onDropReleaseRef.current) {
        const { wx, wy } = screenToWorld(e.x, e.y);
        setDropFingerPos(null);
        onDropReleaseRef.current(wx, wy);
      }
    })
    .runOnJS(true);

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      savedZoom.current      = zoom.current;
      targetZoom.current     = zoom.current;  // stoppe le lerp pendant le geste
      savedCam.current       = { ix: camIx.current, iy: camIy.current };
    })
    .onUpdate(e => {
      if (dropModeRef.current) return; // pas de zoom en mode drop
      const prevZoom = zoom.current;
      const nz = Math.max(0.4, Math.min(8, savedZoom.current * e.scale));
      const fx = e.focalX - W / 2;
      const fy = e.focalY - (canvasHRef.current > 80 ? canvasHRef.current : SH) / 2;
      camIx.current += fx / prevZoom - fx / nz;
      camIy.current += fy / prevZoom - fy / nz;
      zoom.current        = nz;
      targetZoom.current  = nz;
    })
    .runOnJS(true);

  const doubleTap = Gesture.Tap().numberOfTaps(2)
    .onEnd(() => {
      if (dropModeRef.current) return;
      const { ix, iy } = mapCenterIso();
      camIx.current = ix; camIy.current = iy;
      zoom.current = 6.0; targetZoom.current = 6.0;
      gvisRef.current.followId = null;
      prevFollowId.current = null;
      setFollowInfo(null);
    })
    .runOnJS(true);

  const singleTap = Gesture.Tap()
    .onEnd(e => { handleTap(e.x, e.y); })
    .runOnJS(true);

  const gesture = Gesture.Simultaneous(
    panGesture, pinchGesture,
    Gesture.Exclusive(doubleTap, singleTap)
  );

  // ── Preload check : compte les sprites critiques chargés ────────────
  // Évite l'affichage des fallbacks polygones pendant le chargement async.
  const _criticalAssets = [
    imgIsoTiles,
    lpcBodyMaleIdle, lpcBodyMaleWalk, lpcBodyFemaleIdle, lpcBodyFemaleWalk,
    imgDeerIdle, imgWolfIdle, imgBoarIdle, imgHareIdle,
  ];
  const _totalCritical = _criticalAssets.length;
  const _loadedCritical = _criticalAssets.filter(Boolean).length;
  const _isLoading = _loadedCritical < _totalCritical;
  const _loadPct = Math.round((_loadedCritical / _totalCritical) * 100);

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(e) => { canvasHRef.current = e.nativeEvent.layout.height; }}
    >
      <GestureDetector gesture={gesture}>
        <Canvas style={StyleSheet.absoluteFill}>
          {picture && <Picture picture={picture} />}
        </Canvas>
      </GestureDetector>

      {/* ── Loading overlay (préchargement des sprites critiques) ──── */}
      {_isLoading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <View style={styles.loadingCard}>
            <Text style={styles.loadingTitle}>⚔️ Préparation de l'arène…</Text>
            <View style={styles.loadingBar}>
              <View style={[styles.loadingBarFill, { width: `${_loadPct}%` }]} />
            </View>
            <Text style={styles.loadingPct}>
              {_loadedCritical} / {_totalCritical} assets ({_loadPct}%)
            </Text>
          </View>
        </View>
      )}

      {/* ── Overlay cône/ombre en mode drop sponsor ─────────────────── */}
      {dropMode && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* Bannière instruction */}
          <View style={styles.dropBanner}>
            <Text style={styles.dropBannerIco}>{dropMode.icon || '📦'}</Text>
            <Text style={styles.dropBannerTxt}>Touchez la carte pour lancer le colis</Text>
            <Text style={styles.dropBannerSub}>Glissez pour viser · Relâchez pour larguer</Text>
          </View>
          {/* Cône/ombre sous le doigt */}
          {dropFingerPos && (
            <View
              style={[styles.dropTarget, {
                left: dropFingerPos.x - 38,
                top:  dropFingerPos.y - 38,
              }]}
              pointerEvents="none"
            >
              {/* Ombre portée (ellipse) */}
              <View style={[styles.dropShadowOval, { borderColor: dropMode.color || '#e2b96f' }]} />
              {/* Cone : triangle pointant vers le bas */}
              <View style={[styles.dropConeWrap]}>
                <View style={[styles.dropConeTriangle, {
                  borderTopColor: (dropMode.color || '#e2b96f') + 'aa',
                }]} />
              </View>
              {/* Icône du colis */}
              <Text style={styles.dropTargetIco}>{dropMode.icon || '📦'}</Text>
            </View>
          )}
        </View>
      )}

      {/* Barre POV ← champion suivi → */}
      {!dropMode && (
        <View style={styles.povBar} pointerEvents="box-none">
          <TouchableOpacity style={styles.povBtn} onPress={() => cycleFollow(-1)} activeOpacity={0.75}>
            <Text style={styles.povBtnTxt}>◀</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.povCenter} onPress={clearFollow} activeOpacity={0.75}>
            <Text style={styles.povCenterTxt} numberOfLines={1}>
              {followInfo ? `👁  ${followInfo.name}` : 'Caméra libre'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.povBtn} onPress={() => cycleFollow(1)} activeOpacity={0.75}>
            <Text style={styles.povBtnTxt}>▶</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13, 13, 26, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  loadingCard: {
    backgroundColor: '#1a1a2e',
    borderColor: '#e2b96f',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 26,
    paddingVertical: 18,
    minWidth: 260,
    alignItems: 'center',
  },
  loadingTitle: {
    color: '#e2b96f',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1.2,
    marginBottom: 14,
  },
  loadingBar: {
    height: 8,
    width: 220,
    backgroundColor: '#0d0d1a',
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#33334d',
  },
  loadingBarFill: {
    height: '100%',
    backgroundColor: '#e2b96f',
    borderRadius: 4,
  },
  loadingPct: {
    color: '#888',
    fontSize: 11,
    marginTop: 8,
    letterSpacing: 1,
  },
  povBar: {
    position: 'absolute',
    top: 10, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    gap: 6,
  },
  povBtn: {
    backgroundColor: 'rgba(0,0,0,0.60)',
    borderRadius: 22,
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(226,185,111,0.45)',
  },
  povBtnTxt:   { color: '#e2b96f', fontSize: 13, fontWeight: 'bold' },
  povCenter: {
    flex: 1, maxWidth: 170,
    backgroundColor: 'rgba(15,20,35,0.90)',
    borderRadius: 22,
    paddingHorizontal: 14, paddingVertical: 7,
    alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(226,185,111,0.28)',
  },
  povCenterTxt: { color: '#e2b96f', fontSize: 11, fontWeight: '600' },

  // ── Drop targeting mode ───────────────────────────────────────────────────
  dropBanner: {
    position: 'absolute',
    top: 12, left: 20, right: 20,
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(226,185,111,0.55)',
    paddingVertical: 10, paddingHorizontal: 16,
    alignItems: 'center', gap: 2,
  },
  dropBannerIco:  { fontSize: 24 },
  dropBannerTxt:  { color: '#e2b96f', fontSize: 13, fontWeight: '700' },
  dropBannerSub:  { color: '#aaa', fontSize: 10 },
  dropTarget: {
    position: 'absolute',
    width: 76, height: 76,
    alignItems: 'center', justifyContent: 'flex-end',
  },
  dropShadowOval: {
    position: 'absolute',
    bottom: 4,
    width: 52, height: 18,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderWidth: 1.5,
    alignSelf: 'center',
  },
  dropConeWrap: {
    position: 'absolute',
    bottom: 13,
    alignItems: 'center',
  },
  dropConeTriangle: {
    width: 0, height: 0,
    borderLeftWidth: 22, borderLeftColor: 'transparent',
    borderRightWidth: 22, borderRightColor: 'transparent',
    borderTopWidth: 44,
  },
  dropTargetIco: {
    position: 'absolute',
    top: 0,
    fontSize: 28,
  },
});
