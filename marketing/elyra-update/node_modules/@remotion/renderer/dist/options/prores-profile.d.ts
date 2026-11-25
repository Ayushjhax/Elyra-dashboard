export type ProResProfile = '4444-xq' | '4444' | 'hq' | 'standard' | 'light' | 'proxy';
export declare const proResProfileOption: {
    name: string;
    addedIn: string;
    cliFlag: "prores-profile";
    description: () => import("react").JSX.Element;
    ssrName: 'proResProfile';
    docLink: string;
    type: ProResProfile | undefined;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }, options?: {
        uiProResProfile: ProResProfile | undefined;
        compositionDefaultProResProfile: ProResProfile | null;
    }) => {
        source: string;
        value: ProResProfile;
    } | {
        source: string;
        value: undefined;
    };
    setConfig: (value: ProResProfile | undefined) => void;
    id: "prores-profile";
};
