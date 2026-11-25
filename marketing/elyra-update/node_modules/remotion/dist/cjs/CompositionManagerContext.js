"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompositionSetters = exports.CompositionManagerRefContext = exports.CompositionManager = exports.getAssetPreviewCompositionId = void 0;
const react_1 = require("react");
const getAssetPreviewCompositionId = (asset) => `asset:${asset}`;
exports.getAssetPreviewCompositionId = getAssetPreviewCompositionId;
const defaultCompositionManagerContext = {
    compositions: [],
    folders: [],
    currentCompositionMetadata: null,
    currentAssetMetadata: null,
    canvasContent: null,
};
exports.CompositionManager = (0, react_1.createContext)(defaultCompositionManagerContext);
exports.CompositionManagerRefContext = (0, react_1.createContext)({ current: defaultCompositionManagerContext });
exports.CompositionSetters = (0, react_1.createContext)({
    setCanvasContent: () => undefined,
    setCurrentAssetMetadata: () => undefined,
    onlyRenderComposition: null,
});
