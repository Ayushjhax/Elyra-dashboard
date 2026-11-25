import type { InteractivitySchemaField } from '../interactivity-schema.js';
import type { EffectDefinition, EffectFactory, EffectImplementation, MultiBackendEffectDefinition } from './effect-types.js';
export declare const disabledEffectField: InteractivitySchemaField;
export declare const createEffectImplementation: <P, S>(implementation: EffectImplementation<P, S>) => EffectImplementation<P, unknown>;
export declare const createEffect: <P, S = unknown>(input: EffectDefinition<P, S> | MultiBackendEffectDefinition<P>) => EffectFactory<P>;
