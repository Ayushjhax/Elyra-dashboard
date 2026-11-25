"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.everyNthFrameOption = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const DEFAULT_EVERY_NTH_FRAME = 1;
let everyNthFrame = DEFAULT_EVERY_NTH_FRAME;
const cliFlag = 'every-nth-frame';
exports.everyNthFrameOption = {
    name: 'Every nth frame',
    addedIn: '3.1.0',
    cliFlag,
    description: () => ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: ["This option may only be set when rendering GIFs. It determines how many frames are rendered, while the other ones get skipped in order to lower the FPS of the GIF. For example, if the ", (0, jsx_runtime_1.jsx)("code", { children: "fps" }), " is 30, and", ' ', (0, jsx_runtime_1.jsx)("code", { children: "everyNthFrame" }), " is 2, the FPS of the GIF is ", (0, jsx_runtime_1.jsx)("code", { children: "15" }), "."] })),
    ssrName: 'everyNthFrame',
    docLink: 'https://www.remotion.dev/docs/options/every-nth-frame',
    type: DEFAULT_EVERY_NTH_FRAME,
    getValue: ({ commandLine }) => {
        if (commandLine[cliFlag] !== undefined) {
            return {
                source: 'cli',
                value: commandLine[cliFlag],
            };
        }
        if (everyNthFrame !== DEFAULT_EVERY_NTH_FRAME) {
            return {
                source: 'config',
                value: everyNthFrame,
            };
        }
        return {
            source: 'default',
            value: DEFAULT_EVERY_NTH_FRAME,
        };
    },
    setConfig: (value) => {
        everyNthFrame = value;
    },
    id: cliFlag,
};
