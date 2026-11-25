"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isProductionOption = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const cliFlag = 'is-production';
let currentIsProductionKey = null;
exports.isProductionOption = {
    name: 'Is Production',
    addedIn: '4.0.409',
    cliFlag,
    description: () => ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: ["Pass ", (0, jsx_runtime_1.jsx)("code", { children: "false" }), " for a development render so it is not counted as a billable render on remotion.pro. Defaults to ", (0, jsx_runtime_1.jsx)("code", { children: "true" }), ". Only has an effect when a license key is provided."] })),
    ssrName: 'isProduction',
    docLink: 'https://www.remotion.dev/docs/options/is-production',
    getValue: ({ commandLine }) => {
        if (commandLine[cliFlag] !== undefined && commandLine[cliFlag] !== null) {
            return {
                source: 'cli',
                value: commandLine[cliFlag],
            };
        }
        if (currentIsProductionKey !== null) {
            return {
                source: 'config',
                value: currentIsProductionKey,
            };
        }
        return {
            source: 'default',
            value: null,
        };
    },
    setConfig: (value) => {
        currentIsProductionKey = value;
    },
    type: false,
    id: cliFlag,
};
