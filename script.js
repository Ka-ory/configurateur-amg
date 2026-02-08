import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/* --- CONFIGURATION --- */
const canvas = document.querySelector('#webgl');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);
scene.fog = new THREE.FogExp2(0x050505, 0.02);

/* --- CAMERA --- */
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(-5, 2, 8); // Position de départ

/* --- RENDERER --- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

/* --- CONTROLS --- */
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2 - 0.05; // Empêche de passer sous le sol
controls.minDistance = 4;
controls.maxDistance = 12;
controls.enablePan = false; // Plus pro

/* --- ECLAIRAGE (Showroom) --- */
const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
scene.add(ambientLight);

// Spot Principal (Plafonnier)
const spotLight = new THREE.SpotLight(0xffffff, 20);
spotLight.position.set(0, 10, 0);
spotLight.angle = 0.6;
spotLight.penumbra = 0.5;
spotLight.castShadow = true;
spotLight.shadow.bias = -0.0001;
scene.add(spotLight);

// Lumières Néons (Décor)
const rectLight1 = new THREE.RectAreaLight(0x00f3ff, 5, 20, 10);
rectLight1.position.set(-10, 0, 5);
rectLight1.lookAt(0, 0, 0);
scene.add(rectLight1);

const rectLight2 = new THREE.RectAreaLight(0xff0055, 5, 20, 10);
rectLight2.position.set(10, 0, -5);
rectLight2.lookAt(0, 0, 0);
scene.add(rectLight2);

/* --- SOL (Reflections) --- */
const floorGeometry = new THREE.PlaneGeometry(50, 50);
const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.1,
    metalness: 0.8,
});
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Grille lumineuse sur le sol (Effet TRON)
const gridHelper = new THREE.GridHelper(50, 50, 0x333333, 0x111111);
scene.add(gridHelper);

/* --- LE VÉHICULE (Concept Car Procédural) --- */
// NOTE: Puisque je ne peux pas importer un fichier externe .glb ici,
// Je crée une forme aérodynamique abstraite ("Concept Form") pour représenter la voiture.
// C'est ici que tu chargeras ton modèle CLA45.

let carBody;

// Matériau Carrosserie (Ultra réaliste)
const carMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x1a1a1a,
    metalness: 0.9,
    roughness: 0.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.0
});

// Création de la forme "Concept"
function createConceptCar() {
    const geometry = new THREE.TorusKnotGeometry(1.5, 0.5, 200, 32); 
    // Ou utilise une capsule très allongée pour simuler un corps de voiture
    // const geometry = new THREE.CapsuleGeometry(1, 4, 4, 16); 
    // geometry.rotateZ(Math.PI / 2);

    carBody = new THREE.Mesh(geometry, carMaterial);
    carBody.position.y = 1.2;
    carBody.castShadow = true;
    carBody.receiveShadow = true;
    scene.add(carBody);

    // Ajout de particules autour (Effet vitesse)
    const particlesGeom = new THREE.BufferGeometry();
    const particlesCount = 500;
    const posArray = new Float32Array(particlesCount * 3);
    for(let i=0; i<particlesCount * 3; i++) {
        posArray[i] = (Math.random() - 0.5) * 20;
    }
    particlesGeom.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const particlesMat = new THREE.PointsMaterial({
        size: 0.02,
        color: 0xffffff,
        transparent: true,
        opacity: 0.6
    });
    const particlesMesh = new THREE.Points(particlesGeom, particlesMat);
    scene.add(particlesMesh);
    
    // Animation particules
    function animateParticles() {
        particlesMesh.rotation.y += 0.002;
        requestAnimationFrame(animateParticles);
    }
    animateParticles();
}

createConceptCar();

/* // --- COMMENT CHARGER UN VRAI MODÈLE (Décommenter si tu as le fichier) ---
const loader = new GLTFLoader();
loader.load('path/to/cla45.glb', function (gltf) {
    const model = gltf.scene;
    scene.add(model);
    
    // Trouver la carrosserie pour changer la couleur
    model.traverse((o) => {
        if (o.isMesh && o.name.includes('Body')) { // Vérifie le nom dans Blender
            carBody = o;
            o.material = carMaterial;
        }
        if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
        }
    });
});
*/

/* --- POST-PROCESSING (BLOOM EFFECT) --- */
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5, 0.4, 0.85
);
bloomPass.threshold = 0.2; // Seuil de lumière pour briller
bloomPass.strength = 0.8;  // Intensité du glow
bloomPass.radius = 0.5;
composer.addPass(bloomPass);

/* --- ANIMATION LOOP --- */
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    
    // Légère rotation automatique pour dynamiser
    if(carBody) {
        // carBody.rotation.y += 0.001; // Rotation voiture
        // floor.rotation.z -= 0.001;
    }

    composer.render(); // Utilise composer au lieu de renderer pour le bloom
}
animate();

/* --- INTERFACE LOGIC --- */
// 1. Loading Screen
const startBtn = document.getElementById('start-btn');
const loader = document.getElementById('loader');
const ui = document.getElementById('ui-container');

// Simulation chargement
setTimeout(() => {
    document.body.classList.add('loaded');
}, 2000);

// Click Démarrer
startBtn.addEventListener('click', () => {
    // Animation de caméra (Cinématique)
    const startPos = { x: -5, y: 2, z: 8 };
    const endPos = { x: 3, y: 1.5, z: 5 };
    
    // Simple interpolation manuelle (ou utiliser GSAP pour mieux)
    let progress = 0;
    function introAnim() {
        progress += 0.01;
        if(progress <= 1) {
            camera.position.x = startPos.x + (endPos.x - startPos.x) * progress;
            camera.position.y = startPos.y + (endPos.y - startPos.y) * progress;
            camera.position.z = startPos.z + (endPos.z - startPos.z) * progress;
            camera.lookAt(0, 0, 0);
            requestAnimationFrame(introAnim);
        }
    }
    introAnim();

    // Fade out loader
    loader.style.opacity = '0';
    setTimeout(() => {
        loader.style.display = 'none';
        ui.classList.remove('hidden'); // Affiche HUD
    }, 1000);
    
    // Play Sound (optionnel)
    // const audio = new Audio('engine_start.mp3'); audio.play();
});

// 2. Color Picker
const colorBtns = document.querySelectorAll('.color-btn');
const colorName = document.querySelector('.current-color-name');

colorBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Active class
        colorBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update Text
        colorName.innerText = btn.getAttribute('data-name');
        
        // Update 3D Material
        const colorVal = parseInt(btn.getAttribute('data-color'));
        
        // Transition couleur fluide
        if(carBody) {
             // Si c'est un Mesh simple
            if(carBody.material) {
                carBody.material.color.setHex(colorVal);
            } 
            // Si c'est un modèle complexe (GLTF), on change juste la propriété
            // carMaterial.color.setHex(colorVal); 
        }
    });
});

// 3. Lights Button
const lightsBtn = document.getElementById('lights-btn');
let lightsOn = true;

lightsBtn.addEventListener('click', () => {
    lightsOn = !lightsOn;
    if(lightsOn) {
        spotLight.intensity = 20;
        rectLight1.intensity = 5;
        rectLight2.intensity = 5;
        bloomPass.strength = 0.8;
        lightsBtn.innerText = "PHARES: ON";
    } else {
        spotLight.intensity = 0.5; // Mode sombre
        rectLight1.intensity = 0;
        rectLight2.intensity = 0;
        bloomPass.strength = 0.1;
        lightsBtn.innerText = "PHARES: OFF";
    }
});

/* --- RESIZE HANDLER --- */
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});