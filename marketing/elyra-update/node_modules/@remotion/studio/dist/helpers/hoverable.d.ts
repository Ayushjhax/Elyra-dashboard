import type React from 'react';
export declare const HOVERABLE_CLASS_NAME = "__remotion-hoverable";
export declare const HOVER_GROUP_CLASS_NAME = "__remotion-hover-group";
export declare const HOVER_GROUP_REVEAL_CLASS_NAME = "__remotion-hover-group-reveal";
export declare const HOVER_GROUP_REVEAL_KEEP_SPACE_CLASS_NAME = "__remotion-hover-group-reveal-keep-space";
export declare const FOCUS_VISIBLE_ONLY_CLASS_NAME = "__remotion-focus-visible-only";
export declare const INPUT_HOVER_CLASS_NAME = "__remotion-input-hover";
export declare const NO_HOVER_BACKGROUND_STYLE: React.CSSProperties;
export declare const hoverableStyle: ({ idleBackground, hoverBackground, idleColor, hoverColor, }: {
    idleBackground: string;
    hoverBackground: string;
    idleColor: string;
    hoverColor: string;
}) => React.CSSProperties;
export declare const makeHoverableCSS: () => string;
