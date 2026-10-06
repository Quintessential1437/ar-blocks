// ==========================================
// HAND BLOCKS
// ==========================================

const video = document.getElementById("camera");
const canvas = document.getElementById("game");
const loading = document.getElementById("loading");
const errorBox = document.getElementById("error");


// ==========================================
// THREE.JS
// ==========================================

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.01,
  100
);

camera.position.set(0, 0, 6);


const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  alpha: true,
  antialias: true
});

renderer.setPixelRatio(
  Math.min(window.devicePixelRatio, 2)
);

renderer.setSize(
  window.innerWidth,
  window.innerHeight
);


// ==========================================
// LIGHTING
// ==========================================

const ambientLight = new THREE.AmbientLight(
  0xffffff,
  1.8
);

scene.add(ambientLight);


const directionalLight = new THREE.DirectionalLight(
  0xffffff,
  2
);

directionalLight.position.set(
  2,
  4,
  5
);

scene.add(directionalLight);


// ==========================================
// BLOCKS
// ==========================================

const blocks = [];

const blockColors = [
  0x00e5ff,
  0xff2bd6,
  0xff9d00,
  0x5cff5c,
  0x8a5cff,
  0xffff33
];


function createBlock(x, y, z, size, color) {

  const geometry = new THREE.BoxGeometry(
    size,
    size,
    size
  );

  const material = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.25,
    metalness: 0.2
  });

  const cube = new THREE.Mesh(
    geometry,
    material
  );

  cube.position.set(
    x,
    y,
    z
  );

  scene.add(cube);

  blocks.push(cube);

  return cube;
}


// ==========================================
// CREATE BLOCK FIELD
// ==========================================

createBlock(-1.3, 1.1, 0, 0.65, blockColors[0]);
createBlock(0, 1.1, 0, 0.65, blockColors[1]);
createBlock(1.3, 1.1, 0, 0.65, blockColors[2]);

createBlock(-1.3, 0, 0, 0.65, blockColors[3]);
createBlock(0, 0, 0, 0.65, blockColors[4]);
createBlock(1.3, 0, 0, 0.65, blockColors[5]);

createBlock(-1.3, -1.1, 0, 0.65, blockColors[5]);
createBlock(0, -1.1, 0, 0.65, blockColors[0]);
createBlock(1.3, -1.1, 0, 0.65, blockColors[1]);


// ==========================================
// FLOOR
// ==========================================

const floorGeometry =
  new THREE.PlaneGeometry(10, 10);

const floorMaterial =
  new THREE.MeshStandardMaterial({
    color: 0x111111,
    transparent: true,
    opacity: 0.18
  });

const floor =
  new THREE.Mesh(
    floorGeometry,
    floorMaterial
  );

floor.rotation.x = -Math.PI / 2;
floor.position.y = -2;

scene.add(floor);


// ==========================================
// HAND TRACKING
// ==========================================

let handX = 0;
let handY = 0;

let pinch = false;

let grabbedBlock = null;

let previousHandX = 0;
let previousHandY = 0;


function distance(a, b) {

  const dx = a.x - b.x;
  const dy = a.y - b.y;

  return Math.sqrt(
    dx * dx +
    dy * dy
  );
}


function processHands(results) {

  if (
    !results.multiHandLandmarks ||
    results.multiHandLandmarks.length === 0
  ) {

    grabbedBlock = null;

    return;
  }


  const hand =
    results.multiHandLandmarks[0];


  // INDEX FINGER
  const index =
    hand[8];

  // THUMB
  const thumb =
    hand[4];


  // Convert camera coordinates
  // into game coordinates

  handX =
    (1 - index.x) * 2 - 1;

  handY =
    -(index.y * 2 - 1);


  // Distance between thumb
  // and index finger

  const pinchDistance =
    distance(index, thumb);


  pinch =
    pinchDistance < 0.07;


  // ========================================
  // GRAB
  // ========================================

  if (pinch && !grabbedBlock) {

    let closest = null;

    let closestDistance = Infinity;


    for (const block of blocks) {

      const dx =
        block.position.x -
        handX * 3;

      const dy =
        block.position.y -
        handY * 3;


      const d =
        Math.sqrt(
          dx * dx +
          dy * dy
        );


      if (d < closestDistance) {

        closestDistance = d;

        closest = block;
      }
    }


    if (
      closest &&
      closestDistance < 1.4
    ) {

      grabbedBlock = closest;

      grabbedBlock.userData.grabbed = true;
    }
  }


  // ========================================
  // MOVE GRABBED BLOCK
  // ========================================

  if (
    pinch &&
    grabbedBlock
  ) {

    const targetX =
      handX * 3;

    const targetY =
      handY * 3;


    grabbedBlock.position.x +=
      (targetX -
       grabbedBlock.position.x) * 0.25;


    grabbedBlock.position.y +=
      (targetY -
       grabbedBlock.position.y) * 0.25;


    grabbedBlock.rotation.x += 0.02;

    grabbedBlock.rotation.y += 0.025;
  }


  // ========================================
  // RELEASE
  // ========================================

  if (
    !pinch &&
    grabbedBlock
  ) {

    grabbedBlock.userData.grabbed = false;

    grabbedBlock = null;
  }


  previousHandX = handX;
  previousHandY = handY;
}


// ==========================================
// MEDIAPIPE
// ==========================================

const hands =
  new Hands({
    locateFile: function(file) {

      return (
        "https://cdn.jsdelivr.net/npm/@mediapipe/hands/" +
        file
      );

    }
  });


hands.setOptions({

  maxNumHands: 1,

  modelComplexity: 1,

  minDetectionConfidence: 0.6,

  minTrackingConfidence: 0.6

});


hands.onResults(
  processHands
);


// ==========================================
// CAMERA
// ==========================================

async function startCamera() {

  try {

    const stream =
      await navigator.mediaDevices.getUserMedia({

        video: {
          facingMode: "user",

          width: {
            ideal: 1280
          },

          height: {
            ideal: 720
          }
        },

        audio: false

      });


    video.srcObject =
      stream;


    await video.play();


    const cameraController =
      new Camera(video, {

        onFrame: async function() {

          await hands.send({
            image: video
          });

        },

        width: 1280,

        height: 720

      });


    cameraController.start();


    loading.style.display =
      "none";

  }

  catch (err) {

    console.error(err);


    loading.style.display =
      "none";


    errorBox.style.display =
      "block";


    errorBox.innerHTML =
      "Camera could not start.<br><br>" +
      "Make sure you opened this website using HTTPS " +
      "and allowed camera access.";

  }
}


// ==========================================
// RESIZE
// ==========================================

window.addEventListener(
  "resize",
  function() {

    camera.aspect =
      window.innerWidth /
      window.innerHeight;

    camera.updateProjectionMatrix();


    renderer.setSize(
      window.innerWidth,
      window.innerHeight
    );

  }
);


// ==========================================
// ANIMATION
// ==========================================

function animate() {

  requestAnimationFrame(
    animate
  );


  for (const block of blocks) {

    if (
      block !== grabbedBlock
    ) {

      block.rotation.x +=
        0.002;

      block.rotation.y +=
        0.003;
    }
  }


  renderer.render(
    scene,
    camera
  );
}


animate();


// ==========================================
// START
// ==========================================

startCamera();
