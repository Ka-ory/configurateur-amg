import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/* --- 1. SETUP SCÈNE --- */
const canvas = document.querySelector('#webgl');
const scene = new THREE.Scene();

// Ambiance Hivernale (Gris-Bleu clair)
scene.background = new THREE.Color(0xddeeff);
scene.fog = new THREE.FogExp2(0xeef4ff, 0.002); // Brouillard léger

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 3000);
// Position de départ de la caméra (relative à la voiture plus bas)
camera.position.set(325, -9, -280); 

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

/* --- 2. LUMIÈRE --- */
const ambientLight = new THREE.AmbientLight(0xcceeff, 1.2); // Lumière froide
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.8);
sunLight.position.set(350, 50, -350); // Soleil aligné avec la zone de la voiture
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 4096;
sunLight.shadow.mapSize.height = 4096;
sunLight.shadow.bias = -0.0001;
// Zone d'ombre centrée autour de la voiture (important vue la position éloignée)
sunLight.shadow.camera.left = -50;
sunLight.shadow.camera.right = 50;
sunLight.shadow.camera.top = 50;
sunLight.shadow.camera.bottom = -50;
scene.add(sunLight);

// HDR
new RGBELoader().load('decor.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
    // On garde le brouillard en fond plutôt que le HDR brut
    // scene.background = texture; 
}, undefined, () => console.log("Mode sans HDR"));

/* --- 3. LOADERS --- */
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

/* --- 4. CHARGEMENT MAP --- */
gltfLoader.load('map.glb', (gltf) => {
    const map = gltf.scene;
    
    // La map reste à 0,0,0 (C'est la voiture qui va bouger à sa place)
    map.position.set(0, 0, 0);
    map.scale.set(1, 1, 1);

    map.traverse((o) => {
        if (o.isMesh) {
            o.receiveShadow = true;
            o.castShadow = true;

            if (o.material) {
                // Config Neige
                o.material.roughness = 1.0; // Mat
                o.material.metalness = 0.0;
                
                // Transparence feuilles/sapins
                if (o.material.name.toLowerCase().includes('leaf') || 
                    o.material.name.toLowerCase().includes('sapin') ||
                    o.material.transparent) {
                    o.material.transparent = true;
                    o.material.alphaTest = 0.5;
                    o.material.side = THREE.DoubleSide;
                }
            }
        }
    });

    scene.add(map);
    console.log("Map Montagne chargée.");

}, undefined, (e) => console.error("Erreur Map:", e));


/* --- 5. CHARGEMENT VOITURE (POSITION FINALE) --- */
const bodyMaterial = new THREE.MeshPhysicalMaterial({ 
    color: 0x111111, metalness: 0.7, roughness: 0.3, clearcoat: 1.0, envMapIntensity: 1.5 
});

const CAR_X = 327.50;
const CAR_Y = -15.50;
const CAR_Z = -279.50;

gltfLoader.load('cla45.glb', (gltf) => {
    const car = gltf.scene;
    
    const box = new THREE.Box3().setFromObject(car);
    const size = box.getSize(new THREE.Vector3());
    const scaleFactor = 4.8 / Math.max(size.x, size.y, size.z);
    car.scale.set(scaleFactor, scaleFactor, scaleFactor);
    
    const center = new THREE.Box3().setFromObject(car).getCenter(new THREE.Vector3());
    car.position.sub(center); 
    
    const carGroup = new THREE.Group();
    carGroup.add(car);
    
    carGroup.position.set(CAR_X, CAR_Y, CAR_Z);
    carGroup.rotation.y = 0; 

    car.traverse((o) => {
        if(o.isMesh) {
            o.castShadow = true; o.receiveShadow = true;
            const n = o.name.toLowerCase();
            const mn = o.material && o.material.name ? o.material.name.toLowerCase() : "";
            if(n.includes('body') || n.includes('paint') || mn.includes('paint') || mn.includes('body')) {
                o.material = bodyMaterial;
            }
        }
    });

    scene.add(carGroup);
    
    controls.target.set(CAR_X, CAR_Y + 1, CAR_Z);
    controls.update();

    document.getElementById('loader').style.display = 'none';
    document.getElementById('ui-container').classList.remove('hidden');
});

    scene.add(carGroup);
    
    // On cible la caméra sur la voiture (IMPORTANT)
    controls.target.set(CAR_X, CAR_Y + 1, CAR_Z);
    controls.update();

    document.getElementById('loader').style.display = 'none';
    document.getElementById('ui-container').classList.remove('hidden');
});

/* --- 6. POST PROCESSING --- */
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.85; bloomPass.strength = 0.3; bloomPass.radius = 0.2;
composer.addPass(bloomPass);

/* --- 7. CONTROLS --- */
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false; // On empêche de se perdre
controls.minDistance = 4;
controls.maxDistance = 15;
controls.maxPolarAngle = Math.PI / 2 - 0.1; // Pas sous le sol

// Rotation automatique douce
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    composer.render();
}
animate();

/* --- 8. UI INTERACTIONS --- */
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

// Couleurs
document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelector('.current-paint').innerText = btn.dataset.name;
        bodyMaterial.color.setHex(parseInt(btn.dataset.color));
        if(btn.dataset.name.includes("MAT")) {
            bodyMaterial.roughness = 0.6; bodyMaterial.clearcoat = 0.0;
        } else {
            bodyMaterial.roughness = 0.3; bodyMaterial.clearcoat = 1.0;
        }
    });
});

// Caméras (Adaptées à la nouvelle position)
document.querySelectorAll('.cam-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        controls.autoRotate = false;
        
        // Coordonnées relatives à la voiture
        if(view === 'front') camera.position.set(CAR_X - 5, CAR_Y + 1.5, CAR_Z + 5);
        if(view === 'side') camera.position.set(CAR_X + 6, CAR_Y + 1.5, CAR_Z);
        if(view === 'back') camera.position.set(CAR_X - 5, CAR_Y + 2, CAR_Z - 5);
        if(view === 'auto') { controls.autoRotate = true; }
    });
});

document.getElementById('start-engine').addEventListener('click', () => {
    new Audio('startup.mp3').play().catch(e => console.log("Audio bloqué"));
});

