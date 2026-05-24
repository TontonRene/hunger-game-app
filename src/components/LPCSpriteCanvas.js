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
const _SKIN_COLS  = ['#ffe0c8','#d4956a','#c08050','#8a5030','#ffd8b0'];
const _HAIR_COLS  = ['#1a0800','#3d1c02','#d4a017','#c05000','#505050','#f0e0c0','#800000','#000000'];
const _LPC_BODY   = ['male', 'female'];
const _LPC_HAIR   = ['bob', 'braid', 'bangs', 'afro', 'buzzcut', 'cornrows', 'curly', 'long'];
const _LPC_TORSO  = ['shirt', 'tshirt', 'leather', 'plate'];
const _LPC_LEGS   = ['pants', 'shorts'];

function generateLook(id) {
  const h0 = _hashId(id);
  const h1 = (Math.imul(h0 ^ (h0 >>> 16), 0x45d9f3b)) >>> 0;
  const h2 = (Math.imul(h1 ^ (h1 >>> 16), 0x45d9f3b)) >>> 0;
  const h5 = (Math.imul((Math.imul((Math.imul(h2 ^ (h2>>>13), 0x9e3779b9))>>>0 ^ ((Math.imul(h2 ^ (h2>>>13), 0x9e3779b9))>>>0)>>>11, 0x6c62272e))>>>0 ^ ((Math.imul((Math.imul(h2 ^ (h2>>>13), 0x9e3779b9))>>>0 ^ ((Math.imul(h2 ^ (h2>>>13), 0x9e3779b9))>>>0)>>>11, 0x6c62272e))>>>0)>>>15, 0x165667b1)) >>> 0;
  const h6 = (Math.imul(h5 ^ (h5 >>> 17), 0x27d4eb2f)) >>> 0;
  const h7 = (Math.imul(h6 ^ (h6 >>> 13), 0x85ebca6b)) >>> 0;
  return {
    bodyType: _LPC_BODY [h5 % _LPC_BODY.length],
    hair:     _LPC_HAIR [h6 % _LPC_HAIR.length],
    torso:    _LPC_TORSO[h7 % _LPC_TORSO.length],
    legs:     _LPC_LEGS [h1 % _LPC_LEGS.length],
    feet:     'boots',
    skinTint: _SKIN_COLS[h1 % _SKIN_COLS.length],
    hairTint: _HAIR_COLS[h2 % _HAIR_COLS.length],
  };
}

// ── Mapping animState → LPC anim ─────────────────────────────────────────
const ANIM_MAP = {
  idle:   { lpc:'idle',  fps:2,  frames:2 },
  walk:   { lpc:'walk',  fps:9,  frames:9 },
  run:    { lpc:'walk',  fps:13, frames:9 },
  attack: { lpc:'slash', fps:12, frames:6 },
  hurt:   { lpc:'hurt',  fps:6,  frames:6 },
  death:  { lpc:'hurt',  fps:0,  frames:1 },
};

// ── Peinture sprite (alpha uniquement) ───────────────────────────────────
function _mkSpriteP(alpha) {
  const p = Skia.Paint();
  p.setAlphaf(Math.max(0, Math.min(1, alpha)));
  return p;
}

// ═════════════════════════════════════════════════════════════════════════
export default function LPCSpriteCanvas({
  championId,   // pour générer le look via hash
  look,         // override look si déjà calculé
  animState = 'idle',
  width  = 120,
  height = 140,
  dirRow = 3,   // 0=up 1=left 2=right 3=down (LPC natif)
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
  const { bodyType, hair, torso, legs } = resolvedLook;
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
    // On garde les proportions et on met le sprite dans les 80% du canvas
    const sprH = height * 0.88;
    const sprW = sprH;  // LPC cell est carré (64×64)
    const dstX = (width  - sprW) / 2;
    const dstY = (height - sprH) * 0.55; // légèrement au-dessus du centre
    const dst  = Skia.XYWHRect(dstX, dstY, sprW, sprH);

    const LPC_CELL = 64;
    const srcRect  = Skia.XYWHRect(frame * LPC_CELL, dirRow * LPC_CELL, LPC_CELL, LPC_CELL);
    const alpha    = isDead ? 0.38 : 1.0;
    const p        = Skia.Paint(); p.setAlphaf(alpha);

    // 5 couches : body → legs → feet → torso → hair
    const layers = [
      `body_${bodyType}_${animName}`,
      `legs_${legs}_${animName}`,
      `feet_boots_${animName}`,
      `torso_${torso}_${animName}`,
      `hair_${hair}_${animName}`,
    ];
    for (const key of layers) {
      const img = imgs[key];
      if (img) canvas.drawImageRect(img, srcRect, dst, p);
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
      // Rebuild when any image loads (tracked via frame bump)
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
