import type { Caption } from './caption';
export type ParseVttInput = {
    input: string;
};
export type ParseVttOutput = {
    captions: Caption[];
};
export declare const parseVtt: ({ input }: ParseVttInput) => ParseVttOutput;
