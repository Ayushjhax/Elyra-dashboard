import type { CodemodProject } from './codemod-project';
import { type NodeReference } from './node-references';
export type EffectReference = NodeReference & {
    effectIndex: number;
};
export declare const getEffectSource: ({ project, node, }: {
    project: CodemodProject;
    node: NodeReference;
}) => {
    filePath: string;
    input: string;
    length: number;
};
export declare const groupEffects: <Effect extends NodeReference & {
    effectIndex: number | null;
}>({ project, effects, }: {
    project: CodemodProject;
    effects: Effect[];
}) => Map<string, Effect[]>;
