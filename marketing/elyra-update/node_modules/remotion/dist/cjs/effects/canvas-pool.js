"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CanvasPool = void 0;
const reset_webgl_state_js_1 = require("./reset-webgl-state.js");
const webgl_context_lost_error_js_1 = require("./webgl-context-lost-error.js");
const webgl2_context_error_js_1 = require("./webgl2-context-error.js");
const scheduleContextLoss = (gl) => {
    // Losing a WebGL context during an HTML-in-canvas paint event (including
    // its microtasks) crashes Chromium. Release it in the next task instead.
    // Remove this deferral once the fix is available in all supported Chromium versions.
    // https://github.com/remotion-dev/remotion/issues/12293
    // https://issues.chromium.org/issues/575053149
    setTimeout(() => {
        var _a;
        (_a = gl.getExtension('WEBGL_lose_context')) === null || _a === void 0 ? void 0 : _a.loseContext();
    }, 0);
};
// Chains own their 2D/WebGPU pools. WebGL chains borrow one shared pool and
// resize its scratch canvases while holding an exclusive lease.
//
// Canvases are allocated lazily on first use of a given backend. Once
// allocated, they are reused every frame for the chain's lifetime. Contexts
// are created with the cross-backend alpha/sRGB contract enforced (see
// `effect-types.ts`).
//
// Browsers keep only a limited number of WebGL contexts alive (16 in Chrome
// and Safari) and force-lose the oldest one beyond that, while unreferenced
// canvases are only collected lazily. `dispose()` therefore releases the
// backing stores as soon as the chain is torn down and the contexts in the
// next task instead of leaving that to the garbage collector.
class CanvasPool {
    constructor(width, height, onContextLost) {
        this.pairs = new Map();
        // Tracked individually rather than through `pairs` so that a canvas whose
        // sibling failed to allocate still gets released.
        this.allocated = new Map();
        this.lostContexts = new Set();
        this.disposed = false;
        this.width = width;
        this.height = height;
        this.onContextLost = onContextLost;
    }
    resize(width, height) {
        this.width = width;
        this.height = height;
        for (const canvas of this.allocated.keys()) {
            // Assigning even the same dimension clears/reallocates the buffer.
            if (canvas.width !== width)
                canvas.width = width;
            if (canvas.height !== height)
                canvas.height = height;
        }
    }
    owns(canvas) {
        return this.allocated.has(canvas);
    }
    assertWebGLContextsNotLost() {
        for (const [canvas, entry] of this.allocated) {
            if (entry.gl)
                this.getCheckedEntry(canvas);
        }
    }
    getCanvas(backend, index) {
        var _a;
        if (this.disposed) {
            throw new Error('Effect chain state was used after it had been cleaned up');
        }
        let pair = this.pairs.get(backend);
        if (!pair) {
            pair = [null, null];
            this.pairs.set(backend, pair);
        }
        // A single effect needs one target. Allocate its ping-pong partner only
        // when a later pass actually uses it.
        (_a = pair[index]) !== null && _a !== void 0 ? _a : (pair[index] = this.allocateCanvas(backend));
        return pair[index];
    }
    getPair(backend) {
        this.getCanvas(backend, 0);
        this.getCanvas(backend, 1);
        return this.pairs.get(backend);
    }
    getCheckedEntry(canvas) {
        var _a;
        const entry = this.allocated.get(canvas);
        if (this.lostContexts.has(canvas) || ((_a = entry === null || entry === void 0 ? void 0 : entry.gl) === null || _a === void 0 ? void 0 : _a.isContextLost())) {
            throw new webgl_context_lost_error_js_1.WebGLContextLostError(canvas);
        }
        return entry !== null && entry !== void 0 ? entry : null;
    }
    assertContextNotLost(canvas) {
        this.getCheckedEntry(canvas);
    }
    prepareWebGL(canvas, flipSourceY) {
        const entry = this.getCheckedEntry(canvas);
        if (!(entry === null || entry === void 0 ? void 0 : entry.reset)) {
            throw new Error('WebGL effect target is not owned by this pool');
        }
        entry.reset(canvas.width, canvas.height, flipSourceY);
    }
    // A failed setup may have allocated objects it never returned. Scheduling
    // context loss also releases those unreachable objects; no cached state survives.
    retireWebGL(canvas) {
        const entry = this.allocated.get(canvas);
        if (!entry)
            return;
        const { gl } = entry;
        this.allocated.delete(canvas);
        const pair = this.pairs.get('webgl2');
        if (pair) {
            if (pair[0] === canvas)
                pair[0] = null;
            if (pair[1] === canvas)
                pair[1] = null;
        }
        try {
            if (gl)
                scheduleContextLoss(gl);
            // Invalidate cached setups now, before the deferred context loss.
            this.onContextLost(canvas);
        }
        finally {
            canvas.width = 0;
            canvas.height = 0;
            this.lostContexts.delete(canvas);
        }
    }
    // Makes the pool unusable immediately and schedules WebGL context release.
    dispose() {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        for (const [canvas, { gl }] of this.allocated) {
            // Frees the slot in the browser's live-context budget in the next task.
            // Resizing to 0x0 drops the backing store even where the extension
            // is unavailable.
            if (gl)
                scheduleContextLoss(gl);
            canvas.width = 0;
            canvas.height = 0;
        }
        this.allocated.clear();
        this.pairs.clear();
        this.lostContexts.clear();
    }
    allocateCanvas(backend) {
        const canvas = document.createElement('canvas');
        canvas.width = this.width;
        canvas.height = this.height;
        switch (backend) {
            case '2d': {
                const ctx = canvas.getContext('2d', {
                    colorSpace: 'srgb',
                });
                if (!ctx) {
                    throw new Error('Failed to acquire 2D context for effects');
                }
                this.allocated.set(canvas, { gl: null, reset: null });
                return canvas;
            }
            case 'webgl2': {
                const ctx = canvas.getContext('webgl2', {
                    premultipliedAlpha: true,
                    alpha: true,
                    preserveDrawingBuffer: true,
                });
                if (!ctx) {
                    throw (0, webgl2_context_error_js_1.createWebGL2ContextError)('effects');
                }
                canvas.addEventListener('webglcontextlost', () => {
                    // Recovery replaces the canvas. Do not request restoration of a
                    // retired context, which would consume an unowned browser slot.
                    if (this.disposed || !this.allocated.has(canvas)) {
                        return;
                    }
                    this.lostContexts.add(canvas);
                    this.onContextLost(canvas);
                });
                canvas.addEventListener('webglcontextrestored', () => {
                    if (this.disposed || !this.allocated.has(canvas)) {
                        return;
                    }
                    // A restored context starts from the initial GL state.
                    ctx.pixelStorei(ctx.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
                    this.lostContexts.delete(canvas);
                });
                ctx.pixelStorei(ctx.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
                this.allocated.set(canvas, {
                    gl: ctx,
                    reset: (0, reset_webgl_state_js_1.createWebGLStateReset)(ctx, ctx.getParameter(ctx.MAX_COMBINED_TEXTURE_IMAGE_UNITS)),
                });
                return canvas;
            }
            case 'webgpu': {
                if (typeof navigator === 'undefined' ||
                    !('gpu' in navigator) ||
                    !canvas.getContext('webgpu')) {
                    throw new Error('WebGPU is not available in this environment for effects');
                }
                this.allocated.set(canvas, { gl: null, reset: null });
                return canvas;
            }
            default: {
                const exhaustive = backend;
                throw new Error(`Unknown effect backend: ${exhaustive}`);
            }
        }
    }
}
exports.CanvasPool = CanvasPool;
