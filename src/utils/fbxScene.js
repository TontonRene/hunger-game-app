/**
 * Builds the boilerplate HTML for a Three.js + FBXLoader scene inside a WebView.
 * Uses classic <script src> tags (no importmap) for maximum WebView compatibility.
 * After loading, THREE and THREE.FBXLoader are available as globals.
 */
export function buildFBXSceneHTML({ moduleBody, bgColor = '#0d0d1a' }) {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;}
body{background:${bgColor};overflow:hidden;width:100vw;height:100vh;}
</style>
</head>
<body>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/FBXLoader.js"></script>
<script>
// Helper: decode base64 → ArrayBuffer
function b64ToBuffer(b64) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

${moduleBody}
</script>
</body>
</html>`;
}
