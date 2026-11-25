import React from 'react';
import type { SchemaFieldInfo, TimelineFieldOnDragEnd, TimelineFieldOnDragValueChange, TimelineFieldOnSave } from '../../helpers/timeline-layout';
export declare const TimelineArrayField: React.FC<{
    readonly field: SchemaFieldInfo;
    readonly effectiveValue: unknown;
    readonly onSave: TimelineFieldOnSave;
    readonly onDragValueChange: TimelineFieldOnDragValueChange;
    readonly onDragEnd: TimelineFieldOnDragEnd;
}>;
