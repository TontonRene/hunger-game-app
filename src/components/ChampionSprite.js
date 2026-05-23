/**
 * ChampionSprite — Affichage sprite animé d'un champion
 * Utilise global.png (256×384, 8 cols × 12 rows de 32×32)
 * avec rendu en couches (corps, cheveux, haut, ceinture, chaussures, pantalon)
 * et tint couleur par couche.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

// ── Couleurs par archétype ────────────────────────────────────────────────
const ARCH_COLORS = {
  berserker: '#e74c3c', hunter: '#27ae60', opportunist: '#f39c12',
  survivor:  '#1abc9c', tank:   '#8e44ad', soldier:    '#3498db',
  guerrier:  '#c0392b', chasseur:'#27ae60', colosse:   '#8e44ad',
  ombre:     '#2c3e50', médecin: '#2980b9', berserk:   '#e67e22',
  rôdeur:    '#16a085',
};

// ── Palettes aléatoires ───────────────────────────────────────────────────
const _SHIRT = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#ff6b9d','#00b894','#fd79a8','#6c5ce7','#e84393'];
const _PANTS = ['#2c3e50','#4a235a','#1a5276','#145a32','#6e2f0a','#17202a','#7f8c8d','#5d4037'];
const _HAIR  = ['#1a0800','#3d1c02','#d4a017','#c05000','#505050','#f0e0c0','#800000','#000000'];
const _SKIN  = ['#ffe0c8','#d4956a','#c08050','#8a5030','#ffd8b0'];

function _hash(s) {
  let h = 0; const str = String(s || '');
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function getLook(id) {
  const h = _hash(id);
  return {
    skinTint:  _SKIN[h          % _SKIN.length],
    hairTint:  _HAIR[(h >> 3)   % _HAIR.length],
    shirtTint: _SHIRT[(h >> 6)  % _SHIRT.length],
    pantsTint: _PANTS[(h >> 9)  % _PANTS.length],
  };
}

// ── Mapping stat → animation ──────────────────────────────────────────────
const STAT_ANIM = {
  strength: 'attack', speed: 'run', defense: 'hurt',
  endurance: 'walk',  instinct: 'idle', survival: 'idle',
};
const STAT_LABEL = {
  strength:'Force', speed:'Vitesse', defense:'Défense',
  endurance:'Endurance', instinct:'Instinct', survival:'Survie',
};
const STAT_COLOR = {
  strength:'#e74c3c', speed:'#3498db', defense:'#f39c12',
  endurance:'#2ecc71', instinct:'#9b59b6', survival:'#1abc9c',
};

// ── Base64 de global.png (256×384, 8 cols × 12 rows × 32×32) ─────────────
const CHARSHEET_B64 = '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';

// ── Construction HTML (rendu en couches) ──────────────────────────────────
function buildCharHTML({ skinTint, hairTint, shirtTint, pantsTint, animKey, isDead, dirOff, scale }) {
  const fps = animKey === 'attack' ? 14
            : animKey === 'run'    ? 10
            : animKey === 'walk'   ? 7
            : 0; // idle / hurt / death = figé

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{width:100vw;height:100vh;overflow:hidden;background:#0d0d1a;}
canvas{position:absolute;top:0;left:0;}
</style></head><body>
<canvas id="bg"></canvas>
<canvas id="c" style="image-rendering:pixelated;image-rendering:crisp-edges;"></canvas>
<canvas id="tmp"></canvas>
<script>
var SKIN  = '${skinTint}';
var HAIR  = '${hairTint}';
var SHIRT = '${shirtTint}';
var PANTS = '${pantsTint}';
var DIR   = ${dirOff}; // 0=droite, 1=gauche
var FPS   = ${fps};
var IS_DEAD  = ${isDead ? 'true' : 'false'};
var SCALE    = ${scale || 1.0};

var FCOLS=8, FROWS=12, FW=32, FH=32;
var W=window.innerWidth, H=window.innerHeight;

var bgC=document.getElementById('bg'); bgC.width=W; bgC.height=H;
var bgX=bgC.getContext('2d');
var cv=document.getElementById('c');   cv.width=W; cv.height=H;
var ctx=cv.getContext('2d');
var tc=document.getElementById('tmp');
var tctx=tc.getContext('2d');

var BASE=Math.min(W,H)*0.68*SCALE;
var SPW=BASE, SPH=BASE;
var cx=W/2, cy=H/2;
var spX=cx-SPW/2, spY=cy-SPH*0.60;

// Taille du canvas temporaire
tc.width=Math.ceil(SPW); tc.height=Math.ceil(SPH);

// ── Fond ──────────────────────────────────────────────────────────────────
function drawBg() {
  bgX.clearRect(0,0,W,H);
  bgX.fillStyle='#0d0d1a'; bgX.fillRect(0,0,W,H);
  var g=bgX.createRadialGradient(cx,cy*0.85,0,cx,cy*0.85,W*0.65);
  g.addColorStop(0,'rgba(60,80,120,0.22)');
  g.addColorStop(0.5,'rgba(40,50,80,0.08)');
  g.addColorStop(1,'rgba(0,0,0,0)');
  bgX.fillStyle=g; bgX.fillRect(0,0,W,H);
  // Sol lumineux
  var fy=spY+SPH*0.97;
  var fg=bgX.createRadialGradient(cx,fy,0,cx,fy,SPW*0.55);
  fg.addColorStop(0,'rgba(80,100,180,0.12)');
  fg.addColorStop(1,'rgba(0,0,0,0)');
  bgX.fillStyle=fg;
  bgX.beginPath(); bgX.ellipse(cx,fy,SPW*0.5,SPW*0.14,0,0,Math.PI*2); bgX.fill();
  bgX.beginPath(); bgX.ellipse(cx,fy,SPW*0.42,SPW*0.11,0,0,Math.PI*2);
  bgX.strokeStyle='rgba(100,130,220,0.30)'; bgX.lineWidth=1.5; bgX.stroke();
  bgX.globalAlpha=0.025;
  for(var yi=0;yi<H;yi+=3){bgX.fillStyle='#fff';bgX.fillRect(0,yi,W,1);}
  bgX.globalAlpha=1;
}
drawBg();

// ── Dessin d'une couche tintée ─────────────────────────────────────────────
function drawLayer(img, frameIdx, pair, tintHex, alpha) {
  var row = pair*2 + DIR;
  var srcX = frameIdx*FW, srcY = row*FH;
  // Dessin sur canvas temporaire
  tctx.clearRect(0,0,tc.width,tc.height);
  tctx.drawImage(img, srcX, srcY, FW, FH, 0, 0, SPW, SPH);
  if (tintHex) {
    // Tint via source-atop (ne colore que les pixels opaques)
    tctx.globalCompositeOperation='source-atop';
    tctx.globalAlpha=0.58;
    tctx.fillStyle=tintHex;
    tctx.fillRect(0,0,SPW,SPH);
    tctx.globalCompositeOperation='source-over';
    tctx.globalAlpha=1;
  }
  // Composite vers canvas principal
  ctx.globalAlpha=alpha;
  ctx.drawImage(tc,0,0,Math.ceil(SPW),Math.ceil(SPH),spX,spY,SPW,SPH);
  ctx.globalAlpha=1;
}

// ── Sprite ─────────────────────────────────────────────────────────────────
var img=new Image();
var frame=0, lastT=0;

img.onload=function(){
  function render(ts) {
    requestAnimationFrame(render);
    ctx.clearRect(0,0,W,H);

    // Avancement frame
    if(FPS>0 && ts-lastT>1000/FPS){ frame=(frame+1)%FCOLS; lastT=ts; }

    var alpha = IS_DEAD ? 0.28 : 1.0;

    // Ombre portée
    var sg=ctx.createRadialGradient(cx,spY+SPH*0.97,0,cx,spY+SPH*0.97,SPW*0.4);
    sg.addColorStop(0,'rgba(0,0,0,'+(IS_DEAD?0.2:0.55)+')');
    sg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=sg;
    ctx.beginPath();
    ctx.ellipse(cx,spY+SPH*0.97,SPW*0.35,SPW*0.09,0,0,Math.PI*2);
    ctx.fill();

    // 6 couches : corps, cheveux, haut, ceinture, chaussures, pantalon
    drawLayer(img, frame, 0, SKIN,  alpha);
    drawLayer(img, frame, 1, HAIR,  alpha);
    drawLayer(img, frame, 2, SHIRT, alpha);
    drawLayer(img, frame, 3, null,  alpha);
    drawLayer(img, frame, 4, null,  alpha);
    drawLayer(img, frame, 5, PANTS, alpha);

    // Croix pour mort
    if(IS_DEAD){
      ctx.save();
      ctx.strokeStyle='rgba(200,80,80,0.60)';
      ctx.lineWidth=2.5;
      var mx=cx, my=spY+SPH*0.35;
      ctx.beginPath();
      ctx.moveTo(mx-12,my-12); ctx.lineTo(mx+12,my+12);
      ctx.moveTo(mx+12,my-12); ctx.lineTo(mx-12,my+12);
      ctx.stroke(); ctx.restore();
    }
  }
  requestAnimationFrame(render);
};
img.src='data:image/png;base64,'+\`${CHARSHEET_B64}\`;
</script></body></html>`;
}

// ═══════════════════════════════════════════════════════════════════════════
export default function ChampionSprite({
  name,
  archetype,
  isDead = false,
  look,          // { skinTint, hairTint, shirtTint, pantsTint } — optionnel
  animState,     // 'idle'|'walk'|'run'|'attack'|'hurt'|'death'
  trainStat,
  height = 220,
  showTag = true,
  style,
}) {
  const resolvedLook = look || getLook(name || archetype || 'default');
  const col  = ARCH_COLORS[archetype] || resolvedLook.shirtTint || '#e2b96f';
  const anim = isDead  ? 'death'
    : trainStat ? (STAT_ANIM[trainStat] || 'idle')
    : animState  || 'idle';
  const dirOff = 0; // toujours face à droite dans la vue détail
  const accentCol = trainStat ? (STAT_COLOR[trainStat] || col) : col;

  const html = buildCharHTML({
    skinTint:  resolvedLook.skinTint,
    hairTint:  resolvedLook.hairTint,
    shirtTint: resolvedLook.shirtTint,
    pantsTint: resolvedLook.pantsTint,
    animKey:   anim,
    isDead,
    dirOff,
    scale: 1.0,
  });

  return (
    <View style={[styles.container, { height }, style]}>
      <WebView
        style={[styles.webview, { backgroundColor: '#0d0d1a' }]}
        source={{ html }}
        originWhitelist={['*']}
        javaScriptEnabled
        scrollEnabled={false}
        androidHardwareAccelerationDisabled={false}
        mixedContentMode="always"
        cacheEnabled={false}
        backgroundColor="#0d0d1a"
      />
      {showTag && (
        <View style={styles.tag}>
          {name   ? <Text style={styles.name}>{name}</Text> : null}
          {archetype ? (
            <Text style={[styles.arch, { color: col }]}>
              {archetype.toUpperCase()}
            </Text>
          ) : null}
          {trainStat ? (
            <Text style={[styles.statLabel, { color: accentCol }]}>
              ▸ {STAT_LABEL[trainStat]?.toUpperCase()}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14, overflow: 'hidden', position: 'relative',
    marginBottom: 10, backgroundColor: '#0d0d1a',
  },
  webview:   { flex: 1, backgroundColor: '#0d0d1a' },
  tag: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 8, paddingTop: 5, backgroundColor: '#0d0d1a99',
  },
  name:      { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  arch:      { fontSize: 9,  letterSpacing: 2, marginTop: 1 },
  statLabel: { fontSize: 10, letterSpacing: 1.5, marginTop: 2, fontWeight: 'bold' },
});
