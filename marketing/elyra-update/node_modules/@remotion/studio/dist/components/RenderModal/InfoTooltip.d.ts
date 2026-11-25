import React from 'react';
export declare const INFO_TOOLTIP_FONT_SIZE = 13;
export declare const InfoTooltip: React.FC<{
    readonly children: React.ReactNode;
    readonly arrowDirection: 'up' | 'down';
    readonly backgroundColor: string;
    readonly horizontalAlignment: 'left' | 'right';
}>;
