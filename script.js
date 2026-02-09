import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/* --- 1. SETUP DE LA SCÈNE --- */
const canvas = document.querySelector('#webgl');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(-8, 3, 8); 

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;

/* --- 2. LUMIÈRE --- */
const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 2);
sunLight.position.set(10, 20, 10);
sunLight.castShadow = true;
scene.add(sunLight);

// HDR
new RGBELoader().load('decor.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
}, undefined, (err) => console.log("Pas de HDR, pas grave."));

/* --- 3. CHARGEMENT ROBUSTE MAP.GLB --- */
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
dracoLoader.setDecoderConfig({ type: 'js' }); // Force le JS pour la compatibilité max

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

// Gestionnaire d'erreur global pour le chargement
function loadMapSafely() {
    gltfLoader.load('map.glb', (gltf) => {
        try {
            const map = gltf.scene;
            console.log("✅ Map chargée !");

            // Correction taille
            const box = new THREE.Box3().setFromObject(map);
            const size = box.getSize(new THREE.Vector3());
            
            if (size.x < 10) map.scale.set(100, 100, 100);
            else if (size.x > 1000) map.scale.set(0.01, 0.01, 0.01);
            else map.scale.set(1, 1, 1);

            map.position.set(0, -0.1, 0);
            
            // On enlève les objets qui pourraient faire planter le rendu
            map.traverse((o) => {
                if (o.isMesh) {
                    o.receiveShadow = true;
                    // Vérification de sécurité géométrie
                    if (!o.geometry || !o.geometry.attributes.position) return;
                }
            });

            scene.add(map);

        } catch (error) {
            console.error("Erreur post-traitement map :", error);
            addFallbackFloor(); // Si ça plante après chargement, on met le sol de secours
        }

    }, undefined, (e) => {
        console.error("❌ ERREUR CHARGEMENT MAP CRITIQUE :", e);
        console.log("Passage au mode 'Sol de Secours'...");
        addFallbackFloor(); // Si le fichier est illisible, on met le sol de secours
    });
}

function addFallbackFloor() {
    // Crée une grille stylée si la map plante
    const grid = new THREE.GridHelper(100, 100, 0x00f3ff, 0x222222);
    scene.add(grid);
    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.5 })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.1;
    scene.add(plane);
}

// Lancer le chargement sécurisé
loadMapSafely();


/* --- 4. CHARGEMENT VOITURE --- */
const bodyMaterial = new THREE.MeshPhysicalMaterial({ 
    color: 0x111111, metalness: 0.7, roughness: 0.3, clearcoat: 1.0, envMapIntensity: 1.0 
});

gltfLoader.load('cla45.glb', (gltf) => {
    const car = gltf.scene;
    
    const box = new THREE.Box3().setFromObject(car);
    const size = box.getSize(new THREE.Vector3());
    const scaleFactor = 4.8 / Math.max(size.x, size.y, size.z);
    car.scale.set(scaleFactor, scaleFactor, scaleFactor);
    
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
