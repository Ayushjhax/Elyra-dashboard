"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setScreenshotBackground = void 0;
const transparentBackgrounds = new WeakSet();
const setScreenshotBackground = async (page, omitBackground) => {
    if (transparentBackgrounds.has(page) === omitBackground) {
        return;
    }
    if (omitBackground) {
        await page._client().send('Emulation.setDefaultBackgroundColorOverride', {
            color: { r: 0, g: 0, b: 0, a: 0 },
        });
        transparentBackgrounds.add(page);
    }
    else {
        await page._client().send('Emulation.setDefaultBackgroundColorOverride');
        transparentBackgrounds.delete(page);
    }
};
exports.setScreenshotBackground = setScreenshotBackground;
