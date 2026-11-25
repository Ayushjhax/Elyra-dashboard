import type { TimelineContextValue } from './TimelineContext.js';
export { DEFAULT_SEQUENCE_ACTIVITY_LIMIT } from './sequence-activity-defaults.js';
export declare const SequenceActivityContext: import("react").Context<boolean>;
export declare const SequenceActivityDormantContext: import("react").Context<boolean>;
export declare const SequenceActivitySuspensionContext: import("react").Context<boolean>;
export declare const SequenceActivitySettingsContext: import("react").Context<{
    readonly limit: number;
} | null>;
export declare const SequenceActivityTimelineContext: import("react").Context<TimelineContextValue | null>;
export declare const SequenceActivityAbsoluteTimeContext: import("react").Context<TimelineContextValue | null>;
export declare const SequenceContent: React.FC<{
    readonly children: React.ReactNode;
}>;
