import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Owns the renderer, scene, lights and the fixed-angle follow camera.
 * The camera never rotates: the tilt is constant so every arena only needs to look right
 * from one direction.
 */
export class Stage {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.pixelCap = 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.pixelCap));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#9fd3f5');

    const cam = CONFIG.camera;
    this.camera = new THREE.PerspectiveCamera(cam.fov, 1, 0.1, 200);
    this.focus = new THREE.Vector3(0, 0, 4);
    this.shakeT = 0;
    this.shakeStrength = 0;
    this.bounds = { halfW: 0, halfD: 0 };

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#7d9a5c', 1.7));
    const sun = new THREE.DirectionalLight('#fff4dd', 2.2);
    this.sun = sun;
    sun.position.set(-8, 18, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 16, bottom: -16, near: 1, far: 50 });
    this.scene.add(sun, sun.target);

    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
    this.onResize();
  }

  onResize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.resized = true; // the canvas was cleared; see takeResized()
  }

  /** Cap the device pixel ratio (the title flyover is the heaviest scene, so it runs at 1.5 and the fights at 2). */
  setPixelRatioCap(cap) {
    this.pixelCap = cap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    this.onResize();
  }

  /** True once after each resize (setSize clears the canvas), so a paused screen knows it must draw one frame again. */
  takeResized() {
    const r = this.resized;
    this.resized = false;
    return r;
  }

  /** Tell the camera how big the arena is so it can avoid showing too much void. */
  setArena({ width, depth }) {
    this.bounds = {
      halfW: Math.max(0, width / 2 - 9),
      halfD: Math.max(0, depth / 2 - 5),
    };
  }

  shake(strength = 0.25, seconds = 0.2) {
    this.shakeStrength = strength;
    this.shakeT = seconds;
  }

  /** Smoothly follow a point on the ground. Call every frame. */
  follow(x, z, dt, snap = false) {
    const cam = CONFIG.camera;
    const tx = Math.max(-this.bounds.halfW, Math.min(this.bounds.halfW, x));
    const tz = Math.max(-this.bounds.halfD, Math.min(this.bounds.halfD, z));
    const k = snap ? 1 : 1 - Math.exp(-cam.follow * dt);
    this.focus.x += (tx - this.focus.x) * k;
    this.focus.z += (tz - this.focus.z) * k;

    let ox = 0;
    let oy = 0;
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      const s = this.shakeStrength * (this.shakeT / 0.2);
      ox = (Math.random() - 0.5) * s;
      oy = (Math.random() - 0.5) * s;
    }
    // Keep the shadow window over the action (arenas are bigger than the shadow map). Snapped to whole blocks so shadows don't crawl.
    const sx = Math.round(this.focus.x);
    const sz = Math.round(this.focus.z);
    this.sun.position.set(sx - 8, 18, sz + 10);
    this.sun.target.position.set(sx, 0, sz);
    this.sun.target.updateMatrixWorld();

    this.camera.position.set(this.focus.x + ox, cam.height + oy, this.focus.z + cam.back);
    this.camera.lookAt(this.focus.x, 0, this.focus.z);
  }

  /** The ground point (x, z) under a screen position, or null if the ray misses (looking above the horizon). */
  groundPoint(clientX, clientY, y = 0) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), new THREE.Vector3());
    return hit ? { x: hit.x, z: hit.z } : null;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /** Render some other scene (the title flyover) with its own camera through the same renderer. */
  renderOther(scene, camera) {
    const size = this.renderer.getSize(this._size ??= new THREE.Vector2());
    const aspect = size.x / Math.max(1, size.y);
    if (camera.aspect !== aspect) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
    this.renderer.render(scene, camera);
  }

  dispose() {
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
