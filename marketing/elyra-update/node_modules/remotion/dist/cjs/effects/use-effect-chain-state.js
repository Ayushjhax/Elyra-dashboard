"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useEffectChainState = void 0;
const react_1 = require("react");
const validate_dimensions_js_1 = require("../validation/validate-dimensions.js");
const preferred_effect_backend_js_1 = require("./preferred-effect-backend.js");
const run_effect_chain_js_1 = require("./run-effect-chain.js");
const useEffectChainState = (effectsOutputSize = null) => {
    var _a, _b;
    const preferredEffectBackend = (0, preferred_effect_backend_js_1.validatePreferredEffectBackend)((_a = (0, react_1.useContext)(preferred_effect_backend_js_1.PreferredEffectBackendContext)) !== null && _a !== void 0 ? _a : (typeof window === 'undefined'
        ? 'auto'
        : ((_b = window.remotion_preferredEffectBackend) !== null && _b !== void 0 ? _b : 'auto')));
    const effectWidth = effectsOutputSize === null || effectsOutputSize === void 0 ? void 0 : effectsOutputSize.width;
    const effectHeight = effectsOutputSize === null || effectsOutputSize === void 0 ? void 0 : effectsOutputSize.height;
    if (effectsOutputSize) {
        (0, validate_dimensions_js_1.validateDimension)(effectWidth, 'effectsOutputSize.width', 'on an effect-capable component');
        (0, validate_dimensions_js_1.validateDimension)(effectHeight, 'effectsOutputSize.height', 'on an effect-capable component');
    }
    const chainStateRef = (0, react_1.useRef)(null);
    const sizeRef = (0, react_1.useRef)(null);
    const unmountedRef = (0, react_1.useRef)(false);
    const [recoveryRevision, setRecoveryRevision] = (0, react_1.useState)(0);
    (0, react_1.useEffect)(() => {
        // StrictMode and Fast Refresh run the cleanup below and then this effect
        // again, after which `get()` must hand out a fresh state.
        unmountedRef.current = false;
        return () => {
            unmountedRef.current = true;
            if (chainStateRef.current) {
                (0, run_effect_chain_js_1.cleanupEffectChainState)(chainStateRef.current);
                chainStateRef.current = null;
                sizeRef.current = null;
            }
        };
    }, []);
    return (0, react_1.useMemo)(() => ({
        recoveryRevision,
        get: (width, height) => {
            var _a;
            width = effectWidth !== null && effectWidth !== void 0 ? effectWidth : width;
            height = effectHeight !== null && effectHeight !== void 0 ? effectHeight : height;
            // Async work such as a late decoded video frame can still get here
            // after unmount. Nothing would release a pool created at this point.
            if (unmountedRef.current) {
                return null;
            }
            if (!sizeRef.current ||
                sizeRef.current.width !== width ||
                sizeRef.current.height !== height ||
                ((_a = chainStateRef.current) === null || _a === void 0 ? void 0 : _a.preferredEffectBackend) !==
                    preferredEffectBackend) {
                if (chainStateRef.current) {
                    (0, run_effect_chain_js_1.cleanupEffectChainState)(chainStateRef.current);
                }
                chainStateRef.current = (0, run_effect_chain_js_1.createEffectChainState)(width, height);
                chainStateRef.current.requestRedraw = () => {
                    if (!unmountedRef.current)
                        setRecoveryRevision((revision) => revision + 1);
                };
                chainStateRef.current.preferredEffectBackend = preferredEffectBackend;
                sizeRef.current = { width, height };
            }
            return chainStateRef.current;
        },
    }), [effectWidth, effectHeight, preferredEffectBackend, recoveryRevision]);
};
exports.useEffectChainState = useEffectChainState;
