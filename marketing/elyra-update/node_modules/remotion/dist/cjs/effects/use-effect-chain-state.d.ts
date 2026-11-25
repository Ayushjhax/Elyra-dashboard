import type { EffectsOutputSize } from './effect-types.js';
import type { EffectChainState } from './run-effect-chain.js';
export declare const useEffectChainState: (effectsOutputSize?: EffectsOutputSize | null) => {
    recoveryRevision: number;
    get: (width: number, height: number) => EffectChainState | null;
};
