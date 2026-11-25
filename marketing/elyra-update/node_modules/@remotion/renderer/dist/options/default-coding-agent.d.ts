export declare const defaultCodingAgentIds: readonly ['codex', 'cursor', 'copilot', 'claude-code'];
export type DefaultCodingAgent = (typeof defaultCodingAgentIds)[number];
export declare const defaultCodingAgentOption: {
    name: string;
    addedIn: string;
    cliFlag: "coding-agent";
    description: () => import("react").JSX.Element;
    ssrName: null;
    docLink: string;
    type: DefaultCodingAgent | null;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        value: "claude-code" | "codex" | "copilot" | "cursor" | null;
        source: string;
    };
    setConfig(value: "claude-code" | "codex" | "copilot" | "cursor" | null): void;
    id: "coding-agent";
};
