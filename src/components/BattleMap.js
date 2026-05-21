/**
 * BattleMap — Vue ISOMÉTRIQUE Skia PictureRecorder
 * Tuiles cubes 3 faces, figurines géométriques, heightmap procédural
 * @shopify/react-native-skia 2.2.12 · Expo Go SDK 54
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import {
  Canvas, Picture, Skia,
  PaintStyle,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

// ── Constantes isométriques ───────────────────────────────────────────────
const TILE_W   = 24;   // largeur du losange (en px, zoom=1)
const TILE_H   = 12;   // hauteur du losange
const TILE_Z   = 8;    // pixels par unité d'élévation
const HM_CELLS = 20;   // grille heightmap 20×20
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
};

function tileColors(biome, h) {
  const pal = BIOME_ISO[biome] || BIOME_ISO['forêt'];
  const idx  = Math.max(0, Math.min(7, h));
  return pal[idx];
}

// ── Génération procédurale de rivières sur la heightmap ───────────────────
function addRivers(hm, biome, rng) {
  const nb = biome === 'marais' ? 3 : biome === 'forêt' ? 2 : biome === 'montagne' ? 2 : 1;
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
// On décale légèrement vers le bas (iy+20) pour mieux centrer visuellement
function mapCenterIso() {
  const { ix, iy } = wToIso(50, 50, 1);
  return { ix, iy: iy - 18 };
}

// ── Pool de paints ────────────────────────────────────────────────────────
let _FP = null, _AP = null, _SP = null, _SAP = null;
// Pool de paths réutilisables (évite GC intensif sur les tiles)
let _tp = null, _rp = null, _lp = null;  // top, right, left tile faces
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
}
function _c(s) { return _CC[s] || (_CC[s] = Skia.Color(s)); }

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

// ── Dessin d'un cube isométrique ──────────────────────────────────────────
function drawIsoCube(canvas, gx, gy, h, biome, fogA, camIx, camIy, zoom, W, H) {
  const tw = (TILE_W / 2) * zoom;
  const th = (TILE_H / 2) * zoom;
  const tz = h * TILE_Z * zoom;   // hauteur de la colonne visible

  const { ix, iy } = wToIso(gx * HM_CELL, gy * HM_CELL, h);
  const tx = W / 2 + (ix - camIx) * zoom;
  const ty = H / 2 + (iy - camIy) * zoom;

  // Culling : hors écran ?
  if (tx < -tw * 3 || tx > W + tw * 3 || ty < -th - tz - 16 || ty > H + th + 16) return;

  const dimA = fogA > 0.05 ? (1 - fogA * 0.78) : 1;
  const [topC, rightC, leftC] = tileColors(biome, h);

  // ── Face haut (losange) ──────────────────────────────────────────────────
  _tp.rewind();
  _tp.moveTo(tx,      ty - th);
  _tp.lineTo(tx + tw, ty);
  _tp.lineTo(tx,      ty + th);
  _tp.lineTo(tx - tw, ty);
  _tp.close();
  canvas.drawPath(_tp, mkAlpha(topC, 0.92 * dimA));

  // Face haut : léger reflet (eau animé ignoré ici pour perf)
  if (zoom > 1.2 && dimA > 0.5) {
    canvas.drawCircle(tx - tw * 0.3, ty - th * 0.4, tw * 0.22, mkAlpha('#ffffff', 0.10 * dimA));
  }

  // ── Faces latérales (uniquement si h > 0 et cube visible) ───────────────
  if (h > 0 && tz > 0.5) {
    // Face droite (ombre)
    _rp.rewind();
    _rp.moveTo(tx,      ty + th);
    _rp.lineTo(tx + tw, ty);
    _rp.lineTo(tx + tw, ty + tz);
    _rp.lineTo(tx,      ty + th + tz);
    _rp.close();
    canvas.drawPath(_rp, mkAlpha(rightC, 0.95 * dimA));

    // Face gauche (lumière)
    _lp.rewind();
    _lp.moveTo(tx - tw, ty);
    _lp.lineTo(tx,      ty + th);
    _lp.lineTo(tx,      ty + th + tz);
    _lp.lineTo(tx - tw, ty + tz);
    _lp.close();
    canvas.drawPath(_lp, mkAlpha(leftC, 0.95 * dimA));
  }

  // Séparateur de tuiles (visible seulement à fort zoom)
  if (zoom > 1.1 && dimA > 0.5) {
    canvas.drawPath(_tp, mkStrokeA('#000000', 0.4, 0.12 * dimA));
  }

  // Brume de guerre : overlay sombre supplémentaire
  if (fogA > 0.05) {
    canvas.drawPath(_tp, mkAlpha('#000814', fogA * 0.72));
  }
}

// ── Figurine isométrique (humanoïde géométrique) ─────────────────────────
function drawIsoCharacter(canvas, cv, hm, t, camIx, camIy, zoom, W, H, fm) {
  const wz = getElev(cv.x, cv.y, hm);
  const { ix, iy } = wToIso(cv.x, cv.y, wz);
  const sx = W / 2 + (ix - camIx) * zoom;
  const sy = H / 2 + (iy - camIy) * zoom;

  if (sx < -50 || sx > W + 50 || sy < -100 || sy > H + 50) return;

  // Figurine mort
  if (cv.isDead) {
    const ds = Math.max(0.5, zoom * 0.45);
    const xp = Skia.Path.Make();
    xp.moveTo(sx - 5*ds, sy - 2*ds); xp.lineTo(sx + 5*ds, sy + 4*ds);
    xp.moveTo(sx + 5*ds, sy - 2*ds); xp.lineTo(sx - 5*ds, sy + 4*ds);
    canvas.drawPath(xp, mkStrokeA('#444444', 1.5*ds, 0.55));
    return;
  }

  const sc   = Math.max(0.45, zoom * 0.56);
  const baseA = cv.hasCamo ? 0.35 : 1.0;
  const col   = cv.color;
  const bob   = Math.sin(t * 4 + cv.idx) * 1.0 * sc;

  // Glow aura (3 couches)
  const gPulse = cv.combatFlash > 0 ? 1.5 : 1.0;
  canvas.drawCircle(sx, sy - 10*sc, 18*sc, mkAlpha(col, 0.030 * baseA * gPulse));
  canvas.drawCircle(sx, sy - 10*sc, 12*sc, mkAlpha(col, 0.080 * baseA * gPulse));
  canvas.drawCircle(sx, sy - 10*sc,  7*sc, mkAlpha(col, 0.18  * baseA * gPulse));

  // Flash combat
  if (cv.combatFlash > 0) {
    canvas.drawCircle(sx, sy - 8*sc, 15*sc, mkAlpha('#ff6644', cv.combatFlash * 0.32));
  }

  // Ombre portée (ellipse aplatie en iso)
  const shadowP = Skia.Path.Make();
  shadowP.addOval(Skia.XYWHRect(sx - 6*sc, sy - 1*sc, 12*sc, 4*sc));
  canvas.drawPath(shadowP, mkAlpha('#000000', 0.30 * baseA));

  // ── Jambes ──────────────────────────────────────────────────────────────
  const legTop = sy - 2*sc;   // base des jambes (juste sous le corps)
  const legH   = 8*sc;
  canvas.drawRect(Skia.XYWHRect(sx - 4.5*sc, legTop + bob,  2.5*sc, legH - bob), mkAlpha(col, 0.68 * baseA));
  canvas.drawRect(Skia.XYWHRect(sx + 2.0*sc, legTop - bob,  2.5*sc, legH + bob), mkAlpha(col, 0.68 * baseA));

  // ── Corps ────────────────────────────────────────────────────────────────
  const bodyW = 8*sc, bodyH = 12*sc;
  const bodyX = sx - bodyW / 2, bodyY = legTop - bodyH;
  canvas.drawRect(Skia.XYWHRect(bodyX,            bodyY,            bodyW,       bodyH),   mkAlpha(col, 0.92 * baseA));
  canvas.drawRect(Skia.XYWHRect(bodyX + 1.2*sc,   bodyY + 1.5*sc,  bodyW*0.32,  bodyH*0.52), mkAlpha('#ffffff', 0.18 * baseA));

  // ── Bras ─────────────────────────────────────────────────────────────────
  const armY   = bodyY + 2*sc;
  const armBob = Math.sin(t * 4 + cv.idx + Math.PI) * 1.0 * sc;
  canvas.drawRect(Skia.XYWHRect(bodyX - 3*sc,          armY + armBob, 3*sc, 8*sc), mkAlpha(col, 0.65 * baseA));
  canvas.drawRect(Skia.XYWHRect(bodyX + bodyW,          armY - armBob, 3*sc, 8*sc), mkAlpha(col, 0.65 * baseA));

  // ── Tête ─────────────────────────────────────────────────────────────────
  const headR = 5.5*sc;
  const headY = bodyY - headR - 1*sc;
  canvas.drawCircle(sx, headY, headR, mkAlpha(col, 0.95 * baseA));
  canvas.drawCircle(sx - headR*0.30, headY - headR*0.25, headR*0.36, mkAlpha('#ffffff', 0.24 * baseA));

  // Yeux (zoom élevé uniquement)
  if (zoom > 1.8) {
    canvas.drawCircle(sx - 1.8*sc, headY - 0.5*sc, 0.9*sc, mkAlpha('#000000', 0.72));
    canvas.drawCircle(sx + 1.8*sc, headY - 0.5*sc, 0.9*sc, mkAlpha('#000000', 0.72));
  }

  // Ring (suivi = blanc, sinon couleur champion)
  const isFollowed = cv.isFollowed;
  canvas.drawCircle(sx, headY, headR + 2.2*sc,
    mkStrokeA(isFollowed ? '#ffffff' : col,
              isFollowed ? 2.2*sc : 1.2*sc,
              (isFollowed ? 1.0 : 0.45) * baseA));

  // ── Barres HP + survie ────────────────────────────────────────────────────
  const bw = 22*sc, bh = 2.6*sc;
  const bx  = sx - bw / 2;
  const by  = headY - headR - (cv.hunger!=null ? 12*sc : 7*sc);

  // HP
  canvas.drawRect(Skia.XYWHRect(bx - 1, by - 1, bw + 2, bh + 2), mkAlpha('#000000', 0.72));
  const hpRatio = Math.max(0, cv.hp / cv.maxHp);
  const barC    = hpRatio > 0.6 ? '#2ecc71' : hpRatio > 0.3 ? '#f39c12' : '#e74c3c';
  canvas.drawRect(Skia.XYWHRect(bx, by, bw * hpRatio, bh), mkFill(barC));

  // Faim (orange) + soif (bleu) — affichées si le champion a ces attributs
  if (cv.hunger != null) {
    const by2 = by + bh + 1.2*sc;
    const by3 = by2 + bh + 1.0*sc;
    canvas.drawRect(Skia.XYWHRect(bx-1, by2-1, bw+2, bh+2), mkAlpha('#000000', 0.60));
    canvas.drawRect(Skia.XYWHRect(bx,   by2,   bw * Math.max(0, cv.hunger/100), bh), mkAlpha('#e67e22', 0.88));
    canvas.drawRect(Skia.XYWHRect(bx-1, by3-1, bw+2, bh+2), mkAlpha('#000000', 0.60));
    canvas.drawRect(Skia.XYWHRect(bx,   by3,   bw * Math.max(0, cv.thirst/100), bh), mkAlpha('#3498db', 0.88));
  }

  // ── Nom (zoom fort) ───────────────────────────────────────────────────────
  if (zoom > 1.6 && fm) {
    const approxW = cv.name.length * 4.5;
    canvas.drawText(cv.name, sx - approxW / 2, by - 4, mkAlpha('#ffffff', 0.82 * baseA), fm);
  }

  // ── Badge hauteur ─────────────────────────────────────────────────────────
  if (cv.elevation > 3 && zoom > 0.9 && fm) {
    canvas.drawText(`▲${cv.elevation}`, sx + headR + 2*sc, headY + 2,
      mkAlpha('#f39c12', 0.78), fm);
  }
}

// ── Scène isométrique principale ──────────────────────────────────────────
function drawIsoScene(canvas, t, v, sortedTilesRef, camIx, camIy, zoom, fm, fs, W, H) {
  _initPool();

  const biome = v.biome || 'forêt';
  const hm    = v.heightMap;

  // Fond (ciel nuit/jour)
  const isNight = (v.dayPhase || 0) >= 18;
  canvas.drawColor(Skia.Color(isNight ? '#020308' : '#040509'));

  // Champion suivi → fog of war
  const followed   = v.followId ? v.champions.find(c => c.id === v.followId && !c.isDead) : null;
  const visionW    = followed ? (followed.visionRadius || 12) : 999;
  const visionSoft = 10; // marge de transition (unités monde)

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
      drawIsoCharacter(canvas, champsWithDepth[ci].cv, hm, t, camIx, camIy, zoom, W, H, fm);
      ci++;
    }

    // Fog of war : distance du tile au champion suivi
    let fogA = 0;
    if (followed) {
      const tileWx = tile.gx * HM_CELL + HM_CELL / 2;
      const tileWy = tile.gy * HM_CELL + HM_CELL / 2;
      const dist   = Math.hypot(tileWx - followed.x, tileWy - followed.y);
      fogA = dist > visionW ? Math.min(1, (dist - visionW) / visionSoft) : 0;
    }

    drawIsoCube(canvas, tile.gx, tile.gy, tile.h, biome, fogA, camIx, camIy, zoom, W, H);
  }

  // Champions restants (premier plan)
  while (ci < champsWithDepth.length) {
    drawIsoCharacter(canvas, champsWithDepth[ci].cv, hm, t, camIx, camIy, zoom, W, H, fm);
    ci++;
  }

  // ── Colis (supply drops + loots avec animation de chute) ─────────────────
  const WEAPON_COLORS = { sword:'#bdc3c7', spear:'#95a5a6', bow:'#8e44ad', shield:'#7f8c8d' };
  const allDrops = [...(v.supplies || []), ...(v.loots || [])];
  allDrops.forEach(s => {
    const sh   = hm ? getElev(s.x, s.y, hm) : 1;
    // Animation de chute : if _dropTick and tick, compute fall offset
    const tickDiff = s._dropTick != null ? Math.max(0, (v.tick || 0) - s._dropTick) : 999;
    const fallH    = tickDiff < 6 ? Math.max(0, sh + 5 - tickDiff * 1.2) : sh + 0.6;
    const { ix, iy } = wToIso(s.x, s.y, fallH);
    const sx2 = W / 2 + (ix - camIx) * zoom;
    const sy2 = H / 2 + (iy - camIy) * zoom;
    if (sx2 < -20 || sx2 > W+20 || sy2 < -20 || sy2 > H+20) return;
    const col = WEAPON_COLORS[s.type] || SUPPLY_COLORS[s.type] || '#ffffff';
    const r2  = Math.max(3, zoom * 1.8);
    const isWeapon = !!WEAPON_COLORS[s.type];

    // Ombre portée (chute)
    if (tickDiff < 6 && fallH > sh + 0.8) {
      const shh = hm ? getElev(s.x, s.y, hm) : 1;
      const { ix:six2, iy:siy2 } = wToIso(s.x, s.y, shh);
      const shdx = W/2 + (six2 - camIx) * zoom;
      const shdy = H/2 + (siy2 - camIy) * zoom;
      const shadowA = Math.max(0.05, 0.4 - tickDiff * 0.06);
      canvas.drawCircle(shdx, shdy, r2 * (1 + tickDiff * 0.4), mkAlpha('#000000', shadowA));
    }

    // Halo coloré
    canvas.drawCircle(sx2, sy2, r2 * 3.2, mkAlpha(col, 0.20));

    if (isWeapon) {
      // Arme : losange avec croix centrale
      canvas.save();
      canvas.translate(sx2, sy2);
      canvas.rotate(t * 18);
      const dp = Skia.Path.Make();
      dp.moveTo(0, -r2*1.4); dp.lineTo(r2*1.4, 0); dp.lineTo(0, r2*1.4); dp.lineTo(-r2*1.4, 0); dp.close();
      canvas.drawPath(dp, mkAlpha(col, 0.90));
      canvas.restore();
      canvas.drawCircle(sx2, sy2, r2 * 0.55, mkAlpha('#ffffff', 0.55));
    } else {
      // Colis classique : diamant
      canvas.save();
      canvas.translate(sx2, sy2);
      canvas.rotate(t * 24);
      const dp = Skia.Path.Make();
      dp.moveTo(0, -r2); dp.lineTo(r2, 0); dp.lineTo(0, r2); dp.lineTo(-r2, 0); dp.close();
      canvas.drawPath(dp, mkFill(col));
      canvas.restore();
    }

    // Ligne de descente (loot en chute)
    if (tickDiff < 4 && fallH > sh + 1) {
      const { ix:grix, iy:griy } = wToIso(s.x, s.y, sh + 0.6);
      const grsx = W/2 + (grix - camIx)*zoom, grsy = H/2 + (griy - camIy)*zoom;
      const lineP = Skia.Path.Make();
      lineP.moveTo(sx2, sy2); lineP.lineTo(grsx, grsy);
      canvas.drawPath(lineP, mkStrokeA(col, 1.2, 0.35));
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

  // ── Faune (points animés sur la carte) ────────────────────────────────────
  const FAUNA_COLORS = { deer:'#c0a040', wolf:'#6e4020', rabbit:'#d0c080', boar:'#6a3a20' };
  (v.fauna || []).forEach(f => {
    if (f.hp <= 0) return;
    const fh = hm ? getElev(f.x, f.y, hm) : 1;
    const { ix:fix, iy:fiy } = wToIso(f.x, f.y, fh + 0.2);
    const fsx = W/2 + (fix - camIx) * zoom;
    const fsy = H/2 + (fiy - camIy) * zoom;
    if (fsx < -10 || fsx > W+10 || fsy < -10 || fsy > H+10) return;
    const fc = FAUNA_COLORS[f.type] || '#888844';
    const fr = Math.max(2, zoom * 1.1);
    const bob = Math.sin(t * 3 + f.id.length) * 1.5;
    canvas.drawCircle(fsx, fsy + bob, fr * 1.8, mkAlpha(fc, 0.18));
    canvas.drawCircle(fsx, fsy + bob, fr, mkFill(fc));
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

  // ── Cornucopia — lueur dorée au centre au début de partie ────────────────
  if (v.simPhase === 'cornucopia') {
    const cx = 50, cy = 50;
    const { ix: cix, iy: ciy } = wToIso(cx, cy, 1);
    const csx = W/2 + (cix - camIx)*zoom;
    const csy = H/2 + (ciy - camIy)*zoom;
    const pulse = 0.5 + Math.sin(t * 3.5) * 0.5;
    canvas.drawCircle(csx, csy, 110*zoom, mkAlpha('#e2b96f', 0.06 * pulse));
    canvas.drawCircle(csx, csy,  70*zoom, mkAlpha('#e2b96f', 0.12 * pulse));
    canvas.drawCircle(csx, csy,  35*zoom, mkAlpha('#ffe066', 0.24 * pulse));
    canvas.drawCircle(csx, csy,  12*zoom, mkAlpha('#ffffff', 0.45 * pulse));
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
    if (v.simPhase === 'cornucopia') {
      canvas.drawText('⚔️ CORNUCOPIA', W/2 - 36, 22, mkAlpha('#e2b96f', 0.90), fm);
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
  // Faune sur minimap
  (v.fauna || []).forEach(f => {
    if (f.hp <= 0) return;
    const fc = FAUNA_COLORS[f.type] || '#888';
    canvas.drawCircle(mmx + f.x*sc, mmy + f.y*sc, 1.2, mkAlpha(fc, 0.65));
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
export default function BattleMap({ battleState, onChampionTap }) {
  const { width: W, height: H } = useWindowDimensions();

  // ── Caméra en espace iso ───────────────────────────────────────────────
  const { ix: defIx, iy: defIy } = mapCenterIso();
  const camIx       = useRef(defIx);
  const camIy       = useRef(defIy);
  const zoom        = useRef(0.92);
  const targetZoom  = useRef(0.92);  // zoom cible (interpolé en douceur)
  const prevFollowId= useRef(null);  // détection changement follow → zoom auto
  const timeRef     = useRef(0);
  const lastTs      = useRef(null);
  const savedCam    = useRef({ ix: defIx, iy: defIy });
  const savedZoom   = useRef(0.92);

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
    heightMap: null, fauna: [], activeEvent: null,
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
          // Zoom avant sur le perso — niveau adapté
          targetZoom.current = 2.8;
        } else {
          // Retour vue globale
          targetZoom.current = 0.92;
        }
        prevFollowId.current = fId;
      }
      // Interpolation douce du zoom (lerp 6% par frame)
      zoom.current += (targetZoom.current - zoom.current) * 0.06;

      if (fId) {
        const fc = gvisRef.current.champions.find(cv => cv.id === fId && !cv.isDead);
        if (fc) {
          const hm = gvisRef.current.heightMap;
          const wz = hm ? getElev(fc.x, fc.y, hm) : 1;
          const { ix: tix, iy: tiy } = wToIso(fc.x, fc.y, wz);
          // Caméra plus serrée (lerp plus rapide au zoom avant)
          const lerpF = 0.09 + (zoom.current - 0.92) * 0.015;
          camIx.current += (tix - camIx.current) * lerpF;
          camIy.current += (tiy - camIy.current) * lerpF;
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

      // Rendu Skia
      const rec = Skia.PictureRecorder();
      const cvs = rec.beginRecording(Skia.XYWHRect(0, 0, W, H));
      drawIsoScene(
        cvs, timeRef.current, gvisRef.current,
        sortedTilesRef.current,
        camIx.current, camIy.current, zoom.current,
        fontMidRef.current, fontSmRef.current, W, H
      );
      setPicture(rec.finishRecordingAsPicture());
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [W, H]);

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

    // Normalisation → espace monde 0-100 (backend = 100×100, simulateur = 300×300)
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
      const ex  = prevMap.get(c.id);
      const tx  = c.x * sX, ty = c.y * sY;   // normalisé en 0-100
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
      fauna:         (battleState.map?.fauna || []).map(f => ({ ...f, x: f.x * sX, y: f.y * sY })),
      activeEvent:   battleState.activeEvent || null,
      weather:       battleState.weather || 'clear',
      simPhase:      battleState.simPhase || 'main',
    };
  }, [battleState]);

  // ── Tap handler ───────────────────────────────────────────────────────
  const handleTap = useCallback((ex, ey) => {
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
    const MM = 80, MMP = 8, mmy = H - MM - MMP;
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
  }, [W, H, onChampionTap]);

  // ── Gestes ───────────────────────────────────────────────────────────
  const panGesture = Gesture.Pan()
    .onStart(() => { savedCam.current = { ix: camIx.current, iy: camIy.current }; })
    .onUpdate(e => {
      camIx.current = savedCam.current.ix - e.translationX / zoom.current;
      camIy.current = savedCam.current.iy - e.translationY / zoom.current;
      if (gvisRef.current.followId) { gvisRef.current.followId = null; setFollowInfo(null); }
    })
    .runOnJS(true);

  const pinchGesture = Gesture.Pinch()
    .onStart(() => { savedZoom.current = zoom.current; })
    .onUpdate(e => {
      const nz  = Math.max(0.5, Math.min(6, savedZoom.current * e.scale));
      const dix = (e.focalX - W/2) / zoom.current;
      const diy = (e.focalY - H/2) / zoom.current;
      zoom.current = nz;
      camIx.current += dix - (e.focalX - W/2) / nz;
      camIy.current += diy - (e.focalY - H/2) / nz;
    })
    .runOnJS(true);

  const doubleTap = Gesture.Tap().numberOfTaps(2)
    .onEnd(() => {
      const { ix, iy } = mapCenterIso();
      camIx.current = ix; camIy.current = iy;
      zoom.current = 0.92; targetZoom.current = 0.92;
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

  return (
    <View style={StyleSheet.absoluteFill}>
      <GestureDetector gesture={gesture}>
        <Canvas style={StyleSheet.absoluteFill}>
          {picture && <Picture picture={picture} />}
        </Canvas>
      </GestureDetector>

      {/* Barre POV ← champion suivi → */}
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
    </View>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: 'rgba(0,0,0,0.60)',
    borderRadius: 22,
    paddingHorizontal: 14, paddingVertical: 7,
    alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(226,185,111,0.28)',
  },
  povCenterTxt: { color: '#e2b96f', fontSize: 11, fontWeight: '600' },
});
