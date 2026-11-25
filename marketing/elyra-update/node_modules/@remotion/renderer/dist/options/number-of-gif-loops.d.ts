export type NumberOfGifLoops = number | null;
export declare const numberOfGifLoopsOption: {
    name: string;
    addedIn: string;
    cliFlag: "number-of-gif-loops";
    description: () => import("react").JSX.Element;
    ssrName: 'numberOfGifLoops';
    docLink: string;
    type: number | null;
    getValue: ({ commandLine }: {
        commandLine: Record<string, unknown>;
    }) => {
        value: number;
        source: string;
    } | {
        value: null;
        source: string;
    };
    setConfig: (newLoop: NumberOfGifLoops) => void;
    id: "number-of-gif-loops";
};
