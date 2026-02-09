import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'; // INDISPENSABLE POUR L'OPTIMISATION
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/* --- 1. SETUP & PERFORMANCES --- */
const canvas = document.querySelector('#webgl');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111); // Fond gris foncé au cas où

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500); // Far clip réduit pour perfs
camera.position.set(-6, 1.5, 6);

const renderer = new THREE.WebGLRenderer({ 
    canvas, 
    antialias: true, // Si ça lag trop, passe à false
    powerPreference: "high-performance" // Demande la carte graphique dédiée
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Limite la résolution pour éviter le lag (max 1.5x)
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

/* --- 2. CHARGEMENT OPTIMISÉ (DRACO) --- */
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

/* --- 3. ÉCLAIRAGE --- */
const rgbeLoader = new RGBELoader();
rgbeLoader.load('decor.hdr', function(texture) {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
    // On n'affiche pas le HDR en fond pour se concentrer sur la station
    scene.environmentIntensity = 0.8; // Reflets moins agressifs
});

const sunLight = new THREE.DirectionalLight(0xffffff, 2);
sunLight.position.set(-10, 20, 10);
sunLight.castShadow = true;
// Ombres moins gourmandes
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
scene.add(sunLight);

/* --- 4. MAP (STATION) --- */
// Assure-toi d'avoir renommé ton fichier compressé en 'station.glb'
gltfLoader.load('station.glb', (gltf) => {
    const map = gltf.scene;
    
    // Si tu ne vois que du carrelage, c'est peut-être que l'échelle est fausse.
    // Essaie 1.0, 10.0 ou 0.1 ici.
    const SCALE = 1.0; 
    map.scale.set(SCALE, SCALE, SCALE);
    map.position.y = -0.05; // Ajustement sol

    map.traverse((o) => {
        if (o.isMesh) {
            o.receiveShadow = true;
            // On désactive castShadow pour la map pour gagner des FPS (optionnel)
            // o.castShadow = true; 
        }
    });

    scene.add(map);
    console.log("Station chargée avec succès !");

}, undefined, (e) => {
    console.error("Erreur chargement station :", e);
    // Fallback : Sol simple si la station ne charge pas
    const grid = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
    scene.add(grid);
    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(50, 50), 
        new THREE.MeshStandardMaterial({color: 0x222222})
    );
    plane.rotation.x = -Math.PI/2;
    plane.position.y = -0.1;
    scene.add(plane);
});

/* --- 5. VOITURE (Peinture Réaliste) --- */
let carModel = null;

// Matériau Peinture CALIBRÉ (Moins brillant)
const bodyMaterial = new THREE.MeshPhysicalMaterial({ 
    color: 0x111111, 
    metalness: 0.7,      // Baissé de 0.9 à 0.7 (Moins miroir)
    roughness: 0.3,      // Augmenté de 0.2 à 0.3 (Plus mat/réaliste)
    clearcoat: 1.0,      // Vernis toujours présent
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.0 // Baissé de 2.5 à 1.0 (Reflets naturels)
});

gltfLoader.load('cla45.glb', (gltf) => {
    carModel = gltf.scene;

    const box = new THREE.Box3().setFromObject(carModel);
    const size = box.getSize(new THREE.Vector3());
    const scaleFactor = 4.8 / Math.max(size.x, size.y, size.z);
    carModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
    
    const newBox = new THREE.Box3().setFromObject(carModel);
    const center = newBox.getCenter(new THREE.Vector3());
    carModel.position.sub(center);
    carModel.position.y = 0.01;

    carModel.traverse((o) => {
        if (o.isMesh) {
            o.castShadow = true; o.receiveShadow = true;
            const n = o.name.toLowerCase();
            const mn = o.material && o.material.name ? o.material.name.toLowerCase() : "";
            
            if(n.includes('body') || n.includes('paint') || n.includes('chassis') ||
               mn.includes('paint') || mn.includes('body') || mn.includes('metal_primary')) {
                o.material = bodyMaterial;
            }
        }
    });

    scene.add(carModel);
    document.getElementById('loader').style.display = 'none'; // Cache loader direct
    document.getElementById('ui-container').classList.remove('hidden');
});

/* --- 6. POST PROCESSING (Léger) --- */
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Bloom très léger (juste les phares/soleil)
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.9; 
bloomPass.strength = 0.3; 
bloomPass.radius = 0.2;
composer.addPass(bloomPass);

/* --- 7. CONTROLS --- */
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.minDistance = 2;
controls.maxDistance = 10;
controls.enablePan = false;
controls.target.set(0, 0.8, 0);

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    composer.render();
}
animate();

/* --- INTERACTIONS --- */
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

// Gestion couleurs
document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelector('.current-paint').innerText = btn.dataset.name;
        
        const color = parseInt(btn.dataset.color);
        bodyMaterial.color.setHex(color);

        if(btn.dataset.name.includes("MAT")) {
            bodyMaterial.roughness = 0.6; bodyMaterial.clearcoat = 0.0;
        } else {
            // Retour au brillant réaliste
            bodyMaterial.roughness = 0.3; bodyMaterial.clearcoat = 1.0;
        }
    });
});

// Bouton Démarrer
document.getElementById('start-engine').addEventListener('click', () => {
    const audio = new Audio('startup.mp3'); audio.volume = 0.6;
    audio.play().catch(e => console.log("Audio bloqué"));
});

// Boutons Caméra
document.querySelectorAll('.cam-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if(view === 'front') camera.position.set(-5, 1.2, 5);
        if(view === 'side') camera.position.set(6, 1.2, 0);
        if(view === 'back') camera.position.set(-5, 1.5, -5);
        if(view === 'auto') { /* Logique auto-rotate si besoin */ }
        controls.update();
    });
});
