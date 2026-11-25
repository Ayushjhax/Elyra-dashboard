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
Object.defineProperty(exports, "__esModule", { value: true });
exports.useLazyComponent = void 0;
const react_1 = __importStar(require("react"));
const registry_store_js_1 = require("./registry-store.js");
const use_sync_external_store_js_1 = require("./use-sync-external-store.js");
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? react_1.useEffect : react_1.useLayoutEffect;
const createComponentWrapper = (componentStore) => {
    const Wrapper = (props) => {
        const Comp = (0, use_sync_external_store_js_1.useSyncExternalStore)(componentStore.subscribe, componentStore.getSnapshot, componentStore.getSnapshot);
        return react_1.default.createElement(Comp, props);
    };
    return Wrapper;
};
// Expected, it can be any component props
const useLazyComponent = ({ compProps, componentName, noSuspense, }) => {
    // Why a store + stable wrapper instead of returning compProps.component directly?
    //
    // When a user edits their component and saves, React Fast Refresh re-executes
    // the module, giving compProps.component a new function reference.
    // Previously, this new reference flowed into useMemo (which depended on
    // compProps.component), producing a new `lazy` value. Composition.tsx then
    // rendered `<Comp />` where Comp had a different identity, so React unmounted
    // the old tree and mounted a fresh one — losing all component state.
    //
    // A stable Wrapper preserves the tree across Fast Refresh updates. Publish its
    // implementation on commit so an abandoned render cannot change the component
    // exposed by an already registered composition. The subscription updates mounted
    // wrappers even when the registration's component identity stays the same.
    //
    // To reproduce: use packages/example/src/NewVideo.tsx, edit Component
    // (e.g. change volume={1} to volume={2}) and save. Without this fix,
    // Component would fully remount instead of fast-refreshing in place.
    const componentFromProps = 'component' in compProps
        ? compProps.component
        : null;
    if (componentFromProps === undefined &&
        typeof document !== 'undefined' &&
        !noSuspense) {
        throw new Error(`A value of \`undefined\` was passed to the \`component\` prop. Check the value you are passing to the <${componentName}/> component.`);
    }
    const lazyComponentFromProps = 'lazyComponent' in compProps ? compProps.lazyComponent : null;
    const componentStore = (0, react_1.useMemo)(() => (0, registry_store_js_1.createRegistryStore)(componentFromProps !== null && componentFromProps !== void 0 ? componentFromProps : null), 
    // A new lazy loader replaces the wrapper too. Component edits only update
    // the existing store on commit, preserving the wrapper identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lazyComponentFromProps]);
    useIsomorphicLayoutEffect(() => {
        if (componentFromProps !== null && componentFromProps !== undefined) {
            componentStore.setSnapshot(() => componentFromProps);
        }
    }, [componentFromProps, componentStore]);
    // Passing a bound factory keeps its closure separate from the render, including
    // after minification. The wrapper must only retain the store, not initial props.
    const createWrapper = createComponentWrapper;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const Wrapper = (0, react_1.useMemo)(createWrapper.bind(null, componentStore), [
        componentStore,
    ]);
    const lazy = (0, react_1.useMemo)(() => {
        if ('component' in compProps) {
            return Wrapper;
        }
        if ('lazyComponent' in compProps &&
            typeof compProps.lazyComponent !== 'undefined') {
            if (typeof compProps.lazyComponent === 'undefined') {
                throw new Error(`A value of \`undefined\` was passed to the \`lazyComponent\` prop. Check the value you are passing to the <${componentName}/> component.`);
            }
            return react_1.default.lazy(compProps.lazyComponent);
        }
        throw new Error("You must pass either 'component' or 'lazyComponent'");
        // Very important to leave the dependencies as they are, or instead
        // the player will remount on every frame.
        // For the 'component' case, we intentionally do NOT depend on
        // compProps.component — the stable wrapper subscribes to componentStore instead.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lazyComponentFromProps, componentStore, Wrapper]);
    // Read the current component on every render when bypassing the wrapper.
    if ('component' in compProps &&
        (typeof document === 'undefined' || noSuspense)) {
        return compProps.component;
    }
    return lazy;
};
exports.useLazyComponent = useLazyComponent;
