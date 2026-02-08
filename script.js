import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'; // Pour les reflets réalistes
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/* --- CONFIGURATION --- */
const canvas = document.querySelector('#webgl');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);
scene.fog = new THREE.FogExp2(0x050505, 0.015);

/* --- CAMERA --- */
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(-4, 1.5, 6); // Angle vue 3/4 avant

/* --- RENDERER --- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

/* --- CONTROLS --- */
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2 - 0.02; // Bloque la caméra au sol
controls.minDistance = 3.5;
controls.maxDistance = 9;
controls.enablePan = false;

/* --- ECLAIRAGE (Studio Photo) --- */
// Environnement HDR (Reflets carrosserie)
// On utilise une texture générée ou une couleur simple si pas de HDR
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new THREE.Scene()).texture; // Fallback simple

// Lumières
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);

const spotLight = new THREE.SpotLight(0xffffff, 15);
spotLight.position.set(5, 8, 5);
spotLight.angle = 0.5;
spotLight.penumbra = 0.5;
spotLight.castShadow = true;
spotLight.shadow.bias = -0.0001;
spotLight.shadow.mapSize.width = 2048;
spotLight.shadow.mapSize.height = 2048;
scene.add(spotLight);

// Néons Décoratifs (Ambiance Cyber/Garage)
const rectLight1 = new THREE.RectAreaLight(0x00f3ff, 5, 10, 2);
rectLight1.position.set(-5, 0.1, 5);
rectLight1.lookAt(0, 0, 0);
scene.add(rectLight1);

const rectLight2 = new THREE.RectAreaLight(0xff0055, 5, 10, 2);
rectLight2.position.set(5, 0.1, -5);
rectLight2.lookAt(0, 0, 0);
scene.add(rectLight2);

/* --- SOL (Bitume Mouillé) --- */
const floorGeometry = new THREE.PlaneGeometry(30, 30);
const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x050505,
    roughness: 0.1,
    metalness: 0.5,
});
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Grille technique au sol
const gridHelper = new THREE.GridHelper(30, 30, 0x222222, 0x000000);
gridHelper.position.y = 0.01;
scene.add(gridHelper);

/* --- MATÉRIAUX VOITURE --- */
// Peinture Carrosserie (AMG Magno)
const bodyMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x1a1a1a, // Noir par défaut
    metalness: 0.8,
    roughness: 0.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.5
});

// Verres / Toit Ouvrant
const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x000000,
    metalness: 0.9,
    roughness: 0.0,
    transmission: 0.2, // Légèrement transparent
    transparent: true,
    opacity: 0.7
});

/* --- CHARGEMENT DU MODÈLE (CLA 45) --- */
const loader = new GLTFLoader();
let carModel = null;

loader.load('cla45.glb', function (gltf) {
    carModel = gltf.scene;

    // 1. CALCUL DE LA TAILLE ACTUELLE
    const box = new THREE.Box3().setFromObject(carModel);
    const size = box.getSize(new THREE.Vector3());
    
    // 2. FORMULE MAGIQUE DE REDIMENSIONNEMENT
    // On veut que la voiture fasse environ 5 unités de long dans notre scène
    const desiredLength = 5.0; 
    
    // On prend la plus grande dimension (longueur) pour calculer le ratio
    const maxDim = Math.max(size.x, size.y, size.z);
    const scaleFactor = desiredLength / maxDim;
    
    // On applique la taille idéale
    carModel.scale.set(scaleFactor, scaleFactor, scaleFactor);

    // 3. RE-CENTRAGE PARFAIT (Pour qu'elle soit bien au sol)
    // On doit recalculer la box après le redimensionnement
    const newBox = new THREE.Box3().setFromObject(carModel);
    const center = newBox.getCenter(new THREE.Vector3());
    
    carModel.position.x += (carModel.position.x - center.x);
    carModel.position.z += (carModel.position.z - center.z);
    carModel.position.y = 0; // On la pose au sol

    // 4. APPLICATION DES MATÉRIAUX
    carModel.traverse((o) => {
        if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;

            const name = o.name.toLowerCase();
            const matName = o.material ? o.material.name.toLowerCase() : "";

            // Carrosserie
            if (name.includes('body') || name.includes('paint') || matName.includes('paint') || matName.includes('body')) {
                o.material = bodyMaterial;
            }
            // Vitres
            if (name.includes('glass') || name.includes('window') || matName.includes('glass')) {
                o.material = glassMaterial;
            }
        }
    });

    scene.add(carModel);
    
    // 5. ANIMATION D'ENTRÉE (Corrigée avec la nouvelle taille)
    carModel.scale.set(0, 0, 0);
    let currentScale = 0;
    const interval = setInterval(() => {
        currentScale += scaleFactor / 40; // Vitesse de l'animation
        if(currentScale >= scaleFactor) {
            currentScale = scaleFactor;
            clearInterval(interval);
        }
        carModel.scale.set(currentScale, currentScale, currentScale);
    }, 16);

}, undefined, function (error) {
    console.error('Erreur chargement:', error);
    alert("Impossible de charger 'cla45.glb'. Vérifie que le fichier est bien dans le dossier et porte ce nom exact !");
});


/* --- POST-PROCESSING (Glow/Bloom) --- */
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5, 0.4, 0.85
);
bloomPass.threshold = 0.2;
bloomPass.strength = 0.6; // Intensité du néon
bloomPass.radius = 0.5;
composer.addPass(bloomPass);

/* --- ANIMATION LOOP --- */
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    composer.render();
}
animate();

/* --- INTERFACE LOGIC --- */

// 1. START BUTTON
const startBtn = document.getElementById('start-btn');
const loaderDiv = document.getElementById('loader');
const ui = document.getElementById('ui-container');

// Fake loading
setTimeout(() => document.body.classList.add('loaded'), 1500);

startBtn.addEventListener('click', () => {
    // Cinématique Caméra
    const startPos = { x: -4, y: 1.5, z: 6 };
    const endPos = { x: 4, y: 1.2, z: 4.5 }; // Tourne autour
    
    let progress = 0;
    function introAnim() {
        progress += 0.008;
        if(progress <= 1) {
            camera.position.x = startPos.x + (endPos.x - startPos.x) * progress;
            camera.position.z = startPos.z + (endPos.z - startPos.z) * progress;
            camera.lookAt(0, 0, 0);
            requestAnimationFrame(introAnim);
        }
    }
    introAnim();

    loaderDiv.style.opacity = '0';
    setTimeout(() => {
        loaderDiv.style.display = 'none';
        ui.classList.remove('hidden');
    }, 1000);
});

// 2. COLOR PICKER
const colorBtns = document.querySelectorAll('.color-btn');
const colorName = document.querySelector('.current-color-name');

colorBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        colorBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        colorName.innerText = btn.getAttribute('data-name');
        const colorVal = parseInt(btn.getAttribute('data-color'));
        
        // Change la couleur du matériau physique
        bodyMaterial.color.setHex(colorVal);
    });
});

// 3. LIGHTS
const lightsBtn = document.getElementById('lights-btn');
let lightsOn = true;

lightsBtn.addEventListener('click', () => {
    lightsOn = !lightsOn;
    if(lightsOn) {
        spotLight.intensity = 15;
        rectLight1.intensity = 5;
        rectLight2.intensity = 5;
        bloomPass.strength = 0.6;
        lightsBtn.innerText = "PHARES: ON";
    } else {
        spotLight.intensity = 0.5;
        rectLight1.intensity = 0;
        rectLight2.intensity = 0;
        bloomPass.strength = 0.1;
        lightsBtn.innerText = "PHARES: OFF";
    }
});

/* --- RESIZE --- */
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

