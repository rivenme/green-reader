import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GW, GH } from './constants.js';
export function createScene(stage){
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.domElement.tabIndex=0;
renderer.domElement.setAttribute('aria-label','Putting green. Arrow keys aim and set distance. Space putts. Escape cancels.');
renderer.domElement.setAttribute('aria-describedby','keyboardHint');
renderer.setPixelRatio(Math.min(2,window.devicePixelRatio));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
stage.insertBefore(renderer.domElement, stage.firstChild);

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x0c120d);
scene.fog=new THREE.Fog(0x0c120d, 90, 260);

const camera=new THREE.PerspectiveCamera(50, 16/9, 0.1, 500);
const controls=new OrbitControls(camera, renderer.domElement);
controls.enableDamping=true;
controls.dampingFactor=0.08;
controls.maxPolarAngle=Math.PI/2 - 0.06;
controls.minDistance=4;
controls.maxDistance=130;

scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x1a2a1a, 0.75));
const sun=new THREE.DirectionalLight(0xfff2dd, 1.6);
sun.position.set(45, 70, -25);
sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-45; sun.shadow.camera.right=45;
sun.shadow.camera.top=45;  sun.shadow.camera.bottom=-45;
sun.shadow.camera.far=220;
const sunTarget=new THREE.Object3D();
sunTarget.position.set(GW/2,0,GH/2);
scene.add(sunTarget); sun.target=sunTarget;
scene.add(sun);

// rough surround
const rough=new THREE.Mesh(
  new THREE.PlaneGeometry(600,600).rotateX(-Math.PI/2),
  new THREE.MeshStandardMaterial({color:0x131f10, roughness:1})
);
scene.add(rough);

return {renderer,scene,camera,controls,sun,rough};
}
export function heightColor(t){
  // height ramp: blue (low) → green (level) → red (high)
  let r,g,b;
  if(t<0.5){ const k=t/0.5; r=42+(63-42)*k; g=77+(125-77)*k; b=143+(68-143)*k; }
  else     { const k=(t-0.5)/0.5; r=63+(185-63)*k; g=125+(70-125)*k; b=68+(70-68)*k; }
  return [r/255, g/255, b/255];
}

export function disposeObj(o){
  o.traverse(c=>{
    if(c.geometry) c.geometry.dispose();
    if(c.material){ (Array.isArray(c.material)?c.material:[c.material]).forEach(m=>m.dispose()); }
  });
}
