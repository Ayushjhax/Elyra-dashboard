"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rspackOption = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
let rspackEnabled = false;
let configuredRspackEnabled = null;
const cliFlag = 'rspack';
exports.rspackOption = {
    name: 'Rspack',
    addedIn: '4.0.502',
    cliFlag,
    description: () => ((0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, { children: "Uses Rspack instead of Webpack as the bundler for the Studio or bundle." })),
    ssrName: null,
    docLink: 'https://www.remotion.dev/docs/options/rspack',
    type: false,
    getValue: ({ commandLine }) => {
        if (commandLine[cliFlag] !== undefined && commandLine[cliFlag] !== null) {
            return {
                value: commandLine[cliFlag],
                source: 'cli',
            };
        }
        return {
            value: rspackEnabled,
            source: 'config',
        };
    },
    setConfig(value) {
        rspackEnabled = value;
        configuredRspackEnabled = value;
    },
    getConfigValue: () => configuredRspackEnabled,
    reset: () => {
        rspackEnabled = false;
        configuredRspackEnabled = null;
    },
    id: cliFlag,
};
