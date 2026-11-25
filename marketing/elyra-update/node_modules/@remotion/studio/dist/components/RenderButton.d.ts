import React from 'react';
export type RenderType = 'server-render' | 'client-render' | 'render-command';
export declare const RenderButton: React.NamedExoticComponent<{
    readonly readOnlyStudio: boolean;
    readonly size?: 'default' | 'compact';
    readonly narrow?: boolean;
}>;
