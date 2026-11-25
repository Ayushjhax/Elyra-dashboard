import type { CanRenderIssue } from './can-render-types';
import type { WebRendererVideoCodec } from './mediabunny-mappings';
export declare const getEncodedDimensions: ({ width, height, scale, codec, }: {
    width: number;
    height: number;
    scale: number;
    codec: WebRendererVideoCodec | null;
}) => {
    width: number;
    height: number;
};
export declare const validateDimensions: (options: {
    width: number;
    height: number;
    codec: WebRendererVideoCodec;
}) => CanRenderIssue | null;
