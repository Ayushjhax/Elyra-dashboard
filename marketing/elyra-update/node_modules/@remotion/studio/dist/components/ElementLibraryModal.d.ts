import React from 'react';
import { type ElementInstallModalState } from '../state/modals';
export declare const ElementLibraryModal: React.FC<{
    readonly name: string;
    readonly url: string;
    readonly installState: ElementInstallModalState | null;
}>;
