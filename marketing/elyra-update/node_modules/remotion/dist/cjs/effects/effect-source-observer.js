"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.useEffectSourceInspection = exports.invalidateEffectChainSources = exports.publishEffectSource = exports.subscribeToEffectSource = void 0;
const react_1 = __importStar(require("react"));
const observers = new Map();
const redrawListeners = new Map();
const identities = new WeakMap();
const inspectedChains = new WeakMap();
const sourceChainOwners = new Map();
const useIdentityCommitEffect = (_a = react_1.default.useInsertionEffect) !== null && _a !== void 0 ? _a : react_1.useLayoutEffect;
/** Studio-only inspection. The source is borrowed and must be consumed synchronously. */
const subscribeToEffectSource = ({ sequenceKey, effectIndex, onSource, }) => {
    var _a;
    let sequence = observers.get(sequenceKey);
    if (!sequence) {
        sequence = new Map();
        observers.set(sequenceKey, sequence);
    }
    let listeners = sequence.get(effectIndex);
    if (!listeners) {
        listeners = new Set();
        sequence.set(effectIndex, listeners);
    }
    listeners.add(onSource);
    // Repaint once when the inspector opens, including while playback is paused.
    (_a = redrawListeners.get(sequenceKey)) === null || _a === void 0 ? void 0 : _a.forEach((redraw) => redraw());
    return () => {
        listeners.delete(onSource);
        if (listeners.size === 0) {
            sequence.delete(effectIndex);
        }
        if (sequence.size === 0) {
            observers.delete(sequenceKey);
        }
    };
};
exports.subscribeToEffectSource = subscribeToEffectSource;
const publishEffectSource = (effect, source, chain) => {
    var _a;
    if (observers.size === 0) {
        return;
    }
    const identity = identities.get(effect);
    if (!identity) {
        return;
    }
    const listeners = (_a = observers
        .get(identity.sequenceKey)) === null || _a === void 0 ? void 0 : _a.get(identity.effectIndex);
    if (!listeners || listeners.size === 0) {
        return;
    }
    let inspected = inspectedChains.get(chain);
    if (!inspected) {
        inspected = new Map();
        inspectedChains.set(chain, inspected);
    }
    const key = `${identity.sequenceKey}\0${identity.effectIndex}`;
    inspected.set(key, identity);
    sourceChainOwners.set(key, chain);
    listeners.forEach((listener) => {
        try {
            listener(source);
        }
        catch (_a) {
            // Optional inspector readback must never interrupt rendering.
        }
    });
};
exports.publishEffectSource = publishEffectSource;
const invalidateEffectChainSources = (chain) => {
    const inspected = inspectedChains.get(chain);
    inspectedChains.delete(chain);
    inspected === null || inspected === void 0 ? void 0 : inspected.forEach((identity, key) => {
        var _a, _b;
        // A replacement canvas may already have painted before the old canvas's
        // passive cleanup. Only the current owner can invalidate its histogram.
        if (sourceChainOwners.get(key) !== chain) {
            return;
        }
        sourceChainOwners.delete(key);
        (_b = (_a = observers
            .get(identity.sequenceKey)) === null || _a === void 0 ? void 0 : _a.get(identity.effectIndex)) === null || _b === void 0 ? void 0 : _b.forEach((listener) => {
            try {
                listener(null);
            }
            catch (_a) {
                // Optional inspection must not interfere with canvas cleanup.
            }
        });
    });
};
exports.invalidateEffectChainSources = invalidateEffectChainSources;
const useEffectSourceInspection = (effects, sequenceKey) => {
    const [revision, setRevision] = (0, react_1.useState)(0);
    (0, react_1.useLayoutEffect)(() => {
        if (sequenceKey === null) {
            return;
        }
        let listeners = redrawListeners.get(sequenceKey);
        if (!listeners) {
            listeners = new Set();
            redrawListeners.set(sequenceKey, listeners);
        }
        const redraw = () => setRevision((previous) => previous + 1);
        listeners.add(redraw);
        if (observers.has(sequenceKey)) {
            redraw();
        }
        return () => {
            var _a;
            listeners.delete(redraw);
            if (listeners.size === 0) {
                redrawListeners.delete(sequenceKey);
                (_a = observers.get(sequenceKey)) === null || _a === void 0 ? void 0 : _a.forEach((sourceListeners) => {
                    sourceListeners.forEach((listener) => {
                        try {
                            listener(null);
                        }
                        catch (_a) {
                            // An inspector must not interfere with source cleanup.
                        }
                    });
                });
            }
        };
    }, [sequenceKey]);
    useIdentityCommitEffect(() => {
        if (sequenceKey === null) {
            return;
        }
        effects.forEach((effect, effectIndex) => {
            identities.set(effect, { sequenceKey, effectIndex });
        });
        return () => {
            effects.forEach((effect) => identities.delete(effect));
        };
    }, [effects, sequenceKey]);
    // Source components already repaint when their effect array changes.
    return (0, react_1.useMemo)(() => {
        return sequenceKey === null || revision === 0 ? effects : effects.slice();
    }, [effects, revision, sequenceKey]);
};
exports.useEffectSourceInspection = useEffectSourceInspection;
