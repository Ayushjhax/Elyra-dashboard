"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceAudioOption = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const DEFAULT_ENFORCE_AUDIO_TRACK = false;
let enforceAudioTrackState = DEFAULT_ENFORCE_AUDIO_TRACK;
const cliFlag = 'enforce-audio-track';
exports.enforceAudioOption = {
    name: 'Enforce Audio Track',
    addedIn: '3.2.1',
    cliFlag,
    description: (mode) => ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsxs)("p", { children: ["Defaults to ", (0, jsx_runtime_1.jsx)("code", { children: "false" }), ". If ", (0, jsx_runtime_1.jsx)("code", { children: "true" }), ", include a silent audio track when the render contains no audio. If ", (0, jsx_runtime_1.jsx)("code", { children: "false" }), ", omit the audio track when no audio is present. Audio-only exports and", ' ', (0, jsx_runtime_1.jsx)("code", { children: mode === 'cli' ? '--separate-audio-to' : 'separateAudioTo' }), ' ', "still produce an audio file, even when silent."] }), (0, jsx_runtime_1.jsxs)("p", { children: [mode === 'cli' ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: ["Pass ", (0, jsx_runtime_1.jsx)("code", { children: "--enforce-audio-track" })] })) : ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: ["Set this to ", (0, jsx_runtime_1.jsx)("code", { children: "true" })] })), ' ', "for", ' ', (0, jsx_runtime_1.jsx)("a", { href: "/docs/distributed-rendering", children: "chunks that will later be concatenated" }), ", because other chunks may contain audio.", ' ', (0, jsx_runtime_1.jsx)("code", { children: mode === 'cli' ? '--muted' : 'muted: true' }), " takes precedence."] })] })),
    ssrName: 'enforceAudioTrack',
    docLink: 'https://www.remotion.dev/docs/options/enforce-audio-track',
    type: false,
    getValue: ({ commandLine }) => {
        if (commandLine[cliFlag]) {
            return {
                source: 'cli',
                value: true,
            };
        }
        if (enforceAudioTrackState !== DEFAULT_ENFORCE_AUDIO_TRACK) {
            return {
                source: 'config',
                value: enforceAudioTrackState,
            };
        }
        return {
            source: 'default',
            value: DEFAULT_ENFORCE_AUDIO_TRACK,
        };
    },
    setConfig: (value) => {
        enforceAudioTrackState = value;
    },
    id: cliFlag,
};
