import type { File, Node } from '@babel/types';
import * as recast from 'recast';
import type { VideoConfigIdentifierValues } from './sequence-props/video-config-values';
type SourceSnapshot = {
    ast: File;
    videoConfigIdentifierValues: VideoConfigIdentifierValues | null;
};
export declare const getReadOnlySourceSnapshot: (input: string) => SourceSnapshot;
export declare const getReadOnlySourceNodePath: (ast: File, node: Node) => recast.types.NodePath | null | undefined;
export declare const takeSourceSnapshotForEdit: (input: string) => File;
export {};
