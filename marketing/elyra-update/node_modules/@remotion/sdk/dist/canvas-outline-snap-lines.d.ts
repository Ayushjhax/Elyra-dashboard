import React from 'react';
import type { CanvasOutlineSnapPoint } from './outline-snap';
export declare const CanvasOutlineSnapLines: React.FC<{
    readonly compositionHeight: number;
    readonly compositionWidth: number;
    readonly scale: number;
    readonly snapPoints: readonly CanvasOutlineSnapPoint[];
    readonly color: string;
}>;
