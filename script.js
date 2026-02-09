import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'; // Pour le flou photo

/* --- 1. SETUP DE LA SCÈNE --- */
const canvas = document.querySelector('#webgl');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000); 

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(-8, 2, 8); // Vue 3/4 avant par défaut

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }); // preserveDrawingBuffer pour les screenshots
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Haute résolution
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

/* --- 2. ÉCLAIRAGE (Soleil + HDR) --- */
const rgbeLoader = new RGBELoader();
// On garde decor.hdr pour la lumière ambiante et les reflets, même si on a une map 3D
rgbeLoader.load('decor.hdr', function(texture) {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
    // On met aussi le HDR en fond au cas où la map a des trous
    scene.background = texture; 
    scene.backgroundIntensity = 0.5; // Un peu plus sombre pour faire ressortir la map
});

// Soleil Dynamique (Piloté par le slider temps)
const sunLight = new THREE.DirectionalLight(0xffffff, 2);
sunLight.position.set(-30, 50, -30);
sunLight.castShadow = true;
// Ombres Ultra-Détaillées pour les photos
sunLight.shadow.mapSize.width = 4096;
sunLight.shadow.mapSize.height = 4096;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 500;
sunLight.shadow.camera.left = -100;
sunLight.shadow.camera.right = 100;
sunLight.shadow.camera.top = 100;
sunLight.shadow.camera.bottom = -100;
sunLight.shadow.bias = -0.0001;
scene.add(sunLight);

/* --- 3. CHARGEMENT DE LA MAP (DÉCOR) --- */
const gltfLoader = new GLTFLoader();

// Matériau Spécial Eau (Si la map contient "Water")
const waterMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x004455,
    metalness: 0.1,
    roughness: 0.05,
    transmission: 0.9, // Transparent
    transparent: true,
    opacity: 0.8,
    ior: 1.33 // Indice de réfraction de l'eau
});

gltfLoader.load('map.glb', (gltf) => {
    const map = gltf.scene;
    
    // Analyse et optimise la map
    map.traverse((o) => {
        if (o.isMesh) {
            o.receiveShadow = true;
            o.castShadow = true; // Les arbres projettent des ombres

            // Si c'est de l'eau, on la rend réaliste
            if(o.name.toLowerCase().includes('water') || o.name.toLowerCase().includes('eau') || 
               (o.material && o.material.name.toLowerCase().includes('water'))) {
                o.material = waterMaterial;
            }
            // Si c'est des feuilles, on active la transparence
            if(o.material && (o.material.name.toLowerCase().includes('leaf') || o.material.name.toLowerCase().includes('feuille'))) {
                o.material.transparent = true;
                o.material.alphaTest = 0.5; // Évite les bugs de tri
            }
        }
    });

    // Ajuster la taille de la map si besoin (x10 souvent nécessaire pour les assets Sketchfab)
    // map.scale.set(10, 10, 10); 
    
    // Descendre un peu la map si la route flotte
    map.position.y = -0.05; 
    
    scene.add(map);
    console.log("Map chargée !");

}, undefined, (e) => {
    console.error("Pas de map.glb trouvée. Télécharge-en une !");
    // Fallback : Grille simple si pas de map
    const grid = new THREE.GridHelper(100, 100, 0x555555, 0x222222);
    scene.add(grid);
});

/* --- 4. CHARGEMENT VOITURE --- */
let carModel = null;
const bodyMaterial = new THREE.MeshPhysicalMaterial({ 
    color: 0x111111, metalness: 0.9, roughness: 0.2, 
    clearcoat: 1.0, envMapIntensity: 2.0 
});

gltfLoader.load('cla45.glb', (gltf) => {
    carModel = gltf.scene;

    // Auto-Scale
    const box = new THREE.Box3().setFromObject(carModel);
    const size = box.getSize(new THREE.Vector3());
    const scaleFactor = 4.8 / Math.max(size.x, size.y, size.z);
    carModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
    
    // Center & Place on Ground
    const newBox = new THREE.Box3().setFromObject(carModel);
    const center = newBox.getCenter(new THREE.Vector3());
    carModel.position.sub(center);
    carModel.position.y = 0; // Au niveau 0

    // Apply Materials
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
    document.getElementById('loader').style.transform = 'translateY(-100%)';
    setTimeout(() => document.getElementById('ui-container').classList.remove('hidden'), 500);
});


/* --- 5. POST PROCESSING CINÉMATIQUE --- */
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Bloom (Lueur)
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.9; // Seulement les reflets très forts
bloomPass.strength = 0.3; 
bloomPass.radius = 0.5;
composer.addPass(bloomPass);

// Bokeh (Profondeur de champ / Flou)
const bokehPass = new BokehPass(scene, camera, {
    focus: 8.0,      // Distance de mise au point (sur la voiture)
    aperture: 0.0001, // Ouverture (plus grand = plus de flou)
    maxblur: 0.008,   // Flou maximum
});
composer.addPass(bokehPass);


/* --- 6. CONTRÔLES --- */
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.05; // Pas sous le sol
controls.minDistance = 3;
controls.maxDistance = 20;
controls.enablePan = false;
controls.target.set(0, 0.8, 0);

/* --- 7. ANIMATION --- */
let autoRotate = true;
let targetPos = null;

function animate() {
    requestAnimationFrame(animate);
    
    if (targetPos) {
        controls.target.lerp(new THREE.Vector3(0, 0.5, 0), 0.1);
        camera.position.lerp(targetPos, 0.05);
        if(camera.position.distanceTo(targetPos) < 0.2) targetPos = null;
    } else if (autoRotate) {
        controls.update();
    }
    
    controls.update();
    composer.render();
}
animate();


/* --- 8. INTERACTIONS --- */

// PHOTO MODE (Espace)
window.addEventListener('keydown', (e) => {
    if(e.code === 'Space') {
        const ui = document.getElementById('ui-container');
        ui.classList.toggle('hidden'); // Cache/Affiche l'UI
    }
});

// TIME SLIDER
document.getElementById('time-slider').addEventListener('input', (e) => {
    const val = e.target.value;
    const exposure = 0.1 + (val / 100) * 1.4;
    renderer.toneMappingExposure = exposure;

    if(val < 20 || val > 80) {
        sunLight.color.setHex(0xffaa33); // Orange
        sunLight.intensity = 1;
        scene.backgroundIntensity = 0.2; // Nuit
    } else {
        sunLight.color.setHex(0xffffff); // Blanc
        sunLight.intensity = 2;
        scene.backgroundIntensity = 1.0; // Jour
    }
    
    const angle = (val / 100) * Math.PI;
    sunLight.position.x = Math.cos(angle) * 50;
    sunLight.position.y = Math.sin(angle) * 50;
});

// COLORS
document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelector('.current-paint').innerText = btn.dataset.name;
        
        const color = parseInt(btn.dataset.color);
        bodyMaterial.color.setHex(color);

        if(btn.dataset.name.includes("MAT")) {
            bodyMaterial.roughness = 0.6;
            bodyMaterial.clearcoat = 0.0;
        } else {
            bodyMaterial.roughness = 0.2;
            bodyMaterial.clearcoat = 1.0;
        }
    });
});

// CAMERAS
document.querySelectorAll('.cam-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const view = btn.dataset.view;
        autoRotate = false;
        
        if(view === 'front') targetPos = new THREE.Vector3(-6, 1.5, 6);
        if(view === 'side') targetPos = new THREE.Vector3(8, 1.5, 0);
        if(view === 'back') targetPos = new THREE.Vector3(-6, 2, -6);
        if(view === 'auto') { autoRotate = true; targetPos = null; }
    });
});

// DEMARRER
document.getElementById('start-engine').addEventListener('click', () => {
    const audio = new Audio('startup.mp3'); audio.volume = 0.6;
    audio.play().catch(e => console.log("Audio bloqué"));
});

// RESIZE
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});
