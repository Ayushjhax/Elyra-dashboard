"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRulerScaleRange = exports.getRulerPoints = exports.drawMarkingOnRulerCanvas = void 0;
const editor_rulers_1 = require("../state/editor-rulers");
const colors_1 = require("./colors");
const resolve_studio_color_1 = require("./resolve-studio-color");
const studio_pixel_ratio_1 = require("./studio-pixel-ratio");
const drawLabel = ({ orientation, context, label, originDistance, color, }) => {
    context.fillStyle = color;
    if (orientation === 'horizontal') {
        context.fillText(label, originDistance + 4, 16);
    }
    else {
        context.rotate(-Math.PI / 2);
        context.fillText(label, -originDistance + 4, 16);
        context.rotate(Math.PI / 2);
    }
};
const drawGradient = ({ orientation, context, computedStyle, originDistance, canvasHeight, canvasWidth, }) => {
    const size = 250;
    const startX = orientation === 'horizontal' ? originDistance - size / 2 : 0;
    const startY = orientation === 'horizontal' ? 0 : originDistance - size / 2;
    const endX = orientation === 'horizontal' ? originDistance + size / 2 : canvasWidth;
    const endY = orientation === 'horizontal' ? canvasHeight : originDistance + size / 2;
    const grd = context.createLinearGradient(startX, startY, endX, endY);
    const background = (0, resolve_studio_color_1.resolveStudioColor)(colors_1.BACKGROUND, computedStyle);
    const transparentBackground = (0, resolve_studio_color_1.resolveStudioColor)(colors_1.BACKGROUND__TRANSPARENT, computedStyle);
    grd.addColorStop(0, transparentBackground);
    grd.addColorStop(0.25, background);
    grd.addColorStop(0.75, background);
    grd.addColorStop(1, transparentBackground);
    context.fillStyle = grd;
    context.fillRect(startX, startY, endX - startX, endY - startY);
};
const drawGuide = ({ guideHighlight, scale, startMarking, context, computedStyle, canvasHeight, canvasWidth, orientation, originOffset, }) => {
    const { guide } = guideHighlight;
    const color = (0, resolve_studio_color_1.resolveStudioColor)(guideHighlight.color, computedStyle);
    const originDistance = rulerValueToPosition({
        value: guide.position,
        startMarking,
        scale,
    }) +
        originOffset -
        startMarking * scale +
        0.5;
    drawGradient({
        canvasHeight,
        context,
        computedStyle,
        orientation,
        originDistance,
        canvasWidth,
    });
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.beginPath();
    if (orientation === 'horizontal' && guide.orientation === 'horizontal') {
        return;
    }
    if (orientation === 'vertical' && guide.orientation === 'vertical') {
        return;
    }
    if (orientation === 'vertical' && guide.orientation === 'horizontal') {
        context.moveTo(0, originDistance);
        context.lineTo(canvasWidth, originDistance);
        drawLabel({
            context,
            label: guide.position.toString(),
            originDistance,
            orientation,
            color,
        });
    }
    else if (orientation === 'horizontal' && guide.orientation === 'vertical') {
        context.moveTo(originDistance, 0);
        context.lineTo(originDistance, canvasHeight);
        drawLabel({
            context,
            label: guide.position.toString(),
            originDistance,
            orientation,
            color,
        });
    }
    context.stroke();
};
const drawMarkingOnRulerCanvas = ({ scale, points, startMarking, originOffset, markingGaps, orientation, rulerCanvasRef, guideHighlight, canvasHeight, canvasWidth, }) => {
    const canvas = rulerCanvasRef.current;
    if (!canvas)
        return;
    const context = canvas.getContext('2d');
    if (!context)
        return;
    const computedStyle = getComputedStyle(canvas);
    const tickColor = (0, resolve_studio_color_1.resolveStudioColor)(colors_1.WHITE_ALPHA_15, computedStyle);
    const labelColor = (0, resolve_studio_color_1.resolveStudioColor)(colors_1.LIGHT_TEXT, computedStyle);
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const pixelRatio = (0, studio_pixel_ratio_1.getStudioPixelRatio)();
    context.scale(pixelRatio, pixelRatio);
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.strokeStyle = tickColor;
    context.lineWidth = 1;
    context.beginPath();
    points.forEach((point) => {
        context.strokeStyle = tickColor;
        context.lineWidth = 1;
        const originDistance = point.position + originOffset - startMarking * scale;
        context.beginPath();
        if (orientation === 'horizontal') {
            context.moveTo(originDistance, 0);
            context.lineTo(originDistance, canvasHeight);
        }
        else {
            context.moveTo(0, originDistance);
            context.lineTo(canvasWidth, originDistance);
        }
        for (let i = 1; i < 5; i++) {
            const markingOffsetXY = i * markingGaps * scale;
            if (orientation === 'horizontal') {
                context.moveTo(originDistance + markingOffsetXY / 5, 0);
                context.lineTo(originDistance + markingOffsetXY / 5, 4);
            }
            else {
                context.moveTo(0, originDistance + markingOffsetXY / 5);
                context.lineTo(4, originDistance + markingOffsetXY / 5);
            }
        }
        context.stroke();
        context.font = '10px Arial, Helvetica, sans-serif';
        context.textAlign = 'left';
        context.fillStyle = labelColor;
        drawLabel({
            orientation,
            context,
            label: point.value.toString(),
            originDistance,
            color: labelColor,
        });
    });
    if (guideHighlight && orientation !== guideHighlight.guide.orientation) {
        drawGuide({
            computedStyle,
            canvasHeight,
            canvasWidth,
            context,
            guideHighlight,
            originOffset,
            scale,
            orientation,
            startMarking,
        });
    }
};
exports.drawMarkingOnRulerCanvas = drawMarkingOnRulerCanvas;
const getRulerPoints = ({ rulerScaleRange, rulerMarkingGaps, scale, }) => {
    const points = [];
    const startPoint = Math.ceil(rulerScaleRange.start / rulerMarkingGaps);
    const endPoint = Math.floor(rulerScaleRange.end / rulerMarkingGaps);
    const startMarking = startPoint * rulerMarkingGaps;
    for (let i = startPoint; i <= endPoint; i++) {
        points.push({
            value: i * rulerMarkingGaps,
            position: rulerValueToPosition({
                scale,
                startMarking,
                value: i * rulerMarkingGaps,
            }),
        });
    }
    return {
        points,
        startMarking,
    };
};
exports.getRulerPoints = getRulerPoints;
const rulerValueToPosition = ({ value, startMarking, scale, }) => {
    return (value + startMarking) * scale;
};
const getRulerScaleRange = ({ canvasLength, scale, canvasSize, }) => {
    const scaleRangeBeyondCanvas = (canvasSize.width ||
        editor_rulers_1.MINIMUM_VISIBLE_CANVAS_SIZE - editor_rulers_1.MINIMUM_VISIBLE_CANVAS_SIZE) / scale;
    return {
        start: -scaleRangeBeyondCanvas,
        end: scaleRangeBeyondCanvas + canvasLength,
    };
};
exports.getRulerScaleRange = getRulerScaleRange;
