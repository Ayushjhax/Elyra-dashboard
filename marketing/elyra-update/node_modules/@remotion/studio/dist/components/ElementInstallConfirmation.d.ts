import React from 'react';
import type { ElementInstallModalState } from '../state/modals';
export declare const ElementLibraryAddConfirmation: React.FC<{
    readonly origin: string;
    readonly url: string;
    readonly captionStylesUrl: string | null;
}>;
export declare const ElementInstallConfirmation: React.FC<{
    readonly state: ElementInstallModalState;
}>;
