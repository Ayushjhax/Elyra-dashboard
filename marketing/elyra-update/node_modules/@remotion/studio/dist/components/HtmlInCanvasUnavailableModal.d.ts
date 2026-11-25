import React from 'react';
import type { ModalState } from '../state/modals';
type State = Extract<ModalState, {
    type: 'html-in-canvas-unavailable';
}>;
export declare const HtmlInCanvasUnavailableModal: React.FC<{
    readonly state: State;
}>;
export {};
