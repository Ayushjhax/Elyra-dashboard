"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.timelineLayerLayoutsRef = exports.timelineDurationRef = exports.timelineVerticalScroll = exports.scrollableRef = exports.sliderAreaRef = void 0;
const react_1 = __importDefault(require("react"));
exports.sliderAreaRef = react_1.default.createRef();
exports.scrollableRef = react_1.default.createRef();
exports.timelineVerticalScroll = react_1.default.createRef();
exports.timelineDurationRef = react_1.default.createRef();
// Geometry of mounted timeline bars. Reading this ref never subscribes the
// inspector to timeline updates or walks the underlying sequence tree.
exports.timelineLayerLayoutsRef = {
    current: new Map(),
};
