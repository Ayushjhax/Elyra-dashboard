import type { Caption } from './caption';
export type ParseSrtInput = {
    input: string;
    strict?: boolean;
};
export type ParseSrtOutput = {
    captions: Caption[];
};
export declare const parseSrt: ({ input, strict, }: ParseSrtInput) => ParseSrtOutput;
