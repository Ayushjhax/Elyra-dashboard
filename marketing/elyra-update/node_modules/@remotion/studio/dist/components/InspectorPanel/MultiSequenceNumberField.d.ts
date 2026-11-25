import React from 'react';
import type { SchemaFieldInfo, TimelineFieldOnDragEnd } from '../../helpers/timeline-layout';
export declare const MultiSequenceNumberField: React.FC<{
    readonly field: SchemaFieldInfo;
    readonly values: unknown[];
    readonly forceMixed: boolean;
    readonly inherited: boolean;
    readonly onPreview: (values: unknown[]) => void;
    readonly onSave: (values: unknown[]) => Promise<void>;
    readonly onClear: TimelineFieldOnDragEnd;
}>;
