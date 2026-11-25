import type { EffectDefinitionAndStack } from './effect-types.js';
import type { EffectChainState } from './run-effect-chain.js';
type SourceListener = (source: CanvasImageSource | null) => void;
/** Studio-only inspection. The source is borrowed and must be consumed synchronously. */
export declare const subscribeToEffectSource: ({ sequenceKey, effectIndex, onSource, }: {
    readonly sequenceKey: string;
    readonly effectIndex: number;
    readonly onSource: SourceListener;
}) => (() => void);
export declare const publishEffectSource: (effect: EffectDefinitionAndStack<unknown>, source: CanvasImageSource, chain: EffectChainState) => void;
export declare const invalidateEffectChainSources: (chain: EffectChainState) => void;
export declare const useEffectSourceInspection: (effects: EffectDefinitionAndStack<unknown>[], sequenceKey: string | null) => EffectDefinitionAndStack<unknown>[];
export {};
