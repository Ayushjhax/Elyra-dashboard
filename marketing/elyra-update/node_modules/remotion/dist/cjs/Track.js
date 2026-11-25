"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Track = exports.TrackWithoutSchema = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const enable_sequence_stack_traces_js_1 = require("./enable-sequence-stack-traces.js");
const interactivity_schema_js_1 = require("./interactivity-schema.js");
const Sequence_js_1 = require("./Sequence.js");
const timeline_track_context_js_1 = require("./timeline-track-context.js");
const with_interactivity_schema_js_1 = require("./with-interactivity-schema.js");
// A packed row has no container bar to drag. Expose its linear timing in the
// inspector, but keep looping and freezing as programmatic operations.
const { freeze: _freeze, layout: _layout, ...trackSequenceSchema } = interactivity_schema_js_1.sequenceSchema;
const trackSchema = {
    ...trackSequenceSchema,
    ...interactivity_schema_js_1.sequenceTimingSchema,
};
const TrackWithoutSchema = ({ name = 'Track', children, layout = 'none', ...props }) => {
    const [id] = (0, react_1.useState)(() => String(Math.random()));
    const value = (0, react_1.useMemo)(() => ({ id, name }), [id, name]);
    return ((0, jsx_runtime_1.jsx)(timeline_track_context_js_1.TimelineTrackContext.Provider, { value: value, children: (0, jsx_runtime_1.jsx)(Sequence_js_1.SequenceWithoutSchema, { _remotionInternalDocumentationLink: "https://www.remotion.dev/docs/track", ...props, name: name, layout: layout, _remotionInternalTimelineTrack: { role: 'track', seriesOffset: null }, children: children }) }));
};
exports.TrackWithoutSchema = TrackWithoutSchema;
/** Groups clips on one Studio timeline row and applies Sequence timing. */
exports.Track = (0, with_interactivity_schema_js_1.withInteractivitySchema)({
    Component: (props) => (0, jsx_runtime_1.jsx)(exports.TrackWithoutSchema, { ...props, layout: "none" }),
    componentName: '<Track>',
    componentIdentity: 'dev.remotion.remotion.Track',
    schema: trackSchema,
    supportsEffects: false,
});
(0, enable_sequence_stack_traces_js_1.addSequenceStackTraces)(exports.Track);
