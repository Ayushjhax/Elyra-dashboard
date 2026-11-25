import React from 'react';
export type LevelsValues = {
    blackPoint: number;
    whitePoint: number;
    gamma: number;
    outputBlack: number;
    outputWhite: number;
};
export type LevelsField = keyof LevelsValues;
export declare const LevelsControl: React.FC<{
    readonly values: LevelsValues;
    readonly editable: Record<LevelsField, boolean>;
    readonly onChange: (field: LevelsField, value: number, commit: boolean) => void;
    readonly onCancel: () => void;
    readonly histogram: React.ReactNode;
}>;
