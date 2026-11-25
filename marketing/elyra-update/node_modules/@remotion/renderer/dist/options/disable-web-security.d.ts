export declare const disableWebSecurityOption: {
    name: string;
    addedIn: string;
    cliFlag: "disable-web-security";
    description: () => import("react").JSX.Element;
    ssrName: 'disableWebSecurity';
    docLink: string;
    type: boolean;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        source: string;
        value: boolean;
    };
    setConfig: (value: boolean) => void;
    id: "disable-web-security";
};
