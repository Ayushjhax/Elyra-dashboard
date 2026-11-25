import React from 'react';
import { type TimelineTrimLimitReason } from './timeline-trim-limit-reason';
export type TimelineTrimTooltipState = {
    readonly deltaFrames: number;
    readonly edgeFrame: number;
    readonly x: number;
    readonly y: number;
    readonly limitReason: TimelineTrimLimitReason | null;
};
export declare const TimelineTrimTooltip: React.FC<{
    readonly state: TimelineTrimTooltipState;
    readonly fps: number;
    readonly showSourceLimits: boolean;
}>;
