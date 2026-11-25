import type { CodemodProject } from './codemod-project';
import { type CompositionTarget, type CompositionMetadata } from './composition-editing';
import { type CodemodNodeResult, type NodeReference } from './node-references';
export type UpdateCompositionMetadataOptions<Project extends CodemodProject> = CompositionTarget & {
    project: Project;
    metadata: Partial<CompositionMetadata>;
};
export declare const updateCompositionMetadata: <Project extends CodemodProject>({ project, compositionFile, compositionId, metadata, }: UpdateCompositionMetadataOptions<Project>) => CodemodNodeResult & {
    updatedNode: NodeReference;
};
