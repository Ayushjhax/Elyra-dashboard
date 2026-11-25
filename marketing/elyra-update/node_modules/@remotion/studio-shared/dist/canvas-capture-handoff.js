"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.receiveCanvasCapture = exports.canvasCaptureChunkSize = exports.canvasCapturePortName = void 0;
exports.canvasCapturePortName = 'remotion-canvas-capture';
exports.canvasCaptureChunkSize = 1024 * 1024;
const receiveCanvasCapture = async ({ handoffWindow, signal, onCapture, }) => {
    var _a;
    const parameters = new URLSearchParams(handoffWindow.location.hash.slice(1));
    const captureId = parameters.get('canvas-capture');
    if (!captureId) {
        return;
    }
    const extensionId = parameters.get('canvas-capture-extension');
    const runtime = (_a = handoffWindow.chrome) === null || _a === void 0 ? void 0 : _a.runtime;
    if (!extensionId || !/^[a-p]{32}$/.test(extensionId) || !(runtime === null || runtime === void 0 ? void 0 : runtime.connect)) {
        throw new Error('The Canvas Capture extension is unavailable. Open the recording from the extension again.');
    }
    if (signal.aborted) {
        return;
    }
    const captureRuntime = runtime;
    const port = runtime.connect(extensionId, { name: exports.canvasCapturePortName });
    await new Promise((resolve, reject) => {
        let settled = false;
        let timeout = null;
        let metadata = null;
        const chunks = [];
        let awaitingCompletion = false;
        let cleanup = null;
        const finish = (error) => {
            if (settled) {
                return;
            }
            settled = true;
            if (timeout !== null) {
                clearTimeout(timeout);
            }
            cleanup === null || cleanup === void 0 ? void 0 : cleanup();
            port.disconnect();
            if (error) {
                reject(error);
            }
            else {
                resolve();
            }
        };
        const send = (message) => {
            if (timeout !== null) {
                clearTimeout(timeout);
            }
            timeout = setTimeout(() => {
                finish(new Error('Canvas Capture transfer timed out. Open the recording from the extension again.'));
            }, 30000);
            port.postMessage(message);
        };
        const acceptFile = async () => {
            if (!metadata || signal.aborted) {
                return;
            }
            const file = new File(chunks, metadata.filename, {
                type: metadata.mimeType,
            });
            await onCapture(file);
            if (!signal.aborted) {
                awaitingCompletion = true;
                send({ type: 'complete', captureId });
            }
        };
        const handleMessage = async (message) => {
            if (settled) {
                return;
            }
            if (timeout !== null) {
                clearTimeout(timeout);
                timeout = null;
            }
            if (typeof message !== 'object' ||
                message === null ||
                !('type' in message)) {
                throw new Error('Invalid Canvas Capture response.');
            }
            if (message.type === 'error' &&
                'message' in message &&
                typeof message.message === 'string') {
                throw new Error(message.message);
            }
            if (!('captureId' in message) || message.captureId !== captureId) {
                throw new Error('Canvas Capture transfer did not match the requested recording.');
            }
            if (message.type === 'start' &&
                metadata === null &&
                'filename' in message &&
                typeof message.filename === 'string' &&
                'mimeType' in message &&
                typeof message.mimeType === 'string' &&
                'size' in message &&
                typeof message.size === 'number' &&
                Number.isSafeInteger(message.size) &&
                message.size >= 0 &&
                'chunks' in message &&
                message.chunks === Math.ceil(message.size / exports.canvasCaptureChunkSize)) {
                metadata = message;
                if (metadata.chunks === 0) {
                    await acceptFile();
                }
                else {
                    send({ type: 'chunk', captureId, index: 0 });
                }
                return;
            }
            if (message.type === 'chunk' &&
                metadata &&
                !awaitingCompletion &&
                'index' in message &&
                message.index === chunks.length &&
                chunks.length < metadata.chunks &&
                'data' in message &&
                typeof message.data === 'string' &&
                message.data.length <= 4 * Math.ceil(exports.canvasCaptureChunkSize / 3)) {
                const binary = atob(message.data);
                const expectedSize = Math.min(exports.canvasCaptureChunkSize, metadata.size - chunks.length * exports.canvasCaptureChunkSize);
                if (binary.length !== expectedSize) {
                    throw new Error('Canvas Capture received an incomplete recording chunk.');
                }
                const buffer = new ArrayBuffer(binary.length);
                const bytes = new Uint8Array(buffer);
                for (let index = 0; index < binary.length; index++) {
                    bytes[index] = binary.charCodeAt(index);
                }
                chunks.push(buffer);
                if (chunks.length === metadata.chunks) {
                    await acceptFile();
                }
                else {
                    send({ type: 'chunk', captureId, index: chunks.length });
                }
                return;
            }
            if (message.type === 'complete' && awaitingCompletion) {
                const url = new URL(handoffWindow.location.href);
                const hash = new URLSearchParams(url.hash.slice(1));
                if (hash.get('canvas-capture') === captureId) {
                    hash.delete('canvas-capture');
                    hash.delete('canvas-capture-extension');
                    url.hash = hash.toString();
                    handoffWindow.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
                }
                finish(null);
                return;
            }
            throw new Error('Unexpected Canvas Capture response.');
        };
        function onMessage(message) {
            handleMessage(message).catch((error) => finish(error instanceof Error ? error : new Error(String(error))));
        }
        function onDisconnect() {
            var _a;
            var _b;
            finish(new Error((_b = (_a = captureRuntime.lastError) === null || _a === void 0 ? void 0 : _a.message) !== null && _b !== void 0 ? _b : 'Canvas Capture disconnected before the transfer completed. Open the recording from the extension again.'));
        }
        function onAbort() {
            finish(null);
        }
        cleanup = () => {
            port.onMessage.removeListener(onMessage);
            port.onDisconnect.removeListener(onDisconnect);
            signal.removeEventListener('abort', onAbort);
        };
        port.onMessage.addListener(onMessage);
        port.onDisconnect.addListener(onDisconnect);
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted) {
            onAbort();
        }
        else {
            send({ type: 'start', captureId });
        }
    });
};
exports.receiveCanvasCapture = receiveCanvasCapture;
