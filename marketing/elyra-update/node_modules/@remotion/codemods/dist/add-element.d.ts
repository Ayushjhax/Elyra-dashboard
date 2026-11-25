import { CodemodElement } from './codemod-element';
import type { CodemodProject } from './codemod-project';
import type { CompositionTarget } from './composition-editing';
import { type CodemodInsertionResult, type NodeReference } from './node-references';
export type AddElementTarget = ({
    type: 'composition';
} & CompositionTarget) | {
    type: 'component';
    filePath: string;
    exportName: string | 'default';
} | {
    type: 'inside';
    node: NodeReference;
} | {
    type: 'before';
    node: NodeReference;
} | {
    type: 'after';
    node: NodeReference;
};
export type AddElementOptions<Project extends CodemodProject> = {
    project: Project;
    element: CodemodElement;
    target: AddElementTarget;
    prettierConfigOverride?: Record<string, unknown> | null;
};
export declare const addElement: <Project extends CodemodProject>({ project, element, target, prettierConfigOverride, }: AddElementOptions<Project>) => CodemodInsertionResult;
