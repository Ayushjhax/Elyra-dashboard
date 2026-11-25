"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.forceNewStudioOption = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
let forceNewEnabled = false;
const cliFlag = 'force-new';
exports.forceNewStudioOption = {
    name: 'Force New Studio',
    addedIn: '4.0.421',
    cliFlag,
    description: () => ((0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, { children: "Forces starting a new Studio instance even if one is already running on the same port for the same project." })),
    ssrName: null,
    docLink: 'https://www.remotion.dev/docs/options/force-new',
    type: false,
    getValue: ({ commandLine }) => {
        if (commandLine[cliFlag] !== undefined && commandLine[cliFlag] !== null) {
            return {
                value: commandLine[cliFlag],
                source: 'cli',
            };
        }
        return {
            value: forceNewEnabled,
            source: 'config',
        };
    },
    setConfig(value) {
        forceNewEnabled = value;
    },
    id: cliFlag,
};
