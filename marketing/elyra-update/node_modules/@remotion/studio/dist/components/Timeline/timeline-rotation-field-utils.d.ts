import type { SchemaFieldInfo } from '../../helpers/timeline-layout';
export declare const formatTimelineRotationFieldValue: ({ decimalPlaces, fieldSchema, value, }: {
    readonly decimalPlaces: number;
    readonly fieldSchema: SchemaFieldInfo['fieldSchema'];
    readonly value: number | string;
}) => string;
