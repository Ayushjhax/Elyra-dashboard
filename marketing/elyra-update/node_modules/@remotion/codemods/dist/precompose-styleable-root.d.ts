import type { File, JSXElement, JSXFragment } from '@babel/types';
export declare const getStyleablePrecompositionRoot: ({ ast, children, }: {
    ast: File;
    children: JSXFragment['children'];
}) => {
    element: JSXElement;
    handlesTiming: boolean;
} | null;
