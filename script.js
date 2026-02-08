import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RGBShiftShader } from 'three/addons/shaders/RGBShiftShader.js';

/* --- SETUP --- */
const canvas = document.querySelector('#webgl');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020202);
scene.fog = new THREE.FogExp2(0x020202, 0.02);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(-4, 1.5, 6);

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
controls.maxDistance = 9;
controls.enablePan = false;

/* --- LIGHTS --- */
const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
scene.add(ambientLight);

const spotLight = new THREE.SpotLight(0xffffff, 30);
spotLight.position.set(0, 10, 0);
spotLight.angle = 0.6;
spotLight.penumbra = 0.5;
spotLight.castShadow = true;
scene.add(spotLight);

// Néons Sol
const gridHelper = new THREE.GridHelper(50, 50, 0x222222, 0x111111);
scene.add(gridHelper);

const planeGeo = new THREE.PlaneGeometry(200, 200);
const planeMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1, metalness: 0.8 });
const floor = new THREE.Mesh(planeGeo, planeMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.01;
floor.receiveShadow = true;
scene.add(floor);

/* --- VFX PARTICLES (TUNNEL) --- */
const particlesGeo = new THREE.BufferGeometry();
const particlesCount = 2000; // Beaucoup plus de particules
const posArray = new Float32Array(particlesCount * 3);

for(let i=0; i<particlesCount * 3; i++) {
    posArray[i] = (Math.random() - 0.5) * 40; // Plus large
}
particlesGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
const particlesMat = new THREE.PointsMaterial({
    size: 0.02, color: 0x00f3ff, transparent: true, opacity: 0.6
});
const particlesMesh = new THREE.Points(particlesGeo, particlesMat);
scene.add(particlesMesh);

/* --- CAR LOADER --- */
const loader = new GLTFLoader();
let carModel = null;
// Sauvegarde des matériaux originaux pour le X-Ray
const originalMaterials = new Map();

// Matériaux spéciaux
const bodyMaterial = new THREE.MeshPhysicalMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.2, clearcoat: 1.0, envMapIntensity: 2.5 });
const xrayMaterial = new THREE.MeshBasicMaterial({ color: 0x00f3ff, wireframe: true, transparent: true, opacity: 0.3 });

loader.load('cla45.glb', (gltf) => {
    carModel = gltf.scene;

    // Auto-Scale & Center
    const box = new THREE.Box3().setFromObject(carModel);
    const size = box.getSize(new THREE.Vector3());
    const scaleFactor = 4.8 / Math.max(size.x, size.y, size.z);
    carModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
    
    const newBox = new THREE.Box3().setFromObject(carModel);
    const center = newBox.getCenter(new THREE.Vector3());
    carModel.position.sub(center);
    carModel.position.y = 0;

    // Apply Base Material & Save for X-Ray
    carModel.traverse((o) => {
        if (o.isMesh) {
            o.castShadow = true; o.receiveShadow = true;
            originalMaterials.set(o.uuid, o.material); // Save original

            if(o.name.toLowerCase().includes('body') || o.name.toLowerCase().includes('paint')) {
                o.material = bodyMaterial;
                originalMaterials.set(o.uuid, bodyMaterial); // Update save
            }
        }
    });

    scene.add(carModel);
    document.getElementById('loader').style.transform = 'translateY(-100%)';
    setTimeout(() => document.getElementById('ui-container').classList.remove('hidden'), 500);

}, undefined, (err) => console.error(err));

/* --- POST PROCESSING (BLOOM + RGB SHIFT) --- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

// 1. Bloom (Lueur)
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.2; bloomPass.strength = 0.4; bloomPass.radius = 0.5;
composer.addPass(bloomPass);

// 2. RGB Shift (Effet Vitesse/Glitch) - Désactivé par défaut
const rgbShiftPass = new ShaderPass(RGBShiftShader);
rgbShiftPass.uniforms['amount'].value = 0.0; // Pas de distorsion au début
composer.addPass(rgbShiftPass);

/* --- STATES --- */
let isWarping = false;
let isXRay = false;
let autoRotate = true;
let targetPos = null;

/* --- ANIMATION LOOP --- */
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    // 1. PARTICLE ANIMATION (WARP SPEED)
    // Si Warp actif, les particules foncent vers nous (Z axis)
    const positions = particlesMesh.geometry.attributes.position.array;
    const speed = isWarping ? 2.0 : 0.05; // Vitesse x40 en mode Warp

    for(let i=1; i<particlesCount * 3; i+=3) { // i+1 = Y, i+2 = Z
        positions[i+1] += speed; // Bouge en Z
        if(positions[i+1] > 10) { // Si passe derrière caméra
            positions[i+1] = -20; // Reset loin derrière
        }
    }
    particlesMesh.geometry.attributes.position.needsUpdate = true;

    // 2. CAMERA SHAKE (WARP)
    if(isWarping) {
        camera.position.x += (Math.random() - 0.5) * 0.02;
        camera.position.y += (Math.random() - 0.5) * 0.02;
        // Augmenter l'effet RGB Shift
        rgbShiftPass.uniforms['amount'].value = 0.005 + Math.random() * 0.002;
    } else {
        // Retour progressif à la normale
        rgbShiftPass.uniforms['amount'].value = THREE.MathUtils.lerp(rgbShiftPass.uniforms['amount'].value, 0, 0.1);
    }

    // 3. CAMERA SMOOTH MOVE
    if (targetPos) {
        camera.position.lerp(targetPos, 0.05);
        if(camera.position.distanceTo(targetPos) < 0.1) targetPos = null;
    } else if (autoRotate && !isWarping) {
        controls.update();
    }

    composer.render();
}
animate();

/* --- INTERACTIONS --- */

// 1. WARP DRIVE BUTTON
const warpBtn = document.getElementById('warp-btn');
warpBtn.addEventListener('click', () => {
    isWarping = !isWarping;
    warpBtn.classList.toggle('active');
    
    if(isWarping) {
        document.body.classList.add('warping'); // Active CSS speed lines
        document.getElementById('sys-status').innerText = "WARP ENGAGED";
        document.getElementById('sys-status').style.color = "#ff0055";
        
        // FOV Effect (Zoom out)
        // Note: changer le FOV demande updateProjectionMatrix, on simule en reculant
        targetPos = null;
        autoRotate = false;
        
    } else {
        document.body.classList.remove('warping');
        document.getElementById('sys-status').innerText = "ONLINE";
        document.getElementById('sys-status').style.color = "#0f0";
        autoRotate = true;
    }
});

// 2. X-RAY BUTTON
const xrayBtn = document.getElementById('xray-btn');
xrayBtn.addEventListener('click', () => {
    if(!carModel) return;
    isXRay = !isXRay;
    xrayBtn.classList.toggle('active');

    carModel.traverse((o) => {
        if(o.isMesh) {
            if(isXRay) {
                o.material = xrayMaterial; // Mode fantôme
                o.castShadow = false;
            } else {
                o.material = originalMaterials.get(o.uuid); // Restaure l'original
                o.castShadow = true;
            }
        }
    });
});

// 3. COLORS
document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if(isXRay) return; // Pas de changement de couleur en X-Ray
        document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelector('.current-paint').innerText = btn.dataset.name;
        bodyMaterial.color.setHex(parseInt(btn.dataset.color));
    });
});

// 4. CAMERAS
document.querySelectorAll('.cam-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const view = btn.dataset.view;
        autoRotate = false;
        isWarping = false; // Stop warp si on change de vue
        document.body.classList.remove('warping');

        if(view === 'front') targetPos = new THREE.Vector3(0, 1.0, 5.5);
        if(view === 'side') targetPos = new THREE.Vector3(5.5, 1.0, 0);
        if(view === 'back') targetPos = new THREE.Vector3(0, 1.5, -5.5);
        if(view === 'auto') { autoRotate = true; targetPos = null; }
    });
});

// 5. ENGINE SOUND
document.getElementById('start-engine').addEventListener('click', () => {
    const audio = new Audio('startup.mp3');
    audio.volume = 0.5;
    audio.play();
});

// RESIZE
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});
