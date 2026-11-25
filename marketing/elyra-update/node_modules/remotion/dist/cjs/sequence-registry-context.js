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
exports.DisableSequenceRegistrationProvider = exports.DisableSequenceRegistrationContext = exports.SequenceRegistrationContext = exports.SequenceManagerRefContext = exports.useSequenceManagerSequences = exports.SequenceRegistryScopeContext = exports.SequenceCommitRegistrationContext = exports.SequenceRegistryContext = exports.SequenceManagerActionsContext = void 0;
const react_1 = __importStar(require("react"));
const use_sync_external_store_js_1 = require("./use-sync-external-store.js");
const defaultSequenceManagerActions = {
    registerSequence: () => {
        throw new Error('SequenceManagerActionsContext not initialized');
    },
    updateSequence: () => {
        throw new Error('SequenceManagerActionsContext not initialized');
    },
    unregisterSequence: () => {
        throw new Error('SequenceManagerActionsContext not initialized');
    },
};
exports.SequenceManagerActionsContext = react_1.default.createContext(defaultSequenceManagerActions);
exports.SequenceRegistryContext = react_1.default.createContext(null);
const subscribeToNoRegistry = () => () => undefined;
const emptySequences = [];
const getEmptySequences = () => emptySequences;
exports.SequenceCommitRegistrationContext = react_1.default.createContext(false);
exports.SequenceRegistryScopeContext = react_1.default.createContext(null);
const useSequenceManagerSequences = () => {
    var _a, _b, _c;
    const registry = (0, react_1.useContext)(exports.SequenceRegistryContext);
    return (0, use_sync_external_store_js_1.useSyncExternalStore)((_a = registry === null || registry === void 0 ? void 0 : registry.subscribe) !== null && _a !== void 0 ? _a : subscribeToNoRegistry, (_b = registry === null || registry === void 0 ? void 0 : registry.getSnapshot) !== null && _b !== void 0 ? _b : getEmptySequences, (_c = registry === null || registry === void 0 ? void 0 : registry.getSnapshot) !== null && _c !== void 0 ? _c : getEmptySequences);
};
exports.useSequenceManagerSequences = useSequenceManagerSequences;
exports.SequenceManagerRefContext = react_1.default.createContext({
    current: [],
});
exports.SequenceRegistrationContext = react_1.default.createContext(false);
exports.DisableSequenceRegistrationContext = react_1.default.createContext(false);
const DisableSequenceRegistrationProvider = ({ children }) => {
    return react_1.default.createElement(exports.DisableSequenceRegistrationContext.Provider, { value: true }, children);
};
exports.DisableSequenceRegistrationProvider = DisableSequenceRegistrationProvider;
