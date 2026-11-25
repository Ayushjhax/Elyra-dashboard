"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTimelineTrimLimitReason = exports.getVisibleTimelineTrimLimitReason = exports.TIMELINE_TRIM_LIMIT_REASONS = void 0;
exports.TIMELINE_TRIM_LIMIT_REASONS = [
    'Keyframe constraint',
    'Computed keyframes',
    'Computed value',
    'Unknown media duration',
    'Minimum duration',
    'Transition limit',
    'Source start',
    'Source end',
    'Parent edge',
    'Composition edge',
    'Adjacent clip',
    'Content end',
    'Trim limit',
];
const getVisibleTimelineTrimLimitReason = (reason) => {
    return reason === 'Keyframe constraint' ||
        reason === 'Computed keyframes' ||
        reason === 'Computed value' ||
        reason === 'Unknown media duration' ||
        reason === 'Transition limit'
        ? reason
        : null;
};
exports.getVisibleTimelineTrimLimitReason = getVisibleTimelineTrimLimitReason;
const getTimelineTrimLimitReason = (value, candidates) => {
    var _a;
    var _b;
    return ((_b = (_a = candidates.find(([limit, reason]) => reason !== null &&
        Number.isFinite(limit) &&
        Math.abs(value - limit) <=
            Number.EPSILON * Math.max(1, Math.abs(value), Math.abs(limit)) * 8)) === null || _a === void 0 ? void 0 : _a[1]) !== null && _b !== void 0 ? _b : 'Trim limit');
};
exports.getTimelineTrimLimitReason = getTimelineTrimLimitReason;
