import type { ChangeEventHandler, RefObject } from 'react';
import React from 'react';
export declare const CompositionIdField: React.FC<{
    readonly compositionId: string;
    readonly inputRef: RefObject<HTMLInputElement | null>;
    readonly onChange: ChangeEventHandler<HTMLInputElement>;
    readonly validationMessage: string | null;
    readonly value: string;
}>;
