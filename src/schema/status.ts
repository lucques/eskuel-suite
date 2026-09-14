import type { Schema } from './model';

export type ParseSchemaFail = { kind: 'parse-schema', details: string };

export type SchemaStatus =
    | { kind: 'pending' }
    | { kind: 'loaded', data: Schema }
    | { kind: 'failed', error: ParseSchemaFail };
