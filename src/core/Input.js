import { mergeMove } from '../logic/inputMap.js';

const KEY_MAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};
const ATTACK_KEYS = new Set(['Space', 'KeyJ', 'KeyK', 'KeyF']);
const CONFIRM_KEYS = new Set(['Enter', 'Space']);

/**
 * Keyboard and gamepad in one place. `read()` returns the per-frame input the sim consumes:
 * { moveX, moveZ, attack }. `consumeConfirm()` is an edge-triggered "press start" for menus.
 */
export class Input {
  constructor(target = window) {
    this.target = target;
    this.keys = { up: false, down: false, left: false, right: false };
    this.attackKeys = new Set();
    this.confirmQueued = false;
    this.padConfirmHeld = false;

    this.onKeyDown = (e) => {
      if (e.code in KEY_MAP) this.keys[KEY_MAP[e.code]] = true;
      if (ATTACK_KEYS.has(e.code)) this.attackKeys.add(e.code);
      if (CONFIRM_KEYS.has(e.code) && !e.repeat) this.confirmQueued = true;
      if (e.code in KEY_MAP || ATTACK_KEYS.has(e.code)) e.preventDefault(); // no page scrolling
    };
    this.onKeyUp = (e) => {
      if (e.code in KEY_MAP) this.keys[KEY_MAP[e.code]] = false;
      this.attackKeys.delete(e.code);
    };
    this.onBlur = () => {
      // Releasing keys while the window is unfocused would otherwise leave them stuck "down".
      this.keys = { up: false, down: false, left: false, right: false };
      this.attackKeys.clear();
      this.mouseAttack = false;
      this.rightHeld = false;
      this.moveClick = false;
    };

    // Mouse: left button = attack (hold to keep attacking, like Space); right button = walk to that spot.
    // Only clicks on the game canvas count, so the shop and the menus keep their own buttons.
    this.mouseAttack = false;
    this.rightHeld = false;
    this.pointer = { x: 0, y: 0 };
    this.moveClick = false; // a right click / drag happened since the last takeMoveClick()
    this.canvas = null;
    this.onMouseDown = (e) => {
      if (e.target !== this.canvas) return;
      this.pointer = { x: e.clientX, y: e.clientY };
      if (e.button === 0 && !e.ctrlKey) this.mouseAttack = true; // Ctrl+click is a right click on a Mac
      if (e.button === 2) {
        this.rightHeld = true;
        this.moveClick = true;
      }
    };
    this.onMouseMove = (e) => {
      if (!this.rightHeld) return;
      this.pointer = { x: e.clientX, y: e.clientY };
      this.moveClick = true; // dragging with the button down keeps re-aiming the walk
    };
    this.onMouseUp = (e) => {
      if (e.button === 0) this.mouseAttack = false;
      if (e.button === 2) this.rightHeld = false;
    };
    this.onContextMenu = (e) => {
      if (e.target === this.canvas) e.preventDefault();
    };
    target.addEventListener('mousedown', this.onMouseDown);
    target.addEventListener('mousemove', this.onMouseMove);
    target.addEventListener('mouseup', this.onMouseUp);
    target.addEventListener('contextmenu', this.onContextMenu);

    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  /** The element whose clicks count as game clicks (the canvas). */
  attachCanvas(el) {
    this.canvas = el;
  }

  /** The screen position of a new right click/drag since the last call, or null. */
  takeMoveClick() {
    if (!this.moveClick) return null;
    this.moveClick = false;
    return this.pointer;
  }

  pad() {
    if (this.padDisabled || typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    try {
      for (const p of navigator.getGamepads()) if (p && p.connected) return p;
    } catch {
      // Blocked by a permissions policy (e.g. the page is shown inside a sandboxed frame).
      // Fall back to keyboard only, and stop asking so we don't throw every frame.
      this.padDisabled = true;
    }
    return null;
  }

  read() {
    const pad = this.pad();
    const stick = { x: 0, y: 0 };
    let padAttack = false;
    let padConfirm = false;
    if (pad) {
      stick.x = pad.axes[0] || 0;
      stick.y = pad.axes[1] || 0;
      const b = (i) => !!pad.buttons[i]?.pressed;
      // D-pad also moves.
      const dx = (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
      const dy = (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
      if (dx || dy) {
        stick.x = dx;
        stick.y = dy;
      }
      padAttack = b(0) || b(2) || b(5) || b(7);
      padConfirm = b(0) || b(9);
    }
    if (padConfirm && !this.padConfirmHeld) this.confirmQueued = true;
    this.padConfirmHeld = padConfirm;

    const [moveX, moveZ] = mergeMove(this.keys, stick);
    return { moveX, moveZ, attack: this.attackKeys.size > 0 || this.mouseAttack || padAttack };
  }

  /** True once per press of Enter/Space/A/Start. */
  consumeConfirm() {
    const v = this.confirmQueued;
    this.confirmQueued = false;
    return v;
  }

  dispose() {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.target.removeEventListener('mousedown', this.onMouseDown);
    this.target.removeEventListener('mousemove', this.onMouseMove);
    this.target.removeEventListener('mouseup', this.onMouseUp);
    this.target.removeEventListener('contextmenu', this.onContextMenu);
  }
}
