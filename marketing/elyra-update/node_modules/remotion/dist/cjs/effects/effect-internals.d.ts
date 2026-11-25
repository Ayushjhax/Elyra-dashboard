import type { Backend, EffectDefinitionAndStack } from './effect-types.js';
export type Run<T = EffectDefinitionAndStack<unknown>> = {
    readonly backend: Backend;
    readonly effects: T[];
};
export declare const groupByBackend: <T extends {
    definition: {
        backend: Backend;
    };
}>(effects: T[]) => Run<T>[];
