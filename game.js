(() => {
  const video = document.getElementById("camera");
  const canvas = document.getElementById("scene");
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");
  const startBtn = document.getElementById("start");
  const addBtn = document.getElementById("add");

  let renderer, scene, camera, handModel, cameraHelper;
  let blocks = [];
  let pinchWasDown = false;
  let heldBlock = null;
  let handPoint = new THREE.Vector2(0, 0);
  let handVisible = false;
  let processing = false;

  function showError(message) {
    errorEl.textContent = message;
    errorEl.style.display = "block";
    statusEl.textContent = "Needs attention";
  }

  function initScene() {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0, 7);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x26304a, 1.8));
    const key = new THREE.DirectionalLight(0xffffff, 2.3);
    key.position.set(-3, 5, 8);
    scene.add(key);

    // Camera-facing play space: this V2 isolates camera + hand tracking first.
    addBlock(0, 0, 0);
    addBlock(-1.05, -0.15, -0.25);
    addBlock(1.05, -0.15, -0.25);
    window.addEventListener("resize", resize);
    animate();
  }

  function makeBlockMaterial(color) {
    return new THREE.MeshStandardMaterial({
      color, roughness: 0.28, metalness: 0.08,
      emissive: color, emissiveIntensity: 0.08
    });
  }

  function addBlock(x, y, z) {
    const geometry = new THREE.BoxGeometry(0.88, 0.88, 0.88);
    const mesh = new THREE.Mesh(geometry, makeBlockMaterial([0x36d7ff,0xffb84d,0xb68cff,0x55e6a5,0xff6e91][blocks.length % 5]));
    mesh.position.set(x, y, z);
    mesh.userData.homeZ = z;
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
    );
    mesh.add(edges);
    scene.add(mesh);
    blocks.push(mesh);
    return mesh;
  }

  function resize() {
    if (!renderer || !camera) return;
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  function getScreenWorld(x, y) {
    const ndc = new THREE.Vector3(x * 2 - 1, 1 - y * 2, 0.5);
    ndc.unproject(camera);
    const dir = ndc.sub(camera.position).normalize();
    const distance = (0 - camera.position.z) / dir.z;
    return camera.position.clone().add(dir.multiplyScalar(distance));
  }

  function processHands(results) {
    if (!results.multiHandLandmarks || !results.multiHandLandmarks.length) {
      handVisible = false;
      heldBlock = null;
      pinchWasDown = false;
      statusEl.textContent = "Show your hand";
      return;
    }

    const lm = results.multiHandLandmarks[0];
    const index = lm[8], thumb = lm[4];
    // Mirror X to match the mirrored front-camera preview.
    const x = 1 - (index.x + thumb.x) * 0.5;
    const y = (index.y + thumb.y) * 0.5;
    handPoint.set(x, y);
    handVisible = true;
    const pinchDistance = Math.hypot(index.x - thumb.x, index.y - thumb.y);
    const pinching = pinchDistance < 0.075;
    const world = getScreenWorld(x, y);

    if (pinching && !pinchWasDown) {
      let nearest = null, nearestDistance = Infinity;
      for (const block of blocks) {
        const d = block.position.distanceTo(world);
        if (d < nearestDistance) { nearestDistance = d; nearest = block; }
      }
      heldBlock = nearestDistance < 1.2 ? nearest : null;
    }

    if (pinching && heldBlock) {
      heldBlock.position.x += (world.x - heldBlock.position.x) * 0.45;
      heldBlock.position.y += (world.y - heldBlock.position.y) * 0.45;
      heldBlock.position.z += (world.z - heldBlock.position.z) * 0.45;
      statusEl.textContent = "Pinch to move";
    } else if (!pinching) {
      heldBlock = null;
      statusEl.textContent = "Hand detected";
    }
    pinchWasDown = pinching;
  }

  async function start() {
    errorEl.style.display = "none";
    startBtn.disabled = true;
    statusEl.textContent = "Starting camera…";
    try {
      if (!window.isSecureContext) {
        throw new Error("This page is not in a secure context. Open the https:// GitHub Pages address, not a preview or http:// link.");
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("This browser does not expose camera access. Open the site in Safari and check camera permissions.");
      }

      // Request one camera stream and reuse it for both the visible preview and MediaPipe.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      video.srcObject = stream;
      await video.play();

      const hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });
      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.55
      });
      hands.onResults(processHands);

      // MediaPipe's Camera helper only schedules frames; it uses the existing video stream.
      cameraHelper = new Camera(video, {
        onFrame: async () => {
          if (processing) return;
          processing = true;
          try { await hands.send({ image: video }); }
          catch (err) { console.error(err); }
          processing = false;
        },
        width: 1280,
        height: 720
      });
      await cameraHelper.start();

      startBtn.textContent = "CAMERA RUNNING";
      addBtn.disabled = false;
      statusEl.textContent = "Show your hand";
      document.getElementById("hint").textContent = "Pinch your thumb and index finger near a block, then move your hand.";
    } catch (err) {
      console.error(err);
      startBtn.disabled = false;
      showError(err && err.message ? err.message : "Camera or hand tracking could not start. Check camera permissions and reload.");
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    if (!renderer) return;
    const t = performance.now() * 0.001;
    blocks.forEach((b, i) => {
      if (b !== heldBlock) {
        b.rotation.y = Math.sin(t * 0.45 + i) * 0.035;
        b.rotation.x = Math.cos(t * 0.35 + i) * 0.025;
      }
    });
    renderer.render(scene, camera);
  }

  startBtn.addEventListener("click", start);
  addBtn.addEventListener("click", () => {
    if (!scene) return;
    const x = (Math.random() - 0.5) * 2.2;
    const y = (Math.random() - 0.5) * 1.4;
    addBlock(x, y, -0.2);
  });

  initScene();
})();