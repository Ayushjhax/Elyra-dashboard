import React from 'react';
type ActionTooltipProps = {
    readonly label: React.ReactNode;
    readonly shortcut: string | null;
    /** Hover delay in milliseconds. Pass null to show immediately. */
    readonly delay: number | null;
    readonly dismissOnClick: boolean;
    readonly side?: 'top' | 'right';
    readonly triggerStyle?: React.CSSProperties;
    readonly children: React.ReactNode;
};
export declare const ActionTooltip: React.FC<ActionTooltipProps>;
export declare const ClippedTextTooltip: React.FC<ActionTooltipProps & {
    readonly overflowTarget: React.RefObject<HTMLElement | null>;
}>;
export {};
