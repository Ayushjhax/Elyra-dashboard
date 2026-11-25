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
exports.useSequenceActivityAdmission = exports.SequenceActivityBudgetProvider = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importStar(require("react"));
const registry_store_js_1 = require("./registry-store.js");
const sequence_activity_context_js_1 = require("./sequence-activity-context.js");
const TimelineContext_js_1 = require("./TimelineContext.js");
const use_sync_external_store_js_1 = require("./use-sync-external-store.js");
// Count nested dormant content too: one admitted scene must not be able to
// recursively mount another thousand expensive scenes behind its Activity.
const useCommitEffect = (_a = react_1.default.useInsertionEffect) !== null && _a !== void 0 ? _a : react_1.default.useLayoutEffect;
const createActivityBudget = () => {
    const registry = (0, registry_store_js_1.createRegistryStore)(new Set());
    const candidates = new Map();
    let frame = {};
    let limit = sequence_activity_context_js_1.DEFAULT_SEQUENCE_ACTIVITY_LIMIT;
    let scheduled = false;
    let suspended = false;
    const schedule = () => {
        if (scheduled || suspended) {
            return;
        }
        scheduled = true;
        // Insertion effects run in hidden Activities too. Publish only after the
        // whole commit, once all candidates and the root playhead are current.
        queueMicrotask(() => {
            scheduled = false;
            if (suspended) {
                return;
            }
            const ranked = [...candidates.values()]
                .filter((candidate) => candidate.end > candidate.from)
                .map((candidate) => {
                var _a;
                const currentFrame = (_a = frame[candidate.compositionId]) !== null && _a !== void 0 ? _a : 0;
                return {
                    candidate,
                    distance: Math.max(0, candidate.from - currentFrame, currentFrame - candidate.end),
                };
            })
                .sort((a, b) => a.distance - b.distance);
            const selected = new Set();
            for (const { candidate } of ranked) {
                const ancestors = [];
                let ancestor = candidate;
                while (ancestor && !selected.has(ancestor.id)) {
                    ancestors.push(ancestor.id);
                    if (selected.size + ancestors.length > limit) {
                        break;
                    }
                    ancestor =
                        ancestor.parent === null
                            ? undefined
                            : candidates.get(ancestor.parent);
                }
                if (selected.size + ancestors.length > limit) {
                    continue;
                }
                for (const id of ancestors) {
                    selected.add(id);
                }
                if (selected.size === limit) {
                    break;
                }
            }
            // Reserve nearby visible trees too, so becoming dormant retains their
            // state immediately. All other visible trees bypass admission. Reserved
            // IDs bound dormant content, including during a large seek.
            registry.setSnapshot((previous) => previous.size === selected.size &&
                [...previous].every((id) => selected.has(id))
                ? previous
                : selected);
        });
    };
    return {
        ...registry,
        setSuspended: (next) => {
            if (suspended !== next) {
                suspended = next;
                schedule();
            }
        },
        setLimit: (next) => {
            if (limit !== next) {
                limit = next;
                schedule();
            }
        },
        setFrame: (next) => {
            frame = next;
            schedule();
        },
        register: (candidate) => {
            candidates.set(candidate.id, candidate);
            schedule();
            return () => {
                candidates.delete(candidate.id);
                schedule();
            };
        },
    };
};
const ActivityBudgetContext = (0, react_1.createContext)(null);
const InactiveTimelineContext = (0, react_1.createContext)(null);
const emptySelection = new Set();
const ActivitySelectionContext = (0, react_1.createContext)(emptySelection);
const SequenceActivityBudgetProvider = ({ children }) => {
    var _a;
    const enabled = (0, react_1.useContext)(sequence_activity_context_js_1.SequenceActivityContext);
    const settings = (0, react_1.useContext)(sequence_activity_context_js_1.SequenceActivitySettingsContext);
    const suspended = (0, react_1.useContext)(sequence_activity_context_js_1.SequenceActivitySuspensionContext);
    const limit = (_a = settings === null || settings === void 0 ? void 0 : settings.limit) !== null && _a !== void 0 ? _a : sequence_activity_context_js_1.DEFAULT_SEQUENCE_ACTIVITY_LIMIT;
    const admitting = enabled && limit > 0 && limit !== Infinity;
    const [budget] = (0, react_1.useState)(createActivityBudget);
    const timeline = (0, react_1.useContext)(admitting && !suspended ? TimelineContext_js_1.TimelineContext : InactiveTimelineContext);
    const selected = (0, use_sync_external_store_js_1.useSyncExternalStore)(budget.subscribe, budget.getSnapshot, budget.getSnapshot);
    // Shrinking the setting must not keep the old, larger selection for a commit
    // while the budget schedules its new snapshot.
    const admitted = (0, react_1.useMemo)(() => !admitting
        ? emptySelection
        : selected.size > limit
            ? new Set([...selected].slice(0, limit))
            : selected, [admitting, limit, selected]);
    useCommitEffect(() => {
        // Retain the admitted trees while moving the playhead. Re-ranking would
        // unmount their suspended content and remove its timeline registrations.
        budget.setSuspended(suspended);
        budget.setLimit(admitting ? limit : 0);
        if (admitting && timeline !== null) {
            budget.setFrame(timeline.frame);
        }
    }, [admitting, budget, limit, suspended, timeline]);
    return ((0, jsx_runtime_1.jsx)(ActivityBudgetContext.Provider, { value: admitting ? budget : null, children: (0, jsx_runtime_1.jsx)(ActivitySelectionContext.Provider, { value: admitted, children: children }) }));
};
exports.SequenceActivityBudgetProvider = SequenceActivityBudgetProvider;
const useSequenceActivityAdmission = (candidate) => {
    var _a, _b, _c, _d, _e, _f;
    const budget = (0, react_1.useContext)(ActivityBudgetContext);
    const enabled = (0, react_1.useContext)(sequence_activity_context_js_1.SequenceActivityContext);
    const settings = (0, react_1.useContext)(sequence_activity_context_js_1.SequenceActivitySettingsContext);
    const unlimited = enabled &&
        ((_a = settings === null || settings === void 0 ? void 0 : settings.limit) !== null && _a !== void 0 ? _a : sequence_activity_context_js_1.DEFAULT_SEQUENCE_ACTIVITY_LIMIT) === Infinity;
    const selected = (0, react_1.useContext)(ActivitySelectionContext);
    const id = (_b = candidate === null || candidate === void 0 ? void 0 : candidate.id) !== null && _b !== void 0 ? _b : null;
    const parent = (_c = candidate === null || candidate === void 0 ? void 0 : candidate.parent) !== null && _c !== void 0 ? _c : null;
    const compositionId = (_d = candidate === null || candidate === void 0 ? void 0 : candidate.compositionId) !== null && _d !== void 0 ? _d : null;
    const from = (_e = candidate === null || candidate === void 0 ? void 0 : candidate.from) !== null && _e !== void 0 ? _e : null;
    const end = (_f = candidate === null || candidate === void 0 ? void 0 : candidate.end) !== null && _f !== void 0 ? _f : null;
    const committedCandidate = (0, react_1.useMemo)(() => id !== null && compositionId !== null && from !== null && end !== null
        ? { id, parent, compositionId, from, end }
        : null, [id, parent, compositionId, from, end]);
    useCommitEffect(() => {
        if (budget !== null && committedCandidate !== null) {
            return budget.register(committedCandidate);
        }
    }, [budget, committedCandidate]);
    // Unlimited discovery admits children on their first render, without waiting
    // for their registration and a subsequent budget publication.
    return id !== null && (unlimited || selected.has(id));
};
exports.useSequenceActivityAdmission = useSequenceActivityAdmission;
