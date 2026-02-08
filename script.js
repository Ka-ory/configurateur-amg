import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RGBShiftShader } from 'three/addons/shaders/RGBShiftShader.js';

/* --- 1. CONFIGURATION DE LA SCÈNE --- */
const canvas = document.querySelector('#webgl');
const scene = new THREE.Scene();
// On met un fond gris très très foncé (pas noir total) pour voir les ombres
scene.background = new THREE.Color(0x111111);
// Brouillard moins dense pour mieux voir au loin
scene.fog = new THREE.FogExp2(0x111111, 0.01);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
// Position de départ un peu plus reculée et haute
camera.position.set(-6, 2.5, 7);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
// On augmente l'exposition pour "allumer" la scène
renderer.toneMappingExposure = 1.8;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

/* --- 2. CONTRÔLES --- */
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.05; // Empêche de passer sous le sol
controls.minDistance = 4;
controls.maxDistance = 12;
controls.enablePan = false;
controls.target.set(0, 0.5, 0); // Regarde un peu au-dessus du sol (le centre de la voiture)

/* --- 3. ÉCLAIRAGE STUDIO (Pour régler le problème "Tout noir") --- */
const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); // Lumière ambiante forte
scene.add(ambientLight);

// Spot Principal (Haut)
const topLight = new THREE.SpotLight(0xffffff, 20);
topLight.position.set(0, 15, 0);
topLight.angle = 0.6;
topLight.penumbra = 0.5;
topLight.castShadow = true;
topLight.shadow.bias = -0.0001;
scene.add(topLight);

// Lumière de remplissage (Avant-Gauche) - Pour voir la calandre
const frontFill = new THREE.DirectionalLight(0xffffff, 5);
frontFill.position.set(-5, 2, 5);
scene.add(frontFill);

// Lumière de contour (Arrière-Droite) - Pour détacher la voiture du fond
const backRim = new THREE.DirectionalLight(0xffffff, 5);
backRim.position.set(5, 2, -5);
scene.add(backRim);

// Néons Sol (Décoration)
const gridHelper = new THREE.GridHelper(50, 50, 0x444444, 0x222222);
scene.add(gridHelper);

const planeGeo = new THREE.PlaneGeometry(200, 200);
const planeMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1, metalness: 0.8 });
const floor = new THREE.Mesh(planeGeo, planeMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.01;
floor.receiveShadow = true;
scene.add(floor);

/* --- 4. PARTICULES (VITESSE) --- */
const particlesGeo = new THREE.BufferGeometry();
const particlesCount = 2000;
const posArray = new Float32Array(particlesCount * 3);
for(let i=0; i<particlesCount * 3; i++) {
    posArray[i] = (Math.random() - 0.5) * 40;
}
particlesGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
const particlesMat = new THREE.PointsMaterial({
    size: 0.03, color: 0x00f3ff, transparent: true, opacity: 0.6
});
const particlesMesh = new THREE.Points(particlesGeo, particlesMat);
scene.add(particlesMesh);

/* --- 5. CHARGEMENT VOITURE --- */
const loader = new GLTFLoader();
let carModel = null;
const originalMaterials = new Map();

// Matériau Carrosserie (Gris foncé par défaut pour bien voir la lumière)
const bodyMaterial = new THREE.MeshPhysicalMaterial({ 
    color: 0x444444, // Pas noir pur, sinon on voit rien
    metalness: 0.9, 
    roughness: 0.2, 
    clearcoat: 1.0, 
    clearcoatRoughness: 0.1,
    envMapIntensity: 2.5 
});

const xrayMaterial = new THREE.MeshBasicMaterial({ color: 0x00f3ff, wireframe: true, transparent: true, opacity: 0.3 });

loader.load('cla45.glb', (gltf) => {
    carModel = gltf.scene;
    console.log("Voiture chargée !");

    // Calcul automatique de la taille
    const box = new THREE.Box3().setFromObject(carModel);
    const size = box.getSize(new THREE.Vector3());
    const desiredLength = 4.8; 
    const maxDim = Math.max(size.x, size.y, size.z);
    const scaleFactor = desiredLength / maxDim;
    
    carModel.scale.set(scaleFactor, scaleFactor, scaleFactor);

    // Centrage
    const newBox = new THREE.Box3().setFromObject(carModel);
    const center = newBox.getCenter(new THREE.Vector3());
    carModel.position.x += (carModel.position.x - center.x);
    carModel.position.z += (carModel.position.z - center.z);
    carModel.position.y = 0;

    // --- APPLICATION MATÉRIAUX (Correction Problème Couleur) ---
    carModel.traverse((o) => {
        if (o.isMesh) {
            o.castShadow = true; 
            o.receiveShadow = true;
            originalMaterials.set(o.uuid, o.material);

            const n = o.name.toLowerCase();
            const mn = o.material && o.material.name ? o.material.name.toLowerCase() : "";

            // On cherche n'importe quoi qui ressemble à de la peinture
            // On ajoute plus de mots clés pour être sûr de trouver
            if(n.includes('body') || n.includes('paint') || n.includes('chassis') || n.includes('metal_primary') ||
               mn.includes('paint') || mn.includes('body') || mn.includes('metal')) {
                console.log("Carrosserie détectée sur : " + o.name); // Debug console
                o.material = bodyMaterial;
                originalMaterials.set(o.uuid, bodyMaterial);
            }
        }
    });

    scene.add(carModel);
    
    // Cache le loader
    document.getElementById('loader').style.transform = 'translateY(-100%)';
    setTimeout(() => document.getElementById('ui-container').classList.remove('hidden'), 500);

}, undefined, (err) => {
    console.error("Erreur chargement voiture:", err);
});

/* --- 6. POST PROCESSING --- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.2; bloomPass.strength = 0.4; bloomPass.radius = 0.5;
composer.addPass(bloomPass);

const rgbShiftPass = new ShaderPass(RGBShiftShader);
rgbShiftPass.uniforms['amount'].value = 0.0;
composer.addPass(rgbShiftPass);

/* --- 7. LOGIQUE & ANIMATION --- */
let isWarping = false;
let isXRay = false;
let autoRotate = true;
let targetPos = null;

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();

    // Animation particules
    const positions = particlesMesh.geometry.attributes.position.array;
    const speed = isWarping ? 2.0 : 0.05;

    for(let i=1; i<particlesCount * 3; i+=3) { 
        positions[i+1] += speed; 
        if(positions[i+1] > 10) positions[i+1] = -20; 
    }
    particlesMesh.geometry.attributes.position.needsUpdate = true;

    // Warp Shake
    if(isWarping) {
        camera.position.x += (Math.random() - 0.5) * 0.02;
        camera.position.y += (Math.random() - 0.5) * 0.02;
        rgbShiftPass.uniforms['amount'].value = 0.005 + Math.random() * 0.002;
    } else {
        rgbShiftPass.uniforms['amount'].value = THREE.MathUtils.lerp(rgbShiftPass.uniforms['amount'].value, 0, 0.1);
    }

    // Camera Move
    if (targetPos) {
        // On force le controls target pour que la caméra regarde toujours la voiture
        controls.target.lerp(new THREE.Vector3(0, 0.5, 0), 0.1);
        camera.position.lerp(targetPos, 0.05);
        
        // Si on est arrivé
        if(camera.position.distanceTo(targetPos) < 0.2) {
            targetPos = null;
        }
    } else if (autoRotate && !isWarping) {
        controls.update();
    }
    
    // Toujours mettre à jour les controls
    controls.update();
    composer.render();
}
animate();

/* --- 8. INTERACTIONS UTILISATEUR --- */

// WARP
document.getElementById('warp-btn').addEventListener('click', function() {
    isWarping = !isWarping;
    this.classList.toggle('active');
    
    if(isWarping) {
        document.body.classList.add('warping');
        document.getElementById('sys-status').innerText = "WARP ENGAGED";
        document.getElementById('sys-status').style.color = "#ff0055";
        autoRotate = false;
        targetPos = null;
    } else {
        document.body.classList.remove('warping');
        document.getElementById('sys-status').innerText = "ONLINE";
        document.getElementById('sys-status').style.color = "#0f0";
        autoRotate = true;
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
                o.material = xrayMaterial;
                o.castShadow = false;
            } else {
                // Restaure le matériau d'origine ou bodyMaterial
                const original = originalMaterials.get(o.uuid);
                o.material = original ? original : o.material; 
                o.castShadow = true;
            }
        }
    });
});

// COULEURS (Corrigé)
document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if(isXRay) return;
        document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelector('.current-paint').innerText = btn.dataset.name;
        
        // Applique la couleur
        const colorHex = parseInt(btn.dataset.color);
        bodyMaterial.color.setHex(colorHex);
    });
});

// CAMERAS (Coordonnées ajustées pour bien voir)
document.querySelectorAll('.cam-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const view = btn.dataset.view;
        autoRotate = false;
        isWarping = false;
        document.body.classList.remove('warping');

        // Coordonnées ajustées pour être plus éloignées et centrées
        if(view === 'front') targetPos = new THREE.Vector3(0, 1.2, 7.5); // Devant
        if(view === 'side') targetPos = new THREE.Vector3(7.5, 1.2, 0);  // Coté
        if(view === 'back') targetPos = new THREE.Vector3(0, 1.8, -7.5); // Derrière
        if(view === 'auto') { 
            autoRotate = true; 
            targetPos = null; 
        }
    });
});

// START ENGINE (Son sécurisé)
document.getElementById('start-engine').addEventListener('click', () => {
    console.log("Tentative de démarrage...");
    // On crée l'audio ici pour éviter les blocages navigateur
    const audio = new Audio('startup.mp3');
    audio.volume = 0.5;
    
    audio.play().then(() => {
        console.log("Vroum !");
    }).catch(error => {
        console.error("Erreur son : Fichier manquant ou bloqué.", error);
        alert("Erreur: Vérifiez que le fichier startup.mp3 est bien dans le dossier !");
    });
});

// RESIZE
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});
