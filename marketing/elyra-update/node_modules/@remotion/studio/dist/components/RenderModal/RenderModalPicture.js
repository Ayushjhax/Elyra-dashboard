"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RenderModalPicture = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const is_menu_item_1 = require("../Menu/is-menu-item");
const SegmentedControl_1 = require("../SegmentedControl");
const JpegQualitySetting_1 = require("./JpegQualitySetting");
const layout_1 = require("./layout");
const RenderModalHr_1 = require("./RenderModalHr");
const ScaleSetting_1 = require("./ScaleSetting");
const container = {
    flex: 1,
    overflowY: 'auto',
};
const RenderModalPicture = ({ renderMode, scale, setScale, imageFormatOptions, videoImageFormat, usesSharedMemoryCapture, setJpegQuality, jpegQuality, stillImageFormat, compositionWidth, compositionHeight, }) => {
    return ((0, jsx_runtime_1.jsxs)("div", { style: container, className: is_menu_item_1.VERTICAL_SCROLLBAR_CLASSNAME, children: [renderMode === 'video' && !usesSharedMemoryCapture ? ((0, jsx_runtime_1.jsxs)("div", { style: layout_1.optionRow, children: [(0, jsx_runtime_1.jsx)("div", { style: layout_1.label, children: "Image Format" }), (0, jsx_runtime_1.jsx)("div", { style: layout_1.rightRow, children: (0, jsx_runtime_1.jsx)(SegmentedControl_1.SegmentedControl, { items: imageFormatOptions, needsWrapping: false }) })] })) : null, renderMode === 'video' &&
                !usesSharedMemoryCapture &&
                videoImageFormat === 'jpeg' ? ((0, jsx_runtime_1.jsx)(JpegQualitySetting_1.JpegQualitySetting, { jpegQuality: jpegQuality, setJpegQuality: setJpegQuality })) : null, renderMode === 'still' && stillImageFormat === 'jpeg' ? ((0, jsx_runtime_1.jsx)(JpegQualitySetting_1.JpegQualitySetting, { jpegQuality: jpegQuality, setJpegQuality: setJpegQuality })) : null, renderMode === 'video' && !usesSharedMemoryCapture ? ((0, jsx_runtime_1.jsx)(RenderModalHr_1.RenderModalHr, {})) : null, (0, jsx_runtime_1.jsx)(ScaleSetting_1.ScaleSetting, { scale: scale, setScale: setScale, compositionWidth: compositionWidth, compositionHeight: compositionHeight })] }));
};
exports.RenderModalPicture = RenderModalPicture;
