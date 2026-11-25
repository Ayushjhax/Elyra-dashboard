export type WaveformVolume = number | readonly number[];
export type WaveformDrawRange = {
    readonly sourceStart: number;
    readonly sourceDuration: number;
    readonly displayStart: number;
    readonly displayDuration: number;
    readonly loop: boolean;
};
export declare const drawBars: ({ canvas, color, peaks, range, volume, width, horizontalOffset, }: {
    readonly canvas: HTMLCanvasElement | OffscreenCanvas;
    readonly peaks: Float32Array;
    readonly range: WaveformDrawRange;
    readonly color: string;
    readonly volume: WaveformVolume;
    readonly width: number;
    readonly horizontalOffset: number;
}) => void;
