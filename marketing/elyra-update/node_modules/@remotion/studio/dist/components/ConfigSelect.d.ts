import React from 'react';
export declare const booleanOptions: readonly [{
    readonly label: 'Enabled';
    readonly value: true;
}, {
    readonly label: 'Disabled';
    readonly value: false;
}];
export declare const ConfigSelect: <T extends string | boolean>({ defaultLabel, description, name, onChange, options, value, }: {
    readonly defaultLabel: string;
    readonly description: React.ReactNode;
    readonly name: string;
    readonly onChange: (value: T | null) => void;
    readonly options: readonly {
        label: string;
        value: T;
    }[];
    readonly value: T | null;
}) => React.JSX.Element;
