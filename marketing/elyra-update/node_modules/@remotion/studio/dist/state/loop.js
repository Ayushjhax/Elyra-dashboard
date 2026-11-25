"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadLoopOption = exports.persistLoopOption = exports.loopSetterRef = void 0;
const react_1 = require("react");
const key = 'remotion.loop';
exports.loopSetterRef = (0, react_1.createRef)();
const persistLoopOption = (option) => {
    localStorage.setItem(key, String(option));
};
exports.persistLoopOption = persistLoopOption;
const loadLoopOption = () => {
    const item = localStorage.getItem(key);
    return item !== 'false';
};
exports.loadLoopOption = loadLoopOption;
