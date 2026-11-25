import type { ReactNode, RefObject } from 'react';
export declare const CanvasOverlayContext: import("react").Context<ReactNode>;
export declare const CanvasContentContext: import("react").Context<{
    readonly rootRef: RefObject<HTMLDivElement | null>;
    readonly scale: number;
} | null>;
