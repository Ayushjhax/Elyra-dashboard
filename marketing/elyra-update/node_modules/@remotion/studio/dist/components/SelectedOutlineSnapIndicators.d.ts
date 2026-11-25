import React from 'react';
import { type SelectedOutlineSnapPoint } from './selected-outline-snap';
export type UpdateSelectedOutlineSnapPoints = (snapPoints: readonly SelectedOutlineSnapPoint[]) => void;
export declare const SelectedOutlineSnapLines: React.FC<{
    readonly compositionHeight: number;
    readonly compositionWidth: number;
    readonly scale: number;
    readonly snapPoints: readonly SelectedOutlineSnapPoint[];
}>;
export declare const SelectedOutlineSnapIndicators: React.FC<{
    readonly compositionHeight: number;
    readonly compositionWidth: number;
    readonly scale: number;
    readonly updateSnapPointsRef: React.MutableRefObject<UpdateSelectedOutlineSnapPoints>;
}>;
