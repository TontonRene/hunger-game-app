/**
 * LPCSpriteCanvas — Rendu LPC Skia (Canvas) pour vues détail champion & entraînement
 * Utilise les mêmes sprites LPC que BattleMap (5 couches composées).
 * Replacement du WebView global.png dans ChampionSprite / TrainingAnimation / ChampionModel.
 */
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { View } from 'react-native';
import { Canvas, Picture, Skia, useImage } from '@shopify/react-native-skia';

// ── Hash + look déterministe (même algo que BattleMap) ────────────────────
function _hashId(id) {
  let h = 0; const s = String(id || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
const _SKIN_COLS  = ['#ffe0c8','#d4956a','#c08050','#8a5030','#ffd8b0','#a07050','#6a3820'];
const _HAIR_COLS  = ['#1a0800','#3d1c02','#d4a017','#c05000','#505050','#f0e0c0','#800000','#000000','#5a2a08','#8b4513','#a0522d','#deb887'];
const _SHIRT_COLS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#ff6b9d','#00b894','#fd79a8','#6c5ce7','#fdcb6e','#e17055','#74b9ff','#a29bfe','#55efc4'];
const _PANTS_COLS = ['#2c3e50','#1a1a2e','#3d1c02','#0d3d56','#1e3c1a','#4a235a','#34495e','#403030'];
const _LPC_BODY   = ['male', 'female'];
const _LPC_HAIR   = ['bob', 'braid', 'bangs', 'afro', 'buzzcut', 'cornrows', 'curly', 'long'];
const _LPC_TORSO  = ['shirt', 'tshirt', 'leather', 'plate'];
const _LPC_LEGS   = ['pants', 'shorts'];

function generateLook(id) {
  const h0 = _hashId(id);
  const h1 = (Math.imul(h0 ^ (h0 >>> 16), 0x45d9f3b)) >>> 0;
  const h2 = (Math.imul(h1 ^ (h1 >>> 16), 0x45d9f3b)) >>> 0;
  const h3 = (Math.imul(h2 ^ (h2 >>> 13), 0xc2b2ae35)) >>> 0;
  const h4 = (Math.imul(h3 ^ (h3 >>> 16), 0x85ebca6b)) >>> 0;
  const h5 = (Math.imul(h4 ^ (h4 >>> 16), 0x9e3779b9)) >>> 0;
  const h6 = (Math.imul(h5 ^ (h5 >>> 17), 0x27d4eb2f)) >>> 0;
  const h7 = (Math.imul(h6 ^ (h6 >>> 13), 0x85ebca6b)) >>> 0;
  return {
    bodyType:  _LPC_BODY  [h5 % _LPC_BODY.length],
    hair:      _LPC_HAIR  [h6 % _LPC_HAIR.length],
    torso:     _LPC_TORSO [h7 % _LPC_TORSO.length],
    legs:      _LPC_LEGS  [h1 % _LPC_LEGS.length],
    feet:      'boots',
    skinTint:  _SKIN_COLS [h1 % _SKIN_COLS.length],
    hairTint:  _HAIR_COLS [h2 % _HAIR_COLS.length],
    shirtTint: _SHIRT_COLS[h3 % _SHIRT_COLS.length],
    pantsTint: _PANTS_COLS[h4 % _PANTS_COLS.length],
  };
}

// ── Mapping animState → LPC anim ─────────────────────────────────────────
// Counts d'origine LPC :
//   idle=2, walk=9, run=8, slash=6, backslash=13, halfslash=7, hurt=6,
//   shoot=13, thrust=8, spellcast=7, jump=5, climb=6, sit=3, combat_idle=2, emote=variable
const ANIM_MAP = {
  idle:        { lpc:'idle',        fps:2,  frames:2 },
  walk:        { lpc:'walk',        fps:9,  frames:9 },
  run:         { lpc:'run',         fps:11, frames:8 },
  attack:      { lpc:'slash',       fps:12, frames:6 },
  slash:       { lpc:'slash',       fps:12, frames:6 },
  backslash:   { lpc:'backslash',   fps:14, frames:13 },
  halfslash:   { lpc:'halfslash',   fps:14, frames:7 },
  thrust:      { lpc:'thrust',      fps:11, frames:8 },
  shoot:       { lpc:'shoot',       fps:13, frames:13 },
  spellcast:   { lpc:'spellcast',   fps:10, frames:7 },
  cast:        { lpc:'spellcast',   fps:10, frames:7 },   // alias
  jump:        { lpc:'jump',        fps:8,  frames:5 },
  climb:       { lpc:'climb',       fps:7,  frames:6 },
  sit:         { lpc:'sit',         fps:0,  frames:3 },
  combat_idle: { lpc:'combat_idle', fps:3,  frames:2 },
  emote:       { lpc:'emote',       fps:6,  frames:8 },
  hurt:        { lpc:'hurt',        fps:6,  frames:6 },
  death:       { lpc:'hurt',        fps:0,  frames:1 },
};

// ── Peinture sprite (alpha uniquement) ───────────────────────────────────
function _mkSpriteP(alpha) {
  const p = Skia.Paint();
  p.setAlphaf(Math.max(0, Math.min(1, alpha)));
  return p;
}

// ── Peinture avec teinte (ColorFilter MakeBlend Modulate)
// même technique que BattleMap — fonctionne dans PictureRecorder
function _mkTintP(col, alpha) {
  if (!col) return _mkSpriteP(alpha);
  try {
    const p = Skia.Paint();
    p.setAlphaf(Math.max(0, Math.min(1, alpha)));
    p.setColorFilter(Skia.ColorFilter.MakeBlend(Skia.Color(col), BlendMode.Modulate));
    return p;
  } catch (_) {
    return _mkSpriteP(alpha);
  }
}

// ═════════════════════════════════════════════════════════════════════════
export default function LPCSpriteCanvas({
  championId,   // pour générer le look via hash
  look,         // override look si déjà calculé
  animState = 'idle',
  width  = 120,
  height = 140,
  dirRow = 2,   // LPC standard: 0=back 1=gauche 2=front(face) 3=droite
  bgColor = '#0d0d1a',
}) {
  // ── useImage — appelés inconditionnellement au top level ─────────────
  // Body
  const imgBodyMaleWalk    = useImage(require('../../assets/sprites/lpc/body/male_walk.png'));
  const imgBodyMaleIdle    = useImage(require('../../assets/sprites/lpc/body/male_idle.png'));
  const imgBodyMaleSlash   = useImage(require('../../assets/sprites/lpc/body/male_slash.png'));
  const imgBodyMaleHurt    = useImage(require('../../assets/sprites/lpc/body/male_hurt.png'));
  const imgBodyFemaleWalk  = useImage(require('../../assets/sprites/lpc/body/female_walk.png'));
  const imgBodyFemaleIdle  = useImage(require('../../assets/sprites/lpc/body/female_idle.png'));
  const imgBodyFemaleSlash = useImage(require('../../assets/sprites/lpc/body/female_slash.png'));
  const imgBodyFemaleHurt  = useImage(require('../../assets/sprites/lpc/body/female_hurt.png'));
  // Hair
  const imgHairBobWalk     = useImage(require('../../assets/sprites/lpc/hair/bob_walk.png'));
  const imgHairBobIdle     = useImage(require('../../assets/sprites/lpc/hair/bob_idle.png'));
  const imgHairBobSlash    = useImage(require('../../assets/sprites/lpc/hair/bob_slash.png'));
  const imgHairBobHurt     = useImage(require('../../assets/sprites/lpc/hair/bob_hurt.png'));
  const imgHairBraidWalk   = useImage(require('../../assets/sprites/lpc/hair/braid_walk.png'));
  const imgHairBraidIdle   = useImage(require('../../assets/sprites/lpc/hair/braid_idle.png'));
  const imgHairBraidSlash  = useImage(require('../../assets/sprites/lpc/hair/braid_slash.png'));
  const imgHairBraidHurt   = useImage(require('../../assets/sprites/lpc/hair/braid_hurt.png'));
  const imgHairBangsWalk   = useImage(require('../../assets/sprites/lpc/hair/bangs_walk.png'));
  const imgHairBangsIdle   = useImage(require('../../assets/sprites/lpc/hair/bangs_idle.png'));
  const imgHairBangsSlash  = useImage(require('../../assets/sprites/lpc/hair/bangs_slash.png'));
  const imgHairBangsHurt   = useImage(require('../../assets/sprites/lpc/hair/bangs_hurt.png'));
  const imgHairAfroWalk    = useImage(require('../../assets/sprites/lpc/hair/afro_walk.png'));
  const imgHairAfroIdle    = useImage(require('../../assets/sprites/lpc/hair/afro_idle.png'));
  const imgHairAfroSlash   = useImage(require('../../assets/sprites/lpc/hair/afro_slash.png'));
  const imgHairAfroHurt    = useImage(require('../../assets/sprites/lpc/hair/afro_hurt.png'));
  const imgHairBuzzcutWalk = useImage(require('../../assets/sprites/lpc/hair/buzzcut_walk.png'));
  const imgHairBuzzcutIdle = useImage(require('../../assets/sprites/lpc/hair/buzzcut_idle.png'));
  const imgHairBuzzcutSlash= useImage(require('../../assets/sprites/lpc/hair/buzzcut_slash.png'));
  const imgHairBuzzcutHurt = useImage(require('../../assets/sprites/lpc/hair/buzzcut_hurt.png'));
  const imgHairCornrowsWalk= useImage(require('../../assets/sprites/lpc/hair/cornrows_walk.png'));
  const imgHairCornrowsIdle= useImage(require('../../assets/sprites/lpc/hair/cornrows_idle.png'));
  const imgHairCornrowsSlash=useImage(require('../../assets/sprites/lpc/hair/cornrows_slash.png'));
  const imgHairCornrowsHurt= useImage(require('../../assets/sprites/lpc/hair/cornrows_hurt.png'));
  const imgHairCurlyWalk   = useImage(require('../../assets/sprites/lpc/hair/curly_walk.png'));
  const imgHairCurlyIdle   = useImage(require('../../assets/sprites/lpc/hair/curly_idle.png'));
  const imgHairCurlySlash  = useImage(require('../../assets/sprites/lpc/hair/curly_slash.png'));
  const imgHairCurlyHurt   = useImage(require('../../assets/sprites/lpc/hair/curly_hurt.png'));
  const imgHairLongWalk    = useImage(require('../../assets/sprites/lpc/hair/long_walk.png'));
  const imgHairLongIdle    = useImage(require('../../assets/sprites/lpc/hair/long_idle.png'));
  const imgHairLongSlash   = useImage(require('../../assets/sprites/lpc/hair/long_slash.png'));
  const imgHairLongHurt    = useImage(require('../../assets/sprites/lpc/hair/long_hurt.png'));
  // Torso
  const imgTorsoShirtWalk    = useImage(require('../../assets/sprites/lpc/torso/shirt_walk.png'));
  const imgTorsoShirtIdle    = useImage(require('../../assets/sprites/lpc/torso/shirt_idle.png'));
  const imgTorsoShirtSlash   = useImage(require('../../assets/sprites/lpc/torso/shirt_slash.png'));
  const imgTorsoShirtHurt    = useImage(require('../../assets/sprites/lpc/torso/shirt_hurt.png'));
  const imgTorsoTshirtWalk   = useImage(require('../../assets/sprites/lpc/torso/tshirt_walk.png'));
  const imgTorsoTshirtIdle   = useImage(require('../../assets/sprites/lpc/torso/tshirt_idle.png'));
  const imgTorsoTshirtSlash  = useImage(require('../../assets/sprites/lpc/torso/tshirt_slash.png'));
  const imgTorsoTshirtHurt   = useImage(require('../../assets/sprites/lpc/torso/tshirt_hurt.png'));
  const imgTorsoLeatherWalk  = useImage(require('../../assets/sprites/lpc/torso/leather_walk.png'));
  const imgTorsoLeatherIdle  = useImage(require('../../assets/sprites/lpc/torso/leather_idle.png'));
  const imgTorsoLeatherSlash = useImage(require('../../assets/sprites/lpc/torso/leather_slash.png'));
  const imgTorsoLeatherHurt  = useImage(require('../../assets/sprites/lpc/torso/leather_hurt.png'));
  const imgTorsoPlateWalk    = useImage(require('../../assets/sprites/lpc/torso/plate_walk.png'));
  const imgTorsoPlateIdle    = useImage(require('../../assets/sprites/lpc/torso/plate_idle.png'));
  const imgTorsoPlateSlash   = useImage(require('../../assets/sprites/lpc/torso/plate_slash.png'));
  const imgTorsoPlateHurt    = useImage(require('../../assets/sprites/lpc/torso/plate_hurt.png'));
  // Legs
  const imgLegsPantsWalk     = useImage(require('../../assets/sprites/lpc/legs/pants_walk.png'));
  const imgLegsPantsIdle     = useImage(require('../../assets/sprites/lpc/legs/pants_idle.png'));
  const imgLegsPantsSlash    = useImage(require('../../assets/sprites/lpc/legs/pants_slash.png'));
  const imgLegsPantsHurt     = useImage(require('../../assets/sprites/lpc/legs/pants_hurt.png'));
  const imgLegsShortsWalk    = useImage(require('../../assets/sprites/lpc/legs/shorts_walk.png'));
  const imgLegsShortsIdle    = useImage(require('../../assets/sprites/lpc/legs/shorts_idle.png'));
  const imgLegsShortsSlash   = useImage(require('../../assets/sprites/lpc/legs/shorts_slash.png'));
  const imgLegsShortsHurt    = useImage(require('../../assets/sprites/lpc/legs/shorts_hurt.png'));
  // Feet
  const imgFeetBootsWalk     = useImage(require('../../assets/sprites/lpc/feet/boots_walk.png'));
  const imgFeetBootsIdle     = useImage(require('../../assets/sprites/lpc/feet/boots_idle.png'));
  const imgFeetBootsSlash    = useImage(require('../../assets/sprites/lpc/feet/boots_slash.png'));
  const imgFeetBootsHurt     = useImage(require('../../assets/sprites/lpc/feet/boots_hurt.png'));
  const imgBodyMaleBackslash = useImage(require('../../assets/sprites/lpc/body/male_backslash.png'));
  const imgBodyMaleClimb = useImage(require('../../assets/sprites/lpc/body/male_climb.png'));
  const imgBodyMaleCombatidle = useImage(require('../../assets/sprites/lpc/body/male_combat_idle.png'));
  const imgBodyMaleEmote = useImage(require('../../assets/sprites/lpc/body/male_emote.png'));
  const imgBodyMaleHalfslash = useImage(require('../../assets/sprites/lpc/body/male_halfslash.png'));
  const imgBodyMaleJump = useImage(require('../../assets/sprites/lpc/body/male_jump.png'));
  const imgBodyMaleRun = useImage(require('../../assets/sprites/lpc/body/male_run.png'));
  const imgBodyMaleShoot = useImage(require('../../assets/sprites/lpc/body/male_shoot.png'));
  const imgBodyMaleSit = useImage(require('../../assets/sprites/lpc/body/male_sit.png'));
  const imgBodyMaleSpellcast = useImage(require('../../assets/sprites/lpc/body/male_spellcast.png'));
  const imgBodyMaleThrust = useImage(require('../../assets/sprites/lpc/body/male_thrust.png'));
  const imgBodyFemaleBackslash = useImage(require('../../assets/sprites/lpc/body/female_backslash.png'));
  const imgBodyFemaleClimb = useImage(require('../../assets/sprites/lpc/body/female_climb.png'));
  const imgBodyFemaleCombatidle = useImage(require('../../assets/sprites/lpc/body/female_combat_idle.png'));
  const imgBodyFemaleEmote = useImage(require('../../assets/sprites/lpc/body/female_emote.png'));
  const imgBodyFemaleHalfslash = useImage(require('../../assets/sprites/lpc/body/female_halfslash.png'));
  const imgBodyFemaleJump = useImage(require('../../assets/sprites/lpc/body/female_jump.png'));
  const imgBodyFemaleRun = useImage(require('../../assets/sprites/lpc/body/female_run.png'));
  const imgBodyFemaleShoot = useImage(require('../../assets/sprites/lpc/body/female_shoot.png'));
  const imgBodyFemaleSit = useImage(require('../../assets/sprites/lpc/body/female_sit.png'));
  const imgBodyFemaleSpellcast = useImage(require('../../assets/sprites/lpc/body/female_spellcast.png'));
  const imgBodyFemaleThrust = useImage(require('../../assets/sprites/lpc/body/female_thrust.png'));
  const imgHairBobBackslash = useImage(require('../../assets/sprites/lpc/hair/bob_backslash.png'));
  const imgHairBobClimb = useImage(require('../../assets/sprites/lpc/hair/bob_climb.png'));
  const imgHairBobCombatidle = useImage(require('../../assets/sprites/lpc/hair/bob_combat_idle.png'));
  const imgHairBobEmote = useImage(require('../../assets/sprites/lpc/hair/bob_emote.png'));
  const imgHairBobHalfslash = useImage(require('../../assets/sprites/lpc/hair/bob_halfslash.png'));
  const imgHairBobJump = useImage(require('../../assets/sprites/lpc/hair/bob_jump.png'));
  const imgHairBobRun = useImage(require('../../assets/sprites/lpc/hair/bob_run.png'));
  const imgHairBobShoot = useImage(require('../../assets/sprites/lpc/hair/bob_shoot.png'));
  const imgHairBobSit = useImage(require('../../assets/sprites/lpc/hair/bob_sit.png'));
  const imgHairBobSpellcast = useImage(require('../../assets/sprites/lpc/hair/bob_spellcast.png'));
  const imgHairBobThrust = useImage(require('../../assets/sprites/lpc/hair/bob_thrust.png'));
  const imgHairBraidBackslash = useImage(require('../../assets/sprites/lpc/hair/braid_backslash.png'));
  const imgHairBraidClimb = useImage(require('../../assets/sprites/lpc/hair/braid_climb.png'));
  const imgHairBraidCombatidle = useImage(require('../../assets/sprites/lpc/hair/braid_combat_idle.png'));
  const imgHairBraidEmote = useImage(require('../../assets/sprites/lpc/hair/braid_emote.png'));
  const imgHairBraidHalfslash = useImage(require('../../assets/sprites/lpc/hair/braid_halfslash.png'));
  const imgHairBraidJump = useImage(require('../../assets/sprites/lpc/hair/braid_jump.png'));
  const imgHairBraidRun = useImage(require('../../assets/sprites/lpc/hair/braid_run.png'));
  const imgHairBraidShoot = useImage(require('../../assets/sprites/lpc/hair/braid_shoot.png'));
  const imgHairBraidSit = useImage(require('../../assets/sprites/lpc/hair/braid_sit.png'));
  const imgHairBraidSpellcast = useImage(require('../../assets/sprites/lpc/hair/braid_spellcast.png'));
  const imgHairBraidThrust = useImage(require('../../assets/sprites/lpc/hair/braid_thrust.png'));
  const imgHairBangsBackslash = useImage(require('../../assets/sprites/lpc/hair/bangs_backslash.png'));
  const imgHairBangsClimb = useImage(require('../../assets/sprites/lpc/hair/bangs_climb.png'));
  const imgHairBangsCombatidle = useImage(require('../../assets/sprites/lpc/hair/bangs_combat_idle.png'));
  const imgHairBangsEmote = useImage(require('../../assets/sprites/lpc/hair/bangs_emote.png'));
  const imgHairBangsHalfslash = useImage(require('../../assets/sprites/lpc/hair/bangs_halfslash.png'));
  const imgHairBangsJump = useImage(require('../../assets/sprites/lpc/hair/bangs_jump.png'));
  const imgHairBangsRun = useImage(require('../../assets/sprites/lpc/hair/bangs_run.png'));
  const imgHairBangsShoot = useImage(require('../../assets/sprites/lpc/hair/bangs_shoot.png'));
  const imgHairBangsSit = useImage(require('../../assets/sprites/lpc/hair/bangs_sit.png'));
  const imgHairBangsSpellcast = useImage(require('../../assets/sprites/lpc/hair/bangs_spellcast.png'));
  const imgHairBangsThrust = useImage(require('../../assets/sprites/lpc/hair/bangs_thrust.png'));
  const imgHairAfroBackslash = useImage(require('../../assets/sprites/lpc/hair/afro_backslash.png'));
  const imgHairAfroClimb = useImage(require('../../assets/sprites/lpc/hair/afro_climb.png'));
  const imgHairAfroCombatidle = useImage(require('../../assets/sprites/lpc/hair/afro_combat_idle.png'));
  const imgHairAfroEmote = useImage(require('../../assets/sprites/lpc/hair/afro_emote.png'));
  const imgHairAfroHalfslash = useImage(require('../../assets/sprites/lpc/hair/afro_halfslash.png'));
  const imgHairAfroJump = useImage(require('../../assets/sprites/lpc/hair/afro_jump.png'));
  const imgHairAfroRun = useImage(require('../../assets/sprites/lpc/hair/afro_run.png'));
  const imgHairAfroShoot = useImage(require('../../assets/sprites/lpc/hair/afro_shoot.png'));
  const imgHairAfroSit = useImage(require('../../assets/sprites/lpc/hair/afro_sit.png'));
  const imgHairAfroSpellcast = useImage(require('../../assets/sprites/lpc/hair/afro_spellcast.png'));
  const imgHairAfroThrust = useImage(require('../../assets/sprites/lpc/hair/afro_thrust.png'));
  const imgHairBuzzcutBackslash = useImage(require('../../assets/sprites/lpc/hair/buzzcut_backslash.png'));
  const imgHairBuzzcutClimb = useImage(require('../../assets/sprites/lpc/hair/buzzcut_climb.png'));
  const imgHairBuzzcutCombatidle = useImage(require('../../assets/sprites/lpc/hair/buzzcut_combat_idle.png'));
  const imgHairBuzzcutEmote = useImage(require('../../assets/sprites/lpc/hair/buzzcut_emote.png'));
  const imgHairBuzzcutHalfslash = useImage(require('../../assets/sprites/lpc/hair/buzzcut_halfslash.png'));
  const imgHairBuzzcutJump = useImage(require('../../assets/sprites/lpc/hair/buzzcut_jump.png'));
  const imgHairBuzzcutRun = useImage(require('../../assets/sprites/lpc/hair/buzzcut_run.png'));
  const imgHairBuzzcutShoot = useImage(require('../../assets/sprites/lpc/hair/buzzcut_shoot.png'));
  const imgHairBuzzcutSit = useImage(require('../../assets/sprites/lpc/hair/buzzcut_sit.png'));
  const imgHairBuzzcutSpellcast = useImage(require('../../assets/sprites/lpc/hair/buzzcut_spellcast.png'));
  const imgHairBuzzcutThrust = useImage(require('../../assets/sprites/lpc/hair/buzzcut_thrust.png'));
  const imgHairCornrowsBackslash = useImage(require('../../assets/sprites/lpc/hair/cornrows_backslash.png'));
  const imgHairCornrowsClimb = useImage(require('../../assets/sprites/lpc/hair/cornrows_climb.png'));
  const imgHairCornrowsCombatidle = useImage(require('../../assets/sprites/lpc/hair/cornrows_combat_idle.png'));
  const imgHairCornrowsEmote = useImage(require('../../assets/sprites/lpc/hair/cornrows_emote.png'));
  const imgHairCornrowsHalfslash = useImage(require('../../assets/sprites/lpc/hair/cornrows_halfslash.png'));
  const imgHairCornrowsJump = useImage(require('../../assets/sprites/lpc/hair/cornrows_jump.png'));
  const imgHairCornrowsRun = useImage(require('../../assets/sprites/lpc/hair/cornrows_run.png'));
  const imgHairCornrowsShoot = useImage(require('../../assets/sprites/lpc/hair/cornrows_shoot.png'));
  const imgHairCornrowsSit = useImage(require('../../assets/sprites/lpc/hair/cornrows_sit.png'));
  const imgHairCornrowsSpellcast = useImage(require('../../assets/sprites/lpc/hair/cornrows_spellcast.png'));
  const imgHairCornrowsThrust = useImage(require('../../assets/sprites/lpc/hair/cornrows_thrust.png'));
  const imgHairCurlyBackslash = useImage(require('../../assets/sprites/lpc/hair/curly_backslash.png'));
  const imgHairCurlyClimb = useImage(require('../../assets/sprites/lpc/hair/curly_climb.png'));
  const imgHairCurlyCombatidle = useImage(require('../../assets/sprites/lpc/hair/curly_combat_idle.png'));
  const imgHairCurlyEmote = useImage(require('../../assets/sprites/lpc/hair/curly_emote.png'));
  const imgHairCurlyHalfslash = useImage(require('../../assets/sprites/lpc/hair/curly_halfslash.png'));
  const imgHairCurlyJump = useImage(require('../../assets/sprites/lpc/hair/curly_jump.png'));
  const imgHairCurlyRun = useImage(require('../../assets/sprites/lpc/hair/curly_run.png'));
  const imgHairCurlyShoot = useImage(require('../../assets/sprites/lpc/hair/curly_shoot.png'));
  const imgHairCurlySit = useImage(require('../../assets/sprites/lpc/hair/curly_sit.png'));
  const imgHairCurlySpellcast = useImage(require('../../assets/sprites/lpc/hair/curly_spellcast.png'));
  const imgHairCurlyThrust = useImage(require('../../assets/sprites/lpc/hair/curly_thrust.png'));
  const imgHairLongBackslash = useImage(require('../../assets/sprites/lpc/hair/long_backslash.png'));
  const imgHairLongClimb = useImage(require('../../assets/sprites/lpc/hair/long_climb.png'));
  const imgHairLongCombatidle = useImage(require('../../assets/sprites/lpc/hair/long_combat_idle.png'));
  const imgHairLongEmote = useImage(require('../../assets/sprites/lpc/hair/long_emote.png'));
  const imgHairLongHalfslash = useImage(require('../../assets/sprites/lpc/hair/long_halfslash.png'));
  const imgHairLongJump = useImage(require('../../assets/sprites/lpc/hair/long_jump.png'));
  const imgHairLongRun = useImage(require('../../assets/sprites/lpc/hair/long_run.png'));
  const imgHairLongShoot = useImage(require('../../assets/sprites/lpc/hair/long_shoot.png'));
  const imgHairLongSit = useImage(require('../../assets/sprites/lpc/hair/long_sit.png'));
  const imgHairLongSpellcast = useImage(require('../../assets/sprites/lpc/hair/long_spellcast.png'));
  const imgHairLongThrust = useImage(require('../../assets/sprites/lpc/hair/long_thrust.png'));
  const imgTorsoTshirtBackslash = useImage(require('../../assets/sprites/lpc/torso/tshirt_backslash.png'));
  const imgTorsoTshirtClimb = useImage(require('../../assets/sprites/lpc/torso/tshirt_climb.png'));
  const imgTorsoTshirtCombatidle = useImage(require('../../assets/sprites/lpc/torso/tshirt_combat_idle.png'));
  const imgTorsoTshirtEmote = useImage(require('../../assets/sprites/lpc/torso/tshirt_emote.png'));
  const imgTorsoTshirtHalfslash = useImage(require('../../assets/sprites/lpc/torso/tshirt_halfslash.png'));
  const imgTorsoTshirtJump = useImage(require('../../assets/sprites/lpc/torso/tshirt_jump.png'));
  const imgTorsoTshirtRun = useImage(require('../../assets/sprites/lpc/torso/tshirt_run.png'));
  const imgTorsoTshirtShoot = useImage(require('../../assets/sprites/lpc/torso/tshirt_shoot.png'));
  const imgTorsoTshirtSit = useImage(require('../../assets/sprites/lpc/torso/tshirt_sit.png'));
  const imgTorsoTshirtSpellcast = useImage(require('../../assets/sprites/lpc/torso/tshirt_spellcast.png'));
  const imgTorsoTshirtThrust = useImage(require('../../assets/sprites/lpc/torso/tshirt_thrust.png'));
  const imgTorsoLeatherClimb = useImage(require('../../assets/sprites/lpc/torso/leather_climb.png'));
  const imgTorsoLeatherEmote = useImage(require('../../assets/sprites/lpc/torso/leather_emote.png'));
  const imgTorsoLeatherJump = useImage(require('../../assets/sprites/lpc/torso/leather_jump.png'));
  const imgTorsoLeatherShoot = useImage(require('../../assets/sprites/lpc/torso/leather_shoot.png'));
  const imgTorsoLeatherSit = useImage(require('../../assets/sprites/lpc/torso/leather_sit.png'));
  const imgTorsoLeatherSpellcast = useImage(require('../../assets/sprites/lpc/torso/leather_spellcast.png'));
  const imgTorsoLeatherThrust = useImage(require('../../assets/sprites/lpc/torso/leather_thrust.png'));
  const imgTorsoPlateBackslash = useImage(require('../../assets/sprites/lpc/torso/plate_backslash.png'));
  const imgTorsoPlateClimb = useImage(require('../../assets/sprites/lpc/torso/plate_climb.png'));
  const imgTorsoPlateCombatidle = useImage(require('../../assets/sprites/lpc/torso/plate_combat_idle.png'));
  const imgTorsoPlateEmote = useImage(require('../../assets/sprites/lpc/torso/plate_emote.png'));
  const imgTorsoPlateHalfslash = useImage(require('../../assets/sprites/lpc/torso/plate_halfslash.png'));
  const imgTorsoPlateJump = useImage(require('../../assets/sprites/lpc/torso/plate_jump.png'));
  const imgTorsoPlateRun = useImage(require('../../assets/sprites/lpc/torso/plate_run.png'));
  const imgTorsoPlateShoot = useImage(require('../../assets/sprites/lpc/torso/plate_shoot.png'));
  const imgTorsoPlateSit = useImage(require('../../assets/sprites/lpc/torso/plate_sit.png'));
  const imgTorsoPlateSpellcast = useImage(require('../../assets/sprites/lpc/torso/plate_spellcast.png'));
  const imgTorsoPlateThrust = useImage(require('../../assets/sprites/lpc/torso/plate_thrust.png'));
  const imgLegsPantsBackslash = useImage(require('../../assets/sprites/lpc/legs/pants_backslash.png'));
  const imgLegsPantsClimb = useImage(require('../../assets/sprites/lpc/legs/pants_climb.png'));
  const imgLegsPantsCombatidle = useImage(require('../../assets/sprites/lpc/legs/pants_combat_idle.png'));
  const imgLegsPantsEmote = useImage(require('../../assets/sprites/lpc/legs/pants_emote.png'));
  const imgLegsPantsHalfslash = useImage(require('../../assets/sprites/lpc/legs/pants_halfslash.png'));
  const imgLegsPantsJump = useImage(require('../../assets/sprites/lpc/legs/pants_jump.png'));
  const imgLegsPantsRun = useImage(require('../../assets/sprites/lpc/legs/pants_run.png'));
  const imgLegsPantsShoot = useImage(require('../../assets/sprites/lpc/legs/pants_shoot.png'));
  const imgLegsPantsSit = useImage(require('../../assets/sprites/lpc/legs/pants_sit.png'));
  const imgLegsPantsSpellcast = useImage(require('../../assets/sprites/lpc/legs/pants_spellcast.png'));
  const imgLegsPantsThrust = useImage(require('../../assets/sprites/lpc/legs/pants_thrust.png'));
  const imgLegsShortsBackslash = useImage(require('../../assets/sprites/lpc/legs/shorts_backslash.png'));
  const imgLegsShortsClimb = useImage(require('../../assets/sprites/lpc/legs/shorts_climb.png'));
  const imgLegsShortsCombatidle = useImage(require('../../assets/sprites/lpc/legs/shorts_combat_idle.png'));
  const imgLegsShortsEmote = useImage(require('../../assets/sprites/lpc/legs/shorts_emote.png'));
  const imgLegsShortsHalfslash = useImage(require('../../assets/sprites/lpc/legs/shorts_halfslash.png'));
  const imgLegsShortsJump = useImage(require('../../assets/sprites/lpc/legs/shorts_jump.png'));
  const imgLegsShortsRun = useImage(require('../../assets/sprites/lpc/legs/shorts_run.png'));
  const imgLegsShortsShoot = useImage(require('../../assets/sprites/lpc/legs/shorts_shoot.png'));
  const imgLegsShortsSit = useImage(require('../../assets/sprites/lpc/legs/shorts_sit.png'));
  const imgLegsShortsSpellcast = useImage(require('../../assets/sprites/lpc/legs/shorts_spellcast.png'));
  const imgLegsShortsThrust = useImage(require('../../assets/sprites/lpc/legs/shorts_thrust.png'));
  const imgFeetBootsBackslash = useImage(require('../../assets/sprites/lpc/feet/boots_backslash.png'));
  const imgFeetBootsClimb = useImage(require('../../assets/sprites/lpc/feet/boots_climb.png'));
  const imgFeetBootsCombatidle = useImage(require('../../assets/sprites/lpc/feet/boots_combat_idle.png'));
  const imgFeetBootsEmote = useImage(require('../../assets/sprites/lpc/feet/boots_emote.png'));
  const imgFeetBootsHalfslash = useImage(require('../../assets/sprites/lpc/feet/boots_halfslash.png'));
  const imgFeetBootsJump = useImage(require('../../assets/sprites/lpc/feet/boots_jump.png'));
  const imgFeetBootsRun = useImage(require('../../assets/sprites/lpc/feet/boots_run.png'));
  const imgFeetBootsShoot = useImage(require('../../assets/sprites/lpc/feet/boots_shoot.png'));
  const imgFeetBootsSit = useImage(require('../../assets/sprites/lpc/feet/boots_sit.png'));
  const imgFeetBootsSpellcast = useImage(require('../../assets/sprites/lpc/feet/boots_spellcast.png'));
  const imgFeetBootsThrust = useImage(require('../../assets/sprites/lpc/feet/boots_thrust.png'));

  // ── Table de lookup des images chargées ──────────────────────────────
  const imgsRef = useRef({});
  useEffect(() => {
    const c = imgsRef.current;
    // body
    if (imgBodyMaleWalk)     c['body_male_walk']      = imgBodyMaleWalk;
    if (imgBodyMaleIdle)     c['body_male_idle']      = imgBodyMaleIdle;
    if (imgBodyMaleSlash)    c['body_male_slash']     = imgBodyMaleSlash;
    if (imgBodyMaleHurt)     c['body_male_hurt']      = imgBodyMaleHurt;
    if (imgBodyFemaleWalk)   c['body_female_walk']    = imgBodyFemaleWalk;
    if (imgBodyFemaleIdle)   c['body_female_idle']    = imgBodyFemaleIdle;
    if (imgBodyFemaleSlash)  c['body_female_slash']   = imgBodyFemaleSlash;
    if (imgBodyFemaleHurt)   c['body_female_hurt']    = imgBodyFemaleHurt;
    // hair
    if (imgHairBobWalk)      c['hair_bob_walk']       = imgHairBobWalk;
    if (imgHairBobIdle)      c['hair_bob_idle']       = imgHairBobIdle;
    if (imgHairBobSlash)     c['hair_bob_slash']      = imgHairBobSlash;
    if (imgHairBobHurt)      c['hair_bob_hurt']       = imgHairBobHurt;
    if (imgHairBraidWalk)    c['hair_braid_walk']     = imgHairBraidWalk;
    if (imgHairBraidIdle)    c['hair_braid_idle']     = imgHairBraidIdle;
    if (imgHairBraidSlash)   c['hair_braid_slash']    = imgHairBraidSlash;
    if (imgHairBraidHurt)    c['hair_braid_hurt']     = imgHairBraidHurt;
    if (imgHairBangsWalk)    c['hair_bangs_walk']     = imgHairBangsWalk;
    if (imgHairBangsIdle)    c['hair_bangs_idle']     = imgHairBangsIdle;
    if (imgHairBangsSlash)   c['hair_bangs_slash']    = imgHairBangsSlash;
    if (imgHairBangsHurt)    c['hair_bangs_hurt']     = imgHairBangsHurt;
    if (imgHairAfroWalk)     c['hair_afro_walk']      = imgHairAfroWalk;
    if (imgHairAfroIdle)     c['hair_afro_idle']      = imgHairAfroIdle;
    if (imgHairAfroSlash)    c['hair_afro_slash']     = imgHairAfroSlash;
    if (imgHairAfroHurt)     c['hair_afro_hurt']      = imgHairAfroHurt;
    if (imgHairBuzzcutWalk)  c['hair_buzzcut_walk']   = imgHairBuzzcutWalk;
    if (imgHairBuzzcutIdle)  c['hair_buzzcut_idle']   = imgHairBuzzcutIdle;
    if (imgHairBuzzcutSlash) c['hair_buzzcut_slash']  = imgHairBuzzcutSlash;
    if (imgHairBuzzcutHurt)  c['hair_buzzcut_hurt']   = imgHairBuzzcutHurt;
    if (imgHairCornrowsWalk) c['hair_cornrows_walk']  = imgHairCornrowsWalk;
    if (imgHairCornrowsIdle) c['hair_cornrows_idle']  = imgHairCornrowsIdle;
    if (imgHairCornrowsSlash)c['hair_cornrows_slash'] = imgHairCornrowsSlash;
    if (imgHairCornrowsHurt) c['hair_cornrows_hurt']  = imgHairCornrowsHurt;
    if (imgHairCurlyWalk)    c['hair_curly_walk']     = imgHairCurlyWalk;
    if (imgHairCurlyIdle)    c['hair_curly_idle']     = imgHairCurlyIdle;
    if (imgHairCurlySlash)   c['hair_curly_slash']    = imgHairCurlySlash;
    if (imgHairCurlyHurt)    c['hair_curly_hurt']     = imgHairCurlyHurt;
    if (imgHairLongWalk)     c['hair_long_walk']      = imgHairLongWalk;
    if (imgHairLongIdle)     c['hair_long_idle']      = imgHairLongIdle;
    if (imgHairLongSlash)    c['hair_long_slash']     = imgHairLongSlash;
    if (imgHairLongHurt)     c['hair_long_hurt']      = imgHairLongHurt;
    // torso
    if (imgTorsoShirtWalk)   c['torso_shirt_walk']    = imgTorsoShirtWalk;
    if (imgTorsoShirtIdle)   c['torso_shirt_idle']    = imgTorsoShirtIdle;
    if (imgTorsoShirtSlash)  c['torso_shirt_slash']   = imgTorsoShirtSlash;
    if (imgTorsoShirtHurt)   c['torso_shirt_hurt']    = imgTorsoShirtHurt;
    if (imgTorsoTshirtWalk)  c['torso_tshirt_walk']   = imgTorsoTshirtWalk;
    if (imgTorsoTshirtIdle)  c['torso_tshirt_idle']   = imgTorsoTshirtIdle;
    if (imgTorsoTshirtSlash) c['torso_tshirt_slash']  = imgTorsoTshirtSlash;
    if (imgTorsoTshirtHurt)  c['torso_tshirt_hurt']   = imgTorsoTshirtHurt;
    if (imgTorsoLeatherWalk) c['torso_leather_walk']  = imgTorsoLeatherWalk;
    if (imgTorsoLeatherIdle) c['torso_leather_idle']  = imgTorsoLeatherIdle;
    if (imgTorsoLeatherSlash)c['torso_leather_slash'] = imgTorsoLeatherSlash;
    if (imgTorsoLeatherHurt) c['torso_leather_hurt']  = imgTorsoLeatherHurt;
    if (imgTorsoPlateWalk)   c['torso_plate_walk']    = imgTorsoPlateWalk;
    if (imgTorsoPlateIdle)   c['torso_plate_idle']    = imgTorsoPlateIdle;
    if (imgTorsoPlateSlash)  c['torso_plate_slash']   = imgTorsoPlateSlash;
    if (imgTorsoPlateHurt)   c['torso_plate_hurt']    = imgTorsoPlateHurt;
    // legs
    if (imgLegsPantsWalk)    c['legs_pants_walk']     = imgLegsPantsWalk;
    if (imgLegsPantsIdle)    c['legs_pants_idle']     = imgLegsPantsIdle;
    if (imgLegsPantsSlash)   c['legs_pants_slash']    = imgLegsPantsSlash;
    if (imgLegsPantsHurt)    c['legs_pants_hurt']     = imgLegsPantsHurt;
    if (imgLegsShortsWalk)   c['legs_shorts_walk']    = imgLegsShortsWalk;
    if (imgLegsShortsIdle)   c['legs_shorts_idle']    = imgLegsShortsIdle;
    if (imgLegsShortsSlash)  c['legs_shorts_slash']   = imgLegsShortsSlash;
    if (imgLegsShortsHurt)   c['legs_shorts_hurt']    = imgLegsShortsHurt;
    // feet
    if (imgFeetBootsWalk)    c['feet_boots_walk']     = imgFeetBootsWalk;
    if (imgFeetBootsIdle)    c['feet_boots_idle']     = imgFeetBootsIdle;
    if (imgFeetBootsSlash)   c['feet_boots_slash']    = imgFeetBootsSlash;
    if (imgFeetBootsHurt)    c['feet_boots_hurt']     = imgFeetBootsHurt;
    if (imgBodyMaleBackslash) c['body_male_backslash'] = imgBodyMaleBackslash;
    if (imgBodyMaleClimb) c['body_male_climb'] = imgBodyMaleClimb;
    if (imgBodyMaleCombatidle) c['body_male_combat_idle'] = imgBodyMaleCombatidle;
    if (imgBodyMaleEmote) c['body_male_emote'] = imgBodyMaleEmote;
    if (imgBodyMaleHalfslash) c['body_male_halfslash'] = imgBodyMaleHalfslash;
    if (imgBodyMaleJump) c['body_male_jump'] = imgBodyMaleJump;
    if (imgBodyMaleRun) c['body_male_run'] = imgBodyMaleRun;
    if (imgBodyMaleShoot) c['body_male_shoot'] = imgBodyMaleShoot;
    if (imgBodyMaleSit) c['body_male_sit'] = imgBodyMaleSit;
    if (imgBodyMaleSpellcast) c['body_male_spellcast'] = imgBodyMaleSpellcast;
    if (imgBodyMaleThrust) c['body_male_thrust'] = imgBodyMaleThrust;
    if (imgBodyFemaleBackslash) c['body_female_backslash'] = imgBodyFemaleBackslash;
    if (imgBodyFemaleClimb) c['body_female_climb'] = imgBodyFemaleClimb;
    if (imgBodyFemaleCombatidle) c['body_female_combat_idle'] = imgBodyFemaleCombatidle;
    if (imgBodyFemaleEmote) c['body_female_emote'] = imgBodyFemaleEmote;
    if (imgBodyFemaleHalfslash) c['body_female_halfslash'] = imgBodyFemaleHalfslash;
    if (imgBodyFemaleJump) c['body_female_jump'] = imgBodyFemaleJump;
    if (imgBodyFemaleRun) c['body_female_run'] = imgBodyFemaleRun;
    if (imgBodyFemaleShoot) c['body_female_shoot'] = imgBodyFemaleShoot;
    if (imgBodyFemaleSit) c['body_female_sit'] = imgBodyFemaleSit;
    if (imgBodyFemaleSpellcast) c['body_female_spellcast'] = imgBodyFemaleSpellcast;
    if (imgBodyFemaleThrust) c['body_female_thrust'] = imgBodyFemaleThrust;
    if (imgHairBobBackslash) c['hair_bob_backslash'] = imgHairBobBackslash;
    if (imgHairBobClimb) c['hair_bob_climb'] = imgHairBobClimb;
    if (imgHairBobCombatidle) c['hair_bob_combat_idle'] = imgHairBobCombatidle;
    if (imgHairBobEmote) c['hair_bob_emote'] = imgHairBobEmote;
    if (imgHairBobHalfslash) c['hair_bob_halfslash'] = imgHairBobHalfslash;
    if (imgHairBobJump) c['hair_bob_jump'] = imgHairBobJump;
    if (imgHairBobRun) c['hair_bob_run'] = imgHairBobRun;
    if (imgHairBobShoot) c['hair_bob_shoot'] = imgHairBobShoot;
    if (imgHairBobSit) c['hair_bob_sit'] = imgHairBobSit;
    if (imgHairBobSpellcast) c['hair_bob_spellcast'] = imgHairBobSpellcast;
    if (imgHairBobThrust) c['hair_bob_thrust'] = imgHairBobThrust;
    if (imgHairBraidBackslash) c['hair_braid_backslash'] = imgHairBraidBackslash;
    if (imgHairBraidClimb) c['hair_braid_climb'] = imgHairBraidClimb;
    if (imgHairBraidCombatidle) c['hair_braid_combat_idle'] = imgHairBraidCombatidle;
    if (imgHairBraidEmote) c['hair_braid_emote'] = imgHairBraidEmote;
    if (imgHairBraidHalfslash) c['hair_braid_halfslash'] = imgHairBraidHalfslash;
    if (imgHairBraidJump) c['hair_braid_jump'] = imgHairBraidJump;
    if (imgHairBraidRun) c['hair_braid_run'] = imgHairBraidRun;
    if (imgHairBraidShoot) c['hair_braid_shoot'] = imgHairBraidShoot;
    if (imgHairBraidSit) c['hair_braid_sit'] = imgHairBraidSit;
    if (imgHairBraidSpellcast) c['hair_braid_spellcast'] = imgHairBraidSpellcast;
    if (imgHairBraidThrust) c['hair_braid_thrust'] = imgHairBraidThrust;
    if (imgHairBangsBackslash) c['hair_bangs_backslash'] = imgHairBangsBackslash;
    if (imgHairBangsClimb) c['hair_bangs_climb'] = imgHairBangsClimb;
    if (imgHairBangsCombatidle) c['hair_bangs_combat_idle'] = imgHairBangsCombatidle;
    if (imgHairBangsEmote) c['hair_bangs_emote'] = imgHairBangsEmote;
    if (imgHairBangsHalfslash) c['hair_bangs_halfslash'] = imgHairBangsHalfslash;
    if (imgHairBangsJump) c['hair_bangs_jump'] = imgHairBangsJump;
    if (imgHairBangsRun) c['hair_bangs_run'] = imgHairBangsRun;
    if (imgHairBangsShoot) c['hair_bangs_shoot'] = imgHairBangsShoot;
    if (imgHairBangsSit) c['hair_bangs_sit'] = imgHairBangsSit;
    if (imgHairBangsSpellcast) c['hair_bangs_spellcast'] = imgHairBangsSpellcast;
    if (imgHairBangsThrust) c['hair_bangs_thrust'] = imgHairBangsThrust;
    if (imgHairAfroBackslash) c['hair_afro_backslash'] = imgHairAfroBackslash;
    if (imgHairAfroClimb) c['hair_afro_climb'] = imgHairAfroClimb;
    if (imgHairAfroCombatidle) c['hair_afro_combat_idle'] = imgHairAfroCombatidle;
    if (imgHairAfroEmote) c['hair_afro_emote'] = imgHairAfroEmote;
    if (imgHairAfroHalfslash) c['hair_afro_halfslash'] = imgHairAfroHalfslash;
    if (imgHairAfroJump) c['hair_afro_jump'] = imgHairAfroJump;
    if (imgHairAfroRun) c['hair_afro_run'] = imgHairAfroRun;
    if (imgHairAfroShoot) c['hair_afro_shoot'] = imgHairAfroShoot;
    if (imgHairAfroSit) c['hair_afro_sit'] = imgHairAfroSit;
    if (imgHairAfroSpellcast) c['hair_afro_spellcast'] = imgHairAfroSpellcast;
    if (imgHairAfroThrust) c['hair_afro_thrust'] = imgHairAfroThrust;
    if (imgHairBuzzcutBackslash) c['hair_buzzcut_backslash'] = imgHairBuzzcutBackslash;
    if (imgHairBuzzcutClimb) c['hair_buzzcut_climb'] = imgHairBuzzcutClimb;
    if (imgHairBuzzcutCombatidle) c['hair_buzzcut_combat_idle'] = imgHairBuzzcutCombatidle;
    if (imgHairBuzzcutEmote) c['hair_buzzcut_emote'] = imgHairBuzzcutEmote;
    if (imgHairBuzzcutHalfslash) c['hair_buzzcut_halfslash'] = imgHairBuzzcutHalfslash;
    if (imgHairBuzzcutJump) c['hair_buzzcut_jump'] = imgHairBuzzcutJump;
    if (imgHairBuzzcutRun) c['hair_buzzcut_run'] = imgHairBuzzcutRun;
    if (imgHairBuzzcutShoot) c['hair_buzzcut_shoot'] = imgHairBuzzcutShoot;
    if (imgHairBuzzcutSit) c['hair_buzzcut_sit'] = imgHairBuzzcutSit;
    if (imgHairBuzzcutSpellcast) c['hair_buzzcut_spellcast'] = imgHairBuzzcutSpellcast;
    if (imgHairBuzzcutThrust) c['hair_buzzcut_thrust'] = imgHairBuzzcutThrust;
    if (imgHairCornrowsBackslash) c['hair_cornrows_backslash'] = imgHairCornrowsBackslash;
    if (imgHairCornrowsClimb) c['hair_cornrows_climb'] = imgHairCornrowsClimb;
    if (imgHairCornrowsCombatidle) c['hair_cornrows_combat_idle'] = imgHairCornrowsCombatidle;
    if (imgHairCornrowsEmote) c['hair_cornrows_emote'] = imgHairCornrowsEmote;
    if (imgHairCornrowsHalfslash) c['hair_cornrows_halfslash'] = imgHairCornrowsHalfslash;
    if (imgHairCornrowsJump) c['hair_cornrows_jump'] = imgHairCornrowsJump;
    if (imgHairCornrowsRun) c['hair_cornrows_run'] = imgHairCornrowsRun;
    if (imgHairCornrowsShoot) c['hair_cornrows_shoot'] = imgHairCornrowsShoot;
    if (imgHairCornrowsSit) c['hair_cornrows_sit'] = imgHairCornrowsSit;
    if (imgHairCornrowsSpellcast) c['hair_cornrows_spellcast'] = imgHairCornrowsSpellcast;
    if (imgHairCornrowsThrust) c['hair_cornrows_thrust'] = imgHairCornrowsThrust;
    if (imgHairCurlyBackslash) c['hair_curly_backslash'] = imgHairCurlyBackslash;
    if (imgHairCurlyClimb) c['hair_curly_climb'] = imgHairCurlyClimb;
    if (imgHairCurlyCombatidle) c['hair_curly_combat_idle'] = imgHairCurlyCombatidle;
    if (imgHairCurlyEmote) c['hair_curly_emote'] = imgHairCurlyEmote;
    if (imgHairCurlyHalfslash) c['hair_curly_halfslash'] = imgHairCurlyHalfslash;
    if (imgHairCurlyJump) c['hair_curly_jump'] = imgHairCurlyJump;
    if (imgHairCurlyRun) c['hair_curly_run'] = imgHairCurlyRun;
    if (imgHairCurlyShoot) c['hair_curly_shoot'] = imgHairCurlyShoot;
    if (imgHairCurlySit) c['hair_curly_sit'] = imgHairCurlySit;
    if (imgHairCurlySpellcast) c['hair_curly_spellcast'] = imgHairCurlySpellcast;
    if (imgHairCurlyThrust) c['hair_curly_thrust'] = imgHairCurlyThrust;
    if (imgHairLongBackslash) c['hair_long_backslash'] = imgHairLongBackslash;
    if (imgHairLongClimb) c['hair_long_climb'] = imgHairLongClimb;
    if (imgHairLongCombatidle) c['hair_long_combat_idle'] = imgHairLongCombatidle;
    if (imgHairLongEmote) c['hair_long_emote'] = imgHairLongEmote;
    if (imgHairLongHalfslash) c['hair_long_halfslash'] = imgHairLongHalfslash;
    if (imgHairLongJump) c['hair_long_jump'] = imgHairLongJump;
    if (imgHairLongRun) c['hair_long_run'] = imgHairLongRun;
    if (imgHairLongShoot) c['hair_long_shoot'] = imgHairLongShoot;
    if (imgHairLongSit) c['hair_long_sit'] = imgHairLongSit;
    if (imgHairLongSpellcast) c['hair_long_spellcast'] = imgHairLongSpellcast;
    if (imgHairLongThrust) c['hair_long_thrust'] = imgHairLongThrust;
    if (imgTorsoTshirtBackslash) c['torso_tshirt_backslash'] = imgTorsoTshirtBackslash;
    if (imgTorsoTshirtClimb) c['torso_tshirt_climb'] = imgTorsoTshirtClimb;
    if (imgTorsoTshirtCombatidle) c['torso_tshirt_combat_idle'] = imgTorsoTshirtCombatidle;
    if (imgTorsoTshirtEmote) c['torso_tshirt_emote'] = imgTorsoTshirtEmote;
    if (imgTorsoTshirtHalfslash) c['torso_tshirt_halfslash'] = imgTorsoTshirtHalfslash;
    if (imgTorsoTshirtJump) c['torso_tshirt_jump'] = imgTorsoTshirtJump;
    if (imgTorsoTshirtRun) c['torso_tshirt_run'] = imgTorsoTshirtRun;
    if (imgTorsoTshirtShoot) c['torso_tshirt_shoot'] = imgTorsoTshirtShoot;
    if (imgTorsoTshirtSit) c['torso_tshirt_sit'] = imgTorsoTshirtSit;
    if (imgTorsoTshirtSpellcast) c['torso_tshirt_spellcast'] = imgTorsoTshirtSpellcast;
    if (imgTorsoTshirtThrust) c['torso_tshirt_thrust'] = imgTorsoTshirtThrust;
    if (imgTorsoLeatherClimb) c['torso_leather_climb'] = imgTorsoLeatherClimb;
    if (imgTorsoLeatherEmote) c['torso_leather_emote'] = imgTorsoLeatherEmote;
    if (imgTorsoLeatherJump) c['torso_leather_jump'] = imgTorsoLeatherJump;
    if (imgTorsoLeatherShoot) c['torso_leather_shoot'] = imgTorsoLeatherShoot;
    if (imgTorsoLeatherSit) c['torso_leather_sit'] = imgTorsoLeatherSit;
    if (imgTorsoLeatherSpellcast) c['torso_leather_spellcast'] = imgTorsoLeatherSpellcast;
    if (imgTorsoLeatherThrust) c['torso_leather_thrust'] = imgTorsoLeatherThrust;
    if (imgTorsoPlateBackslash) c['torso_plate_backslash'] = imgTorsoPlateBackslash;
    if (imgTorsoPlateClimb) c['torso_plate_climb'] = imgTorsoPlateClimb;
    if (imgTorsoPlateCombatidle) c['torso_plate_combat_idle'] = imgTorsoPlateCombatidle;
    if (imgTorsoPlateEmote) c['torso_plate_emote'] = imgTorsoPlateEmote;
    if (imgTorsoPlateHalfslash) c['torso_plate_halfslash'] = imgTorsoPlateHalfslash;
    if (imgTorsoPlateJump) c['torso_plate_jump'] = imgTorsoPlateJump;
    if (imgTorsoPlateRun) c['torso_plate_run'] = imgTorsoPlateRun;
    if (imgTorsoPlateShoot) c['torso_plate_shoot'] = imgTorsoPlateShoot;
    if (imgTorsoPlateSit) c['torso_plate_sit'] = imgTorsoPlateSit;
    if (imgTorsoPlateSpellcast) c['torso_plate_spellcast'] = imgTorsoPlateSpellcast;
    if (imgTorsoPlateThrust) c['torso_plate_thrust'] = imgTorsoPlateThrust;
    if (imgLegsPantsBackslash) c['legs_pants_backslash'] = imgLegsPantsBackslash;
    if (imgLegsPantsClimb) c['legs_pants_climb'] = imgLegsPantsClimb;
    if (imgLegsPantsCombatidle) c['legs_pants_combat_idle'] = imgLegsPantsCombatidle;
    if (imgLegsPantsEmote) c['legs_pants_emote'] = imgLegsPantsEmote;
    if (imgLegsPantsHalfslash) c['legs_pants_halfslash'] = imgLegsPantsHalfslash;
    if (imgLegsPantsJump) c['legs_pants_jump'] = imgLegsPantsJump;
    if (imgLegsPantsRun) c['legs_pants_run'] = imgLegsPantsRun;
    if (imgLegsPantsShoot) c['legs_pants_shoot'] = imgLegsPantsShoot;
    if (imgLegsPantsSit) c['legs_pants_sit'] = imgLegsPantsSit;
    if (imgLegsPantsSpellcast) c['legs_pants_spellcast'] = imgLegsPantsSpellcast;
    if (imgLegsPantsThrust) c['legs_pants_thrust'] = imgLegsPantsThrust;
    if (imgLegsShortsBackslash) c['legs_shorts_backslash'] = imgLegsShortsBackslash;
    if (imgLegsShortsClimb) c['legs_shorts_climb'] = imgLegsShortsClimb;
    if (imgLegsShortsCombatidle) c['legs_shorts_combat_idle'] = imgLegsShortsCombatidle;
    if (imgLegsShortsEmote) c['legs_shorts_emote'] = imgLegsShortsEmote;
    if (imgLegsShortsHalfslash) c['legs_shorts_halfslash'] = imgLegsShortsHalfslash;
    if (imgLegsShortsJump) c['legs_shorts_jump'] = imgLegsShortsJump;
    if (imgLegsShortsRun) c['legs_shorts_run'] = imgLegsShortsRun;
    if (imgLegsShortsShoot) c['legs_shorts_shoot'] = imgLegsShortsShoot;
    if (imgLegsShortsSit) c['legs_shorts_sit'] = imgLegsShortsSit;
    if (imgLegsShortsSpellcast) c['legs_shorts_spellcast'] = imgLegsShortsSpellcast;
    if (imgLegsShortsThrust) c['legs_shorts_thrust'] = imgLegsShortsThrust;
    if (imgFeetBootsBackslash) c['feet_boots_backslash'] = imgFeetBootsBackslash;
    if (imgFeetBootsClimb) c['feet_boots_climb'] = imgFeetBootsClimb;
    if (imgFeetBootsCombatidle) c['feet_boots_combat_idle'] = imgFeetBootsCombatidle;
    if (imgFeetBootsEmote) c['feet_boots_emote'] = imgFeetBootsEmote;
    if (imgFeetBootsHalfslash) c['feet_boots_halfslash'] = imgFeetBootsHalfslash;
    if (imgFeetBootsJump) c['feet_boots_jump'] = imgFeetBootsJump;
    if (imgFeetBootsRun) c['feet_boots_run'] = imgFeetBootsRun;
    if (imgFeetBootsShoot) c['feet_boots_shoot'] = imgFeetBootsShoot;
    if (imgFeetBootsSit) c['feet_boots_sit'] = imgFeetBootsSit;
    if (imgFeetBootsSpellcast) c['feet_boots_spellcast'] = imgFeetBootsSpellcast;
    if (imgFeetBootsThrust) c['feet_boots_thrust'] = imgFeetBootsThrust;
  }, [
    imgBodyMaleWalk, imgBodyMaleIdle, imgBodyMaleSlash, imgBodyMaleHurt,
    imgBodyFemaleWalk, imgBodyFemaleIdle, imgBodyFemaleSlash, imgBodyFemaleHurt,
    imgHairBobWalk, imgHairBobIdle, imgHairBobSlash, imgHairBobHurt,
    imgHairBraidWalk, imgHairBraidIdle, imgHairBraidSlash, imgHairBraidHurt,
    imgHairBangsWalk, imgHairBangsIdle, imgHairBangsSlash, imgHairBangsHurt,
    imgHairAfroWalk, imgHairAfroIdle, imgHairAfroSlash, imgHairAfroHurt,
    imgHairBuzzcutWalk, imgHairBuzzcutIdle, imgHairBuzzcutSlash, imgHairBuzzcutHurt,
    imgHairCornrowsWalk, imgHairCornrowsIdle, imgHairCornrowsSlash, imgHairCornrowsHurt,
    imgHairCurlyWalk, imgHairCurlyIdle, imgHairCurlySlash, imgHairCurlyHurt,
    imgHairLongWalk, imgHairLongIdle, imgHairLongSlash, imgHairLongHurt,
    imgTorsoShirtWalk, imgTorsoShirtIdle, imgTorsoShirtSlash, imgTorsoShirtHurt,
    imgTorsoTshirtWalk, imgTorsoTshirtIdle, imgTorsoTshirtSlash, imgTorsoTshirtHurt,
    imgTorsoLeatherWalk, imgTorsoLeatherIdle, imgTorsoLeatherSlash, imgTorsoLeatherHurt,
    imgTorsoPlateWalk, imgTorsoPlateIdle, imgTorsoPlateSlash, imgTorsoPlateHurt,
    imgLegsPantsWalk, imgLegsPantsIdle, imgLegsPantsSlash, imgLegsPantsHurt,
    imgLegsShortsWalk, imgLegsShortsIdle, imgLegsShortsSlash, imgLegsShortsHurt,
    imgFeetBootsWalk, imgFeetBootsIdle, imgFeetBootsSlash, imgFeetBootsHurt,
    imgBodyMaleBackslash,imgBodyMaleClimb,imgBodyMaleCombatidle,imgBodyMaleEmote,imgBodyMaleHalfslash,imgBodyMaleJump,imgBodyMaleRun,imgBodyMaleShoot,imgBodyMaleSit,imgBodyMaleSpellcast,imgBodyMaleThrust,imgBodyFemaleBackslash,imgBodyFemaleClimb,imgBodyFemaleCombatidle,imgBodyFemaleEmote,imgBodyFemaleHalfslash,imgBodyFemaleJump,imgBodyFemaleRun,imgBodyFemaleShoot,imgBodyFemaleSit,imgBodyFemaleSpellcast,imgBodyFemaleThrust,imgHairBobBackslash,imgHairBobClimb,imgHairBobCombatidle,imgHairBobEmote,imgHairBobHalfslash,imgHairBobJump,imgHairBobRun,imgHairBobShoot,imgHairBobSit,imgHairBobSpellcast,imgHairBobThrust,imgHairBraidBackslash,imgHairBraidClimb,imgHairBraidCombatidle,imgHairBraidEmote,imgHairBraidHalfslash,imgHairBraidJump,imgHairBraidRun,imgHairBraidShoot,imgHairBraidSit,imgHairBraidSpellcast,imgHairBraidThrust,imgHairBangsBackslash,imgHairBangsClimb,imgHairBangsCombatidle,imgHairBangsEmote,imgHairBangsHalfslash,imgHairBangsJump,imgHairBangsRun,imgHairBangsShoot,imgHairBangsSit,imgHairBangsSpellcast,imgHairBangsThrust,imgHairAfroBackslash,imgHairAfroClimb,imgHairAfroCombatidle,imgHairAfroEmote,imgHairAfroHalfslash,imgHairAfroJump,imgHairAfroRun,imgHairAfroShoot,imgHairAfroSit,imgHairAfroSpellcast,imgHairAfroThrust,imgHairBuzzcutBackslash,imgHairBuzzcutClimb,imgHairBuzzcutCombatidle,imgHairBuzzcutEmote,imgHairBuzzcutHalfslash,imgHairBuzzcutJump,imgHairBuzzcutRun,imgHairBuzzcutShoot,imgHairBuzzcutSit,imgHairBuzzcutSpellcast,imgHairBuzzcutThrust,imgHairCornrowsBackslash,imgHairCornrowsClimb,imgHairCornrowsCombatidle,imgHairCornrowsEmote,imgHairCornrowsHalfslash,imgHairCornrowsJump,imgHairCornrowsRun,imgHairCornrowsShoot,imgHairCornrowsSit,imgHairCornrowsSpellcast,imgHairCornrowsThrust,imgHairCurlyBackslash,imgHairCurlyClimb,imgHairCurlyCombatidle,imgHairCurlyEmote,imgHairCurlyHalfslash,imgHairCurlyJump,imgHairCurlyRun,imgHairCurlyShoot,imgHairCurlySit,imgHairCurlySpellcast,imgHairCurlyThrust,imgHairLongBackslash,imgHairLongClimb,imgHairLongCombatidle,imgHairLongEmote,imgHairLongHalfslash,imgHairLongJump,imgHairLongRun,imgHairLongShoot,imgHairLongSit,imgHairLongSpellcast,imgHairLongThrust,imgTorsoTshirtBackslash,imgTorsoTshirtClimb,imgTorsoTshirtCombatidle,imgTorsoTshirtEmote,imgTorsoTshirtHalfslash,imgTorsoTshirtJump,imgTorsoTshirtRun,imgTorsoTshirtShoot,imgTorsoTshirtSit,imgTorsoTshirtSpellcast,imgTorsoTshirtThrust,imgTorsoLeatherClimb,imgTorsoLeatherEmote,imgTorsoLeatherJump,imgTorsoLeatherShoot,imgTorsoLeatherSit,imgTorsoLeatherSpellcast,imgTorsoLeatherThrust,imgTorsoPlateBackslash,imgTorsoPlateClimb,imgTorsoPlateCombatidle,imgTorsoPlateEmote,imgTorsoPlateHalfslash,imgTorsoPlateJump,imgTorsoPlateRun,imgTorsoPlateShoot,imgTorsoPlateSit,imgTorsoPlateSpellcast,imgTorsoPlateThrust,imgLegsPantsBackslash,imgLegsPantsClimb,imgLegsPantsCombatidle,imgLegsPantsEmote,imgLegsPantsHalfslash,imgLegsPantsJump,imgLegsPantsRun,imgLegsPantsShoot,imgLegsPantsSit,imgLegsPantsSpellcast,imgLegsPantsThrust,imgLegsShortsBackslash,imgLegsShortsClimb,imgLegsShortsCombatidle,imgLegsShortsEmote,imgLegsShortsHalfslash,imgLegsShortsJump,imgLegsShortsRun,imgLegsShortsShoot,imgLegsShortsSit,imgLegsShortsSpellcast,imgLegsShortsThrust,imgFeetBootsBackslash,imgFeetBootsClimb,imgFeetBootsCombatidle,imgFeetBootsEmote,imgFeetBootsHalfslash,imgFeetBootsJump,imgFeetBootsRun,imgFeetBootsShoot,imgFeetBootsSit,imgFeetBootsSpellcast,imgFeetBootsThrust,
  ]);

  // ── Animation frame ticker ───────────────────────────────────────────
  const [frame, setFrame] = useState(0);
  const anim   = ANIM_MAP[animState] || ANIM_MAP.idle;
  const { lpc: animName, fps, frames: frameCount } = anim;

  useEffect(() => {
    setFrame(0); // reset sur changement d'anim
    if (fps === 0) return;
    const id = setInterval(() => setFrame(f => (f + 1) % frameCount), 1000 / fps);
    return () => clearInterval(id);
  }, [fps, frameCount, animName]);

  // ── Look résolu ──────────────────────────────────────────────────────
  const resolvedLook = look || generateLook(championId || 'default');
  const { bodyType, hair, torso, legs,
          skinTint, hairTint, shirtTint, pantsTint } = resolvedLook;
  const isDead = animState === 'death';

  // ── Rendu Picture Skia ───────────────────────────────────────────────
  const picture = useMemo(() => {
    const imgs = imgsRef.current;

    // Attendre que les images soient chargées
    const bodyKey = `body_${bodyType}_${animName}`;
    if (!imgs[bodyKey]) return null;

    const rec = Skia.PictureRecorder();
    const canvas = rec.beginRecording(Skia.XYWHRect(0, 0, width, height));

    // Fond
    const bgPaint = Skia.Paint();
    bgPaint.setColor(Skia.Color(bgColor));
    canvas.drawRect(Skia.XYWHRect(0, 0, width, height), bgPaint);

    // Ombre portée (ellipse sous les pieds)
    const shadowPath = Skia.Path.Make();
    const shW = width * 0.45, shH = shW * 0.18;
    const shX = width / 2, shY = height * 0.97;
    shadowPath.addOval(Skia.XYWHRect(shX - shW/2, shY - shH/2, shW, shH));
    const shadowPaint = Skia.Paint();
    shadowPaint.setColor(Skia.Color('#000000'));
    shadowPaint.setAlphaf(isDead ? 0.18 : 0.45);
    canvas.drawPath(shadowPath, shadowPaint);

    // Calcul de la destination : le sprite LPC 64×64 centré dans le canvas
    // On garde les proportions et on met le sprite dans les 88% du canvas
    const sprH = height * 0.88;
    const sprW = sprH;  // LPC cell est carré (64×64)
    // Léger nudge à gauche pour compenser asymétrie du sprite + remonté plus haut
    const dstX = (width  - sprW) / 2 - width * 0.02;   // un poil à gauche
    const dstY = (height - sprH) * 0.25;               // proche du haut au lieu du centre
    const dst  = Skia.XYWHRect(dstX, dstY, sprW, sprH);

    const LPC_CELL = 64;
    const srcRect  = Skia.XYWHRect(frame * LPC_CELL, dirRow * LPC_CELL, LPC_CELL, LPC_CELL);
    const alpha    = isDead ? 0.38 : 1.0;

    // Offsets pour cheveux/torso (alignement avec body modifié à têtes ajoutées)
    const HAIR_DX  =  sprW * 0.005;
    const HAIR_DY  =  sprH * 0.045;
    const TORSO_DX =  sprW * 0.005;
    const TORSO_DY =  sprH * 0.015;
    const dstHair  = Skia.XYWHRect(dstX + HAIR_DX,  dstY + HAIR_DY,  sprW, sprH);
    const dstTorso = Skia.XYWHRect(dstX + TORSO_DX, dstY + TORSO_DY, sprW, sprH);

    // 5 couches avec teintes individuelles : body=peau, legs=pantalon, feet=neutre,
    // torso=chemise, hair=cheveux
    const layers = [
      [`body_${bodyType}_${animName}`,  dst,      _mkTintP(skinTint,  alpha)],
      [`legs_${legs}_${animName}`,       dst,      _mkTintP(pantsTint, alpha)],
      [`feet_boots_${animName}`,         dst,      _mkSpriteP(alpha)         ],
      [`torso_${torso}_${animName}`,     dstTorso, _mkTintP(shirtTint, alpha)],
      [`hair_${hair}_${animName}`,       dstHair,  _mkTintP(hairTint,  alpha)],
    ];
    for (const [key, layerDst, layerPaint] of layers) {
      const img = imgs[key];
      if (img) canvas.drawImageRect(img, srcRect, layerDst, layerPaint);
    }

    // Croix pour mort
    if (isDead) {
      const cx2 = width / 2, cy2 = height * 0.45;
      const xr   = Math.min(width, height) * 0.12;
      const xPath = Skia.Path.Make();
      xPath.moveTo(cx2 - xr, cy2 - xr); xPath.lineTo(cx2 + xr, cy2 + xr);
      xPath.moveTo(cx2 + xr, cy2 - xr); xPath.lineTo(cx2 - xr, cy2 + xr);
      const xPaint = Skia.Paint();
      xPaint.setColor(Skia.Color('#c85050'));
      xPaint.setAlphaf(0.70);
      xPaint.setStyle(1 /* Stroke */);
      xPaint.setStrokeWidth(2.5);
      canvas.drawPath(xPath, xPaint);
    }

    return rec.finishRecordingAsPicture();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, animName, dirRow, width, height, bgColor, bodyType, hair, torso, legs, isDead,
      skinTint, hairTint, shirtTint, pantsTint,
      imgBodyMaleWalk, imgBodyMaleIdle, imgBodyMaleSlash, imgBodyMaleHurt,
      imgBodyFemaleWalk, imgBodyFemaleIdle, imgBodyFemaleSlash, imgBodyFemaleHurt]);

  return (
    <View style={{ width, height, backgroundColor: bgColor, borderRadius: 10, overflow: 'hidden' }}>
      <Canvas style={{ width, height }}>
        {picture && <Picture picture={picture} />}
      </Canvas>
    </View>
  );
}
