"use strict";
// Internal types for the effects system (exported via `remotion` → `./internals.js`).
//
// An effect is a description of how to transform an input image into an output
// image, executed inside a per-frame chain runtime owned by a source component
// (`<Solid>`, `<HtmlInCanvas>`, ...). Chains own 2D/WebGPU scratch canvases and
// borrow shared WebGL canvases exclusively through the final output copy.
// Effects reuse their resources, even when another chain resizes the target.
//
// Cross-backend contract: all canvases store premultiplied alpha and are
// sRGB-encoded. Effects that perform color math in linear space are responsible
// for converting to/from sRGB themselves.
//
// WebGL setup/apply enter with the default framebuffer and viewport, disabled
// raster tests/blending, full write masks, dithering enabled, no sampler objects
// or pixel buffers, and default pixel-store layout. Source uploads default to
// premultiplied alpha; apply starts with the supplied flipSourceY. See
// reset-webgl-state.ts for the complete baseline. Effects bind their own program,
// VAO, textures and uniforms, and explicitly set flags for auxiliary uploads.
// Only owned resources may be mutated/deleted. Do not leave active queries or
// transform feedback across callbacks. Every callback consumes its inputs
// synchronously; the runtime owns canvases through bridges and final copying.
// Setup state is cached by definition and target, not by effect instance. It
// must tolerate current dimensions/parameters on every apply. Failed WebGL
// setups retire the target; successful states receive cleanup before disposal.
Object.defineProperty(exports, "__esModule", { value: true });
