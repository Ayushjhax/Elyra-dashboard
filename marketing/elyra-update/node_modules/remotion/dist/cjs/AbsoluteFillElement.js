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
exports.AbsoluteFillElement = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importStar(require("react"));
const hasTailwindClassName = ({ className, classPrefix, type, }) => {
    if (!className) {
        return false;
    }
    if (type === 'exact') {
        const split = className.split(' ');
        return classPrefix.some((token) => {
            return split.some((part) => {
                return (part.trim() === token ||
                    part.trim().endsWith(`:${token}`) ||
                    part.trim().endsWith(`!${token}`));
            });
        });
    }
    return classPrefix.some((prefix) => {
        return (className.startsWith(prefix) ||
            className.includes(` ${prefix}`) ||
            className.includes(`!${prefix}`) ||
            className.includes(`:${prefix}`));
    });
};
const AbsoluteFillElementRefForwarding = (props, ref) => {
    const { style, ...other } = props;
    const defaultStyle = (0, react_1.useMemo)(() => {
        // Make TailwindCSS classes get accepted
        return {
            position: 'absolute',
            top: hasTailwindClassName({
                className: other.className,
                classPrefix: ['top-', 'inset-'],
                type: 'prefix',
            })
                ? undefined
                : 0,
            left: hasTailwindClassName({
                className: other.className,
                classPrefix: ['left-', 'inset-'],
                type: 'prefix',
            })
                ? undefined
                : 0,
            right: hasTailwindClassName({
                className: other.className,
                classPrefix: ['right-', 'inset-'],
                type: 'prefix',
            })
                ? undefined
                : 0,
            bottom: hasTailwindClassName({
                className: other.className,
                classPrefix: ['bottom-', 'inset-'],
                type: 'prefix',
            })
                ? undefined
                : 0,
            width: hasTailwindClassName({
                className: other.className,
                classPrefix: ['w-'],
                type: 'prefix',
            })
                ? undefined
                : '100%',
            height: hasTailwindClassName({
                className: other.className,
                classPrefix: ['h-'],
                type: 'prefix',
            })
                ? undefined
                : '100%',
            display: hasTailwindClassName({
                className: other.className,
                classPrefix: [
                    'block',
                    'inline-block',
                    'inline',
                    'flex',
                    'inline-flex',
                    'flow-root',
                    'grid',
                    'inline-grid',
                    'contents',
                    'list-item',
                    'hidden',
                ],
                type: 'exact',
            })
                ? undefined
                : 'flex',
            flexDirection: hasTailwindClassName({
                className: other.className,
                classPrefix: [
                    'flex-row',
                    'flex-col',
                    'flex-row-reverse',
                    'flex-col-reverse',
                ],
                type: 'exact',
            })
                ? undefined
                : 'column',
        };
    }, [other.className]);
    const actualStyle = (0, react_1.useMemo)(() => {
        return {
            ...defaultStyle,
            ...style,
        };
    }, [defaultStyle, style]);
    return (0, jsx_runtime_1.jsx)("div", { ref: ref, style: actualStyle, ...other });
};
exports.AbsoluteFillElement = react_1.default.memo((0, react_1.forwardRef)(AbsoluteFillElementRefForwarding));
