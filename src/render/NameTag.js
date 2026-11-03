import * as THREE from 'three';

const OPACITY = 0.6; // semi-transparent on purpose: a label, not a billboard

/** A floating name above a character: always faces the camera, drawn on top of the world, see-through. */
export class NameTag {
  constructor(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const g = canvas.getContext('2d');
    g.font = 'bold 40px "Trebuchet MS", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.strokeText(text, 128, 34);
    g.fillStyle = '#ffffff';
    g.fillText(text, 128, 34);
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.SpriteMaterial({ map: this.texture, transparent: true, opacity: OPACITY, depthTest: false, depthWrite: false });
    this.sprite = new THREE.Sprite(this.material);
    this.sprite.scale.set(1.6, 0.4, 1);
    this.sprite.renderOrder = 10;
  }

  follow(x, y, z) {
    this.sprite.position.set(x, y, z);
  }

  dispose() {
    this.sprite.removeFromParent();
    this.texture.dispose();
    this.material.dispose();
  }
}
