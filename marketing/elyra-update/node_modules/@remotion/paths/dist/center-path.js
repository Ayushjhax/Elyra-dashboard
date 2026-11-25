"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.centerPath = void 0;
const get_bounding_box_1 = require("./get-bounding-box");
const translate_path_1 = require("./translate-path");
/*
 * @description Translates an SVG path so that the center of the bounding box is at the specified point. Defaults to 0, 0.
 * @see [Documentation](https://www.remotion.dev/docs/paths/center-path)
 */
const centerPath = (d, target = { x: 0, y: 0 }) => {
    const box = (0, get_bounding_box_1.getBoundingBox)(d);
    const dx = target.x - (box.x1 + box.x2) / 2;
    const dy = target.y - (box.y1 + box.y2) / 2;
    return (0, translate_path_1.translatePath)(d, dx, dy);
};
exports.centerPath = centerPath;
