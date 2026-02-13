import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

const CONFIG = {
    x: 341.40,
    y: -15.32,
    z: -279.50,
    rotX: 0.033,
    rotY: -0.79756,
    rotZ: 0.119
};

const canvas = document.querySelector('#webgl');
const scene = new THREE.Scene();

const fogColor = new THREE.Color(0xa0b0c0); 
scene.background = fogColor;
scene.fog = new THREE.FogExp2(fogColor, 0.002);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.position.set(325, -9, -280);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.6; 
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 4;
controls.maxDistance = 15;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
sunLight.position.set(150, 100, -150);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 4096;
sunLight.shadow.mapSize.height = 4096;
sunLight.shadow.bias = -0.0001;
sunLight.shadow.normalBias = 0.05;
sunLight.shadow.camera.left = -100;
sunLight.shadow.camera.right = 100;
sunLight.shadow.camera.top = 100;
sunLight.shadow.camera.bottom = -100;
scene.add(sunLight);

new RGBELoader().load('sources/decor.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
    scene.environmentIntensity = 0.5;
});

const textureLoader = new THREE.TextureLoader();
const roadColor = textureLoader.load('sources/road_color.jpg');
const roadNormal = textureLoader.load('sources/road_normal.jpg');
const roadRough = textureLoader.load('sources/road_rough.jpg');

[roadColor, roadNormal, roadRough].forEach(t => {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(12, 12);
    t.colorSpace = THREE.SRGBColorSpace;
});
roadNormal.colorSpace = THREE.LinearSRGBColorSpace;

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

gltfLoader.load('sources/map.glb', (gltf) => {
    const map = gltf.scene;
    map.position.set(0, 0, 0);

    map.traverse((o) => {
        if (o.isMesh) {
            o.receiveShadow = true;
            o.castShadow = true;

            if (o.material) {
                const name = o.material.name.toLowerCase();

                if (name.includes('road') || name.includes('route') || name.includes('asphalt')) {
                    o.material.map = roadColor;
                    o.material.normalMap = roadNormal;
                    o.material.roughnessMap = roadRough;
                    o.material.roughness = 0.9; 
                    o.material.metalness = 0;
                    o.material.color.setHex(0x888888);
                } 
                else if (name.includes('snow') || name.includes('terrain') || name.includes('ground')) {
                    o.material.color.setHex(0xcccccc); 
                    o.material.roughness = 1.0;
                    o.material.metalness = 0.0;
                }

                if (name.includes('leaf') || name.includes('sapin') || o.material.transparent) {
                    o.material.transparent = true;
                    o.material.alphaTest = 0.5;
                    o.material.side = THREE.DoubleSide;
                }
                o.material.needsUpdate = true;
            }
        }
    });
    scene.add(map);
});

const bodyMaterial = new THREE.MeshPhysicalMaterial({ 
    color: 0x111111, 
    metalness: 0.6, 
    roughness: 0.25, 
    clearcoat: 1.0, 
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.0
});

let carGroup;

const gui = new GUI({ title: 'RÉGLAGES VOITURE' });
const posFolder = gui.addFolder('Position');
const rotFolder = gui.addFolder('Rotation / Inclinaison');

function updateCarTransform() {
    if(carGroup) {
        carGroup.position.set(CONFIG.x, CONFIG.y, CONFIG.z);
        carGroup.rotation.set(CONFIG.rotX, CONFIG.rotY, CONFIG.rotZ);
        controls.target.set(CONFIG.x, CONFIG.y + 1, CONFIG.z);
    }
}

posFolder.add(CONFIG, 'x', 300, 350).onChange(updateCarTransform);
posFolder.add(CONFIG, 'y', -30, 0).onChange(updateCarTransform);
posFolder.add(CONFIG, 'z', -300, -250).onChange(updateCarTransform);

rotFolder.add(CONFIG, 'rotX', -0.5, 0.5).name('Piqué (Av/Ar)').onChange(updateCarTransform);
rotFolder.add(CONFIG, 'rotY', -3.14, 3.14).name('Cap (Direction)').onChange(updateCarTransform);
rotFolder.add(CONFIG, 'rotZ', -0.5, 0.5).name('Roulis (Penché)').onChange(updateCarTransform);

// posFolder.open();
// rotFolder.open();

function loadCar(modelKey) {
    if(carGroup) {
        scene.remove(carGroup);
        carGroup = null;
    }

    let path = '';
    if(modelKey === 'cla') path = 'sources/cars/cla/cla45.glb';
    if(modelKey === 'cls') path = 'sources/cars/cls/mersedes_cls63.glb';

    document.getElementById('loader').style.display = 'flex';

    gltfLoader.load(path, (gltf) => {
        const car = gltf.scene;
        
        const box = new THREE.Box3().setFromObject(car);
        const size = box.getSize(new THREE.Vector3());
        
        let scaleFactor = 4.8 / Math.max(size.x, size.y, size.z);
        if(modelKey === 'cls') scaleFactor *= 1.1; 

        car.scale.set(scaleFactor, scaleFactor, scaleFactor);
        
        const center = new THREE.Box3().setFromObject(car).getCenter(new THREE.Vector3());
        car.position.sub(center); 
        
        carGroup = new THREE.Group();
        carGroup.add(car);
        
        updateCarTransform();
        
        car.traverse((o) => {
            if(o.isMesh) {
                o.castShadow = true; 
                o.receiveShadow = true;
                const n = o.name.toLowerCase();
                const mn = o.material && o.material.name ? o.material.name.toLowerCase() : "";
                
                if(n.includes('body') || n.includes('paint') || mn.includes('paint') || mn.includes('body') || n.includes('carrosserie')) {
                    o.material = bodyMaterial;
                }
                if(n.includes('glass') || mn.includes('window') || n.includes('vitre')) {
                    o.material.transparent = true;
                    o.material.opacity = 0.7;
                    o.material.roughness = 0.0;
                    o.material.metalness = 0.9;
                    o.material.color.setHex(0x000000);
                }
                if(n.includes('tire') || n.includes('rubber') || n.includes('pneu')) {
                    o.material.roughness = 0.9;
                    o.material.metalness = 0.0;
                    o.material.color.setHex(0x202020);
                }
            }
        });

        scene.add(carGroup);
        
        document.getElementById('loader').style.display = 'none';
        document.getElementById('ui-container').classList.remove('hidden');
    });
}

loadCar('cla');

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.98;
bloomPass.strength = 0.12;
bloomPass.radius = 0.1;
composer.addPass(bloomPass);

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

window.addEventListener('keydown', (e) => {
    if(!carGroup) return;
    const moveStep = 0.2;
    const rotStep = 0.02;

    let changed = false;
    switch(e.key.toLowerCase()) {
        case 'arrowup': CONFIG.z -= moveStep; changed = true; break;
        case 'arrowdown': CONFIG.z += moveStep; changed = true; break;
        case 'arrowleft': CONFIG.x -= moveStep; changed = true; break;
        case 'arrowright': CONFIG.x += moveStep; changed = true; break;
        case 'pageup': CONFIG.y += moveStep; changed = true; break;
        case 'pagedown': CONFIG.y -= moveStep; changed = true; break;
        
        case 'q': CONFIG.rotY += rotStep; changed = true; break;
        case 'd': CONFIG.rotY -= rotStep; changed = true; break;
        case 'z': CONFIG.rotX += rotStep; changed = true; break;
        case 's': CONFIG.rotX -= rotStep; changed = true; break;
        case 'a': CONFIG.rotZ += rotStep; changed = true; break;
        case 'e': CONFIG.rotZ -= rotStep; changed = true; break;
    }
    
    if(changed) {
        updateCarTransform();
        gui.controllersRecursive().forEach(c => c.updateDisplay());
    }
});

document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const nameDisplay = document.querySelector('.current-paint');
        if(nameDisplay) nameDisplay.innerText = btn.dataset.name;
        
        bodyMaterial.color.setHex(parseInt(btn.dataset.color));
        if(btn.dataset.name.includes("MAT")) {
            bodyMaterial.roughness = 0.5; 
            bodyMaterial.clearcoat = 0.0;
            bodyMaterial.metalness = 0.3;
        } else {
            bodyMaterial.roughness = 0.25; 
            bodyMaterial.clearcoat = 1.0;
            bodyMaterial.metalness = 0.6;
        }
    });
});

document.querySelectorAll('.cam-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        controls.autoRotate = false;
        if(view === 'front') camera.position.set(CONFIG.x - 5, CONFIG.y + 1.5, CONFIG.z + 5);
        if(view === 'side') camera.position.set(CONFIG.x + 6, CONFIG.y + 1.5, CONFIG.z);
        if(view === 'back') camera.position.set(CONFIG.x - 5, CONFIG.y + 2, CONFIG.z - 5);
        if(view === 'auto') { controls.autoRotate = true; }
    });
});

document.querySelectorAll('.model-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.model-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadCar(btn.dataset.model);
    });
});

const startBtn = document.getElementById('start-engine');
if(startBtn) {
    startBtn.addEventListener('click', () => {
        new Audio('startup.mp3').play().catch(e => console.log(e));
    });
}
