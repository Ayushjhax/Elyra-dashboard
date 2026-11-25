export declare const TIMELINE_TRIM_HANDLE_WIDTH = 8;
export declare const getTimelineTrimHandleLayout: ({ leftEdge, rightEdge, rolling, leftTrim, secondary, rightTrim, nextRolling, activeEdge, }: {
    readonly leftEdge: number;
    readonly rightEdge: number;
    readonly rolling: boolean;
    readonly leftTrim: boolean;
    readonly secondary: boolean;
    readonly rightTrim: boolean;
    readonly nextRolling: boolean;
    readonly activeEdge: 'left' | 'right' | 'source-only' | null;
}) => {
    rolling: number | null;
    leftTrim: number | null;
    secondary: number | null;
    rightTrim: number | null;
};
