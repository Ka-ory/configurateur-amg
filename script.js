import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/* --- CONFIGURATION POSITION & ROTATION --- */
// Position (Déjà calée)
let CAR_X = 327.50;
let CAR_Y = -15.50;
let CAR_Z = -279.50;

// Rotation (C'est ici pour le style "en vif")
// Valeurs en radians (0.1 = un petit peu, 1.5 = 90 degrés)
let CAR_ROT_X = 0.02;  // Piqué très léger vers l'avant (agressif)
let CAR_ROT_Y = -0.6;  // Orientée vers la route
let CAR_ROT_Z = 0.05;  // Légèrement penchée (banking du virage)

/* --- SETUP SCENE --- */
const canvas = document.querySelector('#webgl');
const scene = new THREE.Scene();

const fogColor = new THREE.Color(0xa0b0c0); 
scene.background = fogColor;
scene.fog = new THREE.FogExp2(fogColor, 0.002);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.position.set(325, -9, -280);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.6; 
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

/* --- CONTROLS --- */
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 4;
controls.maxDistance = 15;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;

/* --- LUMIERES --- */
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
sunLight.position.set(150, 100, -150);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 4096;
sunLight.shadow.mapSize.height = 4096;
sunLight.shadow.bias = -0.0001;
sunLight.shadow.normalBias = 0.05;
sunLight.shadow.camera.left = -100;
sunLight.shadow.camera.right = 100;
sunLight.shadow.camera.top = 100;
sunLight.shadow.camera.bottom = -100;
scene.add(sunLight);

new RGBELoader().load('decor.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
    scene.environmentIntensity = 0.5;
});

/* --- TEXTURES --- */
const textureLoader = new THREE.TextureLoader();
const roadColor = textureLoader.load('road_color.jpg');
const roadNormal = textureLoader.load('road_normal.jpg');
const roadRough = textureLoader.load('road_rough.jpg');

[roadColor, roadNormal, roadRough].forEach(t => {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(12, 12);
    t.colorSpace = THREE.SRGBColorSpace;
});
roadNormal.colorSpace = THREE.LinearSRGBColorSpace;

/* --- LOADERS --- */
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

/* --- MAP --- */
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
                    o.material.roughness = 0.9; 
                    o.material.metalness = 0;
                    o.material.color.setHex(0x888888);
                } 
                else if (name.includes('snow') || name.includes('terrain') || name.includes('ground')) {
                    o.material.color.setHex(0xcccccc); 
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

/* --- VOITURE --- */
const bodyMaterial = new THREE.MeshPhysicalMaterial({ 
    color: 0x111111, 
    metalness: 0.6, 
    roughness: 0.25, 
    clearcoat: 1.0, 
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.0
});

let carGroup;

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
    
    // Application Position ET Rotation
    carGroup.position.set(CAR_X, CAR_Y, CAR_Z);
    carGroup.rotation.set(CAR_ROT_X, CAR_ROT_Y, CAR_ROT_Z);
    
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

/* --- POST PROCESSING --- */
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.98;
bloomPass.strength = 0.12;
bloomPass.radius = 0.1;
composer.addPass(bloomPass);

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    composer.render();
}
animate();

/* --- EVENTS & INTERACTION --- */
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

// Outil de Positionnement & Rotation "En Vif"
window.addEventListener('keydown', (e) => {
    if(!carGroup) return;
    
    const moveStep = 0.2;
    const rotStep = 0.02; // Rotation précise

    switch(e.key.toLowerCase()) {
        // POSITION
        case 'arrowup': carGroup.position.z -= moveStep; break;
        case 'arrowdown': carGroup.position.z += moveStep; break;
        case 'arrowleft': carGroup.position.x -= moveStep; break;
        case 'arrowright': carGroup.position.x += moveStep; break;
        case 'pageup': carGroup.position.y += moveStep; break;
        case 'pagedown': carGroup.position.y -= moveStep; break;

        // ROTATION
        case 'q': carGroup.rotation.y += rotStep; break; // Tourner Gauche
        case 'd': carGroup.rotation.y -= rotStep; break; // Tourner Droite
        case 'z': carGroup.rotation.x += rotStep; break; // Piquer Avant
        case 's': carGroup.rotation.x -= rotStep; break; // Lever Nez
        case 'a': carGroup.rotation.z += rotStep; break; // Pencher Gauche (Roulis)
        case 'e': carGroup.rotation.z -= rotStep; break; // Pencher Droite
    }

    // Log pour récupérer tes réglages
    console.log(`
    POS -> X:${carGroup.position.x.toFixed(2)} Y:${carGroup.position.y.toFixed(2)} Z:${carGroup.position.z.toFixed(2)}
    ROT -> X:${carGroup.rotation.x.toFixed(3)} Y:${carGroup.rotation.y.toFixed(3)} Z:${carGroup.rotation.z.toFixed(3)}
    `);
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
