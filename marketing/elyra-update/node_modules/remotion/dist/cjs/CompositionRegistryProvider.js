"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompositionRegistryProvider = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const committed_metadata_js_1 = require("./committed-metadata.js");
const composition_registry_fallback_js_1 = require("./composition-registry-fallback.js");
const use_remotion_environment_js_1 = require("./use-remotion-environment.js");
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? react_1.useEffect : react_1.useLayoutEffect;
const CompositionRegistryFallbackProvider = (0, committed_metadata_js_1.withCommittedMetadata)(composition_registry_fallback_js_1.CompositionRegistryFallbackContext.Provider);
// Every consumer receives a complete committed snapshot. The fallback changes
// how descriptors are captured, rather than exposing a second registration API.
exports.CompositionRegistryProvider = (0, react_1.forwardRef)(({ children, onSnapshot }, flushSnapshotRef) => {
    const { isStudio } = (0, use_remotion_environment_js_1.useRemotionEnvironment)();
    const [managerId] = (0, react_1.useState)(() => String(Math.random()));
    const [useCommitObserver, setUseCommitObserver] = (0, react_1.useState)(() => isStudio && (0, committed_metadata_js_1.isCommitRegistrationObserverInstalled)());
    const observedCommitRef = (0, react_1.useRef)(false);
    const observerFailedRef = (0, react_1.useRef)(false);
    const unmountedRef = (0, react_1.useRef)(false);
    const onSnapshotRef = (0, react_1.useRef)(onSnapshot);
    const lastSnapshotRef = (0, react_1.useRef)(null);
    const pendingSnapshotRef = (0, react_1.useRef)(null);
    const flushSnapshot = (0, react_1.useCallback)(() => {
        const pending = pendingSnapshotRef.current;
        pendingSnapshotRef.current = null;
        if (pending === null || unmountedRef.current) {
            return;
        }
        const committed = typeof pending === 'function' ? pending() : pending;
        const previous = lastSnapshotRef.current;
        if (previous !== null &&
            (previous.compositions === committed.compositions ||
                (previous.compositions.length === committed.compositions.length &&
                    previous.compositions.every((composition, index) => composition === committed.compositions[index]))) &&
            (previous.folders === committed.folders ||
                (previous.folders.length === committed.folders.length &&
                    previous.folders.every((folder, index) => folder === committed.folders[index]))) &&
            (previous.orderIds === committed.orderIds ||
                (previous.orderIds.length === committed.orderIds.length &&
                    previous.orderIds.every((id, index) => id === committed.orderIds[index])))) {
            return;
        }
        lastSnapshotRef.current = committed;
        onSnapshotRef.current(committed);
    }, []);
    (0, react_1.useImperativeHandle)(flushSnapshotRef, () => flushSnapshot, [flushSnapshot]);
    const queueSnapshot = (0, react_1.useCallback)((snapshot) => {
        const alreadyPending = pendingSnapshotRef.current !== null;
        pendingSnapshotRef.current = snapshot;
        if (alreadyPending) {
            return;
        }
        queueMicrotask(flushSnapshot);
    }, [flushSnapshot]);
    const onObservedSnapshot = (0, react_1.useCallback)((snapshot) => {
        if (observerFailedRef.current) {
            return;
        }
        observedCommitRef.current = true;
        queueSnapshot(snapshot);
    }, [queueSnapshot]);
    const fallbackRegistry = (0, react_1.useMemo)(() => {
        const entries = new Map();
        const getSnapshot = () => {
            const compositions = [];
            const folders = [];
            const orderIds = [];
            for (const entry of entries.values()) {
                if (entry.type === 'composition') {
                    compositions.push(entry.value);
                    orderIds.push((0, committed_metadata_js_1.getCompositionAndFolderOrderKey)({
                        type: 'composition',
                        id: entry.value.id,
                    }));
                }
                else {
                    folders.push(entry.value);
                    orderIds.push((0, committed_metadata_js_1.getCompositionAndFolderOrderKey)({
                        type: 'folder',
                        id: (0, committed_metadata_js_1.getFolderOrderId)(entry.value),
                    }));
                }
            }
            return { compositions, folders, orderIds };
        };
        return { entries, notifyCommit: () => queueSnapshot(getSnapshot) };
    }, [queueSnapshot]);
    useIsomorphicLayoutEffect(() => {
        if (onSnapshotRef.current !== onSnapshot) {
            const previous = lastSnapshotRef.current;
            lastSnapshotRef.current = null;
            if (useCommitObserver && previous !== null) {
                queueSnapshot(previous);
            }
        }
        onSnapshotRef.current = onSnapshot;
        if (!useCommitObserver) {
            fallbackRegistry.notifyCommit();
        }
    }, [fallbackRegistry, onSnapshot, queueSnapshot, useCommitObserver]);
    useIsomorphicLayoutEffect(() => {
        unmountedRef.current = false;
        let unmounted = false;
        const onRegistrationError = () => {
            if (observerFailedRef.current) {
                return;
            }
            observerFailedRef.current = true;
            pendingSnapshotRef.current = null;
            queueMicrotask(() => {
                if (!unmountedRef.current) {
                    setUseCommitObserver(false);
                }
            });
        };
        if (isStudio) {
            window.addEventListener(committed_metadata_js_1.COMMIT_REGISTRATION_ERROR_EVENT, onRegistrationError);
            if (useCommitObserver) {
                queueMicrotask(() => {
                    if (!unmounted && !observedCommitRef.current) {
                        onRegistrationError();
                    }
                });
            }
        }
        return () => {
            unmounted = true;
            unmountedRef.current = true;
            if (isStudio) {
                window.removeEventListener(committed_metadata_js_1.COMMIT_REGISTRATION_ERROR_EVENT, onRegistrationError);
            }
        };
    }, [isStudio, useCommitObserver]);
    const metadata = (0, react_1.useMemo)(() => isStudio
        ? {
            type: 'composition-manager',
            id: managerId,
            onCommit: useCommitObserver ? onObservedSnapshot : null,
        }
        : null, [isStudio, managerId, onObservedSnapshot, useCommitObserver]);
    return ((0, jsx_runtime_1.jsx)(CompositionRegistryFallbackProvider, { value: useCommitObserver ? null : fallbackRegistry, _remotionCommitMetadata: metadata, children: children }));
});
