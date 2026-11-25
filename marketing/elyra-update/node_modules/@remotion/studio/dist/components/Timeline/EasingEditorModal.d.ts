import React from 'react';
import type { SegmentedControlItem } from '../SegmentedControl';
import type { TimelineSelection } from './TimelineSelection';
import type { SelectedEasingUpdate, TimelineEasingValue } from './update-selected-easing';
export declare const EasingPresetPreview: React.FC<{
    readonly color: string;
    readonly easing: TimelineEasingValue;
    readonly height?: number;
    readonly nonScalingStroke?: boolean;
    readonly strokeWidth?: number;
    readonly width?: number;
}>;
export type EasingEditorState = {
    initialEasing: TimelineEasingValue;
    selections: TimelineSelection[];
};
export declare const EasingEditor: React.NamedExoticComponent<{
    readonly state: EasingEditorState;
    readonly easingUpdate: SelectedEasingUpdate;
    readonly renderHeader?: (modeItems: SegmentedControlItem[]) => React.ReactNode;
}>;
