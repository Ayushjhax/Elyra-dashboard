import type { ZodTypesType } from '../../get-zod-if-possible';
import { type AnyZodSchema } from './zod-schema-type';
export declare const extractEnumJsonPaths: ({ schema, zodRuntime, currentPath, zodTypes, }: {
    schema: AnyZodSchema;
    zodRuntime: unknown;
    zodTypes: ZodTypesType | null;
    currentPath: (string | number)[];
}) => (string | number)[][];
