import React from 'react';
export declare const isOptionalPackageInstalled: (packageName: string) => boolean;
export declare const markOptionalPackageInstalled: (packageName: string) => void;
export declare const installOptionalPackage: (packageName: string) => Promise<void>;
export declare const useOptionalPackageInstalled: (packageName: string) => boolean;
export declare const OptionalPackageModal: React.FC<{
    readonly ariaLabel: string;
    readonly children: React.ReactNode;
    readonly installButtonText: string;
    readonly installMessage: React.ReactNode | null;
    readonly packageName: string;
    readonly title: string;
}>;
