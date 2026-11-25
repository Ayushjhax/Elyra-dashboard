"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultPremountContext = void 0;
const react_1 = require("react");
const default_premount_in_seconds_js_1 = require("./default-premount-in-seconds.js");
exports.DefaultPremountContext = (0, react_1.createContext)(default_premount_in_seconds_js_1.DEFAULT_PREMOUNT_IN_SECONDS);
