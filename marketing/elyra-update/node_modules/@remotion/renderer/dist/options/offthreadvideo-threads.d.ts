export declare const getOffthreadVideoThreads: () => number | null;
export declare const offthreadVideoThreadsOption: {
    name: string;
    addedIn: string;
    cliFlag: "offthreadvideo-video-threads";
    description: () => import("react").JSX.Element;
    ssrName: 'offthreadVideoThreads';
    docLink: string;
    type: number | null;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: number;
    } | {
        source: string;
        value: null;
    };
    setConfig: (size: number | null) => void;
    id: "offthreadvideo-video-threads";
};
export declare const DEFAULT_RENDER_FRAMES_OFFTHREAD_VIDEO_THREADS = 2;
