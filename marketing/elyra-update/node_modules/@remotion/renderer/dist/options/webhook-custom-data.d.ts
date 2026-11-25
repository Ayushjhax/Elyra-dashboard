export declare const webhookCustomDataOption: {
    name: string;
    addedIn: string;
    cliFlag: "webhook-custom-data";
    description: (type: "cli" | "ssr") => import("react").JSX.Element;
    ssrName: 'customData';
    docLink: string;
    type: Record<string, unknown> | null;
    getValue: () => never;
    setConfig: () => never;
    id: "webhook-custom-data";
};
