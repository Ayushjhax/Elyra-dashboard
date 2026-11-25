"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showLayerFrameNumbersOption = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
let configuredShowLayerFrameNumbers = null;
const cliFlag = 'show-layer-frame-numbers';
exports.showLayerFrameNumbersOption = {
    name: 'Show frame numbers of layer',
    addedIn: '4.0.535',
    cliFlag,
    id: cliFlag,
    description: () => ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: ["Show the current frame number inside sequence layers in the Studio timeline. Defaults to ", (0, jsx_runtime_1.jsx)("code", { children: "false" }), "."] })),
    ssrName: null,
    docLink: 'https://www.remotion.dev/docs/options/show-layer-frame-numbers',
    type: false,
    getValue: ({ commandLine }) => {
        if (commandLine[cliFlag] !== undefined && commandLine[cliFlag] !== null) {
            return { value: commandLine[cliFlag], source: 'cli' };
        }
        return { value: configuredShowLayerFrameNumbers !== null && configuredShowLayerFrameNumbers !== void 0 ? configuredShowLayerFrameNumbers : false, source: 'config' };
    },
    setConfig(value) {
        if (typeof value !== 'boolean') {
            throw new Error('Config.setShowLayerFrameNumbers() expects a boolean');
        }
        configuredShowLayerFrameNumbers = value;
    },
    getConfigValue: () => configuredShowLayerFrameNumbers,
    reset: () => {
        configuredShowLayerFrameNumbers = null;
    },
};
