import type { File } from '@babel/types';
import type { namedTypes } from 'ast-types';
import type { CodemodElement } from './codemod-element';
/**
 * Converts an element description into a Recast JSX element and adds the
 * imports it needs to the AST. The local names in the returned element account
 * for existing bindings, so aliases are used on conflicts.
 */
export declare const buildJsxElement: ({ ast, element, }: {
    ast: File;
    element: CodemodElement;
}) => namedTypes.JSXElement;
