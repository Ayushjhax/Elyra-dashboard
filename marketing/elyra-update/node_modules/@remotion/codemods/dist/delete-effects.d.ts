import type { CodemodProject } from './codemod-project';
import { type EffectReference } from './effect-references';
export type DeleteEffectsOptions<Project extends CodemodProject> = {
    project: Project;
    effects: (EffectReference | (Omit<EffectReference, 'effectIndex'> & {
        effectIndex: null;
    }))[];
};
export declare const deleteEffects: <Project extends CodemodProject>({ project, effects, }: DeleteEffectsOptions<Project>) => Promise<{
    changes: import("./codemod-project").CodemodFileChange[];
    nodePathRemappings: import("./node-references").NodePathRemapping[];
    editDetails: {
        filePath: string;
        formatted: boolean;
        effectLabels: string[];
        logLines: number[];
    }[];
}>;
