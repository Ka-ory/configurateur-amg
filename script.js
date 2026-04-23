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

const fogColor = new THREE.Color(0x8da1b5); 
scene.background = fogColor;
scene.fog = new THREE.FogExp2(fogColor, 0.0015);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.position.set(325, -9, -280);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8; 
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;
controls.minDistance = 4;
controls.maxDistance = 15;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.8;

const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
hemiLight.position.set(0, 200, 0);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
sunLight.position.set(150, 100, -150);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 4096;
sunLight.shadow.mapSize.height = 4096;
sunLight.shadow.bias = -0.0002;
sunLight.shadow.normalBias = 0.05;
sunLight.shadow.camera.left = -100;
sunLight.shadow.camera.right = 100;
sunLight.shadow.camera.top = 100;
sunLight.shadow.camera.bottom = -100;
scene.add(sunLight);

new RGBELoader().load('sources/decor.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
    scene.environmentIntensity = 1.2;
});

const manager = new THREE.LoadingManager();
const loaderElement = document.getElementById('loader');
const loadingBar = document.getElementById('loading-bar');
const loadingNumbers = document.getElementById('loading-numbers');

manager.onProgress = function (url, itemsLoaded, itemsTotal) {
    const percentage = Math.round((itemsLoaded / itemsTotal) * 100);
    if(loadingNumbers) loadingNumbers.innerText = percentage;
    if(loadingBar) loadingBar.style.width = percentage + '%';
};

const textureLoader = new THREE.TextureLoader(manager);
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

const dracoLoader = new DRACOLoader(manager);
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
const gltfLoader = new GLTFLoader(manager);
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
                    o.material.roughness = 0.8; 
                    o.material.metalness = 0;
                    o.material.color.setHex(0xaaaaaa);
                } 
                else if (name.includes('snow') || name.includes('terrain') || name.includes('ground')) {
                    o.material.color.setHex(0xdddddd); 
                    o.material.roughness = 1.0;
                    o.material.metalness = 0.0;
                }

                if (name.includes('leaf') || name.includes('sapin') || o.material.transparent) {
                    o.material.transparent = false;
                    o.material.alphaTest = 0.5;
                    o.material.depthWrite = true;
                    o.material.side = THREE.DoubleSide;
                }
                o.material.needsUpdate = true;
            }
        }
    });
    scene.add(map);
});

const bodyMaterial = new THREE.MeshPhysicalMaterial({ 
    color: 0x111111, metalness: 0.7, roughness: 0.15, clearcoat: 1.0, clearcoatRoughness: 0.02, envMapIntensity: 1.5
});

const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x000000, metalness: 0.9, roughness: 0.0, transmission: 0.0, transparent: true, opacity: 0.3, envMapIntensity: 2.0
});

const rimMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xdddddd, metalness: 1.0, roughness: 0.2, clearcoat: 1.0
});

const plasticMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x111111, metalness: 0.1, roughness: 0.8, clearcoat: 0.0
});

const chromeMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 1.0, roughness: 0.0, clearcoat: 1.0
});

const tireMaterial = new THREE.MeshStandardMaterial({
    color: 0x151515, roughness: 0.9, metalness: 0.0
});

const lightMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2
});

const defaultMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x222222, metalness: 0.5, roughness: 0.8
});

let carGroup;

function updateCarTransform() {
    if(carGroup) {
        carGroup.position.set(CONFIG.x, CONFIG.y, CONFIG.z);
        carGroup.rotation.set(CONFIG.rotX, CONFIG.rotY, CONFIG.rotZ);
        controls.target.set(CONFIG.x, CONFIG.y + 1, CONFIG.z);
    }
}

function clearCar() {
    if(carGroup) {
        carGroup.traverse((child) => {
            if (child.isMesh) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            }
        });
        scene.remove(carGroup);
        carGroup = null;
    }
}

function loadCar(modelKey) {
    clearCar();

    let path = '';
    if(modelKey === 'cla') path = 'sources/cars/cla/cla45.glb';
    if(modelKey === 'cls') path = 'sources/cars/cls/mersedes_cls63.glb';

    loaderElement.style.display = 'flex';
    loaderElement.style.opacity = '1';

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
                
                let assigned = false;

                if(n.includes('body') || n.includes('paint') || mn.includes('paint') || mn.includes('body') || n.includes('carrosserie') || n.includes('shell')) {
                    o.material = bodyMaterial;
                    assigned = true;
                }
                else if(n.includes('glass') || mn.includes('window') || n.includes('vitre') || mn.includes('glass')) {
                    o.material = glassMaterial;
                    assigned = true;
                }
                else if(n.includes('rim') || n.includes('jante') || mn.includes('rim') || mn.includes('wheel')) {
                    o.material = rimMaterial;
                    assigned = true;
                }
                else if(n.includes('tire') || n.includes('rubber') || n.includes('pneu') || mn.includes('rubber')) {
                    o.material = tireMaterial;
                    assigned = true;
                }
                else if(n.includes('chrome') || n.includes('silver') || n.includes('logo') || n.includes('star') || mn.includes('chrome') || n.includes('exhaust')) {
                    o.material = chromeMaterial;
                    assigned = true;
                }
                else if(n.includes('plastic') || n.includes('grill') || n.includes('noir') || n.includes('black') || n.includes('bumper') || n.includes('vent') || mn.includes('plastic') || n.includes('interior')) {
                    o.material = plasticMaterial;
                    assigned = true;
                }
                else if(n.includes('light') || n.includes('phare') || n.includes('brake') || n.includes('feu') || mn.includes('light')) {
                    o.material = lightMaterial;
                    assigned = true;
                }

                if(!assigned) {
                    o.material = defaultMaterial;
                }
            }
        });

        scene.add(carGroup);
        
        setTimeout(() => {
            loaderElement.style.opacity = '0';
            setTimeout(() => { loaderElement.style.display = 'none'; }, 800);
        }, 500);
        
        document.getElementById('ui-container').classList.remove('hidden');
    });
}

loadCar('cla');

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.95;
bloomPass.strength = 0.15;
bloomPass.radius = 0.15;
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

document.querySelectorAll('.swatch').forEach(btn => {
    btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        const parent = btn.closest('.swatch-grid');
        parent.querySelectorAll('.swatch').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        if (type === 'paint') {
            document.getElementById('val-paint').innerText = btn.dataset.name;
            bodyMaterial.color.setHex(parseInt(btn.dataset.color));
            if(btn.dataset.mat === "true") {
                bodyMaterial.roughness = 0.6; 
                bodyMaterial.clearcoat = 0.0;
                bodyMaterial.metalness = 0.3;
            } else {
                bodyMaterial.roughness = 0.15; 
                bodyMaterial.clearcoat = 1.0;
                bodyMaterial.metalness = 0.7;
            }
        } 
        else if (type === 'rim') {
            document.getElementById('val-rim').innerText = btn.dataset.name;
            rimMaterial.color.setHex(parseInt(btn.dataset.color));
            if(btn.dataset.name.includes("MATTE")) {
                rimMaterial.roughness = 0.7;
                rimMaterial.clearcoat = 0.0;
            } else {
                rimMaterial.roughness = 0.2;
                rimMaterial.clearcoat = 1.0;
            }
        }
        else if (type === 'glass') {
            document.getElementById('val-glass').innerText = btn.dataset.name;
            glassMaterial.opacity = parseFloat(btn.dataset.op);
        }
    });
});

document.querySelectorAll('.cam-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
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

const timeSlider = document.getElementById('time-slider');
if(timeSlider) {
    timeSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        const rad = (value / 100) * Math.PI;
        sunLight.position.x = 150 * Math.cos(rad);
        sunLight.position.y = 100 * Math.sin(rad);
        sunLight.intensity = Math.max(0.1, Math.sin(rad) * 1.8);
        scene.environmentIntensity = Math.max(0.2, Math.sin(rad) * 1.2);
    });
}

const startBtn = document.getElementById('start-engine');
if(startBtn) {
    startBtn.addEventListener('click', () => {
        new Audio('startup.mp3').play().catch(e => console.log(e));
        
        const initialInt = lightMaterial.emissiveIntensity;
        lightMaterial.emissiveIntensity = 10;
        setTimeout(() => { lightMaterial.emissiveIntensity = initialInt; }, 100);
        setTimeout(() => { lightMaterial.emissiveIntensity = 10; }, 200);
        setTimeout(() => { lightMaterial.emissiveIntensity = 2; }, 300);
    });
}
