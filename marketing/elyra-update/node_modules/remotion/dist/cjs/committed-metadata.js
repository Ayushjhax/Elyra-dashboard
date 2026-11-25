"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommittedMetadataInternals = exports.CommittedMetadataProvider = exports.withCommittedMetadata = exports.getFolderOrderId = exports.getCompositionAndFolderOrderKey = exports.isCommitRegistrationObserverInstalled = exports.COMMIT_REGISTRATION_ERROR_EVENT = exports.COMMIT_ORDER_EVENT = void 0;
const react_1 = require("react");
const COMMITTED_METADATA_PROP = '_remotionCommitMetadata';
exports.COMMIT_ORDER_EVENT = 'remotion:commit-order';
exports.COMMIT_REGISTRATION_ERROR_EVENT = 'remotion:commit-registration-error';
const COMMIT_OBSERVER_INSTALLATION_MARKER = Symbol.for('remotion.commit-order-observer-installed');
const COMMIT_OBSERVER_FAILURE_MARKER = Symbol.for('remotion.commit-registration-observer-failed');
const isCommitRegistrationObserverInstalled = () => {
    if (typeof window === 'undefined') {
        return false;
    }
    const hook = Reflect.get(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__');
    return (typeof hook === 'object' &&
        hook !== null &&
        Reflect.get(hook, 'isDisabled') !== true &&
        Reflect.get(hook, COMMIT_OBSERVER_INSTALLATION_MARKER) === true &&
        Reflect.get(hook, COMMIT_OBSERVER_FAILURE_MARKER) !== true);
};
exports.isCommitRegistrationObserverInstalled = isCommitRegistrationObserverInstalled;
const getCompositionAndFolderOrderKey = (item) => `${item.type}:${item.id}`;
exports.getCompositionAndFolderOrderKey = getCompositionAndFolderOrderKey;
const getFolderOrderId = ({ name, parent, }) => [parent, name].filter(Boolean).join('/');
exports.getFolderOrderId = getFolderOrderId;
// This is the same provider, with an additional private prop type. Metadata
// stays outside its context value, so edits do not notify context consumers.
const withCommittedMetadata = (provider) => provider;
exports.withCommittedMetadata = withCommittedMetadata;
// Leaves without an existing provider still need a committed Fiber when their
// content is null. Its constant context value never carries registry metadata.
exports.CommittedMetadataProvider = (0, exports.withCommittedMetadata)((0, react_1.createContext)(null).Provider);
exports.CommittedMetadataInternals = {
    metadataProp: COMMITTED_METADATA_PROP,
    eventName: exports.COMMIT_ORDER_EVENT,
    installationMarker: COMMIT_OBSERVER_INSTALLATION_MARKER,
    failureMarker: COMMIT_OBSERVER_FAILURE_MARKER,
    registrationErrorEventName: exports.COMMIT_REGISTRATION_ERROR_EVENT,
};
