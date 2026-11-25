"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.envFileOption = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const cliFlag = 'env-file';
let envFileLocation = null;
exports.envFileOption = {
    name: 'Env File',
    addedIn: '2.2.0',
    cliFlag,
    description: () => ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: ["Specify a location for a dotenv file. Default ", (0, jsx_runtime_1.jsx)("code", { children: ".env" }), "."] })),
    ssrName: null,
    docLink: 'https://www.remotion.dev/docs/options/env-file',
    getValue: ({ commandLine }) => {
        if (commandLine[cliFlag] !== undefined) {
            return {
                source: 'cli',
                value: commandLine[cliFlag],
            };
        }
        if (envFileLocation !== null) {
            return {
                source: 'config',
                value: envFileLocation,
            };
        }
        return {
            source: 'default',
            value: null,
        };
    },
    setConfig: (value) => {
        envFileLocation = value;
    },
    type: '',
    id: cliFlag,
};
