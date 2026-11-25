"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.t2length = exports.quadraticDerivative = exports.getQuadraticArcLength = exports.cubicDerivative = exports.quadraticPoint = exports.getCubicArcLength = exports.cubicPoint = void 0;
const bezier_values_1 = require("./bezier-values");
const cubicPoint = (xs, ys, t) => {
    const x = (1 - t) * (1 - t) * (1 - t) * xs[0] +
        3 * (1 - t) * (1 - t) * t * xs[1] +
        3 * (1 - t) * t * t * xs[2] +
        t * t * t * xs[3];
    const y = (1 - t) * (1 - t) * (1 - t) * ys[0] +
        3 * (1 - t) * (1 - t) * t * ys[1] +
        3 * (1 - t) * t * t * ys[2] +
        t * t * t * ys[3];
    return { x, y };
};
exports.cubicPoint = cubicPoint;
const getCubicArcLength = ({ sx, sy, t, }) => {
    const v0x = 3 * (sx[1] - sx[0]);
    const v1x = 3 * (sx[2] - sx[1]);
    const v2x = 3 * (sx[3] - sx[2]);
    const v0y = 3 * (sy[1] - sy[0]);
    const v1y = 3 * (sy[2] - sy[1]);
    const v2y = 3 * (sy[3] - sy[2]);
    let correctedT;
    const n = 20;
    const z = t / 2;
    let sum = 0;
    for (let i = 0; i < n; i++) {
        correctedT = z * bezier_values_1.tValues[n][i] + z;
        const mt = 1 - correctedT;
        const xbase = mt * mt * v0x + 2 * mt * correctedT * v1x + correctedT * correctedT * v2x;
        const ybase = mt * mt * v0y + 2 * mt * correctedT * v1y + correctedT * correctedT * v2y;
        sum += bezier_values_1.cValues[n][i] * Math.sqrt(xbase * xbase + ybase * ybase);
    }
    return z * sum;
};
exports.getCubicArcLength = getCubicArcLength;
const quadraticPoint = (xs, ys, t) => {
    const x = (1 - t) * (1 - t) * xs[0] + 2 * (1 - t) * t * xs[1] + t * t * xs[2];
    const y = (1 - t) * (1 - t) * ys[0] + 2 * (1 - t) * t * ys[1] + t * t * ys[2];
    return { x, y };
};
exports.quadraticPoint = quadraticPoint;
const cubicDerivative = (xs, ys, t) => {
    const v0x = 3 * (xs[1] - xs[0]);
    const v1x = 3 * (xs[2] - xs[1]);
    const v2x = 3 * (xs[3] - xs[2]);
    const v0y = 3 * (ys[1] - ys[0]);
    const v1y = 3 * (ys[2] - ys[1]);
    const v2y = 3 * (ys[3] - ys[2]);
    const mt = 1 - t;
    return {
        x: mt * mt * v0x + 2 * mt * t * v1x + t * t * v2x,
        y: mt * mt * v0y + 2 * mt * t * v1y + t * t * v2y,
    };
};
exports.cubicDerivative = cubicDerivative;
const getQuadraticArcLength = (xs, ys, t) => {
    if (t === undefined) {
        t = 1;
    }
    const ax = xs[0] - 2 * xs[1] + xs[2];
    const ay = ys[0] - 2 * ys[1] + ys[2];
    const bx = 2 * xs[1] - 2 * xs[0];
    const by = 2 * ys[1] - 2 * ys[0];
    const A = 4 * (ax * ax + ay * ay);
    const B = 4 * (ax * bx + ay * by);
    const C = bx * bx + by * by;
    if (A === 0) {
        return t * Math.sqrt((xs[2] - xs[0]) ** 2 + (ys[2] - ys[0]) ** 2);
    }
    const b = B / (2 * A);
    const c = C / A;
    const u = t + b;
    const k = c - b * b;
    const uuk = u * u + k > 0 ? Math.sqrt(u * u + k) : 0;
    const bbk = b * b + k > 0 ? Math.sqrt(b * b + k) : 0;
    const term = b + Math.sqrt(b * b + k) === 0
        ? 0
        : k * Math.log(Math.abs((u + uuk) / (b + bbk)));
    return (Math.sqrt(A) / 2) * (u * uuk - b * bbk + term);
};
exports.getQuadraticArcLength = getQuadraticArcLength;
const quadraticDerivative = (xs, ys, t) => {
    return {
        x: (1 - t) * 2 * (xs[1] - xs[0]) + t * 2 * (xs[2] - xs[1]),
        y: (1 - t) * 2 * (ys[1] - ys[0]) + t * 2 * (ys[2] - ys[1]),
    };
};
exports.quadraticDerivative = quadraticDerivative;
const t2length = ({ length, totalLength, func, }) => {
    let error = 1;
    let t = length / totalLength;
    let step = (length - func(t)) / totalLength;
    let numIterations = 0;
    while (error > 0.001) {
        const increasedTLength = func(t + step);
        const increasedTError = Math.abs(length - increasedTLength) / totalLength;
        if (increasedTError < error) {
            error = increasedTError;
            t += step;
        }
        else {
            const decreasedTLength = func(t - step);
            const decreasedTError = Math.abs(length - decreasedTLength) / totalLength;
            if (decreasedTError < error) {
                error = decreasedTError;
                t -= step;
            }
            else {
                step /= 2;
            }
        }
        numIterations++;
        if (numIterations > 500) {
            break;
        }
    }
    return t;
};
exports.t2length = t2length;
