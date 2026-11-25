"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RenderQueueOutputName = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const item_style_1 = require("./item-style");
const RenderQueueOutputName = ({ job }) => {
    const deletedOutputLocation = 'deletedOutputLocation' in job && job.deletedOutputLocation;
    const style = (0, react_1.useMemo)(() => {
        return {
            ...item_style_1.renderQueueItemSubtitleStyle,
            textDecoration: deletedOutputLocation ? 'line-through' : 'none',
            color: item_style_1.renderQueueItemSubtitleStyle.color,
            cursor: 'inherit',
        };
    }, [deletedOutputLocation]);
    const getTitle = () => {
        if (deletedOutputLocation) {
            return 'File was deleted';
        }
        return job.outName;
    };
    return ((0, jsx_runtime_1.jsx)("span", { role: "group", style: style, "aria-label": getTitle(), children: job.outName }));
};
exports.RenderQueueOutputName = RenderQueueOutputName;
