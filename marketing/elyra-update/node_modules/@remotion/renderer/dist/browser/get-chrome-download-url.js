"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.logDownloadUrl = exports.canUseRemotionMediaBinaries = exports.isAmazonLinux2023 = exports.TESTED_VERSION = void 0;
exports.getChromeDownloadUrl = getChromeDownloadUrl;
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const logger_1 = require("../logger");
exports.TESTED_VERSION = '158.0.8127.2';
const isAmazonLinux2023 = () => {
    if (os.platform() !== 'linux') {
        return false;
    }
    try {
        const osRelease = fs.readFileSync('/etc/os-release', 'utf-8');
        return (osRelease.includes('Amazon Linux') && osRelease.includes('VERSION="2023"'));
    }
    catch (_a) {
        return false;
    }
};
exports.isAmazonLinux2023 = isAmazonLinux2023;
// remotion.media binaries are built on Ubuntu 24.04 which requires glibc 2.35+
const MINIMUM_GLIBC_FOR_REMOTION_MEDIA = [2, 35];
const getGlibcVersion = () => {
    if (process.platform !== 'linux') {
        return null;
    }
    const { report } = process;
    if (!report) {
        return null;
    }
    const rep = report.getReport();
    if (typeof rep === 'string') {
        return null;
    }
    // @ts-expect-error no types
    const { glibcVersionRuntime } = rep.header;
    if (!glibcVersionRuntime) {
        return null;
    }
    const split = glibcVersionRuntime.split('.');
    if (split.length !== 2) {
        return null;
    }
    return [Number(split[0]), Number(split[1])];
};
const isGlibcVersionAtLeast = (required) => {
    const version = getGlibcVersion();
    if (version === null) {
        // If we can't detect, assume it's not compatible to be safe
        return false;
    }
    const [major, minor] = version;
    const [reqMajor, reqMinor] = required;
    if (major > reqMajor) {
        return true;
    }
    if (major === reqMajor && minor >= reqMinor) {
        return true;
    }
    return false;
};
const canUseRemotionMediaBinaries = () => {
    if (process.platform !== 'linux') {
        // remotion.media binaries are only for Linux
        return false;
    }
    return isGlibcVersionAtLeast(MINIMUM_GLIBC_FOR_REMOTION_MEDIA);
};
exports.canUseRemotionMediaBinaries = canUseRemotionMediaBinaries;
function getChromeDownloadUrl({ platform, version, chromeMode, }) {
    // Preserve explicit Playwright revision overrides on Linux ARM64. Default
    // downloads and Chrome version overrides use Google's CDN on every platform.
    if (platform === 'linux-arm64' && version && /^\d+$/.test(version)) {
        const archive = chromeMode === 'chrome-for-testing'
            ? 'chromium-linux-arm64'
            : 'chromium-headless-shell-linux-arm64';
        return `https://playwright.azureedge.net/builds/chromium/${version}/${archive}.zip`;
    }
    if (chromeMode === 'headless-shell' && version === null) {
        if (platform === 'mac-arm64') {
            return `https://remotion.media/chromium-headless-shell-mac-arm64-${exports.TESTED_VERSION}.zip?clear`;
        }
        if (platform === 'win64') {
            return `https://remotion.media/chromium-headless-shell-win-x64-${exports.TESTED_VERSION}.zip?clear`;
        }
        if (platform === 'linux64' || platform === 'linux-arm64') {
            const architecture = platform === 'linux64' ? 'x64' : 'arm64';
            if ((0, exports.isAmazonLinux2023)()) {
                return `https://remotion.media/chromium-headless-shell-amazon-linux-${architecture}-${exports.TESTED_VERSION}.zip?clear`;
            }
            if ((0, exports.canUseRemotionMediaBinaries)()) {
                return `https://remotion.media/chromium-headless-shell-linux-${architecture}-${exports.TESTED_VERSION}.zip?clear`;
            }
        }
    }
    const archive = chromeMode === 'headless-shell' ? 'chrome-headless-shell' : 'chrome';
    return `https://storage.googleapis.com/chrome-for-testing-public/${version !== null && version !== void 0 ? version : exports.TESTED_VERSION}/${platform}/${archive}-${platform}.zip`;
}
const logDownloadUrl = ({ url, logLevel, indent, }) => {
    logger_1.Log.info({ indent, logLevel }, `Downloading from: ${url}`);
};
exports.logDownloadUrl = logDownloadUrl;
