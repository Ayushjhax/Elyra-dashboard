import type { TreeEntry } from './folder-editing';
import { type SourceEdit } from './source-edits';
export declare const getUnwrapFolderSourceEdit: ({ input, located, }: {
    input: string;
    located: TreeEntry;
}) => SourceEdit;
export declare const getMoveTreeItemSourceEdits: ({ input, source, target, position, }: {
    input: string;
    source: TreeEntry;
    target: TreeEntry | null;
    position: 'root' | 'folder' | 'before' | 'after';
}) => SourceEdit[];
