"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSequenceFreezeFrameMenuItem = exports.calculateSequenceFreezeFrame = exports.isSequenceVisibleAtTimelinePosition = exports.shouldShowFreezeFrameMenuItem = void 0;
const save_sequence_prop_1 = require("./save-sequence-prop");
const shouldShowFreezeFrameMenuItem = (sequence) => {
    var _a, _b;
    return (sequence.type !== 'audio' &&
        ((_a = sequence.timelineTrack) === null || _a === void 0 ? void 0 : _a.role) !== 'track' &&
        ((_b = sequence.controls) === null || _b === void 0 ? void 0 : _b.componentIdentity) !== 'dev.remotion.remotion.Track');
};
exports.shouldShowFreezeFrameMenuItem = shouldShowFreezeFrameMenuItem;
const isSequenceVisibleAtTimelinePosition = ({ sequence, timelinePosition, }) => {
    return (timelinePosition >= sequence.from &&
        timelinePosition < sequence.from + sequence.duration);
};
exports.isSequenceVisibleAtTimelinePosition = isSequenceVisibleAtTimelinePosition;
const calculateSequenceFreezeFrame = ({ sequence, sequenceFrameOffset, timelinePosition, }) => {
    const rawFreezeFrame = (timelinePosition - sequence.from) * sequence.sequencePlaybackRate +
        sequenceFrameOffset;
    const minFrame = (Math.ceil(sequence.from) - sequence.from) * sequence.sequencePlaybackRate +
        sequenceFrameOffset;
    const maxFrame = Number.isFinite(sequence.duration)
        ? Math.max(minFrame, (Math.ceil(sequence.from + sequence.duration) - 1 - sequence.from) *
            sequence.sequencePlaybackRate +
            sequenceFrameOffset)
        : Infinity;
    return Math.min(Math.max(minFrame, rawFreezeFrame), maxFrame);
};
exports.calculateSequenceFreezeFrame = calculateSequenceFreezeFrame;
const getSequenceFreezeFrameMenuItem = ({ clientId, nodePath, propStatusesForOverride, sequence, sequenceFrameOffset, setPropStatuses, timelinePosition, validatedSource, }) => {
    const freezeStatus = propStatusesForOverride === null || propStatusesForOverride === void 0 ? void 0 : propStatusesForOverride.freeze;
    const isFrozen = (freezeStatus === null || freezeStatus === void 0 ? void 0 : freezeStatus.status) === 'static' &&
        typeof freezeStatus.codeValue === 'number';
    const canToggleFreeze = (0, exports.isSequenceVisibleAtTimelinePosition)({ sequence, timelinePosition }) &&
        clientId !== null &&
        Boolean(sequence.controls) &&
        nodePath !== null &&
        validatedSource !== null &&
        freezeStatus !== undefined &&
        freezeStatus !== null &&
        freezeStatus.status === 'static';
    const onToggleFreezeFrame = () => {
        if (!canToggleFreeze ||
            !sequence.controls ||
            nodePath === null ||
            validatedSource === null ||
            clientId === null) {
            return;
        }
        const freezeFrame = (0, exports.calculateSequenceFreezeFrame)({
            sequence,
            sequenceFrameOffset,
            timelinePosition,
        });
        const remove = isFrozen;
        (0, save_sequence_prop_1.saveSequenceProps)({
            addedKeyframes: null,
            movedKeyframes: null,
            changes: [
                {
                    fileName: validatedSource,
                    nodePath,
                    fieldKey: 'freeze',
                    value: remove ? undefined : freezeFrame,
                    defaultValue: null,
                    schema: sequence.controls.schema,
                },
            ],
            setPropStatuses,
            clientId,
            undoLabel: remove ? 'Unfreeze sequence' : 'Freeze sequence',
            redoLabel: remove ? 'Freeze sequence again' : 'Unfreeze sequence again',
        });
    };
    return (0, exports.shouldShowFreezeFrameMenuItem)(sequence)
        ? {
            type: 'item',
            id: 'toggle-freeze-frame',
            keyHint: null,
            label: isFrozen ? 'Unfreeze' : 'Freeze',
            leftItem: null,
            disabled: !canToggleFreeze,
            onClick: onToggleFreezeFrame,
            quickSwitcherLabel: null,
            subMenu: null,
            value: 'toggle-freeze-frame',
        }
        : null;
};
exports.getSequenceFreezeFrameMenuItem = getSequenceFreezeFrameMenuItem;
