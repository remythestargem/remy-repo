import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const canvas = document.querySelector("#game-canvas");
const hint = document.querySelector("#hint");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x78bad5);
scene.fog = new THREE.FogExp2(0x78bad5, 0.016);
const camera = new THREE.PerspectiveCamera(53, 9 / 16, 0.1, 220);
camera.position.set(10, 8, 12);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.09;
controls.enablePan = false;
controls.minDistance = 5.3;
controls.maxDistance = 16;
controls.minPolarAngle = 0.56;
controls.maxPolarAngle = 1.3;
controls.target.set(0, 1.1, 0);

scene.add(new THREE.HemisphereLight(0xdff5ff, 0x263719, 2.4));
const sun = new THREE.DirectionalLight(0xffedc4, 3.3);
sun.position.set(28, 36, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -38;
sun.shadow.camera.right = 38;
sun.shadow.camera.top = 38;
sun.shadow.camera.bottom = -38;
scene.add(sun);

function makeCharacter() {
  const avatar = new THREE.Group();
  avatar.name = "Player placeholder";
  const suit = new THREE.MeshStandardMaterial({ color: 0x2e73d3, roughness: 0.76 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc98762, roughness: 0.82 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x172238, roughness: 0.67 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x202018, roughness: 0.95 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.88, 6, 12), suit);
  body.position.y = 1.08; body.castShadow = body.receiveShadow = true; avatar.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 14), skin);
  head.position.y = 1.92; head.castShadow = true; avatar.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.375, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.54), hair);
  cap.position.y = 2.04; cap.castShadow = true; avatar.add(cap);
  for (const x of [-0.23, 0.23]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.48, 4, 8), dark);
    leg.position.set(x, 0.47, 0); leg.castShadow = true; avatar.add(leg);
  }
  for (const x of [-0.49, 0.49]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.5, 4, 8), suit);
    arm.position.set(x, 1.22, 0); arm.rotation.z = x < 0 ? -0.16 : 0.16; arm.castShadow = true; avatar.add(arm);
  }
  return avatar;
}
const player = makeCharacter();
scene.add(player);

const shadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.64, 24),
  new THREE.MeshBasicMaterial({ color: 0x10210e, transparent: true, opacity: 0.28, depthWrite: false })
);
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = 0.028;
scene.add(shadow);

// Visible edge and hard movement limit keep the player and camera inside the island.
const WORLD_RADIUS = 29;
const edge = new THREE.Mesh(
  new THREE.RingGeometry(WORLD_RADIUS - 0.14, WORLD_RADIUS + 0.14, 160),
  new THREE.MeshBasicMaterial({ color: 0xffdda1, transparent: true, opacity: 0.46, side: THREE.DoubleSide })
);
edge.rotation.x = -Math.PI / 2;
edge.position.y = 0.08;
scene.add(edge);
for (let i = 0; i < 18; i++) {
  const a = i / 18 * Math.PI * 2;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.1, 0.48, 8), new THREE.MeshStandardMaterial({ color: 0xefd18d, emissive: 0x6b3d12, emissiveIntensity: 0.32 }));
  post.position.set(Math.cos(a) * WORLD_RADIUS, 0.3, Math.sin(a) * WORLD_RADIUS);
  post.castShadow = true; scene.add(post);
}

function makeFallbackIsland() {
  const island = new THREE.Group();
  const grass = new THREE.MeshStandardMaterial({ color: 0x3b7729, roughness: 0.94 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x59635c, roughness: 0.96 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(29, 25, 1.5, 96), grass);
  top.position.y = -0.76; top.receiveShadow = true; island.add(top);
  const underside = new THREE.Mesh(new THREE.ConeGeometry(25, 18, 96), stone);
  underside.position.y = -10.4; underside.rotation.x = Math.PI; underside.castShadow = underside.receiveShadow = true; island.add(underside);
  scene.add(island);
}

new GLTFLoader().load(
  "assets/world/world.gltf",
  (gltf) => {
    gltf.scene.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
    scene.add(gltf.scene);
    hint.textContent = "Explore the island · stay inside the gold boundary";
  },
  undefined,
  () => { makeFallbackIsland(); hint.textContent = "Island fallback loaded · stay inside the gold boundary"; }
);

const move = { x: 0, y: 0, up: false, down: false };
const pad = document.querySelector("#joystick");
const stick = document.querySelector("#stick");
let activePointer = null;
function setStick(event) {
  const rect = pad.getBoundingClientRect();
  const dx = event.clientX - rect.left - rect.width / 2, dy = event.clientY - rect.top - rect.height / 2, max = 37;
  const scale = Math.min(1, max / (Math.hypot(dx, dy) || 1));
  move.x = dx / max * scale; move.y = dy / max * scale;
  stick.style.transform = `translate(${move.x * max}px, ${move.y * max}px)`;
}
pad.addEventListener("pointerdown", (event) => { activePointer = event.pointerId; pad.setPointerCapture(activePointer); setStick(event); });
pad.addEventListener("pointermove", (event) => { if (event.pointerId === activePointer) setStick(event); });
for (const type of ["pointerup", "pointercancel"]) pad.addEventListener(type, (event) => { if (event.pointerId === activePointer) { activePointer = null; move.x = move.y = 0; stick.style.transform = ""; } });
for (const [id, key] of [["up", "up"], ["down", "down"]]) {
  const button = document.querySelector(`#${id}`);
  button.addEventListener("pointerdown", (event) => { move[key] = true; button.setPointerCapture(event.pointerId); });
  for (const type of ["pointerup", "pointercancel"]) button.addEventListener(type, () => move[key] = false);
}
addEventListener("keydown", (event) => {
  if (["KeyW", "ArrowUp"].includes(event.code)) move.y = -1;
  if (["KeyS", "ArrowDown"].includes(event.code)) move.y = 1;
  if (["KeyA", "ArrowLeft"].includes(event.code)) move.x = -1;
  if (["KeyD", "ArrowRight"].includes(event.code)) move.x = 1;
  if (event.code === "KeyQ") move.up = true; if (event.code === "KeyE") move.down = true;
});
addEventListener("keyup", (event) => {
  if (["KeyW", "ArrowUp", "KeyS", "ArrowDown"].includes(event.code)) move.y = 0;
  if (["KeyA", "ArrowLeft", "KeyD", "ArrowRight"].includes(event.code)) move.x = 0;
  if (event.code === "KeyQ") move.up = false; if (event.code === "KeyE") move.down = false;
});

const forward = new THREE.Vector3(), right = new THREE.Vector3(), input = new THREE.Vector3(), previous = new THREE.Vector3();
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; previous.copy(player.position);
  camera.getWorldDirection(forward); forward.y = 0; forward.normalize(); right.crossVectors(forward, camera.up).normalize();
  input.set(0, 0, 0).addScaledVector(forward, -move.y).addScaledVector(right, move.x);
  if (input.lengthSq() > 0.001) { input.normalize(); player.position.addScaledVector(input, 8.2 * dt); player.rotation.y = Math.atan2(input.x, input.z); }
  const distance = Math.hypot(player.position.x, player.position.z);
  if (distance > WORLD_RADIUS - 1.1) { const scale = (WORLD_RADIUS - 1.1) / distance; player.position.x *= scale; player.position.z *= scale; }
  player.position.y = Math.min(8, Math.max(0, player.position.y + ((move.up ? 5 : 0) - (move.down ? 5 : 0)) * dt));
  camera.position.add(player.position.clone().sub(previous));
  controls.target.copy(player.position).add(new THREE.Vector3(0, 1.05, 0));
  shadow.position.set(player.position.x, 0.028, player.position.z);
  shadow.scale.setScalar(1 - Math.min(player.position.y / 18, 0.55));
  controls.update(); renderer.render(scene, camera); requestAnimationFrame(frame);
}
function resize() { const width = canvas.clientWidth || innerWidth, height = canvas.clientHeight || innerHeight; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize(); requestAnimationFrame(frame);
