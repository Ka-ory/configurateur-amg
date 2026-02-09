import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/* --- SCENE SETUP --- */
const canvas = document.querySelector('#webgl');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);
scene.fog = new THREE.FogExp2(0x050505, 0.01); // Brouillard léger pour la profondeur

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(-8, 2, 8);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

/* --- ENVIRONNEMENT HDR --- */
const rgbeLoader = new RGBELoader();
rgbeLoader.load('decor.hdr', function(texture) {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = texture;
    scene.environment = texture;
});

// SOLEIL (Directional Light)
const sunLight = new THREE.DirectionalLight(0xffaa33, 3);
sunLight.position.set(-50, 50, -50);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 4096;
sunLight.shadow.mapSize.height = 4096;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 200;
sunLight.shadow.camera.left = -50;
sunLight.shadow.camera.right = 50;
sunLight.shadow.camera.top = 50;
sunLight.shadow.camera.bottom = -50;
scene.add(sunLight);

/* --- LA NATURE (Génération Procédurale) --- */

// 1. LA ROUTE (Texture chargée précédemment ou couleur simple si erreur)
const texLoader = new THREE.TextureLoader();
const roadColor = texLoader.load('road_color.jpg');
const roadNormal = texLoader.load('road_normal.jpg');
const roadRough = texLoader.load('road_rough.jpg');

[roadColor, roadNormal, roadRough].forEach(t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(10, 40);
});
roadColor.colorSpace = THREE.SRGBColorSpace;

const roadGeo = new THREE.PlaneGeometry(10, 400); // Route étroite
const roadMat = new THREE.MeshStandardMaterial({
    map: roadColor, normalMap: roadNormal, roughnessMap: roadRough,
    roughness: 0.8, color: 0x555555
});
const road = new THREE.Mesh(roadGeo, roadMat);
road.rotation.x = -Math.PI / 2;
road.receiveShadow = true;
scene.add(road);

// 2. LE LAC (Plane Géant à Gauche)
const waterGeo = new THREE.PlaneGeometry(300, 500);
const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x001e0f, // Bleu-Vert profond
    roughness: 0.05,  // Très lisse
    metalness: 0.1,
    transmission: 0.8, // Effet d'eau
    transparent: true,
    opacity: 0.9
});
const lake = new THREE.Mesh(waterGeo, waterMat);
lake.rotation.x = -Math.PI / 2;
lake.position.set(-155, -0.2, 0); // Décalé à gauche de la route
scene.add(lake);

// 3. LA FORÊT (Arbres à Droite)
const treeCount = 150;
const treeGroup = new THREE.Group();

const trunkGeo = new THREE.CylinderGeometry(0.2, 0.4, 2);
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2817 }); // Marron
const leavesGeo = new THREE.ConeGeometry(1.5, 4, 8);
const leavesMat = new THREE.MeshStandardMaterial({ color: 0x0d2b12 }); // Vert foncé sapin

for(let i=0; i<treeCount; i++) {
    const tree = new THREE.Group();
    
    // Tronc
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1;
    trunk.castShadow = true;
    
    // Feuilles
    const leaves = new THREE.Mesh(leavesGeo, leavesMat);
    leaves.position.y = 3;
    leaves.castShadow = true;
    
    tree.add(trunk);
    tree.add(leaves);
    
    // Position aléatoire (Côté droit de la route)
    const x = 8 + Math.random() * 50; // De 8m à 58m à droite
    const z = (Math.random() - 0.5) * 200; // Le long de la route
    
    // Random Scale
    const s = 0.8 + Math.random() * 0.5;
    tree.scale.set(s, s, s);
    tree.position.set(x, 0, z);
    
    treeGroup.add(tree);
}
scene.add(treeGroup);

// Sol Herbe (Sous les arbres)
const grassGeo = new THREE.PlaneGeometry(100, 500);
const grassMat = new THREE.MeshStandardMaterial({ color: 0x051a05, roughness: 1 });
const grass = new THREE.Mesh(grassGeo, grassMat);
grass.rotation.x = -Math.PI / 2;
grass.position.set(55, -0.1, 0);
scene.add(grass);


/* --- VOITURE --- */
const loader = new GLTFLoader();
let carModel = null;

// Matériau Carrosserie
const bodyMaterial = new THREE.MeshPhysicalMaterial({ 
    color: 0x111111, metalness: 0.9, roughness: 0.2, 
    clearcoat: 1.0, envMapIntensity: 2.0 
});

loader.load('cla45.glb', (gltf) => {
    carModel = gltf.scene;

    // Scale & Center
    const box = new THREE.Box3().setFromObject(carModel);
    const size = box.getSize(new THREE.Vector3());
    const scaleFactor = 4.8 / Math.max(size.x, size.y, size.z);
    carModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
    
    const newBox = new THREE.Box3().setFromObject(carModel);
    const center = newBox.getCenter(new THREE.Vector3());
    carModel.position.sub(center);
    carModel.position.y = 0;

    // Apply Material
    carModel.traverse((o) => {
        if (o.isMesh) {
            o.castShadow = true; o.receiveShadow = true;
            const n = o.name.toLowerCase();
            const mn = o.material && o.material.name ? o.material.name.toLowerCase() : "";
            
            // Logique de détection robuste
            if(n.includes('body') || n.includes('paint') || n.includes('chassis') ||
               mn.includes('paint') || mn.includes('body') || mn.includes('metal_primary')) {
                o.material = bodyMaterial;
            }
        }
    });

    scene.add(carModel);
    document.getElementById('loader').style.transform = 'translateY(-100%)';
    setTimeout(() => document.getElementById('ui-container').classList.remove('hidden'), 500);

}, undefined, (err) => console.error(err));


/* --- POST PROCESSING (Bloom) --- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.85; // Seuls les reflets du soleil brillent
bloomPass.strength = 0.4; 
bloomPass.radius = 0.5;
composer.addPass(bloomPass);


/* --- CONTROLS & ANIMATION --- */
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.minDistance = 4;
controls.maxDistance = 15;
controls.enablePan = false;
controls.target.set(0, 0.8, 0);

// Animation Loop
let autoRotate = true;
let targetPos = null;

function animate() {
    requestAnimationFrame(animate);
    
    // Caméra Smooth Move
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


/* --- INTERACTIONS --- */

// 1. TIME SLIDER (Météo)
const timeSlider = document.getElementById('time-slider');
timeSlider.addEventListener('input', (e) => {
    const val = e.target.value; // 0 à 100
    
    // Exposition (Luminosité globale)
    // Min 0.1 (Nuit) à Max 1.5 (Midi)
    const exposure = 0.1 + (val / 100) * 1.4;
    renderer.toneMappingExposure = exposure;

    // Couleur du Soleil (Orange le soir/matin, Blanc midi)
    if(val < 20 || val > 80) {
        sunLight.color.setHex(0xffaa33); // Orange
        sunLight.intensity = 1;
    } else {
        sunLight.color.setHex(0xffffff); // Blanc
        sunLight.intensity = 3;
    }
    
    // Position du soleil (Rotation simple)
    const angle = (val / 100) * Math.PI; // 0 à PI
    sunLight.position.x = Math.cos(angle) * 50;
    sunLight.position.y = Math.sin(angle) * 50;
});

// 2. COLORS
document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelector('.current-paint').innerText = btn.dataset.name;
        bodyMaterial.color.setHex(parseInt(btn.dataset.color));
        
        // Gestion Mat vs Brillant
        if(btn.dataset.name.includes("MAT")) {
            bodyMaterial.roughness = 0.6;
            bodyMaterial.clearcoat = 0.0;
        } else {
            bodyMaterial.roughness = 0.2;
            bodyMaterial.clearcoat = 1.0;
        }
    });
});

// 3. CAMERAS
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

// 4. SOUND
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
