import type { File, JSXElement, JSXFragment } from '@babel/types';
import type { FolderReference } from './composition-editing';
import type { SourceEdit } from './source-edits';
export declare const getCompositionIdFromJSXElement: (element: JSXFragment['children'][number], ast: File) => string | null;
export declare const getFolderNameFromJSXElement: (element: JSXFragment['children'][number], ast: File) => string | null;
export declare const findRegistrationRoot: ({ ast, folder, }: {
    ast: File;
    folder: FolderReference | null;
}) => JSXElement | JSXFragment;
export declare const getRegistrationInsertionSourceEdit: ({ input, ast, insertion, folder, }: {
    input: string;
    ast: File;
    insertion: JSXElement;
    folder: FolderReference | null;
}) => SourceEdit;
