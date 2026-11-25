"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commitPendingInspectorFields = exports.registerCommitPendingInspectorField = exports.requestFocusInspectorField = exports.registerFocusInspectorFieldElement = void 0;
const serializeRegistryKey = ({ fieldKey, nodePath, }) => {
    return JSON.stringify({ fieldKey, nodePath });
};
const registeredFields = new Map();
const registeredCommitPendingCallbacks = new Map();
const registerFocusInspectorFieldElement = ({ element, fieldKey, nodePath, }) => {
    if (nodePath === null) {
        return;
    }
    const key = serializeRegistryKey({ fieldKey, nodePath });
    if (element === null) {
        registeredFields.delete(key);
        return;
    }
    registeredFields.set(key, element);
};
exports.registerFocusInspectorFieldElement = registerFocusInspectorFieldElement;
const requestFocusInspectorField = ({ fieldKey, nodePath, }) => {
    const element = registeredFields.get(serializeRegistryKey({ fieldKey, nodePath }));
    if (!element || !element.isConnected) {
        return false;
    }
    // Called after the Inspector has mounted the requested field.
    element.scrollIntoView({ block: 'center' });
    element.focus();
    element.select();
    return true;
};
exports.requestFocusInspectorField = requestFocusInspectorField;
const registerCommitPendingInspectorField = ({ commitPending, fieldKey, nodePath, }) => {
    if (nodePath === null) {
        return;
    }
    const key = serializeRegistryKey({ fieldKey, nodePath });
    if (commitPending === null) {
        registeredCommitPendingCallbacks.delete(key);
        return;
    }
    registeredCommitPendingCallbacks.set(key, commitPending);
};
exports.registerCommitPendingInspectorField = registerCommitPendingInspectorField;
const commitPendingInspectorFields = () => {
    let committed = false;
    for (const commitPending of registeredCommitPendingCallbacks.values()) {
        committed = commitPending() || committed;
    }
    return committed;
};
exports.commitPendingInspectorFields = commitPendingInspectorFields;
