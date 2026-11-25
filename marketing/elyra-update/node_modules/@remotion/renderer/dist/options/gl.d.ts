export declare const validOpenGlRenderers: readonly ['swangle', 'angle', 'egl', 'swiftshader', 'vulkan', 'angle-egl'];
export type OpenGlRenderer = (typeof validOpenGlRenderers)[number];
export declare const getDefaultOpenGlRenderer: (enableV5BreakingChanges: boolean) => OpenGlRenderer | null;
export declare const DEFAULT_OPENGL_RENDERER: "angle" | "angle-egl" | "egl" | "swangle" | "swiftshader" | "vulkan" | null;
export declare const getChromiumOpenGlRenderer: () => "angle" | "angle-egl" | "egl" | "swangle" | "swiftshader" | "vulkan" | null;
export declare const setChromiumOpenGlRenderer: (renderer: OpenGlRenderer) => void;
export declare const glOption: {
    cliFlag: "gl";
    docLink: string;
    name: string;
    addedIn: string;
    type: OpenGlRenderer | null;
    ssrName: string;
    description: () => import("react").JSX.Element;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        value: "angle" | "angle-egl" | "egl" | "swangle" | "swiftshader" | "vulkan" | null;
        source: string;
    };
    setConfig: (value: OpenGlRenderer | null) => void;
    id: "gl";
};
export declare const validateOpenGlRenderer: (option: unknown) => OpenGlRenderer | null;
