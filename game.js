// BLOCKS V1
// Core loop: camera + AR world + hand pinch + block grab/release + magnetic snap.
//
// This prototype uses the same Three.js/Zappar AR stack as the AR Tetris project
// and MediaPipe Hands for browser-side hand landmarks.

const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const spawnButton = document.getElementById("spawn");
const hintEl = document.getElementById("hint");
const handVideo = document.getElementById("handVideo");

let renderer, scene, camera;
let tracker, anchorGroup;
let blocks = [];
let selectedBlock = null;
let grabbed = false;
let pinchWasOn = false;
let handSeen = false;
let lastHand = null;
let targetPoint = new THREE.Vector3();
let smoothedPoint = new THREE.Vector3();
let hasTargetPoint = false;
let blockCount = 0;

// ---------- AR ----------

function showError(message) {
  errorEl.hidden = false;
  errorEl.textContent = message;
  statusEl.textContent = "Setup needs attention";
}

function initAR() {
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.domElement.style.position = "fixed";
  renderer.domElement.style.inset = "0";
  renderer.domElement.style.touchAction = "none";
  document.body.appendChild(renderer.domElement);

  // Zappar camera provides the live camera background.
  ZapparThree.glContextSet(renderer.getContext());

  camera = new ZapparThree.Camera();
  scene = new THREE.Scene();
  scene.background = camera.backgroundTexture;

  // Lighting.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1.8));

  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(2, 4, 3);
  scene.add(key);

  tracker = new ZapparThree.InstantWorldTracker();
  anchorGroup = new ZapparThree.InstantWorldAnchorGroup(camera, tracker);
  scene.add(anchorGroup);

  // A starter block sits a short distance in front of the initial world anchor.
  spawnBlock(new THREE.Vector3(0, 0, -1.1));

  camera.start();
  tracker.start();

  statusEl.textContent = "Move your phone to scan the space";
  animate();
}

// ---------- Blocks ----------

function makeBlockMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x6f7cff,
    roughness: 0.28,
    metalness: 0.08
  });
}

function makeRoundedBlock() {
  const size = 0.28;
  const geometry = new THREE.BoxGeometry(size, size, size, 3, 3, 3);

  // Slight bevel by moving edge vertices toward their face centers.
  // This keeps the prototype dependency-free.
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const limit = size * 0.5;
    const bevel = 0.018;

    const ax = Math.abs(x);
    const ay = Math.abs(y);
    const az = Math.abs(z);

    if (ax > limit - bevel) pos.setX(i, Math.sign(x) * (limit - bevel * 0.35));
    if (ay > limit - bevel) pos.setY(i, Math.sign(y) * (limit - bevel * 0.35));
    if (az > limit - bevel) pos.setZ(i, Math.sign(z) * (limit - bevel * 0.35));
  }
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, makeBlockMaterial());
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 35),
    new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.12
    })
  );
  mesh.add(edge);

  return mesh;
}

function spawnBlock(position) {
  if (!anchorGroup) return;

  const block = makeRoundedBlock();
  block.position.copy(position);
  block.userData.id = ++blockCount;
  block.userData.size = 0.28;
  block.userData.baseY = position.y;
  anchorGroup.add(block);
  blocks.push(block);

  // Small appearance animation.
  block.scale.setScalar(0.01);
  const start = performance.now();
  const duration = 180;

  function pop(now) {
    const t = Math.min(1, (now - start) / duration);
    const s = 0.01 + (1 - 0.01) * (1 - Math.pow(1 - t, 3));
    block.scale.setScalar(s);
    if (t < 1) requestAnimationFrame(pop);
  }
  requestAnimationFrame(pop);
}

spawnButton.addEventListener("click", () => {
  // Spawn a block near the center of the current view.
  spawnBlock(new THREE.Vector3(0, 0, -1.1));
  statusEl.textContent = "Block created";
});

// ---------- Hand tracking ----------

const hands = new Hands({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.65,
  minTrackingConfidence: 0.65
});

hands.onResults(onHandResults);

function distance2D(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function onHandResults(results) {
  const landmarks = results.multiHandLandmarks?.[0];

  if (!landmarks) {
    handSeen = false;
    lastHand = null;
    if (grabbed && selectedBlock) releaseBlock();
    return;
  }

  handSeen = true;

  const thumb = landmarks[4];
  const index = landmarks[8];
  const wrist = landmarks[0];

  const pinchDistance = distance2D(thumb, index);

  // Pinch threshold is intentionally forgiving.
  const isPinching = pinchDistance < 0.075;

  // Use the midpoint of thumb/index as the hand cursor.
  const cx = (thumb.x + index.x) * 0.5;
  const cy = (thumb.y + index.y) * 0.5;

  lastHand = {
    x: cx,
    y: cy,
    wristX: wrist.x,
    wristY: wrist.y,
    pinch: isPinching
  };

  updateHandInteraction(isPinching);
}

function screenToWorld(nx, ny, distance) {
  // MediaPipe x/y are normalized image coordinates.
  // Camera image is mirrored for the user, so invert x.
  const x = (1 - nx) * 2 - 1;
  const y = -(ny * 2 - 1);

  const ndc = new THREE.Vector3(x, y, 0.25);
  ndc.unproject(camera);

  const dir = ndc.sub(camera.position).normalize();
  return camera.position.clone().add(dir.multiplyScalar(distance));
}

function findClosestBlock(point) {
  let closest = null;
  let best = Infinity;

  for (const block of blocks) {
    if (block === selectedBlock) continue;

    const d = block.getWorldPosition(new THREE.Vector3()).distanceTo(point);
    if (d < best && d < 0.42) {
      best = d;
      closest = block;
    }
  }

  return closest;
}

function updateHandInteraction(isPinching) {
  if (!lastHand) return;

  // We use a fixed comfortable AR depth for V1.
  // Later, depth/plane understanding will let us manipulate blocks
  // at arbitrary physical distances more precisely.
  const world = screenToWorld(lastHand.x, lastHand.y, 1.1);

  if (!hasTargetPoint) {
    smoothedPoint.copy(world);
    hasTargetPoint = true;
  } else {
    smoothedPoint.lerp(world, 0.28);
  }

  if (isPinching && !pinchWasOn) {
    selectedBlock = findClosestBlock(smoothedPoint);

    if (selectedBlock) {
      grabbed = true;
      statusEl.textContent = "Grabbed";
      selectedBlock.scale.setScalar(1.06);
      hintEl.style.opacity = "0";
    }
  }

  if (!isPinching && pinchWasOn && grabbed) {
    releaseBlock();
  }

  if (grabbed && selectedBlock) {
    selectedBlock.position.lerp(
      anchorGroup.worldToLocal(smoothedPoint.clone()),
      0.38
    );

    // Magnetic snap preview.
    const snap = findSnapPosition(selectedBlock);
    if (snap) {
      selectedBlock.position.lerp(snap, 0.18);
    }
  }

  pinchWasOn = isPinching;
}

function findSnapPosition(block) {
  const size = block.userData.size;
  let best = null;
  let bestDistance = Infinity;

  for (const other of blocks) {
    if (other === block) continue;

    const d = block.position.distanceTo(other.position);
    if (d > size * 1.9) continue;

    const delta = block.position.clone().sub(other.position);

    let axis = "x";
    let max = Math.abs(delta.x);

    if (Math.abs(delta.y) > max) {
      axis = "y";
      max = Math.abs(delta.y);
    }

    if (Math.abs(delta.z) > max) {
      axis = "z";
      max = Math.abs(delta.z);
    }

    const p = other.position.clone();

    if (axis === "x") p.x += Math.sign(delta.x || 1) * size;
    if (axis === "y") p.y += Math.sign(delta.y || 1) * size;
    if (axis === "z") p.z += Math.sign(delta.z || 1) * size;

    const pd = block.position.distanceTo(p);

    if (pd < bestDistance && pd < size * 0.7) {
      bestDistance = pd;
      best = p;
    }
  }

  return best;
}

function releaseBlock() {
  if (!selectedBlock) return;

  const snap = findSnapPosition(selectedBlock);

  if (snap) {
    selectedBlock.position.copy(snap);
    statusEl.textContent = "Snapped";
  } else {
    statusEl.textContent = "Block placed";
  }

  selectedBlock.scale.setScalar(1);
  selectedBlock = null;
  grabbed = false;
}

function updateStatus() {
  if (!handSeen && !grabbed) {
    statusEl.textContent = "Show your hand";
  }
}

// ---------- Render ----------

function animate() {
  requestAnimationFrame(animate);

  if (renderer && scene && camera) {
    camera.updateFrame(renderer);
    renderer.render(scene, camera);
  }

  updateStatus();
}

window.addEventListener("resize", () => {
  if (renderer) renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Start ----------

(async function start() {
  try {
    initAR();

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    });

    handVideo.srcObject = stream;
    await handVideo.play();

    const handCamera = new Camera(handVideo, {
      onFrame: async () => {
        await hands.send({ image: handVideo });
      },
      width: 640,
      height: 480
    });

    handCamera.start();
    statusEl.textContent = "Show your hand";
  } catch (err) {
    console.error(err);
    showError(
      "Camera or hand tracking could not start. Make sure this site is served over HTTPS and camera access is allowed."
    );
  }
})();
