import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useGame } from '../context/GameContext';
import api from '../utils/api';

// ── Valhalla 3D scene HTML ────────────────────────────────────────────────
const VALHALLA_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<style>*{margin:0;padding:0;}body{background:#100a06;overflow:hidden;}</style>
</head>
<body>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js"><\/script>
<script>

const W=window.innerWidth, H=window.innerHeight;
var renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(W,H);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x100a06);
scene.fog=new THREE.FogExp2(0x100a06, 0.028);

const camera=new THREE.PerspectiveCamera(42,W/H,0.1,80);
camera.position.set(0,4.5,14);
camera.lookAt(0,2,0);

// ── Lumières chaleureuses ─────────────────────────────────────
scene.add(new THREE.AmbientLight(0x3a2510, 3.5));
// Lumière centrale (foyer)
const hearthLight=new THREE.PointLight(0xff8833,4,18);
hearthLight.position.set(0,1.2,0);
hearthLight.castShadow=true;
scene.add(hearthLight);
// Torches latérales
const torchPositions=[[-5,3,-4],[5,3,-4],[-5,3,4],[5,3,4]];
const torchLights=[];
torchPositions.forEach(([x,y,z])=>{
  const l=new THREE.PointLight(0xff6600,2,10);
  l.position.set(x,y,z);
  scene.add(l);
  torchLights.push(l);
});

// ── Matériaux ─────────────────────────────────────────────────
const stoneMat =new THREE.MeshLambertMaterial({color:0x2a1f14,flatShading:true});
const darkWood =new THREE.MeshLambertMaterial({color:0x1a0e06,flatShading:true});
const goldMat  =new THREE.MeshLambertMaterial({color:0xe2b96f,emissive:0xe2b96f,emissiveIntensity:0.15,flatShading:true});
const tableMat =new THREE.MeshLambertMaterial({color:0x3d2410,flatShading:true});
const ironMat  =new THREE.MeshLambertMaterial({color:0x3a3a4a,flatShading:true});
const fireMat  =new THREE.MeshLambertMaterial({color:0xff6600,emissive:0xff4400,emissiveIntensity:0.8});

// ── Sol ───────────────────────────────────────────────────────
const floor=new THREE.Mesh(new THREE.BoxGeometry(24,0.3,20),stoneMat);
floor.position.y=-0.15;
floor.receiveShadow=true;
scene.add(floor);

// Dalles de sol (motif en damier grossier)
for(let x=-5;x<=5;x+=2){
  for(let z=-4;z<=4;z+=2){
    const tile=new THREE.Mesh(new THREE.BoxGeometry(1.8,0.05,1.8),
      new THREE.MeshLambertMaterial({color:(x+z)%4===0?0x221508:0x1a1005,flatShading:true}));
    tile.position.set(x,-0.02,z);
    scene.add(tile);
  }
}

// ── Murs ──────────────────────────────────────────────────────
// Mur du fond
const backWall=new THREE.Mesh(new THREE.BoxGeometry(24,10,0.5),stoneMat);
backWall.position.set(0,5,-8);
backWall.receiveShadow=true;
scene.add(backWall);
// Murs latéraux
[-11,11].forEach(x=>{
  const w=new THREE.Mesh(new THREE.BoxGeometry(0.5,10,20),stoneMat);
  w.position.set(x,5,0);
  w.receiveShadow=true;
  scene.add(w);
});
// Plafond en bois (poutres)
for(let z=-6;z<=6;z+=3){
  const beam=new THREE.Mesh(new THREE.BoxGeometry(24,0.4,0.4),darkWood);
  beam.position.set(0,7.8,z);
  scene.add(beam);
}
const ceil=new THREE.Mesh(new THREE.BoxGeometry(24,0.2,20),darkWood);
ceil.position.y=8;
scene.add(ceil);

// ── Piliers ───────────────────────────────────────────────────
const pillarPositions=[[-7,0,-4],[-7,0,4],[7,0,-4],[7,0,4]];
pillarPositions.forEach(([x,y,z])=>{
  // Fût principal
  const pillar=new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.42,7.5,8),stoneMat);
  pillar.position.set(x,3.75,z);
  pillar.castShadow=true;
  scene.add(pillar);
  // Chapiteau
  const cap=new THREE.Mesh(new THREE.BoxGeometry(1,0.4,1),goldMat);
  cap.position.set(x,7.7,z);
  scene.add(cap);
  // Base
  const base=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.3,0.9),stoneMat);
  base.position.set(x,0.15,z);
  scene.add(base);
  // Torche sur les piliers
  const torchBase=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.08,0.5,6),ironMat);
  torchBase.position.set(x+(x>0?-0.6:0.6),3.5,z);
  scene.add(torchBase);
  const flame=new THREE.Mesh(new THREE.ConeGeometry(0.1,0.3,5),fireMat);
  flame.position.set(x+(x>0?-0.6:0.6),3.85,z);
  flame.userData.torch=true;
  scene.add(flame);
});

// ── Table de banquet ──────────────────────────────────────────
// Table principale
const table=new THREE.Mesh(new THREE.BoxGeometry(9,0.18,2.2),tableMat);
table.position.set(0,0.9,0);
table.castShadow=true;
scene.add(table);
// Pieds de table
[[-4,0],[-4,0],[4,0],[4,0]].forEach(()=>{});
[[-3.8,-0.7],[3.8,-0.7],[-3.8,0.7],[3.8,0.7]].forEach(([x,z])=>{
  const leg=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.9,0.2),darkWood);
  leg.position.set(x,0.45,z);
  scene.add(leg);
});
// Bols et coupes sur la table
for(let i=-3;i<=3;i+=1.5){
  const bowl=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.08,0.12,8),ironMat);
  bowl.position.set(i,1.01,Math.random()>.5?0.5:-0.5);
  scene.add(bowl);
}
// Chopes
for(let i=-2;i<=2;i+=1.2){
  const cup=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.06,0.2,6),goldMat);
  cup.position.set(i+0.3,1.02,Math.random()>.5?-0.4:0.4);
  scene.add(cup);
}

// Bancs de chaque côté
[-1.6,1.6].forEach(z=>{
  const bench=new THREE.Mesh(new THREE.BoxGeometry(8.5,0.12,0.5),darkWood);
  bench.position.set(0,0.52,z*1.15);
  scene.add(bench);
  const bl=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.5,0.5),darkWood);
  bl.position.set(-3.8,0.26,z*1.15); scene.add(bl);
  const br=bl.clone(); br.position.x=3.8; scene.add(br);
});

// ── Foyer central (derrière la table, contre le mur) ──────────
const hearthBack=new THREE.Mesh(new THREE.BoxGeometry(2.5,2.5,0.4),stoneMat);
hearthBack.position.set(0,1.25,-7.7);
scene.add(hearthBack);
const hearthOpening=new THREE.Mesh(new THREE.BoxGeometry(1.6,1.4,0.5),
  new THREE.MeshLambertMaterial({color:0x050200}));
hearthOpening.position.set(0,0.9,-7.65);
scene.add(hearthOpening);
// Bûches
for(let i=-1;i<=1;i++){
  const log=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.09,1.2,6),darkWood);
  log.rotation.z=0.3*i+0.1;
  log.position.set(i*0.25,0.15,-7.7+0.1*Math.abs(i));
  scene.add(log);
}
const hearthFlame=new THREE.Mesh(new THREE.ConeGeometry(0.35,0.9,6),fireMat);
hearthFlame.position.set(0,0.7,-7.65);
hearthFlame.userData.hearth=true;
scene.add(hearthFlame);
const hearthFlame2=new THREE.Mesh(new THREE.ConeGeometry(0.2,0.6,6),
  new THREE.MeshLambertMaterial({color:0xffcc00,emissive:0xffaa00,emissiveIntensity:0.9}));
hearthFlame2.position.set(0,0.8,-7.65);
hearthFlame2.userData.hearth=true;
scene.add(hearthFlame2);

// ── Boucliers sur les murs ────────────────────────────────────
const shieldColors=[0x8B0000,0x00468B,0x006400,0x8B6914];
const shieldPositions=[
  [-9,3.5,-6],[-9,3.5,-2],[-9,3.5,2],
  [9,3.5,-6],[9,3.5,-2],[9,3.5,2]
];
shieldPositions.forEach(([x,y,z],i)=>{
  const shield=new THREE.Mesh(new THREE.CircleGeometry(0.55,16),
    new THREE.MeshLambertMaterial({color:shieldColors[i%4]}));
  shield.position.set(x+(x>0?-0.1:0.1),y,z);
  shield.rotation.y=x>0?-Math.PI/2:Math.PI/2;
  scene.add(shield);
  // Umbo (centre du bouclier)
  const umbo=new THREE.Mesh(new THREE.SphereGeometry(0.12,8,8),ironMat);
  umbo.position.set(x+(x>0?-0.15:0.15),y,z);
  umbo.rotation.y=x>0?-Math.PI/2:Math.PI/2;
  scene.add(umbo);
});

// ── Haches déco sur le mur du fond ───────────────────────────
[-3,3].forEach(x=>{
  const handle=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,1.2,6),darkWood);
  handle.position.set(x,5,-7.7);
  handle.rotation.z=x>0?0.25:-0.25;
  scene.add(handle);
  const blade=new THREE.Mesh(new THREE.CylinderGeometry(0.0,0.38,0.55,4),ironMat);
  blade.position.set(x+(x>0?0.35:-0.35),5.3,-7.7);
  blade.rotation.z=x>0?Math.PI*0.6:-Math.PI*0.6;
  scene.add(blade);
});

// ── Bannière "VALHALLA" ───────────────────────────────────────
const bannerMat=new THREE.MeshLambertMaterial({color:0x6b1a1a});
const banner=new THREE.Mesh(new THREE.BoxGeometry(3.5,2.2,0.08),bannerMat);
banner.position.set(0,6,-7.65);
scene.add(banner);
// Bande d'or en haut de la bannière
const bannerTop=new THREE.Mesh(new THREE.BoxGeometry(3.7,0.15,0.09),goldMat);
bannerTop.position.set(0,7.2,-7.65);
scene.add(bannerTop);

// ── Étoiles / particules de cendres montantes ────────────────
const sparkGeo=new THREE.BufferGeometry();
const sparkPos=[];
for(let i=0;i<60;i++){
  sparkPos.push((Math.random()-0.5)*2,(Math.random()*4)+0.5,(Math.random()-0.5)*0.5-7.6);
}
sparkGeo.setAttribute('position',new THREE.Float32BufferAttribute(sparkPos,3));
const sparks=new THREE.Points(sparkGeo,
  new THREE.PointsMaterial({color:0xffaa44,size:0.04,transparent:true,opacity:0.8}));
scene.add(sparks);

// ── Caméra lente panoramique ──────────────────────────────────
let camAngle=0;
let t=0;

function animate(){
  requestAnimationFrame(animate);
  t+=0.016;
  // Légère panoramique gauche/droite
  camAngle=Math.sin(t*0.08)*0.4;
  camera.position.x=Math.sin(camAngle)*8;
  camera.position.y=4.5+Math.sin(t*0.12)*0.3;
  camera.lookAt(0,2.2,0);

  // Flammes foyer
  scene.children.forEach(c=>{
    if(c.userData?.hearth){
      c.scale.y=0.85+Math.sin(t*7+c.position.x)*0.2;
      c.scale.x=0.9+Math.sin(t*5)*0.1;
    }
    if(c.userData?.torch){
      c.scale.y=0.8+Math.sin(t*9+c.position.x*3)*0.3;
    }
  });

  // Pulsation lumières
  hearthLight.intensity=3.5+Math.sin(t*6)*0.8;
  torchLights.forEach((l,i)=>{
    l.intensity=1.8+Math.sin(t*5+i)*0.5;
  });

  // Braises qui montent (boucle en Y)
  const spPos=sparkGeo.attributes.position;
  for(let i=0;i<spPos.count;i++){
    let y=spPos.getY(i)+0.015;
    if(y>5) y=0.5;
    spPos.setY(i,y);
    spPos.setX(i,spPos.getX(i)+Math.sin(t*2+i)*0.003);
  }
  spPos.needsUpdate=true;

  renderer.render(scene,camera);
}
animate();
</script>
</body>
</html>`;

// ── Screen ────────────────────────────────────────────────────────────────
export default function LoungeScreen() {
  const { champion, user } = useGame();
  const [victories, setVictories]   = useState([]);
  const [loadingV,  setLoadingV]    = useState(false);

  // Charge les victoires depuis le backend à chaque fois que l'écran est actif
  useEffect(() => {
    if (!user?.username) return;
    setLoadingV(true);
    api.get(`/api/battle/victories/${user.username}`)
      .then(res => setVictories(res.data.victories || []))
      .catch(() => {})
      .finally(() => setLoadingV(false));
  }, [user?.username]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Scène 3D Valhalla */}
      <View style={styles.sceneContainer}>
        <WebView
          source={{ html: VALHALLA_HTML }}
          style={styles.scene}
          originWhitelist={['*']}
          javaScriptEnabled
          scrollEnabled={false}
        />
        <View style={styles.sceneOverlay}>
          <Text style={styles.sceneTitle}>VALHALLA</Text>
          <Text style={styles.sceneSub}>Le banquet des champions victorieux</Text>
        </View>
      </View>

      {/* Stats sponsor */}
      {user && (
        <View style={styles.sponsorStats}>
          <View style={styles.sponsorStat}>
            <Text style={styles.sponsorStatValue}>{victories.length}</Text>
            <Text style={styles.sponsorStatLabel}>Victoires</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.sponsorStat}>
            <Text style={styles.sponsorStatValue}>{champion?.battles || 0}</Text>
            <Text style={styles.sponsorStatLabel}>Batailles</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.sponsorStat}>
            <Text style={styles.sponsorStatValue}>
              {champion?.battles ? Math.round((victories.length / champion.battles) * 100) : 0}%
            </Text>
            <Text style={styles.sponsorStatLabel}>Win rate</Text>
          </View>
        </View>
      )}

      {/* Tableau */}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>TABLEAU DE GLOIRE</Text>
        {loadingV && <ActivityIndicator size="small" color="#e2b96f" style={{ marginRight: 16 }} />}
      </View>
      {victories.length === 0 && !loadingV ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🪓</Text>
          <Text style={styles.emptyTitle}>Le banquet attend ses héros</Text>
          <Text style={styles.emptySub}>
            {user
              ? 'Remporte une bataille pour inscrire ton champion dans la légende.'
              : 'Connecte-toi pour voir tes victoires.'}
          </Text>
        </View>
      ) : (
        [...victories].reverse().map((v, i) => (
          <View key={v.id} style={styles.victoryCard}>
            <View style={styles.medal}>
              <Text style={styles.medalText}>#{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.victoryHeader}>
                <Text style={styles.champName}>{v.champName}</Text>
                <Text style={styles.biome}>{v.biome}</Text>
              </View>
              <View style={styles.victoryStats}>
                <Text style={styles.victoryStat}>⚔️ {v.kills} éliminations</Text>
                <Text style={styles.victoryStat}>⏱ {v.ticks} ticks</Text>
                <Text style={styles.victoryDate}>{v.date}</Text>
              </View>
            </View>
            <Text style={styles.crownText}>👑</Text>
          </View>
        ))
      )}

      <View style={styles.quote}>
        <Text style={styles.quoteText}>"Seul le dernier en vie écrit l'histoire."</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d1a' },
  content:   { paddingBottom: 40 },

  sceneContainer: { height: 260, position: 'relative' },
  scene:          { flex: 1 },
  sceneOverlay:   { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 14 },
  sceneTitle:     {
    color: '#e2b96f', fontSize: 26, fontWeight: 'bold', letterSpacing: 6,
    textShadowColor: '#000', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 10,
  },
  sceneSub: { color: '#a08060', fontSize: 11, letterSpacing: 1 },

  sponsorStats: {
    flexDirection: 'row', backgroundColor: '#111122',
    marginHorizontal: 16, marginTop: 16,
    borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#e2b96f22',
  },
  sponsorStat:      { flex: 1, alignItems: 'center' },
  sponsorStatValue: { color: '#e2b96f', fontSize: 24, fontWeight: 'bold' },
  sponsorStatLabel: { color: '#555', fontSize: 11, marginTop: 4 },
  divider:          { width: 1, backgroundColor: '#2a2a4a', marginHorizontal: 8 },

  sectionRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 12 },
  sectionTitle: { color: '#555', fontSize: 11, letterSpacing: 2, marginHorizontal: 16 },

  victoryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#111122', borderRadius: 12, padding: 16,
    marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e2b96f33',
  },
  medal:        { width: 36, height: 36, borderRadius: 18, backgroundColor: '#e2b96f22', borderWidth: 1, borderColor: '#e2b96f', alignItems: 'center', justifyContent: 'center' },
  medalText:    { color: '#e2b96f', fontSize: 12, fontWeight: 'bold' },
  victoryHeader:{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  champName:    { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  biome:        { color: '#e2b96f', fontSize: 10, letterSpacing: 1, backgroundColor: '#e2b96f22', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  victoryStats: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  victoryStat:  { color: '#888', fontSize: 12 },
  victoryDate:  { color: '#444', fontSize: 11 },
  crownText:    { fontSize: 22 },

  empty:      { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 16 },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyTitle: { color: '#e2b96f', fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  emptySub:   { color: '#555', fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 20 },

  quote: { marginTop: 32, paddingHorizontal: 16, paddingVertical: 20, alignItems: 'center' },
  quoteText: { color: '#333', fontSize: 13, fontStyle: 'italic', textAlign: 'center' },
});
