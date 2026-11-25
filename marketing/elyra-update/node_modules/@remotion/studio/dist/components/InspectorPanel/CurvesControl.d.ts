import React from 'react';
export type CurvePoints = readonly (readonly [number, number])[];
export declare const CurvesControl: React.FC<{
    readonly points: CurvePoints;
    readonly channel: 'rgb' | 'red' | 'green' | 'blue';
    readonly interpolation: 'smooth' | 'linear';
    readonly editable: boolean;
    readonly histogram: React.ReactNode;
    readonly onChange: (points: CurvePoints, commit: boolean) => void;
    readonly onCancel: () => void;
}>;
