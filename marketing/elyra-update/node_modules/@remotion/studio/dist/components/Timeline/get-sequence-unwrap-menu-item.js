"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSequenceUnwrapMenuItem = void 0;
const NotificationCenter_1 = require("../Notifications/NotificationCenter");
const unwrap_sequence_from_source_1 = require("./unwrap-sequence-from-source");
const getSequenceUnwrapMenuItem = ({ canEditSource, compositionId, isTransition, nodePath, sequence, sourceLocation, setSelectedModal, }) => {
    if (!canEditSource ||
        compositionId === null ||
        isTransition ||
        nodePath === null ||
        sourceLocation === null ||
        sequence.type !== 'sequence') {
        return null;
    }
    return {
        type: 'item',
        id: 'unwrap-sequence',
        label: 'Unwrap',
        value: 'unwrap-sequence',
        keyHint: null,
        leftItem: null,
        quickSwitcherLabel: null,
        subMenu: null,
        disabled: false,
        onClick: () => {
            var _a;
            (0, unwrap_sequence_from_source_1.unwrapSequenceFromSource)({
                compositionId,
                displayName: sequence.displayName || ((_a = sequence.controls) === null || _a === void 0 ? void 0 : _a.componentName) || null,
                nodePath,
                sourceLocation,
                setSelectedModal,
            }).catch((error) => (0, NotificationCenter_1.showNotification)(error.message, 4000));
        },
    };
};
exports.getSequenceUnwrapMenuItem = getSequenceUnwrapMenuItem;
