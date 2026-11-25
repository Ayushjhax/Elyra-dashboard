export declare const TIMELINE_TRIM_LIMIT_REASONS: readonly ['Keyframe constraint', 'Computed keyframes', 'Computed value', 'Unknown media duration', 'Minimum duration', 'Transition limit', 'Source start', 'Source end', 'Parent edge', 'Composition edge', 'Adjacent clip', 'Content end', 'Trim limit'];
export type TimelineTrimLimitReason = (typeof TIMELINE_TRIM_LIMIT_REASONS)[number];
export declare const getVisibleTimelineTrimLimitReason: (reason: TimelineTrimLimitReason | null) => TimelineTrimLimitReason | null;
export declare const getTimelineTrimLimitReason: (value: number, candidates: readonly (readonly [number, TimelineTrimLimitReason | null])[]) => TimelineTrimLimitReason;
