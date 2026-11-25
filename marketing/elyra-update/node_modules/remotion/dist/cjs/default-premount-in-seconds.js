"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateDefaultPremountInSeconds = exports.DEFAULT_STUDIO_PREMOUNT_IN_SECONDS = exports.DEFAULT_PREMOUNT_IN_SECONDS = void 0;
const v5_flag_js_1 = require("./v5-flag.js");
exports.DEFAULT_PREMOUNT_IN_SECONDS = v5_flag_js_1.ENABLE_V5_BREAKING_CHANGES ? 2 : 0;
exports.DEFAULT_STUDIO_PREMOUNT_IN_SECONDS = 2;
const validateDefaultPremountInSeconds = (value) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new TypeError(`defaultPremountInSeconds must be a finite, non-negative number, but got ${String(value)}.`);
    }
};
exports.validateDefaultPremountInSeconds = validateDefaultPremountInSeconds;
