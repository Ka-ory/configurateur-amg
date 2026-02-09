import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'; // INDISPENSABLE
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/* --- 1. SETUP DE LA SCÈNE --- */
const canvas = document.querySelector('#webgl');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222); // Gris moyen pour bien voir les objets noirs

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000); // Vue très large
camera.position.set(-8, 3, 8); 

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;

/* --- 2. LUMIÈRE (SIMPLE ET EFFICACE) --- */
const ambientLight = new THREE.AmbientLight(0xffffff, 1.5); // Lumière partout pour être sûr de voir
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 2);
sunLight.position.set(10, 20, 10);
sunLight.castShadow = true;
scene.add(sunLight);

// HDR (Optionnel, pour les reflets)
new RGBELoader().load('decor.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
    // On ne met pas en background pour éviter la confusion
});

/* --- 3. CHARGEMENT MAP.GLB (COMPRESSÉ) --- */
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

gltfLoader.load('map.glb', (gltf) => {
    const map = gltf.scene;
    console.log("✅ Map chargée !");

    // --- CORRECTION AUTOMATIQUE DE TAILLE ---
    const box = new THREE.Box3().setFromObject(map);
    const size = box.getSize(new THREE.Vector3());
    console.log("📏 Taille originale de la map :", size);

    // Si la map est minuscule (< 10m), on l'agrandit
    if (size.x < 10) {
        console.log("⚠️ Map trop petite. Agrandissement x100...");
        map.scale.set(100, 100, 100);
    } 
    // Si la map est gigantesque (> 1000m), on la réduit
    else if (size.x > 1000) {
        console.log("⚠️ Map trop grande. Réduction x0.01...");
        map.scale.set(0.01, 0.01, 0.01);
    } 
    else {
        // Taille normale
        map.scale.set(1, 1, 1);
    }

    // --- POSITIONNEMENT ---
    map.position.set(0, -0.1, 0); // Juste sous 0
    
    // Application matériaux simples pour éviter les bugs visuels
    map.traverse((o) => {
        if (o.isMesh) {
            o.receiveShadow = true;
            // On force un matériel standard si l'original est buggé
            if (!o.material) o.material = new THREE.MeshStandardMaterial({color: 0x888888});
        }
    });

    scene.add(map);

}, undefined, (e) => {
    console.error("❌ ERREUR CHARGEMENT MAP :", e);
    alert("Erreur: Impossible de charger 'map.glb'. Vérifie la console (F12).");
});


/* --- 4. CHARGEMENT VOITURE (CLA45) --- */
// Matériau réaliste (moins brillant)
const bodyMaterial = new THREE.MeshPhysicalMaterial({ 
    color: 0x111111, metalness: 0.7, roughness: 0.3, clearcoat: 1.0, envMapIntensity: 1.0 
});

gltfLoader.load('cla45.glb', (gltf) => {
    const car = gltf.scene;
    
    // Auto-scale Voiture
    const box = new THREE.Box3().setFromObject(car);
    const size = box.getSize(new THREE.Vector3());
    const scaleFactor = 4.8 / Math.max(size.x, size.y, size.z);
    car.scale.set(scaleFactor, scaleFactor, scaleFactor);
    
    // Centrage
    const center = new THREE.Box3().setFromObject(car).getCenter(new THREE.Vector3());
    car.position.sub(center);
    car.position.y = 0; // Au sol

    // Application Peinture
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

    scene.add(car);
    // On cache le loader
    document.getElementById('loader').style.display = 'none';
    document.getElementById('ui-container').classList.remove('hidden');
});

/* --- 5. POST PROCESSING & RENDU --- */
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.9; bloomPass.strength = 0.3; bloomPass.radius = 0.2;
composer.addPass(bloomPass);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 0.5, 0);

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

// Boutons Couleurs
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
