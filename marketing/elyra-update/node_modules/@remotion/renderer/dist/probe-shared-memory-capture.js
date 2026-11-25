"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.probeSharedMemoryCapture = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const get_local_browser_executable_1 = require("./get-local-browser-executable");
const open_browser_1 = require("./open-browser");
const prespawn_ffmpeg_1 = require("./prespawn-ffmpeg");
const remotion_shared_memory_1 = require("./remotion-shared-memory");
const probes = new Map();
const probeSharedMemoryCapture = async ({ browserExecutable, chromeMode, chromiumOptions, binariesDirectory, logLevel, }) => {
    // Opening the render modal should not download a browser.
    let executablePath;
    let executableStat;
    try {
        executablePath = (0, get_local_browser_executable_1.getLocalBrowserExecutable)({
            preferredBrowserExecutable: browserExecutable,
            chromeMode,
            indent: false,
            logLevel,
        });
        executableStat = node_fs_1.default.statSync(executablePath);
    }
    catch (_a) {
        return false;
    }
    const key = JSON.stringify({
        executablePath,
        mtime: executableStat.mtimeMs,
        ctime: executableStat.ctimeMs,
        size: executableStat.size,
        chromeMode,
        chromiumOptions,
        binariesDirectory,
        backend: (0, remotion_shared_memory_1.getPreferredRemotionSharedMemoryBackend)(),
    });
    const cached = probes.get(key);
    if (cached) {
        return cached;
    }
    const probe = (async () => {
        const support = await (0, prespawn_ffmpeg_1.probeRemotionSharedMemoryFfmpegSupport)({
            binariesDirectory,
            indent: false,
            logLevel,
        });
        if (!support.sharedMemory) {
            return false;
        }
        const browser = await (0, open_browser_1.openBrowser)('chrome', {
            browserExecutable: executablePath,
            chromeMode,
            chromiumOptions: { ...chromiumOptions, headless: true },
            forceDeviceScaleFactor: 1,
            logLevel,
        });
        let backingDirectory = null;
        let capture = null;
        try {
            backingDirectory = support.filePools
                ? node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), 'remotion-shm-probe-'))
                : null;
            capture = new remotion_shared_memory_1.RemotionSharedMemoryCapture({
                width: 16,
                height: 16,
                indent: false,
                logLevel,
                backingDirectory,
            });
            const page = await browser.newPage({
                context: () => null,
                logLevel,
                indent: false,
                pageIndex: 0,
                onBrowserLog: null,
                onLog: () => undefined,
            });
            await capture.initializePages([page]);
            return capture.isSupported();
        }
        finally {
            try {
                await (capture === null || capture === void 0 ? void 0 : capture.dispose());
            }
            finally {
                try {
                    await browser.close({ silent: true });
                }
                finally {
                    if (backingDirectory !== null) {
                        node_fs_1.default.rmSync(backingDirectory, { recursive: true, force: true });
                    }
                }
            }
        }
    })();
    probes.set(key, probe);
    try {
        return await probe;
    }
    catch (_b) {
        // Keep the screenshot controls if probing fails, and retry next time.
        probes.delete(key);
        return false;
    }
};
exports.probeSharedMemoryCapture = probeSharedMemoryCapture;
