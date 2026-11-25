"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showPremountingOption = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
let configuredShowPremounting = null;
const cliFlag = 'show-premounting';
exports.showPremountingOption = {
    name: 'Show premounting in the Studio timeline',
    addedIn: '4.0.535',
    cliFlag,
    id: cliFlag,
    description: () => ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: ["Show premounting indicators in the Studio timeline. Defaults to", ' ', (0, jsx_runtime_1.jsx)("code", { children: "false" }), "."] })),
    ssrName: null,
    docLink: 'https://www.remotion.dev/docs/options/show-premounting',
    type: true,
    getValue: ({ commandLine }) => {
        if (commandLine[cliFlag] !== undefined && commandLine[cliFlag] !== null) {
            return { value: commandLine[cliFlag], source: 'cli' };
        }
        return { value: configuredShowPremounting !== null && configuredShowPremounting !== void 0 ? configuredShowPremounting : false, source: 'config' };
    },
    setConfig(value) {
        if (typeof value !== 'boolean') {
            throw new Error('Config.setShowPremounting() expects a boolean');
        }
        configuredShowPremounting = value;
    },
    getConfigValue: () => configuredShowPremounting,
    reset: () => {
        configuredShowPremounting = null;
    },
};
