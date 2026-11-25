import type { AbsoluteInstruction, QInstruction, ReducedInstruction } from './types';
export declare const iterateOverSegments: <T extends ReducedInstruction | QInstruction>({ segments, iterate, }: {
    segments: (AbsoluteInstruction | QInstruction)[];
    iterate: (options: {
        segment: AbsoluteInstruction | QInstruction;
        prevSegment: (AbsoluteInstruction | QInstruction) | null;
        x: number;
        y: number;
        initialX: number;
        initialY: number;
        cpX: number | null;
        cpY: number | null;
    }) => T[];
}) => T[];
