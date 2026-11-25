export type CompositionMetadataField = 'durationInFrames' | 'fps' | 'height' | 'width';
export type PendingCompositionMetadataValue = {
    readonly baseline: object;
    readonly status: 'saving' | 'awaiting-hmr';
    readonly value: number;
};
export type PendingCompositionMetadata = Partial<Record<CompositionMetadataField, PendingCompositionMetadataValue>>;
export declare const failPendingCompositionMetadataValue: ({ field, pending, value, }: {
    readonly field: CompositionMetadataField;
    readonly pending: PendingCompositionMetadata;
    readonly value: PendingCompositionMetadataValue;
}) => PendingCompositionMetadata;
export declare const acceptPendingCompositionMetadataValue: ({ currentConfig, field, pending, value, }: {
    readonly currentConfig: object;
    readonly field: CompositionMetadataField;
    readonly pending: PendingCompositionMetadata;
    readonly value: PendingCompositionMetadataValue;
}) => PendingCompositionMetadata;
export declare const reconcilePendingCompositionMetadata: ({ currentConfig, pending, }: {
    readonly currentConfig: object;
    readonly pending: PendingCompositionMetadata;
}) => PendingCompositionMetadata;
