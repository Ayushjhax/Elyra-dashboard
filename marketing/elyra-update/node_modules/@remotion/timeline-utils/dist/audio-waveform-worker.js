"use strict";
/// <reference lib="webworker" />
Object.defineProperty(exports, "__esModule", { value: true });
const load_waveform_peaks_1 = require("./audio-waveform/load-waveform-peaks");
const postPeaks = (data) => {
    // Structured cloning copies the array, so the decoder can keep
    // mutating its buffer while the main thread reads the snapshot.
    const payload = {
        type: 'peaks',
        ...data,
    };
    self.postMessage(payload);
};
const postError = (requestId, error) => {
    const message = error instanceof Error ? error.message : 'Failed to load waveform';
    const payload = {
        type: 'error',
        requestId,
        message,
    };
    self.postMessage(payload);
};
self.addEventListener('message', (event) => {
    const message = event.data;
    const controller = new AbortController();
    (0, load_waveform_peaks_1.loadWaveformPeaks)(message.src, controller.signal, {
        waveformSampleRate: message.waveformSampleRate,
        onProgress: ({ peaks, maxima, final }) => {
            if (!final) {
                postPeaks({
                    requestId: message.requestId,
                    peaks,
                    maxima,
                    final: false,
                    averageVolume: null,
                });
            }
        },
    })
        .then((result) => {
        postPeaks({ requestId: message.requestId, ...result, final: true });
    })
        .catch((error) => {
        postError(message.requestId, error);
    });
});
