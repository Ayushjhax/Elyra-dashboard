"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runEffectChain = exports.cleanupEffectChainState = exports.createEffectChainState = void 0;
const canvas_pool_js_1 = require("./canvas-pool.js");
const effect_internals_js_1 = require("./effect-internals.js");
const effect_source_observer_js_1 = require("./effect-source-observer.js");
const gpu_device_js_1 = require("./gpu-device.js");
const shared_webgl_pool_js_1 = require("./shared-webgl-pool.js");
const webgl_context_lost_error_js_1 = require("./webgl-context-lost-error.js");
const webgl2_context_error_js_1 = require("./webgl2-context-error.js");
// Detach entries before calling user code. One broken cleanup must not prevent
// the remaining effects from releasing their resources.
const cleanupEntries = (entries) => {
    const errors = [];
    for (const entry of entries) {
        try {
            entry.definition.cleanup(entry.state);
        }
        catch (error) {
            errors.push(error);
        }
    }
    if (errors.length === 1)
        throw errors[0];
    if (errors.length > 1)
        throw new AggregateError(errors, 'Effect cleanup failed');
};
const disposeEffectChainState = (state) => {
    var _a;
    const entries = state.cleanupRegistry;
    state.cleanupRegistry = [];
    state.setupCache = new WeakMap();
    try {
        cleanupEntries(entries);
    }
    finally {
        try {
            (_a = state.unsubscribeWebGL) === null || _a === void 0 ? void 0 : _a.call(state);
            state.unsubscribeWebGL = null;
            state.webglPool = null;
            state.requestRedraw = null;
        }
        finally {
            state.pool.dispose();
        }
    }
};
const createEffectChainState = (width, height) => {
    var _a;
    const state = {
        width,
        height,
        preferredEffectBackend: typeof window === 'undefined'
            ? 'auto'
            : ((_a = window.remotion_preferredEffectBackend) !== null && _a !== void 0 ? _a : 'auto'),
        gpuDevice: null,
        selections: new WeakMap(),
        pool: new canvas_pool_js_1.CanvasPool(width, height, () => undefined),
        webglPool: null,
        releaseWebGL: null,
        unsubscribeWebGL: null,
        webglGeneration: 0,
        lastLostWebGLCanvas: null,
        requestRedraw: null,
        onWebGLContextLost: (canvas) => {
            var _a, _b, _c;
            // The GL objects these setups hold died with the context and stay
            // invalid on a restored one, so the next run has to recreate them.
            // While the context is lost, GL calls are no-ops, which makes this
            // the moment to run the cleanups without side effects on the
            // context's error state.
            const dead = state.cleanupRegistry.filter((entry) => entry.target === canvas);
            if (dead.length === 0 &&
                !(state.releaseWebGL && ((_a = state.webglPool) === null || _a === void 0 ? void 0 : _a.owns(canvas))))
                return;
            state.webglGeneration++;
            state.lastLostWebGLCanvas = canvas;
            state.cleanupRegistry = state.cleanupRegistry.filter((entry) => entry.target !== canvas);
            for (const entry of dead) {
                (_b = state.setupCache.get(entry.definition)) === null || _b === void 0 ? void 0 : _b.delete(canvas);
            }
            try {
                cleanupEntries(dead);
            }
            finally {
                // Active runs recover from their original source. An idle React
                // preview needs a new capture, including when its timeline is paused.
                if (!state.pendingRun && !state.cleanupRequested)
                    (_c = state.requestRedraw) === null || _c === void 0 ? void 0 : _c.call(state);
            }
        },
        setupCache: new WeakMap(),
        cleanupRegistry: [],
        currentRunId: 0,
        pendingRun: null,
        cleanupRequested: false,
    };
    return state;
};
exports.createEffectChainState = createEffectChainState;
// Cancel immediately, but do not destroy canvases borrowed by an asynchronous
// bridge or by an effect callback still on the stack.
const cleanupEffectChainState = (state) => {
    if (state.cleanupRequested)
        return;
    state.cleanupRequested = true;
    state.currentRunId++;
    (0, effect_source_observer_js_1.invalidateEffectChainSources)(state);
    if (!state.pendingRun) {
        if (state.webglPool) {
            (0, shared_webgl_pool_js_1.cleanupWithSharedWebGLPool)(() => disposeEffectChainState(state));
        }
        else {
            disposeEffectChainState(state);
        }
    }
};
exports.cleanupEffectChainState = cleanupEffectChainState;
const ensureSetup = (state, def, target, backend) => {
    const widened = def;
    let cacheForDefinition = state.setupCache.get(widened);
    if (!cacheForDefinition) {
        cacheForDefinition = new WeakMap();
        state.setupCache.set(widened, cacheForDefinition);
    }
    if (cacheForDefinition.has(target)) {
        return cacheForDefinition.get(target);
    }
    if (backend === 'webgl2')
        state.webglPool.prepareWebGL(target, false);
    let setupState;
    try {
        setupState = def.setup(target);
    }
    catch (error) {
        if (backend === 'webgl2') {
            // Allocation/compilation can fail because the GPU was lost during
            // setup. Keep that distinct from a broken shader or effect implementation.
            state.webglPool.assertContextNotLost(target);
            try {
                state.webglPool.retireWebGL(target);
            }
            catch (cleanupError) {
                throw new AggregateError([error, cleanupError], 'Effect setup and cleanup failed');
            }
        }
        throw error;
    }
    cacheForDefinition.set(target, setupState);
    state.cleanupRegistry.push({
        backend,
        definition: widened,
        state: setupState,
        target,
    });
    return setupState;
};
// Runs the effect pipeline imperatively. Returns `true` if the pipeline
// completed and wrote to `output`, `false` if it was superseded by a newer
// run (caller should not act on a stale result).
const runEffectChainWithoutResize = async ({ state, source, output, width, height }, initialFlipSourceY, runId, { resolved, gpuDevice, }) => {
    var _a;
    const isCancelled = () => state.currentRunId !== runId;
    const { webglGeneration } = state;
    const assertWebGLValid = () => {
        if (!state.releaseWebGL)
            return;
        if (state.webglGeneration !== webglGeneration &&
            state.lastLostWebGLCanvas) {
            throw new webgl_context_lost_error_js_1.WebGLContextLostError(state.lastLostWebGLCanvas);
        }
        state.webglPool.assertWebGLContextsNotLost();
    };
    const runs = (0, effect_internals_js_1.groupByBackend)(resolved);
    let currentImage = source;
    let lastTarget = null;
    if (runs.length === 0) {
        // In-place pipeline (e.g. <HtmlInCanvas>: drawElementImage into the same
        // surface, no further effects) — the bitmap is already on `output`.
        if (source === output) {
            return true;
        }
        const ctx = output.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to acquire 2D context for output canvas');
        }
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(currentImage, 0, 0, width, height);
        return true;
    }
    // Canvas sources are DOM-oriented. Flip them when uploading into WebGL so
    // texture coordinates match clip-space output. `ImageBitmap` bridges below
    // opt out because they are already oriented for upload.
    let flipWebGLSourceY = initialFlipSourceY;
    // Only bridge bitmaps are owned here; the original source belongs to the caller.
    let bridgeBitmap = null;
    try {
        for (let runIndex = 0; runIndex < runs.length; runIndex++) {
            const run = runs[runIndex];
            let canvasIndex = 0;
            for (const eff of run.effects) {
                if (isCancelled())
                    return false;
                const canvasPool = run.backend === 'webgl2' ? state.webglPool : state.pool;
                const dst = canvasPool.getCanvas(run.backend, canvasIndex);
                const def = eff.implementation;
                const setupState = ensureSetup(state, def, dst, run.backend);
                if (isCancelled())
                    return false;
                assertWebGLValid();
                (0, effect_source_observer_js_1.publishEffectSource)(eff.original, currentImage, state);
                if (isCancelled())
                    return false;
                if (run.backend === 'webgl2')
                    canvasPool.prepareWebGL(dst, flipWebGLSourceY);
                def.apply({
                    source: currentImage,
                    target: dst,
                    state: setupState,
                    params: eff.params,
                    width: state.width,
                    height: state.height,
                    gpuDevice,
                    flipSourceY: run.backend === 'webgl2' ? flipWebGLSourceY : false,
                });
                if (run.backend === 'webgl2')
                    canvasPool.assertContextNotLost(dst);
                if (isCancelled())
                    return false;
                // Effects consume their source synchronously. Release it before the
                // next bridge so a run never retains multiple temporary bitmaps.
                bridgeBitmap === null || bridgeBitmap === void 0 ? void 0 : bridgeBitmap.close();
                bridgeBitmap = null;
                if (run.backend === 'webgl2') {
                    // Same-backend ping-pong passes feed the previous WebGL canvas back
                    // through `texImage2D()`. That source is still a DOM canvas, so the
                    // next upload also needs to be flipped.
                    flipWebGLSourceY = true;
                }
                currentImage = dst;
                canvasIndex = canvasIndex === 0 ? 1 : 0;
            }
            lastTarget = (_a = currentImage) !== null && _a !== void 0 ? _a : lastTarget;
            const nextRun = runs[runIndex + 1];
            if (nextRun && nextRun.backend !== run.backend && lastTarget) {
                // 2D → WebGL: pass the 2D canvas directly so `texImage2D` + `UNPACK_FLIP_Y`
                // matches blur-only on a raw frame canvas. `createImageBitmap` here changes
                // upload orientation and produced upside-down stacks (wave + blur).
                if (run.backend === '2d' && nextRun.backend === 'webgl2') {
                    currentImage = lastTarget;
                    flipWebGLSourceY = true;
                }
                else {
                    // Other bridges use `createImageBitmap` rather than passing the canvas
                    // straight through. A direct `drawImage(webglCanvas)` in the next
                    // backend's first effect forces an implicit GPU readback / finish on the
                    // consuming context, which empirically blows the per-frame vsync budget and
                    // halves the paint rate. `createImageBitmap` pipelines the GPU work.
                    // WebGL ignores UNPACK_FLIP_Y_WEBGL for ImageBitmap uploads.
                    // Normalize the orientation here rather than relying on the
                    // underlying canvas backing store's orientation.
                    bridgeBitmap = await createImageBitmap(lastTarget, {
                        imageOrientation: nextRun.backend === 'webgl2' ? 'flipY' : 'none',
                    });
                    if (isCancelled()) {
                        return false;
                    }
                    assertWebGLValid();
                    currentImage = bridgeBitmap;
                    if (nextRun.backend === 'webgl2') {
                        flipWebGLSourceY = false;
                    }
                }
            }
        }
    }
    finally {
        // Also release a bridge if setup/apply throws or the run is cancelled.
        bridgeBitmap === null || bridgeBitmap === void 0 ? void 0 : bridgeBitmap.close();
    }
    if (isCancelled())
        return false;
    assertWebGLValid();
    if (!lastTarget) {
        return true;
    }
    const outCtx = output.getContext('2d');
    if (!outCtx) {
        throw new Error('Failed to acquire 2D context for output canvas');
    }
    outCtx.clearRect(0, 0, width, height);
    outCtx.drawImage(lastTarget, 0, 0, width, height);
    return true;
};
// Keep ownership of the optional resized source until the existing chain settles.
const runEffectChainWithResize = async (options, runId, allowBackendFallback) => {
    var _a;
    var _b, _c;
    const { state, source, width, height, effects } = options;
    const order = ['webgpu', 'webgl2', '2d'];
    if (state.preferredEffectBackend !== 'auto') {
        order.splice(order.indexOf(state.preferredEffectBackend), 1);
        order.unshift(state.preferredEffectBackend);
    }
    const resolved = [];
    let gpuDevice = null;
    for (const effect of effects) {
        if (effect.params.disabled)
            continue;
        const implementations = (_b = effect.definition.implementations) !== null && _b !== void 0 ? _b : {
            [effect.definition.backend]: effect.definition,
        };
        let selected = false;
        const cached = state.selections.get(effect.definition);
        const candidates = cached === undefined
            ? order
            : [
                cached.backend,
                ...order.filter((backend) => backend !== cached.backend),
            ];
        for (const backend of candidates) {
            const implementation = implementations[backend];
            if (!implementation)
                continue;
            if (backend === 'webgpu') {
                if (typeof window !== 'undefined' &&
                    window.remotion_disableWebGpuEffects)
                    continue;
                gpuDevice = await (0, gpu_device_js_1.getGpuDevice)();
                if (state.currentRunId !== runId)
                    return false;
                if (!gpuDevice)
                    continue;
                const { limits } = gpuDevice;
                if (limits &&
                    (state.width > limits.maxTextureDimension2D ||
                        state.height > limits.maxTextureDimension2D))
                    continue;
            }
            if (backend === 'webgl2' && !state.releaseWebGL) {
                (_c = state.unsubscribeWebGL) !== null && _c !== void 0 ? _c : (state.unsubscribeWebGL = (0, shared_webgl_pool_js_1.subscribeToSharedWebGLContextLoss)(state.onWebGLContextLost));
                const lease = await (0, shared_webgl_pool_js_1.acquireSharedWebGLPool)(state.width, state.height);
                state.webglPool = lease.pool;
                state.releaseWebGL = lease.release;
                if (state.currentRunId !== runId)
                    return false;
            }
            // Allocation failure is a capability failure; setup/apply errors are bugs and propagate.
            if (Object.keys(implementations).length > 1) {
                try {
                    (backend === 'webgl2' ? state.webglPool : state.pool).getCanvas(backend, 0);
                }
                catch (error) {
                    if (!allowBackendFallback)
                        throw error;
                    continue;
                }
            }
            state.selections.set(effect.definition, { backend, implementation });
            resolved.push({
                definition: { backend },
                implementation,
                original: effect,
                params: effect.params,
            });
            selected = true;
            break;
        }
        if (!selected)
            throw new Error(`No supported implementation for effect "${effect.definition.type}" (preferred backend: ${state.preferredEffectBackend})`);
    }
    const deviceChanged = gpuDevice !== state.gpuDevice;
    const activeImplementations = new Set(resolved.map((effect) => effect.implementation));
    let entries = state.cleanupRegistry.filter((entry) => deviceChanged || !activeImplementations.has(entry.definition));
    if (entries.length > 0) {
        // WebGPU cleanups can unconfigure their target's shared canvas context.
        // Another effect may have cached a setup on that same ping-pong target
        // before a reorder or undo. Retire it too, so it configures the context
        // again instead of reusing resources backed by an unconfigured canvas.
        const retiredWebGpuTargets = new Set(entries
            .filter((entry) => entry.backend === 'webgpu')
            .map((entry) => entry.target));
        if (retiredWebGpuTargets.size > 0) {
            entries = state.cleanupRegistry.filter((entry) => deviceChanged ||
                !activeImplementations.has(entry.definition) ||
                retiredWebGpuTargets.has(entry.target));
        }
        const retiredEntries = new Set(entries);
        state.cleanupRegistry = state.cleanupRegistry.filter((entry) => !retiredEntries.has(entry));
        for (const entry of entries) {
            (_a = state.setupCache.get(entry.definition)) === null || _a === void 0 ? void 0 : _a.delete(entry.target);
        }
        if (state.webglPool && !state.releaseWebGL) {
            // Local WebGPU cleanup must finish before its canvas is configured by
            // the replacement implementation. Only WebGL shares another chain's lease.
            try {
                cleanupEntries(entries.filter((entry) => entry.backend !== 'webgl2'));
            }
            finally {
                const webglEntries = entries.filter((entry) => entry.backend === 'webgl2');
                if (webglEntries.length > 0) {
                    (0, shared_webgl_pool_js_1.cleanupWithSharedWebGLPool)(() => cleanupEntries(webglEntries));
                }
            }
        }
        else {
            cleanupEntries(entries);
        }
    }
    state.gpuDevice = gpuDevice;
    if (state.currentRunId !== runId)
        return false;
    if ((state.width === width && state.height === height) ||
        !effects.some((effect) => !effect.params.disabled)) {
        return runEffectChainWithoutResize(options, true, runId, {
            resolved,
            gpuDevice,
        });
    }
    const firstEnabledEffect = resolved[0];
    const resized = await createImageBitmap(source, {
        resizeWidth: state.width,
        resizeHeight: state.height,
        // WebGL ignores UNPACK_FLIP_Y_WEBGL for ImageBitmap uploads.
        imageOrientation: firstEnabledEffect.definition.backend === 'webgl2' ? 'flipY' : 'none',
    });
    try {
        if (state.currentRunId !== runId) {
            return false;
        }
        return await runEffectChainWithoutResize({ ...options, source: resized }, false, runId, { resolved, gpuDevice });
    }
    finally {
        resized.close();
    }
};
// Reserve the chain before invoking any effect or observer. A reentrant call
// supersedes this run, but cannot touch its canvases until every bridge settles.
const runEffectChain = async (options) => {
    const { state } = options;
    if (state.cleanupRequested) {
        throw new Error('Effect chain state was used after it had been cleaned up');
    }
    const runId = ++state.currentRunId;
    const previousRun = state.pendingRun;
    let release;
    const completion = new Promise((resolve) => {
        release = resolve;
    });
    state.pendingRun = completion;
    try {
        if (previousRun)
            await previousRun;
        if (state.currentRunId !== runId)
            return false;
        for (let attempt = 0;; attempt++) {
            try {
                return await runEffectChainWithResize(options, runId, attempt === 0);
            }
            catch (error) {
                if (state.currentRunId !== runId)
                    return false;
                let failure = error;
                if (state.releaseWebGL) {
                    try {
                        // GPU loss can make a shader compile, upload, or asynchronous
                        // bitmap bridge fail before the browser delivers its lost event.
                        state.webglPool.assertWebGLContextsNotLost();
                    }
                    catch (contextError) {
                        failure = contextError;
                    }
                }
                if (!(failure instanceof webgl_context_lost_error_js_1.WebGLContextLostError) &&
                    !(attempt > 0 && failure instanceof webgl2_context_error_js_1.WebGL2ContextCreationError))
                    throw failure;
                if (attempt === 2) {
                    if (failure instanceof webgl_context_lost_error_js_1.WebGLContextLostError) {
                        // Retire before ending the run so its delayed lost event cannot
                        // schedule another automatic redraw and restart the retry budget.
                        state.webglPool.retireWebGL(failure.canvas);
                    }
                    throw new Error('WebGL context was lost repeatedly while rendering effects. ' +
                        'Recovery failed after two retries. Try reducing rendering concurrency or GPU memory usage.', { cause: failure });
                }
                if (failure instanceof webgl_context_lost_error_js_1.WebGLContextLostError) {
                    state.webglPool.retireWebGL(failure.canvas);
                }
                // Yield so the browser can finish releasing the old GPU context.
                // The next attempt acquires fresh canvases and reruns the whole chain.
                await new Promise((resolve) => setTimeout(resolve, attempt * 50));
                if (state.currentRunId !== runId)
                    return false;
            }
        }
    }
    finally {
        try {
            if (state.pendingRun === completion) {
                state.pendingRun = null;
                if (state.cleanupRequested)
                    disposeEffectChainState(state);
            }
        }
        finally {
            try {
                const { releaseWebGL } = state;
                state.releaseWebGL = null;
                releaseWebGL === null || releaseWebGL === void 0 ? void 0 : releaseWebGL();
            }
            finally {
                release();
            }
        }
    }
};
exports.runEffectChain = runEffectChain;
