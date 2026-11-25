import React from 'react';
export declare const QueueJobErrorModal: React.FC<{
    readonly title: string;
    readonly error: {
        message: string;
        stack: string | null;
    };
}>;
