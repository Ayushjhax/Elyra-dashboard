import type { ZodTypesType } from '../../get-zod-if-possible';
import { type AnyZodSchema } from './zod-schema-type';
export declare const createZodValues: (schema: AnyZodSchema, zodRuntime: unknown, zodTypes: ZodTypesType | null) => unknown;
