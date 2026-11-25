"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canvasTabsOption = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
let canvasTabsEnabled = true;
let configuredCanvasTabsEnabled = null;
const cliFlag = 'disable-canvas-tabs';
exports.canvasTabsOption = {
    name: 'Disable or enable Studio canvas tabs',
    addedIn: '4.0.530',
    cliFlag,
    description: () => (0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, { children: "Enable or disable the tabs above the Studio canvas." }),
    ssrName: null,
    docLink: 'https://www.remotion.dev/docs/options/disable-canvas-tabs',
    type: false,
    getValue: ({ commandLine }) => {
        if (commandLine[cliFlag] !== undefined && commandLine[cliFlag] !== null) {
            canvasTabsEnabled = commandLine[cliFlag] === false;
            return {
                value: canvasTabsEnabled,
                source: 'cli',
            };
        }
        return {
            value: canvasTabsEnabled,
            source: 'config',
        };
    },
    setConfig(value) {
        canvasTabsEnabled = value;
        configuredCanvasTabsEnabled = value;
    },
    getConfigValue: () => configuredCanvasTabsEnabled,
    reset: () => {
        canvasTabsEnabled = true;
        configuredCanvasTabsEnabled = null;
    },
    id: cliFlag,
};
