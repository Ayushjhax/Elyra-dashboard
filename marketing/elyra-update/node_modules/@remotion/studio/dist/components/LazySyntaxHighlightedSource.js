"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LazySyntaxHighlightedSource = exports.loadSyntaxHighlightedSource = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const sourceStyle = {
    fontFamily: 'inherit',
    fontSize: 'inherit',
    lineHeight: 'inherit',
    color: 'inherit',
};
const PlainSource = ({ source }) => ((0, jsx_runtime_1.jsx)("span", { style: sourceStyle, children: source }));
let loadedSource = null;
let sourcePromise = null;
const loadSyntaxHighlightedSource = () => {
    if (sourcePromise === null) {
        sourcePromise = Promise.resolve().then(() => __importStar(require('./SyntaxHighlightedSource'))).catch(() => ({ default: PlainSource }))
            .then((module) => {
            loadedSource = module.default;
            return module;
        });
    }
    return sourcePromise;
};
exports.loadSyntaxHighlightedSource = loadSyntaxHighlightedSource;
const SyntaxHighlightedSource = (0, react_1.lazy)(exports.loadSyntaxHighlightedSource);
const LazySyntaxHighlightedSource = ({ source }) => {
    // React.lazy can suspend on its first render even after preloading finishes.
    const LoadedSource = loadedSource;
    if (LoadedSource !== null) {
        return (0, jsx_runtime_1.jsx)(LoadedSource, { source: source });
    }
    return ((0, jsx_runtime_1.jsx)(react_1.Suspense, { fallback: (0, jsx_runtime_1.jsx)("span", { style: { ...sourceStyle, visibility: 'hidden' }, children: source }), children: (0, jsx_runtime_1.jsx)(SyntaxHighlightedSource, { source: source }) }));
};
exports.LazySyntaxHighlightedSource = LazySyntaxHighlightedSource;
