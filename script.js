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
scene.background = new THREE.Color(0x222222);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(20, 10, 20); // Vue de côté pour bien voir la hauteur

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;

/* --- LUMIÈRE --- */
const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
scene.add(ambientLight);
const sunLight = new THREE.DirectionalLight(0xffffff, 2);
sunLight.position.set(10, 50, 10);
sunLight.castShadow = true;
scene.add(sunLight);

// HDR
new RGBELoader().load('decor.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
}, undefined, () => console.log("Pas de HDR"));

/* --- LOADERS --- */
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

/* --- 1. CHARGEMENT MAP (CENTRÉE) --- */
let mapModel = null;
gltfLoader.load('map.glb', (gltf) => {
    mapModel = gltf.scene;
    
    // ON FORCE LA MAP À 0,0,0
    mapModel.position.set(0, 0, 0);
    mapModel.scale.set(1, 1, 1);
    
    mapModel.traverse((o) => {
        if (o.isMesh) o.receiveShadow = true;
    });
    scene.add(mapModel);
    console.log("📍 MAP placée au centre (0,0,0)");
}, undefined, (e) => console.error("Erreur Map:", e));

/* --- 2. CHARGEMENT VOITURE (JUSTE AU-DESSUS) --- */
let carModel = null;
const bodyMaterial = new THREE.MeshPhysicalMaterial({ 
    color: 0x111111, metalness: 0.7, roughness: 0.3, clearcoat: 1.0 
});

gltfLoader.load('cla45.glb', (gltf) => {
    carModel = gltf.scene;
    
    // Scale
    const box = new THREE.Box3().setFromObject(carModel);
    const size = box.getSize(new THREE.Vector3());
    const scaleFactor = 4.8 / Math.max(size.x, size.y, size.z);
    carModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
    
    // POSITION DE DÉPART : Juste au-dessus du centre de la map
    // Si la route de ta map est loin du centre 0,0,0, la voiture tombera dans le vide.
    // Mais on va pouvoir la bouger.
    carModel.position.set(0, 10, 0); 

    carModel.traverse((o) => {
        if(o.isMesh) {
            o.castShadow = true;
            const n = o.name.toLowerCase();
            if(n.includes('body') || n.includes('paint')) o.material = bodyMaterial;
        }
    });

    scene.add(carModel);
    document.getElementById('loader').style.display = 'none';
    document.getElementById('ui-container').classList.remove('hidden');

    console.log("------------------------------------------------");
    console.log("🚗 MODE CALIBRAGE");
    console.log("Utilise I, J, K, L pour déplacer la VOITURE sur la route");
    console.log("Utilise U / O pour monter/descendre la VOITURE");
    console.log("ESPACE pour voir les coordonnées");
    console.log("------------------------------------------------");
});


/* --- DÉPLACEMENT MANUEL DE LA VOITURE --- */
window.addEventListener('keydown', (e) => {
    if(!carModel) return;
    const step = 0.5; // Vitesse rapide
    const fineStep = 0.05; // Vitesse lente (avec Shift)
    const s = e.shiftKey ? fineStep : step;

    switch(e.key.toLowerCase()) {
        case 'i': carModel.position.z -= s; break;
        case 'k': carModel.position.z += s; break;
        case 'j': carModel.position.x -= s; break;
        case 'l': carModel.position.x += s; break;
        case 'u': carModel.position.y += s; break;
        case 'o': carModel.position.y -= s; break;
        case 'r': carModel.rotation.y += 0.1; break;
        case ' ': 
            console.log(`NOUVELLES COORDONNÉES À ENVOYER :`);
            console.log(`X: ${carModel.position.x.toFixed(2)}`);
            console.log(`Y: ${carModel.position.y.toFixed(2)}`);
            console.log(`Z: ${carModel.position.z.toFixed(2)}`);
            alert(`X=${carModel.position.x.toFixed(2)} Y=${carModel.position.y.toFixed(2)} Z=${carModel.position.z.toFixed(2)}`);
            break;
    }
});

/* --- RENDU --- */
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
