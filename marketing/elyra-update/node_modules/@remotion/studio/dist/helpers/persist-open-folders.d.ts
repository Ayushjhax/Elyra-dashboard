import { type BooleanMap } from './persist-boolean-map';
export declare const openFolderKey: ({ folderName, parentName, }: {
    folderName: string;
    parentName: string | null;
}) => string;
export type ExpandedFoldersState = BooleanMap;
type PersistanceType = 'assets' | 'compositions';
export declare const persistExpandedFolders: (type: PersistanceType, state: ExpandedFoldersState) => void;
export declare const loadExpandedFolders: (type: PersistanceType) => ExpandedFoldersState;
export type ExpandedFoldersRef = {
    toggleFolder: (folderName: string, parentName: string | null) => void;
    foldersExpanded: ExpandedFoldersState;
    setFoldersExpanded: (foldersExpanded: ExpandedFoldersState) => void;
};
export declare const ExpandedFoldersContext: import("react").Context<ExpandedFoldersRef>;
export {};
