import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildFBXSceneHTML } from '../utils/fbxScene';
import { FBX_B64 } from '../utils/fbx/idle';

// Couvre les archetypes du simulateur ET de la lounge
const ARCH_COLORS = {
  berserker:'#e74c3c', hunter:'#27ae60', opportunist:'#f39c12',
  survivor:'#1abc9c',  tank:'#8e44ad',   soldier:'#3498db',
  guerrier:'#c0392b',  chasseur:'#27ae60', colosse:'#8e44ad',
  ombre:'#2c3e50',     médecin:'#2980b9',  berserk:'#e67e22',
  rôdeur:'#16a085',
};

function buildHTML(color, isDead) {
  const hex = parseInt(color.replace('#',''), 16);
  const moduleBody = `
var FBX_B64 = '${FBX_B64}';
var accentColor = 0x${hex.toString(16).padStart(6,'0')};
var isDead = ${isDead ? 'true' : 'false'};

var W = window.innerWidth, H = window.innerHeight;
var mobile = W < 520;

var renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: 'low-power',
  alpha: true
});
renderer.setSize(W, H);
renderer.shadowMap.enabled = false;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.0 : 1.5));
document.body.appendChild(renderer.domElement);

var scene = new THREE.Scene();

document.body.style.background =
  'radial-gradient(ellipse at 50% 65%, #' +
  accentColor.toString(16).padStart(6,'0') + (isDead ? '18' : '2a') + ' 0%, #0d0d1a 68%)';

var camera = new THREE.PerspectiveCamera(40, W/H, 0.1, 60);
camera.position.set(0, 1.4, 3.2);
camera.lookAt(0, 0.9, 0);

scene.add(new THREE.AmbientLight(0x334466, isDead ? 1.8 : 3.2));
var key = new THREE.DirectionalLight(isDead ? 0x8899aa : 0xfff5e0, isDead ? 1.2 : 2.4);
key.position.set(2, 4, 3);
scene.add(key);
var rim = new THREE.DirectionalLight(accentColor, isDead ? 0.3 : 1.3);
rim.position.set(-3, 2, -2);
scene.add(rim);

var floor = new THREE.Mesh(
  new THREE.CircleGeometry(1.3, 18),
  new THREE.MeshLambertMaterial({ color: 0x111122 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

var ring = new THREE.Mesh(
  new THREE.RingGeometry(0.96, 1.14, 20),
  new THREE.MeshBasicMaterial({
    color: accentColor, side: THREE.DoubleSide,
    transparent: true, opacity: isDead ? 0.08 : 0.28
  })
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.005;
scene.add(ring);

var clock = new THREE.Clock(), mixer = null;

var loader = new THREE.FBXLoader();
try {
  var buf = b64ToBuffer(FBX_B64);
  var obj = loader.parse(buf, '');
  obj.scale.setScalar(0.012);
  obj.traverse(function(c) {
    if (!c.isMesh) return;
    c.castShadow = false; c.receiveShadow = false;
    if (isDead && c.material) {
      var m = (Array.isArray(c.material) ? c.material[0] : c.material).clone();
      m.color.setHex(0x445566);
      m.opacity = 0.55; m.transparent = true;
      c.material = m;
    }
  });
  scene.add(obj);
  if (obj.animations && obj.animations.length) {
    mixer = new THREE.AnimationMixer(obj);
    var action = mixer.clipAction(obj.animations[0]);
    action.play();
    if (isDead) action.paused = true;
  }
} catch(e) { console.error('FBX', e); }

function animate() {
  requestAnimationFrame(animate);
  var dt = clock.getDelta();
  if (mixer && !isDead) mixer.update(dt);
  renderer.render(scene, camera);
}
animate();
`;
  return buildFBXSceneHTML({ moduleBody, bgColor: 'transparent' });
}

export default function ChampionModel({ name, archetype, isDead, color }) {
  const col = color || ARCH_COLORS[archetype] || '#e2b96f';
  return (
    <View style={styles.container}>
      <WebView
        style={styles.webview}
        source={{ html: buildHTML(col, !!isDead) }}
        originWhitelist={['*']}
        javaScriptEnabled
        scrollEnabled={false}
        androidHardwareAccelerationDisabled={false}
        mixedContentMode="always"
      />
      <View style={styles.tag}>
        <Text style={styles.name}>{name}</Text>
        <Text style={[styles.arch, { color: col }]}>{archetype?.toUpperCase()}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 185, borderRadius: 12, overflow: 'hidden', position: 'relative', marginBottom: 10 },
  webview:   { flex: 1, backgroundColor: 'transparent' },
  tag: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 8, paddingTop: 5, backgroundColor: '#0d0d1a99',
  },
  name: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  arch: { fontSize: 9, letterSpacing: 2, marginTop: 1 },
});
