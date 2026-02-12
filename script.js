import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/* --- SETUP SCÈNE --- */
const canvas = document.querySelector('#webgl');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505); // Fond sombre propre

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(-7, 2, 7); // Vue catalogue

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0; // Exposition équilibrée
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

/* --- LUMIÈRE --- */
const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); // Lumière de base
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
sunLight.position.set(20, 50, 20); // Soleil haut
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 4096; // Ombres très nettes
sunLight.shadow.mapSize.height = 4096;
sunLight.shadow.bias = -0.0005; // Enlève les artifacts d'ombre
scene.add(sunLight);

// HDR (Ciel)
new RGBELoader().load('decor.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
    // On met aussi le HDR en fond pour que ce soit joli
    scene.background = texture;
    scene.backgroundIntensity = 0.6; // Pas trop éblouissant
}, undefined, () => console.log("Pas de HDR"));

/* --- LOADERS --- */
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

/* --- CHARGEMENT MAP (AMÉLIORÉ) --- */
// Rentre ici tes coordonnées finales de la MAP (celles que tu as notées)
// Si tu ne les as pas notées, remets celles par défaut ou ajuste
const MAP_POS_X = -325.50;
const MAP_POS_Y = 11.50;
const MAP_POS_Z = 298.00;
const MAP_ROT_Y = 0; // Si tu avais tourné la map

gltfLoader.load('map.glb', (gltf) => {
    const map = gltf.scene;
    
    // Positionnement
    map.position.set(MAP_POS_X, MAP_POS_Y, MAP_POS_Z);
    map.rotation.y = MAP_ROT_Y;
    map.scale.set(1, 1, 1);

    // --- EMBELLISSEMENT AUTOMATIQUE ---
    map.traverse((o) => {
        if (o.isMesh) {
            o.receiveShadow = true;
            o.castShadow = true; // La map projette aussi des ombres sur elle-même

            // Si l'objet a un matériau, on l'améliore
            if (o.material) {
                // Règle la rugosité pour éviter l'effet "plastique mouillé" partout
                // On met une rugosité élevée par défaut (mat) sauf si le fichier dit le contraire
                o.material.roughness = 0.8; 
                o.material.metalness = 0.1; // Peu de métal par défaut sur le décor

                // Gestion Transparence (Arbres, Barrières)
                if (o.material.transparent || o.material.opacity < 1) {
                    o.material.transparent = true;
                    o.material.alphaTest = 0.5; // Découpe nette des feuilles
                    o.material.side = THREE.DoubleSide; // Voir les feuilles des 2 côtés
                }

                // Cas spécial : L'eau (si détectée)
                const n = o.name.toLowerCase();
                const mn = o.material.name.toLowerCase();
                if (n.includes('water') || n.includes('eau') || mn.includes('water')) {
                    o.material.roughness = 0.1;
                    o.material.metalness = 0.8;
                    o.material.color.setHex(0x004466);
                }
            }
        }
    });

    scene.add(map);
    console.log("Map chargée et embellie !");

}, undefined, (e) => console.error("Erreur Map:", e));


/* --- CHARGEMENT VOITURE --- */
const bodyMaterial = new THREE.MeshPhysicalMaterial({ 
    color: 0x111111, metalness: 0.7, roughness: 0.3, clearcoat: 1.0, envMapIntensity: 1.0 
});

gltfLoader.load('cla45.glb', (gltf) => {
    const car = gltf.scene;
    
    // Scale & Center
    const box = new THREE.Box3().setFromObject(car);
    const size = box.getSize(new THREE.Vector3());
    const scaleFactor = 4.8 / Math.max(size.x, size.y, size.z);
    car.scale.set(scaleFactor, scaleFactor, scaleFactor);
    
    // Voiture toujours à 0,0,0
    const center = new THREE.Box3().setFromObject(car).getCenter(new THREE.Vector3());
    car.position.sub(center);
    car.position.y = 0;

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
    document.getElementById('loader').style.display = 'none';
    document.getElementById('ui-container').classList.remove('hidden');
});

/* --- POST PROCESSING (Rendu Cinéma) --- */
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.9; bloomPass.strength = 0.3; bloomPass.radius = 0.2;
composer.addPass(bloomPass);

/* --- CONTROLS --- */
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.05; // Pas sous le sol
controls.minDistance = 3;
controls.maxDistance = 12;
controls.enablePan = false; // On bloque le pan pour garder la voiture au centre
controls.target.set(0, 0.8, 0);

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    composer.render();
}
animate();

/* --- UI INTERACTIONS --- */
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

// Caméras
document.querySelectorAll('.cam-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if(view === 'front') camera.position.set(-5, 1.2, 5);
        if(view === 'side') camera.position.set(6, 1.2, 0);
        if(view === 'back') camera.position.set(-5, 1.5, -5);
        if(view === 'auto') { /* auto rotate logic if needed */ }
        controls.update();
    });
});

// Son
document.getElementById('start-engine').addEventListener('click', () => {
    new Audio('startup.mp3').play().catch(e => console.log("Audio bloqué"));
});
