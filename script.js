import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/* --- SETUP SCÈNE (AMBIANCE HIVER) --- */
const canvas = document.querySelector('#webgl');
const scene = new THREE.Scene();

// Fond : Un gris-bleu très clair pour simuler le ciel d'hiver si le HDR ne charge pas
scene.background = new THREE.Color(0xddeeff); 

// BROUILLARD VOLUMÉTRIQUE (L'effet "Montagne")
// Couleur bleu glace très clair (0xeef4ff), densité faible (0.002)
scene.fog = new THREE.FogExp2(0xeef4ff, 0.002);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 3000); // Vue loin pour la montagne
camera.position.set(-6, 2, 6);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1; // Légèrement surexposé pour la réverbération de la neige
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

/* --- LUMIÈRE (SOLEIL D'HIVER) --- */
const ambientLight = new THREE.AmbientLight(0xcceeff, 1.2); // Lumière ambiante bleutée (froid)
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.8); // Soleil blanc pur
sunLight.position.set(-50, 30, -50); // Soleil assez bas
sunLight.castShadow = true;
// Ombres étendues pour couvrir toute la montagne
sunLight.shadow.mapSize.width = 4096;
sunLight.shadow.mapSize.height = 4096;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 1000;
sunLight.shadow.camera.left = -200;
sunLight.shadow.camera.right = 200;
sunLight.shadow.camera.top = 200;
sunLight.shadow.camera.bottom = -200;
sunLight.shadow.bias = -0.0001;
scene.add(sunLight);

// HDR
new RGBELoader().load('decor.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
    // On garde le HDR en fond mais on laisse le brouillard agir dessus
    scene.background = texture;
    scene.backgroundIntensity = 0.8;
}, undefined, () => console.log("Pas de HDR"));

/* --- LOADERS --- */
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

/* --- CHARGEMENT MAP (CONFIGURÉE NEIGE) --- */
// Tes coordonnées précises
const MAP_POS_X = 348;
const MAP_POS_Y = 16;
const MAP_POS_Z = 278;
const MAP_ROT_Y = 12.55;

gltfLoader.load('map.glb', (gltf) => {
    const map = gltf.scene;
    
    // Positionnement
    map.position.set(MAP_POS_X, MAP_POS_Y, MAP_POS_Z);
    map.rotation.y = MAP_ROT_Y;
    map.scale.set(1, 1, 1);

    // --- CONFIGURATION SPÉCIALE NEIGE/MONTAGNE ---
    map.traverse((o) => {
        if (o.isMesh) {
            o.receiveShadow = true;
            o.castShadow = true; 

            if (o.material) {
                // LE SECRET DE LA NEIGE :
                // 1. Pas de métal (metalness = 0)
                // 2. Très rugueux (roughness = 1.0) -> Aspect poudreuse mate
                o.material.roughness = 1.0; 
                o.material.metalness = 0.0;
                
                // Si la texture est trop sombre, on peut tricher en éclaircissant le matériau
                // o.material.color.addScalar(0.1); 

                // Transparence (Arbres/Sapins)
                if (o.material.transparent || o.material.opacity < 1 || o.material.name.toLowerCase().includes('leaf') || o.material.name.toLowerCase().includes('sapin')) {
                    o.material.transparent = true;
                    o.material.alphaTest = 0.5;
                    o.material.side = THREE.DoubleSide;
                }

                // Glace / Eau (si détectée)
                const n = o.name.toLowerCase();
                if (n.includes('ice') || n.includes('glace') || n.includes('water')) {
                    o.material.roughness = 0.05; // Très lisse
                    o.material.transmission = 0.6; // Un peu transparent
                    o.material.color.setHex(0xaaccff); // Bleu glacé
                }
            }
        }
    });

    scene.add(map);
    console.log("Map Montagne chargée !");

}, undefined, (e) => console.error("Erreur Map:", e));


/* --- CHARGEMENT VOITURE --- */
const bodyMaterial = new THREE.MeshPhysicalMaterial({ 
    color: 0x111111, metalness: 0.7, roughness: 0.3, clearcoat: 1.0, envMapIntensity: 1.5 
});

gltfLoader.load('cla45.glb', (gltf) => {
    const car = gltf.scene;
    
    // Scale & Center
    const box = new THREE.Box3().setFromObject(car);
    const size = box.getSize(new THREE.Vector3());
    const scaleFactor = 4.8 / Math.max(size.x, size.y, size.z);
    car.scale.set(scaleFactor, scaleFactor, scaleFactor);
    
    // Voiture à 0,0,0 (C'est la map qui a bougé autour)
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

/* --- POST PROCESSING (ÉCLAT FROID) --- */
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Bloom un peu plus fort pour faire briller la neige au soleil
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.8; // Seuil plus bas pour que la neige blanche brille un peu
bloomPass.strength = 0.35; 
bloomPass.radius = 0.4;
composer.addPass(bloomPass);

/* --- CONTROLS --- */
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.05; 
controls.minDistance = 3;
controls.maxDistance = 15;
controls.enablePan = false;
controls.target.set(0, 0.8, 0);

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    composer.render();
}
animate();

/* --- UI --- */
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
        if(view === 'auto') { }
        controls.update();
    });
});

document.getElementById('start-engine').addEventListener('click', () => {
    new Audio('startup.mp3').play().catch(e => console.log("Audio bloqué"));
});
