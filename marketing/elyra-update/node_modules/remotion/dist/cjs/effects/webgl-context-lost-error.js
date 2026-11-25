"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebGLContextLostError = void 0;
class WebGLContextLostError extends Error {
    constructor(canvas) {
        super('WebGL context was lost while rendering effects');
        this.name = 'WebGLContextLostError';
        this.canvas = canvas;
    }
}
exports.WebGLContextLostError = WebGLContextLostError;
