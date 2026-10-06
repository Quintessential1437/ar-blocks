/* =========================================================
   AR TETRIS PORTAL
   Camera + 3D Tetris
   ========================================================= */
const video = document.getElementById("camera");
const canvas = document.getElementById("game");
const startScreen = document.getElementById("startScreen");
const startButton = document.getElementById("startButton");
const message = document.getElementById("message");
const scoreElement = document.getElementById("score");
/* =========================================================
   CAMERA
   ========================================================= */
async function startCamera() {
  message.textContent = "Requesting camera...";
  try {
    if (!navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        "Camera API is not available."
      );
    }
    const stream =
      await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: {
            ideal: "environment"
          },
          width: {
            ideal: 1920
          },
          height: {
            ideal: 1080
          }
        },
        audio: false
      });
    video.srcObject = stream;
    await video.play();
    message.textContent =
      "Camera connected";
    console.log("CAMERA STARTED");
    setTimeout(() => {
      startScreen.style.display = "none";
      startGame();
    }, 700);
  } catch (error) {
    console.error(
      "CAMERA ERROR:",
      error
    );
    message.innerHTML =
      "Camera could not start.<br><br>" +
      "<b>" +
      error.message +
      "</b><br><br>" +
      "Make sure camera access is allowed.";
    startButton.textContent =
      "TRY AGAIN";
  }
}
/* =========================================================
   START BUTTON
   ========================================================= */
startButton.addEventListener(
  "click",
  startCamera
);
/* =========================================================
   THREE.JS
   ========================================================= */
let scene;
let camera;
let renderer;
let gameGroup;
let score = 0;
let fallingBlock;
let fallTimer = 0;
/* =========================================================
   BOARD
   ========================================================= */
const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const BLOCK_SIZE = 0.35;
/* =========================================================
   COLORS
   ========================================================= */
const COLORS = [
  0x00e5ff,
  0x4c6fff,
  0xff9d00,
  0xffee00,
  0x00ff88,
  0xcc44ff,
  0xff3355
];
/* =========================================================
   START GAME
   ========================================================= */
function startGame() {
  scene =
    new THREE.Scene();
  /* CAMERA */
  camera =
    new THREE.PerspectiveCamera(
      60,
      window.innerWidth /
      window.innerHeight,
      0.01,
      100
    );
  /*
    IMPORTANT:
    The game is placed in front
    of the camera initially.
  */
  camera.position.set(
    0,
    0,
    0
  );
  /* RENDERER */
  renderer =
    new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: true
    });
  renderer.setPixelRatio(
    Math.min(
      window.devicePixelRatio,
      2
    )
  );
  renderer.setSize(
    window.innerWidth,
    window.innerHeight
  );
  renderer.outputEncoding =
    THREE.sRGBEncoding;
  /* LIGHT */
  const ambientLight =
    new THREE.AmbientLight(
      0xffffff,
      1.8
    );
  scene.add(
    ambientLight
  );
  const directionalLight =
    new THREE.DirectionalLight(
      0xffffff,
      2
    );
  directionalLight.position.set(
    2,
    5,
    4
  );
  scene.add(
    directionalLight
  );
  /* GAME CONTAINER */
  gameGroup =
    new THREE.Group();
  scene.add(
    gameGroup
  );
  /*
    Put the game several meters
    in front of the phone.
    This gives the player room
    to physically walk around it.
  */
  gameGroup.position.set(
    0,
    0,
    -4
  );
  createBoundary();
  createBlock();
  animate();
}
/* =========================================================
   CREATE BOUNDARY
   ========================================================= */
function createBoundary() {
  const width =
    BOARD_WIDTH *
    BLOCK_SIZE;
  const height =
    BOARD_HEIGHT *
    BLOCK_SIZE;
  const material =
    new THREE.LineBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.7
    });
  const geometry =
    new THREE.BufferGeometry();
  const points = [
    new THREE.Vector3(
      -width / 2,
      -height / 2,
      0
    ),
    new THREE.Vector3(
      width / 2,
      -height / 2,
      0
    ),
    new THREE.Vector3(
      width / 2,
      height / 2,
      0
    ),
    new THREE.Vector3(
      -width / 2,
      height / 2,
      0
    ),
    new THREE.Vector3(
      -width / 2,
      -height / 2,
      0
    )
  ];
  geometry.setFromPoints(
    points
  );
  const boundary =
    new THREE.Line(
      geometry,
      material
    );
  gameGroup.add(
    boundary
  );
}
/* =========================================================
   CREATE TETRIS BLOCK
   ========================================================= */
function createBlock() {
  if (fallingBlock) {
    gameGroup.remove(
      fallingBlock
    );
  }
  fallingBlock =
    new THREE.Group();
  const color =
    COLORS[
      Math.floor(
        Math.random() *
        COLORS.length
      )
    ];
  const material =
    new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.25,
      metalness: 0.35
    });
  /*
    Create a simple 4-block
    Tetris shape.
  */
  const shape = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1]
  ];
  shape.forEach(
    ([x, y]) => {
      const geometry =
        new THREE.BoxGeometry(
          BLOCK_SIZE * 0.92,
          BLOCK_SIZE * 0.92,
          BLOCK_SIZE * 0.92
        );
      const cube =
        new THREE.Mesh(
          geometry,
          material
        );
      cube.position.set(
        x * BLOCK_SIZE,
        y * BLOCK_SIZE,
        0
      );
      fallingBlock.add(
        cube
      );
    }
  );
  fallingBlock.position.set(
    -BLOCK_SIZE,
    2.5,
    0
  );
  gameGroup.add(
    fallingBlock
  );
}
/* =========================================================
   TOUCH CONTROLS
   ========================================================= */
let touchStartX = 0;
let touchStartY = 0;
window.addEventListener(
  "touchstart",
  event => {
    if (!fallingBlock)
      return;
    const touch =
      event.touches[0];
    touchStartX =
      touch.clientX;
    touchStartY =
      touch.clientY;
  },
  {
    passive: true
  }
);
window.addEventListener(
  "touchend",
  event => {
    if (!fallingBlock)
      return;
    const touch =
      event.changedTouches[0];
    const dx =
      touch.clientX -
      touchStartX;
    const dy =
      touch.clientY -
      touchStartY;
    /*
      SWIPE LEFT / RIGHT
    */
    if (
      Math.abs(dx) >
      40
    ) {
      fallingBlock.position.x +=
        dx > 0
          ? BLOCK_SIZE
          : -BLOCK_SIZE;
    }
    /*
      TAP = ROTATE
    */
    else if (
      Math.abs(dx) < 20 &&
      Math.abs(dy) < 20
    ) {
      fallingBlock.rotation.z +=
        Math.PI / 2;
    }
  },
  {
    passive: true
  }
);
/* =========================================================
   FALLING BLOCK
   ========================================================= */
function updateGame(
  delta
) {
  if (!fallingBlock)
    return;
  fallTimer += delta;
  if (
    fallTimer > 700
  ) {
    fallingBlock.position.y -=
      BLOCK_SIZE;
    fallTimer = 0;
    /*
      Simple bottom limit.
    */
    const bottom =
      -(BOARD_HEIGHT *
        BLOCK_SIZE) / 2;
    if (
      fallingBlock.position.y <
      bottom
    ) {
      score += 10;
      scoreElement.textContent =
        "SCORE: " +
        score;
      createBlock();
    }
  }
}
/* =========================================================
   ANIMATION
   ========================================================= */
let lastTime =
  performance.now();
function animate() {
  requestAnimationFrame(
    animate
  );
  const now =
    performance.now();
  const delta =
    now - lastTime;
  lastTime =
    now;
  updateGame(
    delta
  );
  /*
    VERY SLOW rotation gives
    the blocks a 3D appearance.
  */
  if (fallingBlock) {
    fallingBlock.rotation.y +=
      0.002;
  }
  renderer.render(
    scene,
    camera
  );
}
/* =========================================================
   RESIZE
   ========================================================= */
window.addEventListener(
  "resize",
  () => {
    if (!camera || !renderer)
      return;
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
