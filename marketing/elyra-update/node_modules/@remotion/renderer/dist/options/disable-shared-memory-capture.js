"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.disableSharedMemoryCaptureOption = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
let disableSharedMemoryCapture = false;
const cliFlag = 'disable-shared-memory-capture';
exports.disableSharedMemoryCaptureOption = {
    name: 'Disable shared-memory capture',
    addedIn: '4.0.534',
    cliFlag,
    description: () => ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: ["Disables shared-memory capture and uses regular JPEG or PNG screenshots instead. Parallel encoding remains enabled. Default ", (0, jsx_runtime_1.jsx)("code", { children: "false" }), "."] })),
    ssrName: 'disableSharedMemoryCapture',
    docLink: 'https://www.remotion.dev/docs/options/disable-shared-memory-capture',
    type: false,
    getValue: ({ commandLine }) => {
        if (commandLine[cliFlag] !== undefined && commandLine[cliFlag] !== null) {
            return { value: commandLine[cliFlag], source: 'cli' };
        }
        if (disableSharedMemoryCapture !== false) {
            return { value: disableSharedMemoryCapture, source: 'config' };
        }
        return { value: false, source: 'default' };
    },
    setConfig(value) {
        disableSharedMemoryCapture = value;
    },
    id: cliFlag,
};
