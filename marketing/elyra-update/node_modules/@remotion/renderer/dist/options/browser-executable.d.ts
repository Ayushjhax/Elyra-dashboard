import type { BrowserExecutable } from '../browser-executable';
export declare const browserExecutableOption: {
    name: string;
    addedIn: string;
    cliFlag: "browser-executable";
    description: () => import("react").JSX.Element;
    ssrName: 'browserExecutable';
    docLink: string;
    type: BrowserExecutable;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: BrowserExecutable;
    };
    setConfig: (value: BrowserExecutable) => void;
    id: "browser-executable";
};
