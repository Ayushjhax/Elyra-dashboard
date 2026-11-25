"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.snapCanvasPositionToDevicePixel = exports.getDevicePixelAlignedCanvasLayout = void 0;
const getDevicePixelAlignedCanvasLayout = ({ cssWidth, cssHeight, containerLeft, devicePixelRatio, }) => {
    const containerLeftInPixels = containerLeft * devicePixelRatio;
    const horizontalOffset = cssWidth === 0
        ? 0
        : containerLeftInPixels - Math.floor(containerLeftInPixels);
    return {
        height: Math.ceil(cssHeight * devicePixelRatio),
        horizontalOffset,
        width: Math.ceil(cssWidth * devicePixelRatio + horizontalOffset),
    };
};
exports.getDevicePixelAlignedCanvasLayout = getDevicePixelAlignedCanvasLayout;
const snapCanvasPositionToDevicePixel = ({ position, horizontalOffset, }) => {
    return Math.floor(position + horizontalOffset) - horizontalOffset;
};
exports.snapCanvasPositionToDevicePixel = snapCanvasPositionToDevicePixel;
