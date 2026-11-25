"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.askAIOption = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
let askAIEnabled = true;
let configuredAskAIEnabled = null;
const cliFlag = 'disable-ask-ai';
exports.askAIOption = {
    name: 'Disable or Enable the Ask AI option',
    addedIn: '4.0.407',
    cliFlag,
    description: () => ((0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, { children: "If the Cmd + I shortcut of the Ask AI modal conflicts with your Studio, you can disable it using this." })),
    ssrName: null,
    docLink: 'https://www.remotion.dev/docs/options/disable-ask-ai',
    type: false,
    getValue: ({ commandLine }) => {
        if (commandLine[cliFlag] !== undefined && commandLine[cliFlag] !== null) {
            askAIEnabled = false;
            return {
                value: askAIEnabled,
                source: 'cli',
            };
        }
        return {
            value: askAIEnabled,
            source: 'config',
        };
    },
    setConfig(value) {
        askAIEnabled = value;
        configuredAskAIEnabled = value;
    },
    getConfigValue: () => configuredAskAIEnabled,
    reset: () => {
        askAIEnabled = true;
        configuredAskAIEnabled = null;
    },
    id: cliFlag,
};
