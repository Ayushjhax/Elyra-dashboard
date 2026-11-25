import type { LogLevel } from '../log-level';
export declare const logLevelOption: {
    cliFlag: "log";
    name: string;
    addedIn: string;
    ssrName: string;
    description: () => import("react").JSX.Element;
    docLink: string;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        value: LogLevel;
        source: string;
    };
    setConfig: (newLogLevel: LogLevel) => void;
    getConfigValue: () => "error" | "info" | "trace" | "verbose" | "warn" | null;
    reset: () => void;
    type: LogLevel;
    id: "log";
};
