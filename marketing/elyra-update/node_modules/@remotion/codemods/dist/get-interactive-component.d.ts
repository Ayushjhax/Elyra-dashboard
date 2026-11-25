import type { File, Node } from '@babel/types';
export declare const getInteractiveComponent: ({ ast, declaration, }: {
    ast: File;
    declaration: Node;
}) => Node | null;
