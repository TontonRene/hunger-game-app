/**
 * ChampionSprite — Affichage sprite animé d'un champion
 * Remplace le modèle FBX/Three.js par un rendu HTML5 Canvas
 * avec éclairage professionnel, tint couleur champion, et animations sprite.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { SPRITES } from '../utils/sprites';

// ── Couleurs par archétype ────────────────────────────────────────────────
const ARCH_COLORS = {
  berserker: '#e74c3c', hunter: '#27ae60', opportunist: '#f39c12',
  survivor:  '#1abc9c', tank:   '#8e44ad', soldier:    '#3498db',
  guerrier:  '#c0392b', chasseur:'#27ae60', colosse:   '#8e44ad',
  ombre:     '#2c3e50', médecin: '#2980b9', berserk:   '#e67e22',
  rôdeur:    '#16a085',
};

// ── Mapping stat → animation ──────────────────────────────────────────────
const STAT_ANIM = {
  strength:  'attack',
  speed:     'run',
  defense:   'hurt',
  endurance: 'walk',
  instinct:  'idle',
  survival:  'idle',
};

// ── Mapping stat → position de caméra ────────────────────────────────────
const STAT_LABEL = {
  strength:  'Force',
  speed:     'Vitesse',
  defense:   'Défense',
  endurance: 'Endurance',
  instinct:  'Instinct',
  survival:  'Survie',
};

// ── Couleurs accent par stat ──────────────────────────────────────────────
const STAT_COLOR = {
  strength:  '#e74c3c',
  speed:     '#3498db',
  defense:   '#f39c12',
  endurance: '#2ecc71',
  instinct:  '#9b59b6',
  survival:  '#1abc9c',
};

// ── Construction HTML ─────────────────────────────────────────────────────
function buildSpriteHTML({
  color = '#e2b96f',
  animKey = 'idle',
  isDead = false,
  orbit = false,
  accentLabel = null,
  bgStyle = 'dark',       // 'dark' | 'arena'
  scale = 1.0,
}) {
  const sprite = SPRITES[isDead ? 'death' : animKey] || SPRITES.idle;
  const b64    = sprite.b64;
  const frames = sprite.frames;

  // Hex color → composantes
  const h = color.replace('#', '');
  const R = parseInt(h.slice(0, 2), 16);
  const G = parseInt(h.slice(2, 4), 16);
  const B = parseInt(h.slice(4, 6), 16);

  const FRAME_MS = animKey === 'attack' ? 70
                : animKey === 'run'    ? 80
                : animKey === 'hurt'   ? 100
                : animKey === 'walk'   ? 110
                : animKey === 'death'  ? 130
                : 140;  // idle

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
body{width:100vw;height:100vh;overflow:hidden;background:#0d0d1a;}
canvas{position:absolute;top:0;left:0;}
</style></head><body>
<canvas id="bg"></canvas>
<canvas id="c" style="image-rendering:pixelated;image-rendering:crisp-edges;"></canvas>
<script>
var R=${R},G=${G},B=${B};
var FRAMES=${frames};
var FRAME_MS=${FRAME_MS};
var IS_DEAD=${isDead?'true':'false'};
var IS_DEATH_ANIM=${animKey==='death'?'true':'false'};
var ORBIT=${orbit?'true':'false'};
var SCALE=${scale};
var deathDone=false;

var W=window.innerWidth, H=window.innerHeight;

// Canvases
var bgC=document.getElementById('bg'), bgX=bgC.getContext('2d');
var cv=document.getElementById('c'),   ctx=cv.getContext('2d');
bgC.width=W; bgC.height=H;
cv.width=W;  cv.height=H;

// Taille de rendu
var BASE = Math.min(W,H)*0.62*SCALE;
var SPW = BASE;
var SPH = BASE*1.9;

var cx=W/2, cy=H/2;
var spX=cx-SPW/2, spY=cy-SPH*0.52;

// ── Fond statique ──────────────────────────────────────────────────────────
function drawBg() {
  bgX.clearRect(0,0,W,H);
  // Fond de base
  bgX.fillStyle='#0d0d1a';
  bgX.fillRect(0,0,W,H);

  // Halo principal couleur champion
  var g=bgX.createRadialGradient(cx,cy*0.85,0,cx,cy*0.85,W*0.65);
  g.addColorStop(0,'rgba('+R+','+G+','+B+',0.18)');
  g.addColorStop(0.45,'rgba('+R+','+G+','+B+',0.07)');
  g.addColorStop(1,'rgba(0,0,0,0)');
  bgX.fillStyle=g; bgX.fillRect(0,0,W,H);

  // Sol (ellipse lumineuse)
  var fy=spY+SPH*0.97;
  var fg=bgX.createRadialGradient(cx,fy,0,cx,fy,SPW*0.55);
  fg.addColorStop(0,'rgba('+R+','+G+','+B+',0.14)');
  fg.addColorStop(0.6,'rgba('+R+','+G+','+B+',0.04)');
  fg.addColorStop(1,'rgba(0,0,0,0)');
  bgX.fillStyle=fg;
  bgX.beginPath();
  bgX.ellipse(cx,fy,SPW*0.55,SPW*0.16,0,0,Math.PI*2);
  bgX.fill();

  // Anneau sol (inner)
  bgX.beginPath();
  bgX.ellipse(cx,fy,SPW*0.46,SPW*0.13,0,0,Math.PI*2);
  bgX.strokeStyle='rgba('+R+','+G+','+B+',0.38)';
  bgX.lineWidth=1.8; bgX.stroke();

  // Anneau sol (outer, plus subtil)
  bgX.beginPath();
  bgX.ellipse(cx,fy,SPW*0.55,SPW*0.155,0,0,Math.PI*2);
  bgX.strokeStyle='rgba('+R+','+G+','+B+',0.14)';
  bgX.lineWidth=1.2; bgX.stroke();

  // Key light (haut-gauche, blanc chaud)
  var kl=bgX.createLinearGradient(cx-SPW*0.7,spY-SPH*0.2, cx+SPW*0.4,spY+SPH*0.6);
  kl.addColorStop(0,'rgba(255,245,224,0.11)');
  kl.addColorStop(1,'rgba(0,0,0,0)');
  bgX.fillStyle=kl; bgX.fillRect(0,0,W,H);

  // Rim light (bas-droite, couleur champion)
  var rl=bgX.createLinearGradient(cx+SPW*0.6,spY+SPH*0.8, cx-SPW*0.3,spY);
  rl.addColorStop(0,'rgba('+R+','+G+','+B+',0.13)');
  rl.addColorStop(1,'rgba(0,0,0,0)');
  bgX.fillStyle=rl; bgX.fillRect(0,0,W,H);

  // Lignes décoratives (scan lines légères)
  bgX.globalAlpha=0.03;
  for(var yi=0;yi<H;yi+=3){
    bgX.fillStyle='#ffffff';
    bgX.fillRect(0,yi,W,1);
  }
  bgX.globalAlpha=1;
}
drawBg();

// ── Sprite ─────────────────────────────────────────────────────────────────
var img=new Image();
var frame=0, lastT=0;
var orbitAngle=0;

img.onload=function(){
  var fw=img.width/FRAMES, fh=img.height;

  function render(ts) {
    requestAnimationFrame(render);
    ctx.clearRect(0,0,W,H);

    // Avancement frame
    if(FRAME_MS>0 && ts-lastT>FRAME_MS){
      if(IS_DEATH_ANIM){
        // Joue une seule fois, s'arrête au dernier frame
        if(!deathDone){ frame++; if(frame>=FRAMES-1){ frame=FRAMES-1; deathDone=true; } }
      } else if(!IS_DEAD){
        frame=(frame+1)%FRAMES;
      }
      lastT=ts;
    }

    var drawX=cx, drawY=cy;

    // Orbite (pour entraînement vitesse/endurance)
    if(ORBIT){
      orbitAngle+=0.008;
      drawX=cx+Math.sin(orbitAngle)*SPW*0.22;
      var scaleOrbit=0.85+Math.cos(orbitAngle)*0.12;
      ctx.save();
      ctx.translate(drawX,cy);
      ctx.scale(scaleOrbit,scaleOrbit);
      ctx.translate(-drawX,-cy);
    }

    var sx=drawX-SPW/2, sy=spY+(ORBIT?Math.cos(orbitAngle)*SPH*0.06:0);
    var fy2=sy+SPH*0.97;

    // Ombre portée
    ctx.save();
    ctx.globalAlpha=IS_DEAD?0.15:0.42;
    var sg=ctx.createRadialGradient(drawX,fy2,0,drawX,fy2,SPW*0.4);
    sg.addColorStop(0,'rgba(0,0,0,0.9)');
    sg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=sg;
    ctx.beginPath();
    ctx.ellipse(drawX,fy2,SPW*0.38,SPW*0.10,0,0,Math.PI*2);
    ctx.fill();
    ctx.restore();

    // Sprite base
    ctx.save();
    if(IS_DEAD){ ctx.globalAlpha=0.42; ctx.filter='grayscale(65%) brightness(0.55)'; }
    ctx.drawImage(img, frame*fw,0,fw,fh, sx,sy,SPW,SPH);
    ctx.restore();

    // Tint multiply (coloration champion — appliqué avec source-atop sur sprite)
    ctx.save();
    ctx.globalCompositeOperation='source-atop';
    // Pour ne colorier que le sprite dessiné, on redessine en multiply
    ctx.restore();

    // Tint via overlay (plus doux que multiply)
    if(!IS_DEAD){
      ctx.save();
      // On recrée un canvas temporaire pour le tint propre
      ctx.globalCompositeOperation='multiply';
      ctx.globalAlpha=0.30;
      ctx.fillStyle='rgb('+R+','+G+','+B+')';
      ctx.fillRect(sx,sy,SPW,SPH);
      ctx.restore();
    }

    // Key light overlay sur le sprite
    ctx.save();
    ctx.globalCompositeOperation='screen';
    ctx.globalAlpha=0.10;
    var kl2=ctx.createLinearGradient(sx,sy,sx+SPW*0.6,sy+SPH*0.5);
    kl2.addColorStop(0,'rgba(255,245,224,1)');
    kl2.addColorStop(1,'rgba(0,0,0,1)');
    ctx.fillStyle=kl2;
    ctx.fillRect(sx,sy,SPW,SPH);
    ctx.restore();

    // Rim light (bas-droite)
    ctx.save();
    ctx.globalCompositeOperation='screen';
    ctx.globalAlpha=0.09;
    var rl2=ctx.createLinearGradient(sx+SPW,sy+SPH,sx,sy);
    rl2.addColorStop(0,'rgba('+R+','+G+','+B+',1)');
    rl2.addColorStop(1,'rgba(0,0,0,1)');
    ctx.fillStyle=rl2;
    ctx.fillRect(sx,sy,SPW,SPH);
    ctx.restore();

    // Croix mort
    if(IS_DEAD){
      ctx.save();
      ctx.globalAlpha=0.55;
      ctx.strokeStyle='rgba('+R+','+G+','+B+',0.7)';
      ctx.lineWidth=2.5;
      var mx=drawX, my=sy+SPH*0.35;
      ctx.beginPath();
      ctx.moveTo(mx-12,my-12); ctx.lineTo(mx+12,my+12);
      ctx.moveTo(mx+12,my-12); ctx.lineTo(mx-12,my+12);
      ctx.stroke();
      ctx.restore();
    }

    if(ORBIT) ctx.restore();
  }

  requestAnimationFrame(render);
};
img.src='data:image/png;base64,'+\`${b64}\`;
</script></body></html>`;
}

// ═══════════════════════════════════════════════════════════════════════════
export default function ChampionSprite({
  name,
  archetype,
  isDead = false,
  color,
  animState,   // 'idle'|'walk'|'run'|'attack'|'hurt'|'death'
  trainStat,   // si mode entraînement : 'strength'|'speed'|...
  height = 220,
  showTag = true,
  style,
}) {
  const col   = color || ARCH_COLORS[archetype] || '#e2b96f';
  const anim  = isDead ? 'death'
    : trainStat ? (STAT_ANIM[trainStat] || 'idle')
    : animState || 'idle';
  const orbit = trainStat === 'speed' || trainStat === 'endurance';
  const accentCol = trainStat ? (STAT_COLOR[trainStat] || col) : col;

  const html = buildSpriteHTML({
    color: accentCol,
    animKey: anim,
    isDead,
    orbit,
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
          {name ? (
            <Text style={styles.name}>{name}</Text>
          ) : null}
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
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 10,
    backgroundColor: '#0d0d1a',
  },
  webview: { flex: 1, backgroundColor: '#0d0d1a' },
  tag: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    padding: 8, paddingTop: 5,
    backgroundColor: '#0d0d1a99',
  },
  name:      { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  arch:      { fontSize: 9,  letterSpacing: 2, marginTop: 1 },
  statLabel: { fontSize: 10, letterSpacing: 1.5, marginTop: 2, fontWeight: 'bold' },
});
