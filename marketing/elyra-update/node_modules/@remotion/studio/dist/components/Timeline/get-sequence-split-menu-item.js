"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSequenceSplitMenuItem = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const pending_sequence_splits_1 = require("./pending-sequence-splits");
const split_selected_timeline_item_1 = require("./split-selected-timeline-item");
const getSequenceSplitMenuItem = ({ nodePathInfo, sequence, propStatuses, splitFrame, keyframeDisplayOffset, keyframePlaybackRate, canEditSource, hasMultipleSelection, }) => {
    if (hasMultipleSelection) {
        return null;
    }
    const eligibility = nodePathInfo
        ? (0, split_selected_timeline_item_1.getTimelineSequenceSplitEligibility)({
            selection: { type: 'sequence', nodePathInfo },
            sequence,
            propStatuses,
            splitFrame,
        })
        : {
            canSplit: false,
            reason: 'Sequence has no editable source node',
        };
    const isSplitting = nodePathInfo !== null && (0, pending_sequence_splits_1.isSequenceSplitPending)(nodePathInfo);
    const disabledReason = isSplitting
        ? 'Splitting…'
        : !canEditSource
            ? 'Sequence source is unavailable'
            : propStatuses === undefined
                ? 'Waiting for sequence prop status'
                : eligibility.canSplit
                    ? null
                    : eligibility.reason;
    return {
        type: 'item',
        id: 'split-sequence',
        label: ((0, jsx_runtime_1.jsx)("span", { role: "group", style: {
                fontFamily: 'inherit',
                fontSize: 'inherit',
                lineHeight: 'inherit',
                color: 'inherit',
            }, "aria-label": disabledReason !== null && disabledReason !== void 0 ? disabledReason : 'Split at the playhead', children: isSplitting ? 'Splitting…' : 'Split' })),
        value: 'split-sequence',
        keyHint: null,
        leftItem: null,
        quickSwitcherLabel: null,
        subMenu: null,
        disabled: disabledReason !== null,
        onClick: () => {
            if (disabledReason !== null ||
                !eligibility.canSplit ||
                (0, pending_sequence_splits_1.isSequenceSplitPending)(eligibility.nodePathInfo)) {
                return;
            }
            // Keep the frame used to enable the menu item, even during playback.
            (0, split_selected_timeline_item_1.splitTimelineSequenceFromSource)({
                nodePathInfo: eligibility.nodePathInfo,
                expectedDuration: splitFrame - sequence.from,
                splitFrame: (0, split_selected_timeline_item_1.getSequenceSourceSplitFrame)({
                    timelineFrame: splitFrame,
                    keyframeDisplayOffset,
                    keyframePlaybackRate,
                }),
            }).catch(() => undefined);
        },
    };
};
exports.getSequenceSplitMenuItem = getSequenceSplitMenuItem;
