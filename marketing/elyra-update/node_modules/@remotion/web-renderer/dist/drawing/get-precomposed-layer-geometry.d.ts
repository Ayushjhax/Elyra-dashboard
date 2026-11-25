export declare const getPrecomposedLayerGeometry: ({ precomposeRect, totalMatrix, parentRect, scale, is3DPrecomposition, }: {
    precomposeRect: DOMRect;
    totalMatrix: DOMMatrix;
    parentRect: DOMRect;
    scale: number;
    is3DPrecomposition: boolean;
}) => {
    rect: DOMRect;
    scale: number;
    pixelWidth: null;
    pixelHeight: null;
} | {
    rect: DOMRect;
    scale: number;
    pixelWidth: number;
    pixelHeight: number;
};
