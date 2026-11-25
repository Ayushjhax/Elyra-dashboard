import type { ClassDeclaration, File, FunctionDeclaration, ImportDeclaration, ImportSpecifier, VariableDeclaration } from '@babel/types';
export declare const declarationBindsName: (declaration: FunctionDeclaration | ClassDeclaration | VariableDeclaration, name: string) => any;
export declare const hasTopLevelBinding: ({ ast, name }: {
    ast: File;
    name: string;
}) => boolean;
export declare const getImportedName: (specifier: ImportSpecifier) => string;
export declare const findImportDeclaration: (ast: File, sourcePath: string) => ImportDeclaration | null;
export declare const insertImportDeclaration: (ast: File, importDeclaration: ImportDeclaration) => void;
export declare const normalizeImportSpacing: (input: string) => string;
export declare const ensureNamedImport: ({ ast, importedName, sourcePath, localName, }: {
    ast: File;
    importedName: string;
    sourcePath: string;
    localName: string;
}) => string;
export declare const ensureNamedImports: ({ ast, importedNames, sourcePath, }: {
    ast: File;
    importedNames: ReadonlySet<string>;
    sourcePath: string;
}) => void;
export declare const getImportDeclarations: ({ ast, sourcePath, }: {
    ast: File;
    sourcePath: string;
}) => ImportDeclaration[];
export declare const ensureOfficialNamedImport: ({ ast, importedName, sourcePath, preferredLocalName, }: {
    ast: File;
    importedName: string;
    sourcePath: string;
    preferredLocalName: string;
}) => string;
export declare const ensureStaticFileBinding: (ast: File) => void;
