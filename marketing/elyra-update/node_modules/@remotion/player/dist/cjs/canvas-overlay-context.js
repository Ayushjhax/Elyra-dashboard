"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CanvasContentContext = exports.CanvasOverlayContext = void 0;
const react_1 = require("react");
// Canvas supplies its authoring UI here so it shares the Player's timeline,
// clipping and fullscreen container without wrapping the user's composition.
exports.CanvasOverlayContext = (0, react_1.createContext)(null);
// The SDK measures against the unscaled composition and projects into the overlay.
exports.CanvasContentContext = (0, react_1.createContext)(null);
