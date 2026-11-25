import React from 'react';
import type { EffectDefinitionAndStack, EffectsOutputSize } from '../effects/effect-types.js';
import type { AnimatedImageFillMode } from './props';
export type AnimatedImageCanvasRef = {
    readonly draw: (imageData: VideoFrame) => Promise<boolean>;
    readonly getCanvas: () => HTMLCanvasElement | null;
    clear: () => void;
};
export declare const Canvas: React.ForwardRefExoticComponent<{
    readonly width?: number;
    readonly height?: number;
    readonly fit: AnimatedImageFillMode;
    readonly className?: string;
    readonly style?: React.CSSProperties;
    readonly effects: EffectDefinitionAndStack<unknown>[];
    readonly effectsOutputSize: EffectsOutputSize | null;
} & React.AriaAttributes & Record<`data-${string}`, string | undefined> & React.RefAttributes<AnimatedImageCanvasRef>>;
