export declare const skipSkillsOption: {
    name: string;
    addedIn: string;
    cliFlag: "skip-skills";
    description: () => import("react").JSX.Element;
    ssrName: null;
    docLink: string;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: true;
    } | {
        source: string;
        value: false;
    };
    setConfig: () => never;
    type: boolean;
    id: "skip-skills";
};
