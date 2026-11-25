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
exports.SequenceRegistryProvider = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importStar(require("react"));
const committed_metadata_js_1 = require("./committed-metadata.js");
const log_level_context_js_1 = require("./log-level-context.js");
const log_js_1 = require("./log.js");
const registry_store_js_1 = require("./registry-store.js");
const sequence_registry_context_js_1 = require("./sequence-registry-context.js");
const use_remotion_environment_js_1 = require("./use-remotion-environment.js");
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? react_1.default.useEffect : react_1.default.useLayoutEffect;
const SequenceManagerRefProvider = (0, committed_metadata_js_1.withCommittedMetadata)(sequence_registry_context_js_1.SequenceManagerRefContext.Provider);
const SequenceRegistryProvider = ({ children }) => {
    const { isStudio } = (0, use_remotion_environment_js_1.useRemotionEnvironment)();
    const logLevel = (0, log_level_context_js_1.useLogLevel)();
    const sequenceRegistrationEnabled = (0, react_1.useContext)(sequence_registry_context_js_1.SequenceRegistrationContext);
    const shouldObserveCommits = isStudio || sequenceRegistrationEnabled;
    const [sequenceManagerId] = (0, react_1.useState)(() => String(Math.random()));
    const [commitRegistrationEnabled, setCommitRegistrationEnabled] = (0, react_1.useState)(() => shouldObserveCommits && (0, committed_metadata_js_1.isCommitRegistrationObserverInstalled)());
    const observedCommitRef = (0, react_1.useRef)(false);
    const rootObservationFailedRef = (0, react_1.useRef)(false);
    const committedRegistrationIdsRef = (0, react_1.useRef)(new Set());
    const committedDescriptorsRef = (0, react_1.useRef)(new Map());
    const pendingCommittedSequencesRef = (0, react_1.useRef)(new Map());
    const committedScopesRef = (0, react_1.useRef)(new Map([
        [sequenceManagerId, { sequences: [], sequenceIds: [] }],
    ]));
    const registrationObserverFailedRef = (0, react_1.useRef)(false);
    const registrationUnmountedRef = (0, react_1.useRef)(false);
    const committedOrderRef = (0, react_1.useRef)(null);
    const committedOrderIdsRef = (0, react_1.useRef)(null);
    const [registry] = (0, react_1.useState)(() => (0, registry_store_js_1.createRegistryStore)([]));
    const setSequences = registry.setSnapshot;
    const sequencesRef = (0, react_1.useMemo)(() => ({
        get current() {
            return registry.getSnapshot();
        },
    }), [registry]);
    const onCommitSequences = (0, react_1.useCallback)((scopeId, snapshot, sequenceIds) => {
        var _a;
        if (registrationObserverFailedRef.current ||
            registrationUnmountedRef.current) {
            return;
        }
        const previousSnapshot = (_a = pendingCommittedSequencesRef.current.get(scopeId)) !== null && _a !== void 0 ? _a : committedScopesRef.current.get(scopeId);
        if ((previousSnapshot === null || previousSnapshot === void 0 ? void 0 : previousSnapshot.sequences) === snapshot &&
            previousSnapshot.sequenceIds === sequenceIds) {
            return;
        }
        const alreadyPending = pendingCommittedSequencesRef.current.size > 0;
        pendingCommittedSequencesRef.current.set(scopeId, {
            sequences: snapshot,
            sequenceIds,
        });
        if (alreadyPending) {
            return;
        }
        // Publish after React finishes committing, and coalesce successive snapshots.
        queueMicrotask(() => {
            const pending = pendingCommittedSequencesRef.current;
            pendingCommittedSequencesRef.current = new Map();
            if (pending.size === 0 ||
                registrationObserverFailedRef.current ||
                registrationUnmountedRef.current) {
                return;
            }
            const previousIds = committedRegistrationIdsRef.current;
            const previousDescriptors = committedDescriptorsRef.current;
            for (const [id, scope] of pending) {
                if (id !== sequenceManagerId && scope.sequenceIds.length === 0) {
                    committedScopesRef.current.delete(id);
                }
                else {
                    committedScopesRef.current.set(id, scope);
                }
            }
            // A forwarded renderer owns only its fragment. Publishing or removing it
            // must never replace the descriptors committed by the other roots.
            const scopes = [...committedScopesRef.current.values()];
            const sequences = scopes.flatMap((scope) => scope.sequences);
            const ids = scopes.flatMap((scope) => scope.sequenceIds);
            committedDescriptorsRef.current = new Map(sequences.map((sequence) => [sequence.id, sequence]));
            const nextIds = new Set(sequences.map((sequence) => sequence.id));
            const order = new Map(ids.map((id, index) => [id, index]));
            committedOrderIdsRef.current = ids;
            committedOrderRef.current = order;
            committedRegistrationIdsRef.current = nextIds;
            if (isStudio && logLevel === 'trace') {
                for (const sequence of sequences) {
                    if (!previousIds.has(sequence.id)) {
                        log_js_1.Log.trace({ logLevel, tag: null }, `[Sequence registration] Registered "${sequence.displayName}" (${sequence.id}) after commit`, sequence);
                    }
                }
            }
            setSequences((current) => (0, registry_store_js_1.reconcileRegistryEntries)({
                current,
                entries: sequences,
                previousDescriptors,
                previousKeys: previousIds,
                nextKeys: nextIds,
                getKey: (sequence) => sequence.id,
                order,
                orderProperty: 'timelineOrder',
            }));
        });
    }, [isStudio, logLevel, sequenceManagerId, setSequences]);
    const onCommitRootSequences = (0, react_1.useCallback)((sequences, sequenceIds) => {
        if (!rootObservationFailedRef.current) {
            observedCommitRef.current = true;
            onCommitSequences(sequenceManagerId, sequences, sequenceIds);
        }
    }, [onCommitSequences, sequenceManagerId]);
    const registryScope = (0, react_1.useMemo)(() => ({
        onCommitSequences,
        commitRegistrationRequested: shouldObserveCommits,
    }), [onCommitSequences, shouldObserveCommits]);
    useIsomorphicLayoutEffect(() => {
        if (!shouldObserveCommits) {
            return;
        }
        let unmounted = false;
        registrationUnmountedRef.current = false;
        const onRegistrationError = () => {
            if (registrationObserverFailedRef.current) {
                return;
            }
            registrationObserverFailedRef.current = true;
            pendingCommittedSequencesRef.current.clear();
            queueMicrotask(() => {
                if (registrationUnmountedRef.current) {
                    return;
                }
                const previousIds = committedRegistrationIdsRef.current;
                committedRegistrationIdsRef.current = new Set();
                committedScopesRef.current.clear();
                setSequences((current) => current.filter((sequence) => !previousIds.has(sequence.id)));
                setCommitRegistrationEnabled(false);
            });
        };
        const onCommitOrder = (event) => {
            const { detail } = event;
            const managerOrder = detail.sequenceManagers.find((item) => item.managerId === sequenceManagerId);
            if (!managerOrder) {
                return;
            }
            if (commitRegistrationEnabled) {
                return;
            }
            const previousOrder = committedOrderIdsRef.current;
            if (previousOrder === managerOrder.sequenceIds ||
                (previousOrder !== null &&
                    previousOrder.length === managerOrder.sequenceIds.length &&
                    previousOrder.every((sequenceId, index) => sequenceId === managerOrder.sequenceIds[index]))) {
                return;
            }
            const order = new Map(managerOrder.sequenceIds.map((sequenceId, index) => [
                sequenceId,
                index,
            ]));
            committedOrderIdsRef.current = managerOrder.sequenceIds;
            committedOrderRef.current = order;
            queueMicrotask(() => {
                if (unmounted) {
                    return;
                }
                setSequences((currentSequences) => {
                    let changed = false;
                    const nextSequences = currentSequences.map((sequence) => {
                        var _a;
                        const timelineOrder = (_a = order.get(sequence.id)) !== null && _a !== void 0 ? _a : null;
                        if (sequence.timelineOrder === timelineOrder) {
                            return sequence;
                        }
                        changed = true;
                        return { ...sequence, timelineOrder };
                    });
                    return changed ? nextSequences : currentSequences;
                });
            });
        };
        window.addEventListener(committed_metadata_js_1.COMMIT_ORDER_EVENT, onCommitOrder);
        window.addEventListener(committed_metadata_js_1.COMMIT_REGISTRATION_ERROR_EVENT, onRegistrationError);
        if (commitRegistrationEnabled) {
            // React invokes its commit hook after layout effects. Installation alone
            // does not prove this renderer connected to the hook during initialization.
            queueMicrotask(() => {
                if (unmounted ||
                    observedCommitRef.current ||
                    registrationObserverFailedRef.current) {
                    return;
                }
                rootObservationFailedRef.current = true;
                onCommitSequences(sequenceManagerId, [], []);
                setCommitRegistrationEnabled(false);
            });
        }
        return () => {
            unmounted = true;
            registrationUnmountedRef.current = true;
            // Effect replay must not discard a snapshot already collected by React.
            window.removeEventListener(committed_metadata_js_1.COMMIT_ORDER_EVENT, onCommitOrder);
            window.removeEventListener(committed_metadata_js_1.COMMIT_REGISTRATION_ERROR_EVENT, onRegistrationError);
        };
    }, [
        shouldObserveCommits,
        sequenceManagerId,
        setSequences,
        commitRegistrationEnabled,
        onCommitSequences,
    ]);
    const registerSequence = (0, react_1.useCallback)((seq) => {
        if (isStudio) {
            log_js_1.Log.trace({ logLevel, tag: null }, `[Sequence registration] Registered "${seq.displayName}" (${seq.id}) after commit`, seq);
        }
        setSequences((seqs) => {
            var _a;
            var _b;
            return [
                ...seqs,
                {
                    ...seq,
                    timelineOrder: (_b = (_a = committedOrderRef.current) === null || _a === void 0 ? void 0 : _a.get(seq.id)) !== null && _b !== void 0 ? _b : null,
                },
            ];
        });
    }, [isStudio, logLevel, setSequences]);
    const updateSequence = (0, react_1.useCallback)((seq) => {
        setSequences((seqs) => {
            var _a;
            var _b;
            const index = seqs.findIndex((item) => item.id === seq.id);
            if (index === -1) {
                return seqs;
            }
            const updatedSequence = {
                ...seq,
                timelineOrder: (_b = (_a = committedOrderRef.current) === null || _a === void 0 ? void 0 : _a.get(seq.id)) !== null && _b !== void 0 ? _b : null,
            };
            if ((0, registry_store_js_1.areRegistryEntriesEqual)(seqs[index], updatedSequence)) {
                return seqs;
            }
            const next = [...seqs];
            next[index] = updatedSequence;
            return next;
        });
    }, [setSequences]);
    const unregisterSequence = (0, react_1.useCallback)((seq) => {
        setSequences((seqs) => seqs.filter((s) => s.id !== seq));
    }, [setSequences]);
    const actions = (0, react_1.useMemo)(() => {
        return {
            registerSequence,
            updateSequence,
            unregisterSequence,
        };
    }, [registerSequence, unregisterSequence, updateSequence]);
    const metadata = (0, react_1.useMemo)(() => shouldObserveCommits
        ? {
            type: 'sequence-manager',
            id: sequenceManagerId,
            onCommit: commitRegistrationEnabled ? onCommitRootSequences : null,
        }
        : null, [
        commitRegistrationEnabled,
        onCommitRootSequences,
        sequenceManagerId,
        shouldObserveCommits,
    ]);
    return ((0, jsx_runtime_1.jsx)(SequenceManagerRefProvider, { value: sequencesRef, _remotionCommitMetadata: metadata, children: (0, jsx_runtime_1.jsx)(sequence_registry_context_js_1.SequenceRegistryScopeContext.Provider, { value: registryScope, children: (0, jsx_runtime_1.jsx)(sequence_registry_context_js_1.SequenceManagerActionsContext.Provider, { value: actions, children: (0, jsx_runtime_1.jsx)(sequence_registry_context_js_1.SequenceRegistryContext.Provider, { value: registry, children: (0, jsx_runtime_1.jsx)(sequence_registry_context_js_1.SequenceCommitRegistrationContext.Provider, { value: commitRegistrationEnabled, children: children }) }) }) }) }));
};
exports.SequenceRegistryProvider = SequenceRegistryProvider;
