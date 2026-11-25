export type WaveformMaxima = readonly Float32Array[];
export declare const registerWaveformMaxima: (peaks: Float32Array, maxima: WaveformMaxima) => void;
export declare const getWaveformMaxima: (peaks: Float32Array, completedPeaks: number | null) => WaveformMaxima;
export declare const getWaveformMaximum: ({ peaks, maxima, from, to, }: {
    readonly peaks: Float32Array;
    readonly maxima: WaveformMaxima;
    readonly from: number;
    readonly to: number;
}) => number;
