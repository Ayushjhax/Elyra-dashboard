export declare const getDevicePixelAlignedCanvasLayout: ({ cssWidth, cssHeight, containerLeft, devicePixelRatio, }: {
    readonly cssWidth: number;
    readonly cssHeight: number;
    readonly containerLeft: number;
    readonly devicePixelRatio: number;
}) => {
    height: number;
    horizontalOffset: number;
    width: number;
};
export declare const snapCanvasPositionToDevicePixel: ({ position, horizontalOffset, }: {
    readonly position: number;
    readonly horizontalOffset: number;
}) => number;
