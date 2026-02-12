import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/* --- SETUP --- */
const canvas = document.querySelector('#webgl');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(-6, 2, 6); // Caméra proche pour bien voir

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;

/* --- LUMIÈRE --- */
const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
scene.add(ambientLight);
const sunLight = new THREE.DirectionalLight(0xffffff, 2);
sunLight.position.set(10, 20, 10);
sunLight.castShadow = true;
scene.add(sunLight);

new RGBELoader().load('decor.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
}, undefined, () => console.log("Note: Pas de HDR, lumière standard utilisée."));

/* --- LOADERS --- */
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

/* --- CHARGEMENT MAP --- */
let mapModel = null;
// Tes coordonnées approximatives INVERSÉES (car on bouge la map, pas la voiture)
const startX = -325.50;
const startY = 11.50; // Inversé de -11.50
const startZ = 298.00; // Inversé de -298.00

gltfLoader.load('map.glb', (gltf) => {
    mapModel = gltf.scene;
    mapModel.scale.set(1, 1, 1); 
    
    // On applique la position de départ
    mapModel.position.set(startX, startY, startZ);
    
    mapModel.traverse((o) => {
        if (o.isMesh) {
            o.receiveShadow = true;
        }
    });
    scene.add(mapModel);
    console.log("Map chargée ! Positionnée à :", mapModel.position);
}, undefined, (e) => console.error("Erreur Map:", e));

/* --- CHARGEMENT VOITURE --- */
let carModel = null;
const bodyMaterial = new THREE.MeshPhysicalMaterial({ 
    color: 0x111111, metalness: 0.7, roughness: 0.3, clearcoat: 1.0, envMapIntensity: 1.0 
});

gltfLoader.load('cla45.glb', (gltf) => {
    carModel = gltf.scene;
    
    const box = new THREE.Box3().setFromObject(carModel);
    const size = box.getSize(new THREE.Vector3());
    const scaleFactor = 4.8 / Math.max(size.x, size.y, size.z);
    carModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
    
    // La voiture reste TOUJOURS à 0,0,0
    carModel.position.set(0, 0, 0);

    carModel.traverse((o) => {
        if(o.isMesh) {
            o.castShadow = true; o.receiveShadow = true;
            const n = o.name.toLowerCase();
            const mn = o.material && o.material.name ? o.material.name.toLowerCase() : "";
            if(n.includes('body') || n.includes('paint') || mn.includes('paint') || mn.includes('body')) {
                o.material = bodyMaterial;
            }
        }
    });

    scene.add(carModel);
    document.getElementById('loader').style.display = 'none';
    document.getElementById('ui-container').classList.remove('hidden');

    console.log("------------------------------------------------");
    console.log("🚗 MODE AJUSTEMENT PRÉCIS");
    console.log("I / K : Avancer/Reculer la Map");
    console.log("J / L : Gauche/Droite la Map");
    console.log("U / O : Monter/Descendre la Map");
    console.log("R : Tourner la Map");
    console.log("MAINTIENS SHIFT pour aller doucement !");
    console.log("ESPACE pour valider la position");
    console.log("------------------------------------------------");
});

/* --- SYSTEME DE DEPLACEMENT (MAP) --- */
window.addEventListener('keydown', (e) => {
    if(!mapModel) return;
    
    // Vitesse : Rapide par défaut, Lente si Shift appuyé
    const baseStep = e.shiftKey ? 0.05 : 0.5; 
    const rotStep = e.shiftKey ? 0.01 : 0.05;

    switch(e.key.toLowerCase()) {
        case 'i': mapModel.position.z += baseStep; break; // Inverse car on bouge la map
        case 'k': mapModel.position.z -= baseStep; break;
        case 'j': mapModel.position.x += baseStep; break;
        case 'l': mapModel.position.x -= baseStep; break;
        case 'u': mapModel.position.y -= baseStep; break; // Descendre map = Monter voiture
        case 'o': mapModel.position.y += baseStep; break;
        case 'r': mapModel.rotation.y += rotStep; break;
        case ' ': 
            console.log(`📍 POSITION FINALE À GARDER :`);
            console.log(`mapModel.position.set(${mapModel.position.x.toFixed(3)}, ${mapModel.position.y.toFixed(3)}, ${mapModel.position.z.toFixed(3)});`);
            console.log(`mapModel.rotation.y = ${mapModel.rotation.y.toFixed(3)};`);
            alert(`Map X=${mapModel.position.x.toFixed(2)} Y=${mapModel.position.y.toFixed(2)} Z=${mapModel.position.z.toFixed(2)}\nRotation=${mapModel.rotation.y.toFixed(2)}\n(Copié dans la console F12)`);
            break;
    }
});


/* --- RENDU --- */
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.9; bloomPass.strength = 0.3; bloomPass.radius = 0.2;
composer.addPass(bloomPass);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

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
