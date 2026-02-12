import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// --- CONFIGURATION POSITION VOITURE ---
// Modifie ces valeurs ici.
// Utilise les flèches du clavier + PageUp/PageDown pour ajuster en direct, 
// puis regarde la console (F12) pour copier les nouvelles valeurs.
let CAR_X = 327.50;
let CAR_Y = -15.50;
let CAR_Z = -279.50;

const canvas = document.querySelector('#webgl');
const scene = new THREE.Scene();

// Ciel plus naturel, moins saturé
scene.background = new THREE.Color(0xcce0ff);
scene.fog = new THREE.FogExp2(0xcce0ff, 0.0015);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.position.set(325, -9, -280);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9; // Réduit pour éviter le "cramé"
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 4;
controls.maxDistance = 20;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;

// Lumière ambiante plus douce
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

// Soleil moins violent
const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
sunLight.position.set(200, 100, -200);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 4096;
sunLight.shadow.mapSize.height = 4096;
sunLight.shadow.bias = -0.0001;
sunLight.shadow.normalBias = 0.05; // Corrige les stries d'ombre sur la voiture
sunLight.shadow.camera.left = -100;
sunLight.shadow.camera.right = 100;
sunLight.shadow.camera.top = 100;
sunLight.shadow.camera.bottom = -100;
scene.add(sunLight);

new RGBELoader().load('decor.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
    scene.environmentIntensity = 0.6; // Réduit les reflets trop forts du ciel
});

const textureLoader = new THREE.TextureLoader();
const roadColor = textureLoader.load('road_color.jpg');
const roadNormal = textureLoader.load('road_normal.jpg');
const roadRough = textureLoader.load('road_rough.jpg');

[roadColor, roadNormal, roadRough].forEach(t => {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(10, 10);
    t.colorSpace = THREE.SRGBColorSpace; // Important pour les couleurs justes
});
roadNormal.colorSpace = THREE.LinearSRGBColorSpace; // Normal map doit être linéaire

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

gltfLoader.load('map.glb', (gltf) => {
    const map = gltf.scene;
    map.position.set(0, 0, 0);

    map.traverse((o) => {
        if (o.isMesh) {
            o.receiveShadow = true;
            o.castShadow = true;

            if (o.material) {
                const name = o.material.name.toLowerCase();

                if (name.includes('road') || name.includes('route') || name.includes('asphalt')) {
                    o.material.map = roadColor;
                    o.material.normalMap = roadNormal;
                    o.material.roughnessMap = roadRough;
                    o.material.roughness = 0.8; 
                    o.material.metalness = 0;
                } 
                else if (name.includes('snow') || name.includes('terrain') || name.includes('ground')) {
                    // Neige pas totalement blanche pour garder du détail
                    o.material.color.setHex(0xeeeeee); 
                    o.material.roughness = 1.0;
                    o.material.metalness = 0.0;
                }

                if (name.includes('leaf') || name.includes('sapin') || o.material.transparent) {
                    o.material.transparent = true;
                    o.material.alphaTest = 0.5;
                    o.material.side = THREE.DoubleSide;
                }
                
                o.material.needsUpdate = true;
            }
        }
    });

    scene.add(map);
});

// Peinture réaliste
const bodyMaterial = new THREE.MeshPhysicalMaterial({ 
    color: 0x111111, 
    metalness: 0.6, // Moins miroir
    roughness: 0.25, // Un peu plus diffus
    clearcoat: 1.0, 
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.0
});

let carGroup; // Variable globale pour le mouvement

gltfLoader.load('cla45.glb', (gltf) => {
    const car = gltf.scene;
    
    const box = new THREE.Box3().setFromObject(car);
    const size = box.getSize(new THREE.Vector3());
    const scaleFactor = 4.8 / Math.max(size.x, size.y, size.z);
    car.scale.set(scaleFactor, scaleFactor, scaleFactor);
    
    const center = new THREE.Box3().setFromObject(car).getCenter(new THREE.Vector3());
    car.position.sub(center); 
    
    carGroup = new THREE.Group();
    carGroup.add(car);
    carGroup.position.set(CAR_X, CAR_Y, CAR_Z);
    
    car.traverse((o) => {
        if(o.isMesh) {
            o.castShadow = true; 
            o.receiveShadow = true;
            const n = o.name.toLowerCase();
            const mn = o.material && o.material.name ? o.material.name.toLowerCase() : "";
            
            if(n.includes('body') || n.includes('paint') || mn.includes('paint') || mn.includes('body')) {
                o.material = bodyMaterial;
            }
            if(n.includes('glass') || mn.includes('window')) {
                o.material.transparent = true;
                o.material.opacity = 0.7;
                o.material.roughness = 0.0;
                o.material.metalness = 0.9;
                o.material.color.setHex(0x000000);
            }
            // Pneus plus mats
            if(n.includes('tire') || n.includes('rubber')) {
                o.material.roughness = 0.9;
                o.material.metalness = 0.0;
                o.material.color.setHex(0x202020);
            }
        }
    });

    scene.add(carGroup);
    
    controls.target.set(CAR_X, CAR_Y + 1, CAR_Z);
    controls.update();

    const loaderEl = document.getElementById('loader');
    if(loaderEl) loaderEl.style.display = 'none';
    const uiEl = document.getElementById('ui-container');
    if(uiEl) uiEl.classList.remove('hidden');
});

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Bloom très subtil, juste pour les éclats du soleil
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.98; // Se déclenche seulement sur le très brillant
bloomPass.strength = 0.15; // Faible intensité
bloomPass.radius = 0.2;
composer.addPass(bloomPass);

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    composer.render();
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

// --- AJUSTEMENT POSITION CLAVIER ---
window.addEventListener('keydown', (e) => {
    if(!carGroup) return;
    const step = 0.1;
    switch(e.key) {
        case 'ArrowUp': carGroup.position.z -= step; break;
        case 'ArrowDown': carGroup.position.z += step; break;
        case 'ArrowLeft': carGroup.position.x -= step; break;
        case 'ArrowRight': carGroup.position.x += step; break;
        case 'PageUp': carGroup.position.y += step; break;
        case 'PageDown': carGroup.position.y -= step; break;
    }
    // Affiche les nouvelles coordonnées pour que tu puisses les noter
    console.log(`X: ${carGroup.position.x.toFixed(2)}, Y: ${carGroup.position.y.toFixed(2)}, Z: ${carGroup.position.z.toFixed(2)}`);
});

document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const nameDisplay = document.querySelector('.current-paint');
        if(nameDisplay) nameDisplay.innerText = btn.dataset.name;
        
        bodyMaterial.color.setHex(parseInt(btn.dataset.color));
        if(btn.dataset.name.includes("MAT")) {
            bodyMaterial.roughness = 0.5; 
            bodyMaterial.clearcoat = 0.0;
            bodyMaterial.metalness = 0.3;
        } else {
            bodyMaterial.roughness = 0.25; 
            bodyMaterial.clearcoat = 1.0;
            bodyMaterial.metalness = 0.6;
        }
    });
});

document.querySelectorAll('.cam-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        controls.autoRotate = false;
        
        if(view === 'front') camera.position.set(CAR_X - 5, CAR_Y + 1.5, CAR_Z + 5);
        if(view === 'side') camera.position.set(CAR_X + 6, CAR_Y + 1.5, CAR_Z);
        if(view === 'back') camera.position.set(CAR_X - 5, CAR_Y + 2, CAR_Z - 5);
        if(view === 'auto') { controls.autoRotate = true; }
    });
});

const startBtn = document.getElementById('start-engine');
if(startBtn) {
    startBtn.addEventListener('click', () => {
        new Audio('startup.mp3').play().catch(e => console.log(e));
    });
}
