import { Game } from './core/Game.js';

const game = new Game(document.getElementById('app'));
game.boot();

// Handy for debugging and automated checks from the browser console.
window.__ffl = game;
