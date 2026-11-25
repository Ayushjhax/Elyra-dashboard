export declare const canvasCapturePortName = "remotion-canvas-capture";
export declare const canvasCaptureChunkSize: number;
export type CanvasCaptureRequest = {
    type: 'start';
    captureId: string;
} | {
    type: 'chunk';
    captureId: string;
    index: number;
} | {
    type: 'complete';
    captureId: string;
};
export type CanvasCaptureResponse = {
    type: 'start';
    captureId: string;
    filename: string;
    mimeType: string;
    size: number;
    chunks: number;
} | {
    type: 'chunk';
    captureId: string;
    index: number;
    data: string;
} | {
    type: 'complete';
    captureId: string;
} | {
    type: 'error';
    message: string;
};
export declare const receiveCanvasCapture: ({ handoffWindow, signal, onCapture, }: {
    handoffWindow: Window;
    signal: AbortSignal;
    onCapture: (file: File) => void | Promise<void>;
}) => Promise<void>;
