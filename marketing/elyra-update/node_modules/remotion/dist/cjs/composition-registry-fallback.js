"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useCommittedCompositionEntry = exports.CompositionRegistryFallbackContext = void 0;
const react_1 = require("react");
exports.CompositionRegistryFallbackContext = (0, react_1.createContext)(null);
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? react_1.useEffect : react_1.useLayoutEffect;
const createEntryCleanup = (registry, identity) => {
    if (registry === null) {
        return;
    }
    return () => {
        registry.entries.delete(identity);
        registry.notifyCommit();
    };
};
// The fallback stages descriptors during layout effects and publishes one
// complete snapshot after the commit, including mount and unmount changes.
const useCommittedCompositionEntry = (entry) => {
    const registry = (0, react_1.useContext)(exports.CompositionRegistryFallbackContext);
    const key = (0, react_1.useRef)({});
    useIsomorphicLayoutEffect(() => {
        if (registry === null) {
            return;
        }
        if (entry === null) {
            registry.entries.delete(key.current);
        }
        else {
            registry.entries.set(key.current, entry);
        }
        registry.notifyCommit();
    }, [entry, registry]);
    // The cleanup outlives entry changes. Binding a separate factory prevents it
    // from sharing a closure with the original entry, even after minification.
    useIsomorphicLayoutEffect(createEntryCleanup.bind(null, registry, key.current), [registry]);
};
exports.useCommittedCompositionEntry = useCommittedCompositionEntry;
