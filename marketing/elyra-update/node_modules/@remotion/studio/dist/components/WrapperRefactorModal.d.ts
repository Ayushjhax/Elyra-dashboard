import React from 'react';
import type { ModalState } from '../state/modals';
type State = Extract<ModalState, {
    type: 'wrap-refactor' | 'unwrap-refactor';
}>;
export declare const WrapperRefactorModal: React.FC<{
    readonly state: State;
}>;
export {};
