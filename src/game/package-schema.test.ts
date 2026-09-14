import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { compileJsonSchema } from '../package/json-schema';

const schema = readJson('../../spec/game-package/v1/datapackage.schema.json');
const validate = compileJsonSchema(schema);

describe('Eskuel game package JSON Schema', () => {
    it.each([
        'pokemon-adventure',
        'pokemon-adventure-postgresql',
    ])('accepts the published %s example descriptor', exampleName => {
        const descriptor = readExampleDescriptor(exampleName);

        expect(validate(descriptor), JSON.stringify(validate.errors, null, 2)).toBe(true);
    });

    it('accepts resources in either order', () => {
        const descriptor = readExampleDescriptor();
        const resources = descriptor.resources as unknown[];
        resources.reverse();

        expect(validate(descriptor), JSON.stringify(validate.errors, null, 2)).toBe(true);
    });

    it('requires one game resource and one database dependency', () => {
        const descriptor = readExampleDescriptor();
        const resources = descriptor.resources as Array<Record<string, unknown>>;
        resources[1] = { ...resources[0], path: 'data/other.xml' };

        expect(validate(descriptor)).toBe(false);
        expect(validate.errors).toContainEqual(expect.objectContaining({ keyword: 'contains' }));
    });

    it('rejects resource byte counts that are not safe JavaScript integers', () => {
        const descriptor = readExampleDescriptor();
        const resources = descriptor.resources as Array<Record<string, unknown>>;
        resources[0].bytes = Number.MAX_SAFE_INTEGER + 1;

        expect(validate(descriptor)).toBe(false);
        expect(validate.errors).toContainEqual(expect.objectContaining({ keyword: 'maximum' }));
    });

    it('rejects properties outside the strict v1 profile', () => {
        const descriptor = readExampleDescriptor();
        Object.assign(descriptor, { description: 'Not part of profile v1' });

        expect(validate(descriptor)).toBe(false);
        expect(validate.errors).toContainEqual(expect.objectContaining({ keyword: 'additionalProperties' }));
    });
});

function readExampleDescriptor(exampleName = 'pokemon-adventure'): Record<string, unknown> {
    return readJson(`../../spec/game-package/v1/examples/${exampleName}/datapackage.json`);
}

function readJson(relativePath: string): Record<string, unknown> {
    return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8')) as Record<string, unknown>;
}
