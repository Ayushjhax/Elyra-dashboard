import React from 'react';
type ActivityCandidate = {
    readonly id: string;
    readonly parent: string | null;
    readonly compositionId: string;
    readonly from: number;
    readonly end: number;
};
export declare const SequenceActivityBudgetProvider: React.FC<{
    readonly children: React.ReactNode;
}>;
export declare const useSequenceActivityAdmission: (candidate: ActivityCandidate | null) => boolean;
export {};
