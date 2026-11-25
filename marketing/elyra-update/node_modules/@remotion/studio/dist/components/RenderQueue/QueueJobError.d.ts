import React from 'react';
export declare const QueueJobError: React.FC<{
    readonly error: {
        message: string;
        stack: string | undefined;
    };
    readonly modalTitle: string;
}>;
