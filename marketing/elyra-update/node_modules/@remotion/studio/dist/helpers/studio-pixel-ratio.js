"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStudioPixelRatio = void 0;
const url_state_1 = require("./url-state");
let initialized = false;
let overridePixelRatio = null;
const getStudioPixelRatio = () => {
    if (!initialized) {
        initialized = true;
        const storageKey = 'remotion.studioPixelRatio';
        const raw = new URLSearchParams((0, url_state_1.getNavigationWindow)().location.search).get('studioPixelRatio');
        const fromUrl = raw === null ? Number.NaN : Number(raw);
        if (Number.isFinite(fromUrl) && fromUrl > 0) {
            overridePixelRatio = fromUrl;
            try {
                window.sessionStorage.setItem(storageKey, String(fromUrl));
            }
            catch (_a) {
                // Keep the override in memory if session storage is unavailable.
            }
        }
        else {
            try {
                const stored = Number(window.sessionStorage.getItem(storageKey));
                if (Number.isFinite(stored) && stored > 0) {
                    overridePixelRatio = stored;
                }
            }
            catch (_b) {
                // Use the device pixel ratio if session storage is unavailable.
            }
        }
    }
    return overridePixelRatio !== null && overridePixelRatio !== void 0 ? overridePixelRatio : window.devicePixelRatio;
};
exports.getStudioPixelRatio = getStudioPixelRatio;
