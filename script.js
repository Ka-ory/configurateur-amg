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
camera.position.set(-8, 3, 8); 

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
gltfLoader.load('map.glb', (gltf) => {
    const map = gltf.scene;
    // Ajustement taille map (change si besoin)
    map.scale.set(1, 1, 1); 
    map.position.set(0, 0, 0);
    
    map.traverse((o) => {
        if (o.isMesh) {
            o.receiveShadow = true;
             // Si la map est noire, décommenter la ligne suivante :
             // if(!o.material.map) o.material = new THREE.MeshStandardMaterial({color:0x888888});
        }
    });
    scene.add(map);
    console.log("Map chargée !");
}, undefined, (e) => console.error("Erreur Map:", e));

/* --- CHARGEMENT VOITURE --- */
let carModel = null;
const bodyMaterial = new THREE.MeshPhysicalMaterial({ 
    color: 0x111111, metalness: 0.7, roughness: 0.3, clearcoat: 1.0, envMapIntensity: 1.0 
});

gltfLoader.load('cla45.glb', (gltf) => {
    carModel = gltf.scene;
    
    // Scale
    const box = new THREE.Box3().setFromObject(carModel);
    const size = box.getSize(new THREE.Vector3());
    const scaleFactor = 4.8 / Math.max(size.x, size.y, size.z);
    carModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
    
    // Position Initiale (0,0,0)
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

    // Message d'aide
    console.log("------------------------------------------------");
    console.log("🚗 MODE GARAGE ACTIVÉ");
    console.log("Utilise ces touches pour placer ta voiture :");
    console.log("I / K : Avancer / Reculer (Z)");
    console.log("J / L : Gauche / Droite (X)");
    console.log("U / O : Monter / Descendre (Y)");
    console.log("R : Tourner");
    console.log("------------------------------------------------");

});

/* --- SYSTEME DE DEPLACEMENT MANUEL --- */
window.addEventListener('keydown', (e) => {
    if(!carModel) return;
    const step = 0.5; // Vitesse de déplacement (mètres)
    
    switch(e.key.toLowerCase()) {
        case 'i': carModel.position.z -= step; break;
        case 'k': carModel.position.z += step; break;
        case 'j': carModel.position.x -= step; break;
        case 'l': carModel.position.x += step; break;
        case 'u': carModel.position.y += step; break; // Monter
        case 'o': carModel.position.y -= step; break; // Descendre
        case 'r': carModel.rotation.y += 0.1; break;  // Tourner
        case ' ': // Espace pour afficher les coordonnées
            console.log(`📍 COORDONNÉES À COPIER DANS LE CODE :`);
            console.log(`carModel.position.set(${carModel.position.x.toFixed(2)}, ${carModel.position.y.toFixed(2)}, ${carModel.position.z.toFixed(2)});`);
            console.log(`carModel.rotation.y = ${carModel.rotation.y.toFixed(2)};`);
            alert(`Position: X=${carModel.position.x.toFixed(1)} Y=${carModel.position.y.toFixed(1)} Z=${carModel.position.z.toFixed(1)}\n(Regarde la console F12 pour copier le code)`);
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
