"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.takeFrame = void 0;
const puppeteer_evaluate_1 = require("./puppeteer-evaluate");
const puppeteer_screenshot_1 = require("./puppeteer-screenshot");
const takeFrame = async ({ freePage, imageFormat, jpegQuality, width, height, output, scale, wantsBuffer, timeoutInMilliseconds, remotionSharedMemory, }) => {
    var _a, _b;
    if (imageFormat === 'none') {
        return null;
    }
    const captureImageFormat = (_a = remotionSharedMemory === null || remotionSharedMemory === void 0 ? void 0 : remotionSharedMemory.getImageFormat(imageFormat)) !== null && _a !== void 0 ? _a : imageFormat;
    if (captureImageFormat === 'png' ||
        captureImageFormat === 'pdf' ||
        captureImageFormat === 'webp') {
        await (0, puppeteer_evaluate_1.puppeteerEvaluateWithCatch)({
            pageFunction: () => {
                document.body.style.background = 'transparent';
            },
            args: [],
            frame: null,
            page: freePage,
            timeoutInMilliseconds,
        });
    }
    else {
        await (0, puppeteer_evaluate_1.puppeteerEvaluateWithCatch)({
            pageFunction: () => {
                document.body.style.background = 'black';
            },
            args: [],
            frame: null,
            page: freePage,
            timeoutInMilliseconds,
        });
    }
    const buf = await (0, puppeteer_screenshot_1.screenshot)({
        page: freePage,
        omitBackground: captureImageFormat === 'png' || captureImageFormat === 'webp',
        path: (_b = (wantsBuffer ? undefined : output)) !== null && _b !== void 0 ? _b : undefined,
        type: captureImageFormat,
        jpegQuality,
        width,
        height,
        scale,
        remotionSharedMemory,
    });
    return buf;
};
exports.takeFrame = takeFrame;
