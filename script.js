import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// IMPORT CRUCIAL POUR LE DÉCOR HDR
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RGBShiftShader } from 'three/addons/shaders/RGBShiftShader.js';

/* --- 1. CONFIGURATION DE LA SCÈNE --- */
const canvas = document.querySelector('#webgl');
const scene = new THREE.Scene();
// Le fond sera géré par le HDR plus bas

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(-8, 2, 10); // Angle large pour le paysage

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// Tone Mapping indispensable pour le réalisme HDR
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0; // Exposition du soleil
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Important pour que les textures de couleur soient correctes
renderer.outputColorSpace = THREE.SRGBColorSpace; 

/* --- 2. ENVIRONNEMENT ULTIME (Lac & Soleil HDR) --- */
const rgbeLoader = new RGBELoader();
rgbeLoader.load('decor.hdr', function(texture) {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    // Définit l'image comme fond ET comme source de lumière/reflets
    scene.background = texture;
    scene.environment = texture;
    
    // On ajuste l'intensité du décor si c'est trop lumineux
    scene.backgroundIntensity = 1; 
    scene.environmentIntensity = 1.2; // Reflets un peu plus punchy
});

// Soleil directionnel pour des ombres nettes (doit être aligné avec le soleil de l'image HDR)
const sunLight = new THREE.DirectionalLight(0xffffff, 3);
sunLight.position.set(-10, 20, 30); // Position approximative du soleil dans l'image
sunLight.castShadow = true;
// Qualité des ombres
sunLight.shadow.mapSize.width = 4096;
sunLight.shadow.mapSize.height = 4096;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 100;
// Taille de la zone d'ombre
sunLight.shadow.camera.left = -20;
sunLight.shadow.camera.right = 20;
sunLight.shadow.camera.top = 20;
sunLight.shadow.camera.bottom = -20;
sunLight.shadow.bias = -0.0005;
sunLight.shadow.radius = 2; // Ombres douces sur les bords
scene.add(sunLight);


/* --- 3. LA ROUTE RÉALISTE (Textures) --- */
const texLoader = new THREE.TextureLoader();
// Chargement des textures
const roadColor = texLoader.load('road_color.jpg');
const roadNormal = texLoader.load('road_normal.jpg');
const roadRough = texLoader.load('road_rough.jpg');

// Configuration de la répétition de la texture pour une grande route
[roadColor, roadNormal, roadRough].forEach(tex => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(20, 20); // Répète 20 fois sur la surface
    // Important pour la couleur
    if(tex === roadColor) tex.colorSpace = THREE.SRGBColorSpace;
});

const roadGeo = new THREE.PlaneGeometry(400, 400);
const roadMat = new THREE.MeshStandardMaterial({
    map: roadColor,
    normalMap: roadNormal,
    normalScale: new THREE.Vector2(1, 1), // Intensité du relief
    roughnessMap: roadRough,
    roughness: 0.8, // Route un peu usée
    metalness: 0.1,
    envMapIntensity: 0.5 // Légers reflets du ciel sur l'asphalte
});

const road = new THREE.Mesh(roadGeo, roadMat);
road.rotation.x = -Math.PI / 2;
road.position.y = -0.05; // Juste sous les roues
road.receiveShadow = true;
scene.add(road);


/* --- 4. PARTICLES (Poussière dorée au soleil) --- */
const particlesGeo = new THREE.BufferGeometry();
const particlesCount = 1500;
const posArray = new Float32Array(particlesCount * 3);
for(let i=0; i<particlesCount * 3; i++) {
    posArray[i] = (Math.random() - 0.5) * 100; // Répandu sur une grande zone
}
particlesGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
const particlesMat = new THREE.PointsMaterial({
    size: 0.05, 
    color: 0xffddaa, // Couleur dorée/sable
    transparent: true, 
    opacity: 0.4,
    blending: THREE.AdditiveBlending
});
const particlesMesh = new THREE.Points(particlesGeo, particlesMat);
scene.add(particlesMesh);


/* --- 5. CONTRÔLES --- */
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.minDistance = 4;
controls.maxDistance = 20; // On peut reculer plus loin pour voir le paysage
controls.enablePan = false;
controls.target.set(0, 0.8, 0);

/* --- 6. CHARGEMENT VOITURE --- */
const loader = new GLTFLoader();
let carModel = null;
const originalMaterials = new Map();

// Matériau Carrosserie de base (sera affecté par le HDR)
const bodyMaterial = new THREE.MeshPhysicalMaterial({ 
    color: 0x111111, // Noir Cosmos
    metalness: 1.0, 
    roughness: 0.15, // Très brillant
    clearcoat: 1.0, 
    clearcoatRoughness: 0.05,
    envMapIntensity: 2.0 // Reflète fort le décor
});

const xrayMaterial = new THREE.MeshBasicMaterial({ color: 0x00f3ff, wireframe: true, transparent: true, opacity: 0.3 });

loader.load('cla45.glb', (gltf) => {
    carModel = gltf.scene;

    // Auto-Scale & Center
    const box = new THREE.Box3().setFromObject(carModel);
    const size = box.getSize(new THREE.Vector3());
    const desiredLength = 4.8; 
    const scaleFactor = desiredLength / Math.max(size.x, size.y, size.z);
    carModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
    
    const newBox = new THREE.Box3().setFromObject(carModel);
    const center = newBox.getCenter(new THREE.Vector3());
    carModel.position.sub(center);
    carModel.position.y = 0;

    // Apply Materials
    carModel.traverse((o) => {
        if (o.isMesh) {
            o.castShadow = true; o.receiveShadow = true;
            originalMaterials.set(o.uuid, o.material);

            const n = o.name.toLowerCase();
            const mn = o.material && o.material.name ? o.material.name.toLowerCase() : "";

            // Détection Carrosserie
            if(n.includes('body') || n.includes('paint') || n.includes('chassis') || n.includes('metal_primary') ||
               mn.includes('paint') || mn.includes('body')) {
                o.material = bodyMaterial;
                originalMaterials.set(o.uuid, bodyMaterial);
            }
        }
    });

    scene.add(carModel);
    document.getElementById('loader').style.transform = 'translateY(-100%)';
    setTimeout(() => document.getElementById('ui-container').classList.remove('hidden'), 500);

}, undefined, (err) => console.error(err));

/* --- 7. POST PROCESSING (Ajusté pour le jour) --- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

// Bloom plus subtil pour le jour (juste les reflets du soleil)
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.8; // Seuls les trucs TRES brillants (soleil sur carrosserie) brillent
bloomPass.strength = 0.3; 
bloomPass.radius = 0.5;
composer.addPass(bloomPass);

const rgbShiftPass = new ShaderPass(RGBShiftShader);
rgbShiftPass.uniforms['amount'].value = 0.0;
composer.addPass(rgbShiftPass);

/* --- 8. ANIMATION & LOGIQUE --- */
let isWarping = false;
let isXRay = false;
let autoRotate = true;
let targetPos = null;
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();

    // Animation Poussière
    const positions = particlesMesh.geometry.attributes.position.array;
    const speed = isWarping ? 5.0 : 0.02; // Vitesse warp augmentée

    // Fait défiler la route et les particules si Warp
    if(isWarping) {
         road.position.z += speed;
         if(road.position.z > 20) road.position.z = 0; // Boucle la route
    }

    for(let i=1; i<particlesCount * 3; i+=3) { 
        positions[i+1] += speed; 
        if(positions[i+1] > 50) positions[i+1] = -100; 
    }
    particlesMesh.geometry.attributes.position.needsUpdate = true;

    // Warp Shake
    if(isWarping) {
        camera.position.x += (Math.random() - 0.5) * 0.03;
        camera.position.y += (Math.random() - 0.5) * 0.03;
        rgbShiftPass.uniforms['amount'].value = 0.005 + Math.random() * 0.003;
    } else {
        rgbShiftPass.uniforms['amount'].value = THREE.MathUtils.lerp(rgbShiftPass.uniforms['amount'].value, 0, 0.1);
    }

    // Camera Move
    if (targetPos) {
        controls.target.lerp(new THREE.Vector3(0, 0.5, 0), 0.1);
        camera.position.lerp(targetPos, 0.05);
        if(camera.position.distanceTo(targetPos) < 0.2) targetPos = null;
    } else if (autoRotate && !isWarping) {
        controls.update();
    }
    
    controls.update();
    composer.render();
}
animate();

/* --- 9. INTERACTIONS UI --- */
// WARP DRIVE (Modifié pour faire défiler la route)
document.getElementById('warp-btn').addEventListener('click', function() {
    isWarping = !isWarping;
    this.classList.toggle('active');
    if(isWarping) {
        document.body.classList.add('warping');
        document.getElementById('sys-status').innerText = "WARP ENGAGED";
        document.getElementById('sys-status').style.color = "#ff0055";
        autoRotate = false; targetPos = null;
    } else {
        document.body.classList.remove('warping');
        document.getElementById('sys-status').innerText = "ONLINE";
        document.getElementById('sys-status').style.color = "#0f0";
        autoRotate = true;
        road.position.z = 0; // Reset route
    }
});

// X-RAY
document.getElementById('xray-btn').addEventListener('click', function() {
    if(!carModel) return;
    isXRay = !isXRay;
    this.classList.toggle('active');
    carModel.traverse((o) => {
        if(o.isMesh) {
            if(isXRay) {
                o.material = xrayMaterial; o.castShadow = false;
            } else {
                const original = originalMaterials.get(o.uuid);
                o.material = original ? original : o.material; 
                o.castShadow = true;
            }
        }
    });
});

// COLORS
document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if(isXRay) return;
        document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelector('.current-paint').innerText = btn.dataset.name;
        bodyMaterial.color.setHex(parseInt(btn.dataset.color));
    });
});

// CAMERAS
document.querySelectorAll('.cam-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const view = btn.dataset.view;
        autoRotate = false; isWarping = false;
        document.body.classList.remove('warping');
        if(view === 'front') targetPos = new THREE.Vector3(0, 1.2, 8.5);
        if(view === 'side') targetPos = new THREE.Vector3(9.5, 1.2, 0);
        if(view === 'back') targetPos = new THREE.Vector3(0, 1.8, -8.5);
        if(view === 'auto') { autoRotate = true; targetPos = null; }
    });
});

// START ENGINE
document.getElementById('start-engine').addEventListener('click', () => {
    const audio = new Audio('startup.mp3'); audio.volume = 0.6;
    audio.play().catch(e => alert("Fichier audio 'startup.mp3' manquant ou bloqué."));
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});
