"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startErrorOverlay = void 0;
const react_overlay_1 = require("./react-overlay");
const remotion_overlay_1 = require("./remotion-overlay");
const startErrorOverlay = () => {
    (0, react_overlay_1.startReportingRuntimeErrors)();
    (0, remotion_overlay_1.mountRemotionOverlay)();
};
exports.startErrorOverlay = startErrorOverlay;
