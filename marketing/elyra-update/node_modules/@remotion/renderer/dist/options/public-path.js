"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicPathOption = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const cliFlag = 'public-path';
let currentPublicPath = null;
exports.publicPathOption = {
    name: 'Public Path',
    addedIn: '4.0.127',
    cliFlag,
    description: () => {
        return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: ["The path of the URL where the bundle is going to be hosted. By default it is ", (0, jsx_runtime_1.jsx)("code", { children: "./" }), ", making the bundle relocatable. Set an absolute path such as ", (0, jsx_runtime_1.jsx)("code", { children: "/sites/my-site/" }), " to host the bundle at a fixed location."] }));
    },
    ssrName: 'publicPath',
    docLink: 'https://www.remotion.dev/docs/options/public-path',
    getValue: ({ commandLine }) => {
        if (commandLine[cliFlag] !== undefined) {
            return {
                source: 'cli',
                value: commandLine[cliFlag],
            };
        }
        if (currentPublicPath !== null) {
            return {
                source: 'config',
                value: currentPublicPath,
            };
        }
        return {
            source: 'default',
            value: null,
        };
    },
    setConfig: (value) => {
        currentPublicPath = value;
    },
    type: '',
    id: cliFlag,
};
