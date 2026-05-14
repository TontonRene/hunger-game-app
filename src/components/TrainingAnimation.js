import React from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildFBXSceneHTML } from '../utils/fbxScene';

import { FBX_B64 as FBX_PUNCHING }  from '../utils/fbx/punchingBag';
import { FBX_B64 as FBX_RUNNING }   from '../utils/fbx/running';
import { FBX_B64 as FBX_SITTING }   from '../utils/fbx/sittingIdle';
import { FBX_B64 as FBX_THINKING }  from '../utils/fbx/thinking';
import { FBX_B64 as FBX_HIT }       from '../utils/fbx/hitReaction';
import { FBX_B64 as FBX_IDLE }      from '../utils/fbx/idle';

const STAT_META = {
  strength:  { color: '#e74c3c', label: 'Force',     fbx: () => FBX_PUNCHING, orbit: false },
  speed:     { color: '#3498db', label: 'Vitesse',   fbx: () => FBX_RUNNING,  orbit: true  },
  defense:   { color: '#f39c12', label: 'Défense',   fbx: () => FBX_HIT,      orbit: false },
  endurance: { color: '#2ecc71', label: 'Endurance', fbx: () => FBX_RUNNING,  orbit: true  },
  instinct:  { color: '#9b59b6', label: 'Instinct',  fbx: () => FBX_THINKING, orbit: false },
  survival:  { color: '#1abc9c', label: 'Survie',    fbx: () => FBX_SITTING,  orbit: false },
};

function buildHTML(stat, meta) {
  const hexColor = parseInt(meta.color.replace('#', ''), 16);
  const orbit    = meta.orbit;

  const moduleBody = `
var FBX_B64  = '${meta.fbx()}';
var ORBIT    = ${orbit};
var ACCENT   = 0x${hexColor.toString(16).padStart(6, '0')};

var W = window.innerWidth, H = window.innerHeight;
var renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

var scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0d1a);
scene.fog = new THREE.Fog(0x0d0d1a, 10, 22);

var camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 60);
camera.position.set(0, 1.6, 4.5);
camera.lookAt(0, 0.8, 0);

// Lights
scene.add(new THREE.AmbientLight(0x334466, 2.5));
var key = new THREE.DirectionalLight(0xfff5e0, 2.5);
key.position.set(3, 5, 4); key.castShadow = true;
key.shadow.mapSize.width = 512; key.shadow.mapSize.height = 512;
scene.add(key);
var rim = new THREE.DirectionalLight(ACCENT, 1.2);
rim.position.set(-3, 2, -2); scene.add(rim);

// Platform
var platMat = new THREE.MeshLambertMaterial({ color: 0x111122, flatShading: true });
var platform = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.0, 0.18, 20), platMat);
platform.position.y = -0.09;
platform.receiveShadow = true;
scene.add(platform);

// Accent ring on platform edge
var ringMesh = new THREE.Mesh(
  new THREE.RingGeometry(1.65, 1.85, 32),
  new THREE.MeshBasicMaterial({ color: ACCENT, side: THREE.DoubleSide, transparent: true, opacity: 0.3 })
);
ringMesh.rotation.x = -Math.PI / 2;
ringMesh.position.y = 0.005;
scene.add(ringMesh);

// Atmosphere point light
var ptLight = new THREE.PointLight(ACCENT, 1.0, 6);
ptLight.position.set(0, 2, 0);
scene.add(ptLight);

var clock   = new THREE.Clock();
var mixer   = null;
var charObj = null;

var loader = new THREE.FBXLoader();
try {
  var buf = b64ToBuffer(FBX_B64);
  var obj = loader.parse(buf, '');
  obj.scale.setScalar(0.012);
  obj.position.set(0, 0, 0);
  obj.traverse(function(c) {
    if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
  });
  scene.add(obj);
  charObj = obj;

  if (obj.animations && obj.animations.length > 0) {
    mixer = new THREE.AnimationMixer(obj);
    mixer.clipAction(obj.animations[0]).play();
  }
} catch(e) {
  console.error('FBX load error', e);
}

function animate() {
  requestAnimationFrame(animate);
  var dt = clock.getDelta();
  var t  = clock.elapsedTime;

  if (mixer) mixer.update(dt);

  // Running in circle
  if (ORBIT && charObj) {
    var speed = 0.55;
    var r = 0.9;
    charObj.position.x =  Math.sin(t * speed) * r;
    charObj.position.z =  Math.cos(t * speed) * r;
    charObj.rotation.y = -(t * speed) + Math.PI;
  }

  ptLight.intensity = 0.8 + Math.sin(t * 2) * 0.25;
  renderer.render(scene, camera);
}
animate();
`;

  return buildFBXSceneHTML({ moduleBody, bgColor: '#0d0d1a' });
}

export default function TrainingAnimation({ stat }) {
  const meta = STAT_META[stat] || STAT_META.strength;
  return (
    <View style={styles.container}>
      <WebView
        source={{ html: buildHTML(stat, meta) }}
        style={styles.webview}
        originWhitelist={['*']}
        javaScriptEnabled
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 200, borderRadius: 12, overflow: 'hidden', marginBottom: 12 },
  webview:   { flex: 1 },
});
