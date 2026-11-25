import type { File } from '@babel/types';
export declare const isPureMathMethod: (name: string) => boolean;
export declare const isPureMathConstant: (name: string) => boolean;
type PureTopLevelFunctionsOptions = {
    ast: File;
    remotionImports: Map<string, string>;
    stablePrimitiveNames: Set<string>;
};
export declare const getPureTopLevelFunctionAnalysis: ({ ast, remotionImports, stablePrimitiveNames, }: PureTopLevelFunctionsOptions) => {
    pureFunctionNames: Set<string>;
    primitiveFunctionNames: Set<string>;
};
export {};
