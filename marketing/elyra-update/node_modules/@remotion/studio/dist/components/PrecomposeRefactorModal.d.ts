import React from 'react';
import type { ModalState } from '../state/modals';
type State = Extract<ModalState, {
    type: 'precompose-refactor';
}>;
export declare const PrecomposeRefactorModal: React.FC<{
    readonly state: State;
}>;
export {};
