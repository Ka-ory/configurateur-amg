import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/* --- SETUP --- */
const canvas = document.querySelector('#webgl');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);
scene.fog = new THREE.FogExp2(0x050505, 0.02);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(-5, 2, 6);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;

/* --- CONTROLS --- */
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.minDistance = 3;
controls.maxDistance = 10;
controls.enablePan = false;

/* --- LIGHTS & ENV --- */
const ambientLight = new THREE.AmbientLight(0xffffff, 1.5); // Forte ambiance
scene.add(ambientLight);

// Spots principaux
const spotLight = new THREE.SpotLight(0xffffff, 20);
spotLight.position.set(5, 10, 5);
spotLight.angle = 0.5;
spotLight.penumbra = 0.5;
spotLight.castShadow = true;
spotLight.shadow.mapSize.width = 2048;
spotLight.shadow.mapSize.height = 2048;
scene.add(spotLight);

const blueSpot = new THREE.SpotLight(0x00f3ff, 10);
blueSpot.position.set(-5, 5, -5);
scene.add(blueSpot);

const pinkSpot = new THREE.SpotLight(0xff0055, 10);
pinkSpot.position.set(5, 0, 5);
scene.add(pinkSpot);

// Sol Réfléchissant (Grid Floor)
const gridHelper = new THREE.GridHelper(40, 40, 0x333333, 0x111111);
scene.add(gridHelper);

const planeGeo = new THREE.PlaneGeometry(100, 100);
const planeMat = new THREE.MeshStandardMaterial({ 
    color: 0x050505, roughness: 0.1, metalness: 0.8 
});
const floor = new THREE.Mesh(planeGeo, planeMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.01;
floor.receiveShadow = true;
scene.add(floor);

/* --- VFX: SCANNING RINGS --- */
const rings = [];
const ringGeo = new THREE.TorusGeometry(3.5, 0.02, 16, 100);
const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff, transparent: true, opacity: 0.5 });

for(let i=0; i<3; i++) {
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = i * 0.5;
    scene.add(ring);
    rings.push({ mesh: ring, speed: 0.005 + i * 0.002, offset: i });
}

/* --- VFX: PARTICLES --- */
const particlesGeo = new THREE.BufferGeometry();
const particlesCount = 700;
const posArray = new Float32Array(particlesCount * 3);

for(let i=0; i<particlesCount * 3; i++) {
    posArray[i] = (Math.random() - 0.5) * 15; // Spread
}
particlesGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
const particlesMat = new THREE.PointsMaterial({
    size: 0.015, color: 0x00f3ff, transparent: true, opacity: 0.8
});
const particlesMesh = new THREE.Points(particlesGeo, particlesMat);
scene.add(particlesMesh);

/* --- CAR LOADING --- */
const loader = new GLTFLoader();
let carModel = null;
const bodyMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x111111, metalness: 0.9, roughness: 0.2, clearcoat: 1.0, envMapIntensity: 2.5
});

// Points d'intérêt (Position relative à la voiture)
// 0: Moteur/Capot, 1: Arrière/Aero
const hotspots = [
    { position: new THREE.Vector3(0, 0.8, 1.5), element: document.querySelector('.point-0') },
    { position: new THREE.Vector3(0, 0.6, -2.0), element: document.querySelector('.point-1') }
];

loader.load('cla45.glb', (gltf) => {
    carModel = gltf.scene;

    // Redimensionnement automatique
    const box = new THREE.Box3().setFromObject(carModel);
    const size = box.getSize(new THREE.Vector3());
    const scaleFactor = 4.8 / Math.max(size.x, size.y, size.z); // Target size ~4.8m
    carModel.scale.set(scaleFactor, scaleFactor, scaleFactor);

    // Centrage
    const newBox = new THREE.Box3().setFromObject(carModel);
    const center = newBox.getCenter(new THREE.Vector3());
    carModel.position.sub(center);
    carModel.position.y = 0; // Au sol

    // Materials
    carModel.traverse((o) => {
        if (o.isMesh) {
            o.castShadow = true; o.receiveShadow = true;
            if(o.name.toLowerCase().includes('body') || o.name.toLowerCase().includes('paint')) {
                o.material = bodyMaterial;
            }
        }
    });

    scene.add(carModel);
    
    // Remove loader
    document.getElementById('loader').style.transform = 'translateY(-100%)';
    setTimeout(() => document.getElementById('ui-container').classList.remove('hidden'), 500);

}, undefined, (err) => console.error(err));

/* --- POST PROCESSING (BLOOM) --- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.2; bloomPass.strength = 0.4; bloomPass.radius = 0.5;
composer.addPass(bloomPass);

/* --- ANIMATION LOOP --- */
// Camera logic
let targetPos = null;
let autoRotate = true;

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const elapsedTime = clock.getElapsedTime();

    // 1. Anime Rings
    rings.forEach((r, i) => {
        r.mesh.position.y = Math.sin(elapsedTime * 0.5 + r.offset) * 1.5 + 1.5;
        r.mesh.scale.x = r.mesh.scale.y = 1 + Math.sin(elapsedTime * 2) * 0.02;
    });

    // 2. Anime Particles
    particlesMesh.rotation.y = elapsedTime * 0.05;

    // 3. Camera Movement
    if (targetPos) {
        camera.position.lerp(targetPos, 0.05);
        if(camera.position.distanceTo(targetPos) < 0.1) targetPos = null;
    } else if (autoRotate) {
        controls.update(); // Orbit normal
    }
    
    controls.update();

    // 4. Update Hotspots Positions
    if(carModel) {
        hotspots.forEach(hotspot => {
            // Clone position pour ne pas modifier l'original
            const pos = hotspot.position.clone();
            pos.applyMatrix4(carModel.matrixWorld); // Suivre la voiture
            pos.project(camera); // Convertir en 2D écran

            const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
            const y = (pos.y * -0.5 + 0.5) * window.innerHeight;

            // Afficher seulement si visible (devant la caméra)
            if(Math.abs(pos.z) < 1) {
                hotspot.element.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
                hotspot.element.classList.add('visible');
            } else {
                hotspot.element.classList.remove('visible');
            }
        });
    }

    composer.render();
    
    // Update FPS fake
    if(Math.random() > 0.9) document.getElementById('fps').innerText = Math.floor(58 + Math.random() * 4);
}
animate();

/* --- UI INTERACTIONS --- */
// Couleurs
document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelector('.current-paint').innerText = btn.dataset.name;
        bodyMaterial.color.setHex(parseInt(btn.dataset.color));
    });
});

// Caméra Buttons
document.querySelectorAll('.cam-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const view = btn.dataset.view;
        autoRotate = false;

        if(view === 'front') targetPos = new THREE.Vector3(0, 1.0, 5.5);
        if(view === 'side') targetPos = new THREE.Vector3(5.5, 1.0, 0);
        if(view === 'back') targetPos = new THREE.Vector3(0, 1.5, -5.5);
        if(view === 'auto') { autoRotate = true; targetPos = null; }
    });
});

// Sound
document.getElementById('start-engine').addEventListener('click', () => {
    const audio = new Audio('startup.mp3');
    audio.volume = 0.5;
    audio.play();
});

// Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});
