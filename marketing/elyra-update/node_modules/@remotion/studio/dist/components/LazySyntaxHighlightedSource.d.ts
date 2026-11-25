import React from 'react';
type SourceComponent = React.FC<{
    readonly source: string;
}>;
export declare const loadSyntaxHighlightedSource: () => Promise<{
    default: SourceComponent;
}>;
export declare const LazySyntaxHighlightedSource: SourceComponent;
export {};
