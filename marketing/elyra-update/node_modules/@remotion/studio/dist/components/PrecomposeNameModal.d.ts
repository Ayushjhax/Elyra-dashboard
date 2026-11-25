import React from 'react';
import type { ModalState } from '../state/modals';
type State = Extract<ModalState, {
    type: 'precompose-name';
}>;
export declare const PrecomposeNameModal: React.FC<{
    readonly state: State;
}>;
export {};
