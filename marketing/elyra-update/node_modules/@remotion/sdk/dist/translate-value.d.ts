export declare const roundToDecimalPlaces: (value: number, decimalPlaces: number) => number;
export type ParsedTranslate = readonly [number, number, number | null];
export type TranslateUnit = 'px' | '%';
export type ParsedTranslateWithUnits = readonly [
    {
        readonly value: number;
        readonly unit: TranslateUnit;
    },
    {
        readonly value: number;
        readonly unit: TranslateUnit;
    },
    {
        readonly value: number;
        readonly unit: 'px';
    } | null
];
export declare const parseTranslateWithUnits: (value: string) => ParsedTranslateWithUnits | null;
/** Pixel translate coordinates; percentages and unparseable values read as the origin. */
export declare const parseTranslate: (value: string) => ParsedTranslate;
export declare const serializeTranslateWithUnits: ([x, y, z]: ParsedTranslateWithUnits, decimalPlaces?: number) => string;
export declare const serializeTranslate: ([x, y, z]: ParsedTranslate, decimalPlaces?: number) => string;
