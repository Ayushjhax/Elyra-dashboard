"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompositionManagerProvider = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const committed_metadata_js_1 = require("./committed-metadata.js");
const CompositionManager_1 = require("./CompositionManager");
const CompositionManagerContext_1 = require("./CompositionManagerContext");
const CompositionRegistryProvider_js_1 = require("./CompositionRegistryProvider.js");
const registry_store_js_1 = require("./registry-store.js");
const use_sync_external_store_js_1 = require("./use-sync-external-store.js");
const CompositionManagerProvider = ({ children, onlyRenderComposition, currentCompositionMetadata, initialCompositions, initialCanvasContent, }) => {
    const committedKeysRef = (0, react_1.useRef)(new Set());
    const flushSnapshotRef = (0, react_1.useRef)(null);
    const committedDescriptorsRef = (0, react_1.useRef)(new Map());
    const [registrationError, setRegistrationError] = (0, react_1.useState)(null);
    const [registry] = (0, react_1.useState)(() => (0, registry_store_js_1.createRegistryStore)({
        compositions: initialCompositions.map((composition, order) => ({
            ...composition,
            order,
        })),
        folders: [],
    }));
    const { compositions, folders } = (0, use_sync_external_store_js_1.useSyncExternalStore)(registry.subscribe, registry.getSnapshot, registry.getSnapshot);
    const [canvasContent, setCanvasContent] = (0, react_1.useState)(initialCanvasContent);
    const [currentAssetMetadata, setCurrentAssetMetadata] = (0, react_1.useState)(null);
    const onCommitRegistrations = (0, react_1.useCallback)((pending) => {
        const previousKeys = committedKeysRef.current;
        const previousDescriptors = committedDescriptorsRef.current;
        const existingIds = new Set(registry
            .getSnapshot()
            .compositions.map((composition) => composition.id));
        const descriptors = new Map();
        for (const composition of pending.compositions) {
            const key = `composition:${composition.id}`;
            if (descriptors.has(key) ||
                (!previousKeys.has(key) && existingIds.has(composition.id))) {
                setRegistrationError(new Error(`Multiple composition with id ${composition.id} are registered.`));
                return;
            }
            descriptors.set(key, composition);
        }
        for (const folder of pending.folders) {
            descriptors.set(`folder:${(0, committed_metadata_js_1.getFolderOrderId)(folder)}`, folder);
        }
        const nextKeys = new Set(descriptors.keys());
        const order = new Map(pending.orderIds.map((id, index) => [id, index]));
        committedKeysRef.current = nextKeys;
        committedDescriptorsRef.current = descriptors;
        registry.setSnapshot((current) => {
            const nextCompositions = (0, registry_store_js_1.reconcileRegistryEntries)({
                current: current.compositions,
                entries: pending.compositions,
                previousDescriptors,
                previousKeys,
                nextKeys,
                getKey: (composition) => `composition:${composition.id}`,
                order,
                orderProperty: 'order',
            });
            const nextFolders = (0, registry_store_js_1.reconcileRegistryEntries)({
                current: current.folders,
                entries: pending.folders,
                previousDescriptors,
                previousKeys,
                nextKeys,
                getKey: (folder) => `folder:${(0, committed_metadata_js_1.getFolderOrderId)(folder)}`,
                order,
                orderProperty: 'order',
            });
            return nextCompositions === current.compositions &&
                nextFolders === current.folders
                ? current
                : { compositions: nextCompositions, folders: nextFolders };
        });
    }, [registry]);
    (0, react_1.useImperativeHandle)(CompositionManager_1.compositionsRef, () => {
        return {
            getCompositions: () => {
                var _a;
                (_a = flushSnapshotRef.current) === null || _a === void 0 ? void 0 : _a.call(flushSnapshotRef);
                return registry.getSnapshot().compositions;
            },
        };
    }, [registry]);
    const compositionManagerSetters = (0, react_1.useMemo)(() => ({
        setCanvasContent,
        setCurrentAssetMetadata,
        onlyRenderComposition,
    }), [onlyRenderComposition]);
    const compositionManagerContextValue = (0, react_1.useMemo)(() => {
        return {
            compositions,
            folders,
            currentCompositionMetadata,
            currentAssetMetadata,
            canvasContent,
        };
    }, [
        compositions,
        folders,
        currentCompositionMetadata,
        currentAssetMetadata,
        canvasContent,
    ]);
    const compositionManagerRef = (0, react_1.useRef)(compositionManagerContextValue);
    compositionManagerRef.current = compositionManagerContextValue;
    if (registrationError !== null) {
        throw registrationError;
    }
    return ((0, jsx_runtime_1.jsx)(CompositionRegistryProvider_js_1.CompositionRegistryProvider, { ref: flushSnapshotRef, onSnapshot: onCommitRegistrations, children: (0, jsx_runtime_1.jsx)(CompositionManagerContext_1.CompositionManager.Provider, { value: compositionManagerContextValue, children: (0, jsx_runtime_1.jsx)(CompositionManagerContext_1.CompositionManagerRefContext.Provider, { value: compositionManagerRef, children: (0, jsx_runtime_1.jsx)(CompositionManagerContext_1.CompositionSetters.Provider, { value: compositionManagerSetters, children: children }) }) }) }));
};
exports.CompositionManagerProvider = CompositionManagerProvider;
