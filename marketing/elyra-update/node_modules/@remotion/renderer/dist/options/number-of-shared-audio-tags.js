"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.numberOfSharedAudioTagsOption = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
let numberOfSharedAudioTags = 0;
let configuredNumberOfSharedAudioTags = null;
const cliFlag = 'number-of-shared-audio-tags';
exports.numberOfSharedAudioTagsOption = {
    name: 'Number of shared audio tags',
    addedIn: '3.3.2',
    cliFlag,
    description: () => ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: ["Set number of shared audio tags. See", ' ', (0, jsx_runtime_1.jsx)("a", { href: "https://www.remotion.dev/docs/player/autoplay#using-the-numberofsharedaudiotags-prop", children: "Using the numberOfSharedAudioTags prop" }), ' ', "for more information."] })),
    ssrName: null,
    docLink: 'https://www.remotion.dev/docs/options/number-of-shared-audio-tags',
    type: 0,
    getValue: ({ commandLine }) => {
        if (commandLine[cliFlag] !== undefined) {
            return {
                value: commandLine[cliFlag],
                source: 'cli',
            };
        }
        return {
            value: numberOfSharedAudioTags,
            source: 'config',
        };
    },
    setConfig(value) {
        numberOfSharedAudioTags = value;
        configuredNumberOfSharedAudioTags = value;
    },
    getConfigValue: () => configuredNumberOfSharedAudioTags,
    reset: () => {
        numberOfSharedAudioTags = 0;
        configuredNumberOfSharedAudioTags = null;
    },
    id: cliFlag,
};
