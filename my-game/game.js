import * as THREE from "three";
import { GLTFLoader } from "three/addons/GLTFLoader.js";

// --- Canvas & Renderer ---
const canvas = document.querySelector("#game-canvas");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

// --- Scene & Camera ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.FogExp2(0x87ceeb, 0.011);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 600);

// --- Lighting ---
const hemiLight = new THREE.HemisphereLight(0xfff6e5, 0x4a7c40, 2.2);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffeedd, 2.8);
sunLight.position.set(35, 50, 25);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -50;
sunLight.shadow.camera.right = 50;
sunLight.shadow.camera.top = 50;
sunLight.shadow.camera.bottom = -50;
sunLight.shadow.bias = -0.0003;
sunLight.shadow.normalBias = 0.035;
scene.add(sunLight);

// --- Terrain Heightmap Function (Procedural Noise) ---
function getTerrainHeight(x, z) {
  const dist = Math.hypot(x, z);
  if (dist > 44) return -3.0;
  
  // Central elevation profile
  const islandFactor = Math.max(0.0, Math.cos(Math.min(1.0, dist / 42.0) * Math.PI * 0.5));
  const base = Math.pow(islandFactor, 1.3) * 6.5;
  
  // Multi-octave noise (deterministic)
  const n1 = Math.sin(x * 0.12) * Math.cos(z * 0.12) * 1.8;
  const n2 = Math.sin(x * 0.28 + z * 0.15) * Math.cos(x * 0.18 - z * 0.3) * 0.9;
  const n3 = Math.sin(x * 0.6) * Math.cos(z * 0.6) * 0.35;
  const noise = n1 + n2 + n3;
  
  // Shoreline flattening
  if (dist > 32) {
    const beachBlend = Math.min(1, (dist - 32) / 10.0);
    return (base + noise) * (1.0 - beachBlend) * 0.3 - 0.4;
  }
  
  return base + noise * islandFactor;
}

// --- High-Poly Island Terrain (Over 50,000 triangles) ---
function createHighPolyIsland() {
  const segments = 160;
  const size = 100;
  const geom = new THREE.PlaneGeometry(size, size, segments, segments);
  geom.rotateX(-Math.PI / 2);
  
  const pos = geom.attributes.position;
  const colors = [];
  const grassColor = new THREE.Color(0x3d7a2e);
  const grassLight = new THREE.Color(0x549b3f);
  const sandColor = new THREE.Color(0xe2c484);
  const wetSand = new THREE.Color(0xb89e6a);
  const cliffColor = new THREE.Color(0x6b665a);
  const tempCol = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = getTerrainHeight(x, z);
    pos.setY(i, h);
    
    const dist = Math.hypot(x, z);
    
    if (dist > 36 || h < -0.3) {
      // Underwater / beach wetness
      tempCol.copy(wetSand);
      if (h < -1.5) tempCol.copy(new THREE.Color(0x4e6f52)); // Seafloor
    } else if (h < 0.8) {
      tempCol.copy(sandColor);
      if (Math.random() > 0.8) tempCol.copy(sandColor).offsetHSL(0, 0, 0.04);
    } else {
      // Grass with variation
      tempCol.copy(grassColor).lerp(grassLight, Math.random() * 0.55);
      // Add cliff coloring where steep
      const steepness = Math.abs(getTerrainHeight(x + 1, z) - getTerrainHeight(x - 1, z)) + Math.abs(getTerrainHeight(x, z + 1) - getTerrainHeight(x, z - 1));
      if (steepness > 1.1) tempCol.lerp(cliffColor, Math.min(1, (steepness - 1.1) * 1.2));
    }
    
    colors.push(tempCol.r, tempCol.g, tempCol.b);
  }
  
  geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geom.computeVertexNormals();
  
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.0
  });
  
  const mesh = new THREE.Mesh(geom, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  scene.add(mesh);
  return mesh;
}
createHighPolyIsland();

// --- Ocean ---
const oceanGeom = new THREE.PlaneGeometry(400, 400, 32, 32);
oceanGeom.rotateX(-Math.PI / 2);
const oceanMat = new THREE.MeshStandardMaterial({
  color: 0x1a6f9e,
  roughness: 0.15,
  metalness: 0.5,
  transparent: true,
  opacity: 0.9
});
const ocean = new THREE.Mesh(oceanGeom, oceanMat);
ocean.position.y = -0.5;
scene.add(ocean);

// --- Collision System ---
const collisionCircles = []; // { x, z, radius }

function registerCollider(x, z, radius) {
  collisionCircles.push({ x, z, radius });
}

// --- Detailed Procedural Palm Trees ---
function makePalmTree(x, z, scale = 1) {
  const tree = new THREE.Group();
  const groundY = getTerrainHeight(x, z);
  tree.position.set(x, groundY - 0.15, z);
  tree.scale.setScalar(scale);

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7d5a3d, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d7a2e, roughness: 0.65, side: THREE.DoubleSide });

  const trunkSegments = 6;
  let curY = 0;
  let curX = 0;
  let prevX = 0;
  for (let i = 0; i < trunkSegments; i++) {
    const segH = 0.75;
    const bend = Math.sin(i * 0.4) * 0.25;
    const segGeom = new THREE.CylinderGeometry(0.19 - i * 0.018, 0.24 - i * 0.018, segH, 8);
    const seg = new THREE.Mesh(segGeom, trunkMat);
    seg.position.set(prevX + bend * 0.5, curY + segH / 2, 0);
    seg.rotation.z = -0.05;
    seg.castShadow = true;
    seg.receiveShadow = true;
    tree.add(seg);
    prevX = curX + bend;
    curX = prevX;
    curY += segH * 0.93;
  }

  // Leafy crown (16 fronds for density)
  const crownY = curY + 0.2;
  const frondCount = 16;
  for (let i = 0; i < frondCount; i++) {
    const angle = (i / frondCount) * Math.PI * 2;
    const leafGeom = new THREE.ConeGeometry(0.55, 2.8, 5);
    leafGeom.rotateX(Math.PI / 2.7);
    const leaf = new THREE.Mesh(leafGeom, leafMat);
    leaf.position.set(curX, crownY, 0);
    leaf.rotation.y = angle;
    leaf.rotation.x = Math.PI / 5;
    leaf.castShadow = true;
    tree.add(leaf);
    
    // Drooping outer fronds
    if (i % 2 === 0) {
      const outerLeaf = new THREE.Mesh(leafGeom, leafMat);
      outerLeaf.position.set(curX, crownY - 0.1, 0);
      outerLeaf.rotation.y = angle + 0.2;
      outerLeaf.rotation.x = Math.PI / 3.5;
      outerLeaf.castShadow = true;
      tree.add(outerLeaf);
    }
  }

  // Coconuts
  const coconutMat = new THREE.MeshStandardMaterial({ color: 0x5e4527, roughness: 0.8 });
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const coconut = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), coconutMat);
    coconut.position.set(curX + Math.cos(angle) * 0.3, crownY - 0.25, Math.sin(angle) * 0.3);
    coconut.castShadow = true;
    tree.add(coconut);
  }

  scene.add(tree);
  registerCollider(x, z, 0.6 * scale);
  return tree;
}

// Populate palms
const palmPositions = [
  [-12, -8, 1.1], [14, 10, 1.2], [-15, 12, 0.95], [16, -12, 1.05],
  [-6, 18, 1.0], [8, -17, 1.15], [-20, -5, 0.9], [19, 4, 1.0],
  [-10, 14, 1.0], [5, 20, 1.05], [-22, 8, 0.95], [22, -8, 1.0],
  [0, -20, 1.1], [-17, -15, 1.0], [17, 16, 1.05], [-4, -12, 1.1]
];
palmPositions.forEach(([x, z, s]) => makePalmTree(x, z, s));

// Rocks & boulders (Procedural, real colliders)
function makeBoulder(x, z, radius, detail = 1) {
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8b8578, roughness: 0.95, flatShading: true });
  const geom = new THREE.IcosahedronGeometry(radius, detail);
  // Deform vertices for natural irregularity
  const posAttr = geom.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vy = posAttr.getY(i);
    const vz = posAttr.getZ(i);
    const noise = Math.sin(vx * 3.1) * Math.cos(vy * 2.7) * Math.sin(vz * 3.3);
    const scale = 1.0 + noise * 0.22;
    posAttr.setXYZ(i, vx * scale, vy * scale * 0.8, vz * scale);
  }
  geom.computeVertexNormals();
  
  const rock = new THREE.Mesh(geom, rockMat);
  const groundY = getTerrainHeight(x, z);
  rock.position.set(x, groundY + radius * 0.35, z);
  rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
  rock.castShadow = true;
  rock.receiveShadow = true;
  scene.add(rock);
  registerCollider(x, z, radius * 0.95);
  return rock;
}

// Scatter boulders
const boulderPlacements = [
  [-18, -12, 1.5], [21, 14, 1.2], [-24, 3, 1.8], [24, -5, 1.4],
  [-8, -22, 1.3], [10, 22, 1.1], [-27, -18, 2.2], [28, 10, 1.6],
  [-14, 20, 1.0], [6, -24, 1.4], [30, -14, 1.9], [-30, 12, 1.5]
];
boulderPlacements.forEach(([x, z, r]) => makeBoulder(x, z, r, 1));

// Poly Haven asset rocks (High-res enhancement, non-blocking)
const gltfLoader = new GLTFLoader();
function loadAssetSafely(url, onLoad) {
  gltfLoader.load(
    url,
    (gltf) => {
      gltf.scene.traverse((n) => {
        if (n.isMesh) {
          n.castShadow = true;
          n.receiveShadow = true;
        }
      });
      onLoad(gltf.scene);
    },
    undefined,
    (err) => console.warn(`Asset ${url} loaded with fallback procedural rocks:`, err)
  );
}

loadAssetSafely("./assets/rock_moss_set_01/rock_moss_set_01_1k.gltf", (model) => {
  model.scale.setScalar(1.1);
  model.position.set(-22, getTerrainHeight(-22, 0) + 0.2, 0);
  scene.add(model);
  registerCollider(-22, 0, 2.2);
});

loadAssetSafely("./assets/rock_face_01/rock_face_01_1k.gltf", (model) => {
  model.scale.setScalar(0.9);
  model.position.set(26, getTerrainHeight(26, -10) + 0.2, -10);
  scene.add(model);
  registerCollider(26, -10, 2.5);
});

// --- Grass Tufts (Instanced for performance) ---
const grassTufts = new THREE.InstancedMesh(
  new THREE.ConeGeometry(0.12, 0.7, 4),
  new THREE.MeshStandardMaterial({ color: 0x4a9e3a, roughness: 0.85 }),
  600
);
const grassDummy = new THREE.Object3D();
let grassCount = 0;
for (let i = 0; i < 600; i++) {
  const x = (Math.random() - 0.5) * 60;
  const z = (Math.random() - 0.5) * 60;
  const dist = Math.hypot(x, z);
  if (dist < 30) {
    const h = getTerrainHeight(x, z);
    if (h > 0.8) {
      grassDummy.position.set(x, h + 0.3, z);
      grassDummy.rotation.set((Math.random() - 0.5) * 0.4, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.4);
      grassDummy.scale.setScalar(0.8 + Math.random() * 0.6);
      grassDummy.updateMatrix();
      grassTufts.setMatrixAt(grassCount++, grassDummy.matrix);
    }
  }
}
grassTufts.count = grassCount;
grassTufts.instanceMatrix.needsUpdate = true;
grassTufts.castShadow = false;
scene.add(grassTufts);

// --- Detailed Player Character ---
function createPlayer() {
  const avatar = new THREE.Group();
  avatar.name = "Player";

  // Materials
  const shirtMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, roughness: 0.7 });
  const vestMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.75 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd99573, roughness: 0.8 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.8 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x2c1f18, roughness: 0.95 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
  const backpackMat = new THREE.MeshStandardMaterial({ color: 0x8b6f47, roughness: 0.9 });

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.30, 20, 20), skinMat);
  head.position.y = 1.80;
  head.castShadow = true;
  avatar.add(head);

  // Hair (cap style)
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.58), hairMat);
  hair.position.y = 1.86;
  hair.castShadow = true;
  avatar.add(hair);

  // Eyes
  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeMat);
  leftEye.position.set(-0.11, 1.82, 0.27);
  avatar.add(leftEye);

  const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeMat);
  rightEye.position.set(0.11, 1.82, 0.27);
  avatar.add(rightEye);

  // Neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.14, 10), skinMat);
  neck.position.y = 1.62;
  avatar.add(neck);

  // Torso
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.72, 10, 16), shirtMat);
  torso.position.y = 1.15;
  torso.castShadow = true;
  avatar.add(torso);

  // Backpack
  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.28), backpackMat);
  backpack.position.set(0, 1.22, -0.35);
  backpack.castShadow = true;
  avatar.add(backpack);

  // Shoulder Straps
  const leftStrap = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.06), vestMat);
  leftStrap.position.set(-0.17, 1.28, -0.22);
  avatar.add(leftStrap);

  const rightStrap = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.06), vestMat);
  rightStrap.position.set(0.17, 1.28, -0.22);
  avatar.add(rightStrap);

  // Arms
  avatar.leftArm = new THREE.Group();
  avatar.leftArm.position.set(-0.42, 1.42, 0);
  const leftUpperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.48, 6, 10), shirtMat);
  leftUpperArm.position.y = -0.3;
  leftUpperArm.castShadow = true;
  avatar.leftArm.add(leftUpperArm);
  const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), skinMat);
  leftHand.position.y = -0.6;
  avatar.leftArm.add(leftHand);
  avatar.add(avatar.leftArm);

  avatar.rightArm = new THREE.Group();
  avatar.rightArm.position.set(0.42, 1.42, 0);
  const rightUpperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.48, 6, 10), shirtMat);
  rightUpperArm.position.y = -0.3;
  rightUpperArm.castShadow = true;
  avatar.rightArm.add(rightUpperArm);
  const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), skinMat);
  rightHand.position.y = -0.6;
  avatar.rightArm.add(rightHand);
  avatar.add(avatar.rightArm);

  // Legs
  avatar.leftLeg = new THREE.Group();
  avatar.leftLeg.position.set(-0.17, 0.78, 0);
  const leftThigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.5, 6, 10), pantsMat);
  leftThigh.position.y = -0.3;
  leftThigh.castShadow = true;
  avatar.leftLeg.add(leftThigh);
  const leftBoot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.3), shoeMat);
  leftBoot.position.set(0, -0.68, 0.05);
  leftBoot.castShadow = true;
  avatar.leftLeg.add(leftBoot);
  avatar.add(avatar.leftLeg);

  avatar.rightLeg = new THREE.Group();
  avatar.rightLeg.position.set(0.17, 0.78, 0);
  const rightThigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.5, 6, 10), pantsMat);
  rightThigh.position.y = -0.3;
  rightThigh.castShadow = true;
  avatar.rightLeg.add(rightThigh);
  const rightBoot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.3), shoeMat);
  rightBoot.position.set(0, -0.68, 0.05);
  rightBoot.castShadow = true;
  avatar.rightLeg.add(rightBoot);
  avatar.add(avatar.rightLeg);

  return avatar;
}

const player = createPlayer();
scene.add(player);

// Dynamic Ground Shadow
const shadowMesh = new THREE.Mesh(
  new THREE.CircleGeometry(0.55, 24),
  new THREE.MeshBasicMaterial({ color: 0x051208, transparent: true, opacity: 0.35, depthWrite: false })
);
shadowMesh.rotation.x = -Math.PI / 2;
scene.add(shadowMesh);

// --- Touch Controls (Dynamic floating joystick + camera look) ---
const leftZone = document.querySelector("#left-zone");
const joystickBase = document.querySelector("#joystick-base");
const joystickKnob = document.querySelector("#joystick-knob");
const rightZone = document.querySelector("#right-zone");
const btnJump = document.querySelector("#btn-jump");
const btnSprint = document.querySelector("#btn-sprint");

let joystickActive = false;
let joystickPointerId = null;
let joystickOriginX = 0;
let joystickOriginY = 0;
const JOYSTICK_MAX_RADIUS = 50;
const inputVector = { x: 0, y: 0 };

leftZone.addEventListener("pointerdown", (e) => {
  if (joystickActive) return;
  joystickActive = true;
  joystickPointerId = e.pointerId;
  leftZone.setPointerCapture(e.pointerId);
  
  joystickOriginX = e.clientX;
  joystickOriginY = e.clientY;
  joystickBase.style.left = `${joystickOriginX}px`;
  joystickBase.style.top = `${joystickOriginY}px`;
  joystickBase.classList.remove("hidden");
  joystickKnob.style.transform = `translate(0px, 0px)`;
  inputVector.x = 0;
  inputVector.y = 0;
});

leftZone.addEventListener("pointermove", (e) => {
  if (!joystickActive || e.pointerId !== joystickPointerId) return;
  
  const dx = e.clientX - joystickOriginX;
  const dy = e.clientY - joystickOriginY;
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const clampedDist = Math.min(dist, JOYSTICK_MAX_RADIUS);
  
  const knobX = Math.cos(angle) * clampedDist;
  const knobY = Math.sin(angle) * clampedDist;
  joystickKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;
  
  if (clampedDist > 6) {
    inputVector.x = knobX / JOYSTICK_MAX_RADIUS;
    inputVector.y = knobY / JOYSTICK_MAX_RADIUS;
  } else {
    inputVector.x = 0;
    inputVector.y = 0;
  }
});

function endJoystick(e) {
  if (e.pointerId === joystickPointerId) {
    joystickActive = false;
    joystickPointerId = null;
    joystickBase.classList.add("hidden");
    joystickKnob.style.transform = `translate(0px, 0px)`;
    inputVector.x = 0;
    inputVector.y = 0;
  }
}
leftZone.addEventListener("pointerup", endJoystick);
leftZone.addEventListener("pointercancel", endJoystick);

// Camera Look
let lookActive = false;
let lookPointerId = null;
let lastLookX = 0;
let lastLookY = 0;
let cameraYaw = 0.5;
let cameraPitch = 0.32;
const CAMERA_SENSITIVITY = 0.005;

rightZone.addEventListener("pointerdown", (e) => {
  if (e.target.closest(".action-btn")) return;
  if (lookActive) return;
  lookActive = true;
  lookPointerId = e.pointerId;
  lastLookX = e.clientX;
  lastLookY = e.clientY;
  rightZone.setPointerCapture(e.pointerId);
});

rightZone.addEventListener("pointermove", (e) => {
  if (!lookActive || e.pointerId !== lookPointerId) return;
  const dx = e.clientX - lastLookX;
  const dy = e.clientY - lastLookY;
  
  cameraYaw -= dx * CAMERA_SENSITIVITY;
  cameraPitch = THREE.MathUtils.clamp(cameraPitch - dy * CAMERA_SENSITIVITY, 0.02, 1.1);
  
  lastLookX = e.clientX;
  lastLookY = e.clientY;
});

function endLook(e) {
  if (e.pointerId === lookPointerId) {
    lookActive = false;
    lookPointerId = null;
  }
}
rightZone.addEventListener("pointerup", endLook);
rightZone.addEventListener("pointercancel", endLook);

// Action Buttons
let isSprinting = false;
let isGrounded = true;
let playerVelocityY = 0;
const GRAVITY = -26;
const JUMP_POWER = 8.5;

function doJump() {
  if (isGrounded) {
    playerVelocityY = JUMP_POWER;
    isGrounded = false;
  }
}

btnJump.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  doJump();
});

btnSprint.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  isSprinting = !isSprinting;
  btnSprint.classList.toggle("active", isSprinting);
});

// Keyboard Fallback
const keys = {};
window.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (e.code === "Space") doJump();
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
    isSprinting = true;
    btnSprint.classList.add("active");
  }
});
window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
    isSprinting = false;
    btnSprint.classList.remove("active");
  }
});

// --- Physics & Collisions ---
const WORLD_RADIUS = 38;
function resolveCollisions(px, pz) {
  for (const c of collisionCircles) {
    const dx = px - c.x;
    const dz = pz - c.z;
    const dist = Math.hypot(dx, dz);
    const minDist = c.radius + 0.45;
    if (dist < minDist && dist > 0.0001) {
      const push = (minDist - dist) / dist;
      px += dx * push;
      pz += dz * push;
    }
  }
  return [px, pz];
}

// --- Main Game Loop ---
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const moveDir = new THREE.Vector3();
const cameraTarget = new THREE.Vector3(0, 1.6, 0);
const desiredCamPos = new THREE.Vector3();
const CAMERA_DISTANCE = 4.2; // Closer camera

let lastTime = performance.now();
let walkCycle = 0;

function tick(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  
  // Keyboard input resolution
  const kx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const ky = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  const cx = Math.abs(inputVector.x) > 0.05 ? inputVector.x : kx;
  const cy = Math.abs(inputVector.y) > 0.05 ? inputVector.y : ky;
  
  // Direction relative to camera yaw
  forward.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
  right.set(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
  moveDir.set(0, 0, 0).addScaledVector(forward, -cy).addScaledVector(right, cx);
  
  const inputMag = Math.min(1, Math.hypot(cx, cy));
  const isMoving = inputMag > 0.08;
  
  const baseSpeed = isSprinting ? 11.0 : 6.5;
  const currentSpeed = baseSpeed * inputMag;
  
  if (isMoving) {
    moveDir.normalize();
    let nextX = player.position.x + moveDir.x * currentSpeed * dt;
    let nextZ = player.position.z + moveDir.z * currentSpeed * dt;
    
    // Collisions (trees & rocks)
    [nextX, nextZ] = resolveCollisions(nextX, nextZ);
    
    // World boundary
    const distFromCenter = Math.hypot(nextX, nextZ);
    if (distFromCenter > WORLD_RADIUS) {
      const scale = WORLD_RADIUS / distFromCenter;
      nextX *= scale;
      nextZ *= scale;
    }
    
    player.position.x = nextX;
    player.position.z = nextZ;
    
    // Smoothly turn character toward move direction
    const targetAngle = Math.atan2(moveDir.x, moveDir.z);
    let diff = targetAngle - player.rotation.y;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    player.rotation.y += diff * Math.min(1, dt * 16);
    
    // Walking animation
    walkCycle += dt * (isSprinting ? 15 : 9);
    const swing = Math.sin(walkCycle) * (isSprinting ? 0.75 : 0.5);
    player.leftLeg.rotation.x = swing;
    player.rightLeg.rotation.x = -swing;
    player.leftArm.rotation.x = -swing * 0.9;
    player.rightArm.rotation.x = swing * 0.9;
  } else {
    // Idle breathing animation
    player.leftLeg.rotation.x = THREE.MathUtils.lerp(player.leftLeg.rotation.x, 0, dt * 10);
    player.rightLeg.rotation.x = THREE.MathUtils.lerp(player.rightLeg.rotation.x, 0, dt * 10);
    player.leftArm.rotation.x = THREE.MathUtils.lerp(player.leftArm.rotation.x, 0, dt * 10);
    player.rightArm.rotation.x = THREE.MathUtils.lerp(player.rightArm.rotation.x, 0, dt * 10);
  }
  
  // Ground elevation & jump physics
  const groundY = getTerrainHeight(player.position.x, player.position.z);
  if (!isGrounded) {
    playerVelocityY += GRAVITY * dt;
    player.position.y += playerVelocityY * dt;
    if (player.position.y <= groundY) {
      player.position.y = groundY;
      playerVelocityY = 0;
      isGrounded = true;
    }
  } else {
    player.position.y = THREE.MathUtils.lerp(player.position.y, groundY, dt * 20);
  }
  
  // Ground shadow
  shadowMesh.position.set(player.position.x, groundY + 0.04, player.position.z);
  const airOffset = Math.max(0, player.position.y - groundY);
  shadowMesh.scale.setScalar(THREE.MathUtils.clamp(1 - airOffset * 0.22, 0.35, 1));
  
  // Smooth camera tracking (close third-person)
  cameraTarget.lerp(
    new THREE.Vector3(player.position.x, player.position.y + 1.5, player.position.z),
    1 - Math.exp(-dt * 14)
  );
  
  const flatDist = Math.cos(cameraPitch) * CAMERA_DISTANCE;
  desiredCamPos.set(
    cameraTarget.x + Math.sin(cameraYaw) * flatDist,
    cameraTarget.y + Math.sin(cameraPitch) * CAMERA_DISTANCE,
    cameraTarget.z + Math.cos(cameraYaw) * flatDist
  );
  camera.position.lerp(desiredCamPos, 1 - Math.exp(-dt * 12));
  camera.lookAt(cameraTarget);
  
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// Resize handler
function onWindowResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", onWindowResize);
onWindowResize();

// Start the game
requestAnimationFrame(tick);
