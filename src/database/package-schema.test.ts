import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { compileJsonSchema } from '../package/json-schema';

const schema = readJson('../../spec/database-package/v1/datapackage.schema.json');
const validate = compileJsonSchema(schema);

describe('Eskuel database package JSON Schema', () => {
    it.each([
        'initial-sql-script/datapackage.json',
        'postgresql-initial-sql-script/datapackage.json',
        'database-file/datapackage.json',
    ])('accepts example %s', filename => {
        const descriptor = readJson(`../../spec/database-package/v1/examples/${filename}`);

        expect(validate(descriptor), JSON.stringify(validate.errors, null, 2)).toBe(true);
    });

    it('rejects properties outside the strict v1 profile', () => {
        const descriptor = readJson('../../spec/database-package/v1/examples/initial-sql-script/datapackage.json');
        Object.assign(descriptor, { description: 'Not part of profile v1' });

        expect(validate(descriptor)).toBe(false);
        expect(validate.errors).toContainEqual(expect.objectContaining({ keyword: 'additionalProperties' }));
    });

    it('enforces artifact-specific resource metadata', () => {
        const descriptor = readJson('../../spec/database-package/v1/examples/initial-sql-script/datapackage.json');
        const resources = descriptor.resources as Array<Record<string, unknown>>;
        resources[0].mediatype = 'application/vnd.sqlite3';

        expect(validate(descriptor)).toBe(false);
        expect(validate.errors).toContainEqual(expect.objectContaining({ keyword: 'const' }));
    });

    it('rejects resource byte counts that are not safe JavaScript integers', () => {
        const descriptor = readJson('../../spec/database-package/v1/examples/initial-sql-script/datapackage.json');
        const resources = descriptor.resources as Array<Record<string, unknown>>;
        resources[0].bytes = Number.MAX_SAFE_INTEGER + 1;

        expect(validate(descriptor)).toBe(false);
        expect(validate.errors).toContainEqual(expect.objectContaining({ keyword: 'maximum' }));
    });

    it('allows PostgreSQL for initialization scripts but not database files', () => {
        const postgresqlScript = readJson(
            '../../spec/database-package/v1/examples/postgresql-initial-sql-script/datapackage.json',
        );
        expect(validate(postgresqlScript), JSON.stringify(validate.errors, null, 2)).toBe(true);

        const databaseFile = readJson('../../spec/database-package/v1/examples/database-file/datapackage.json');
        const resources = databaseFile.resources as Array<Record<string, unknown>>;
        const metadata = resources[0]['eskuel:database'] as Record<string, unknown>;
        metadata.system = 'postgresql';

        expect(validate(databaseFile)).toBe(false);
        expect(validate.errors).toContainEqual(expect.objectContaining({ keyword: 'const' }));
    });

    it('requires every license to reference a bundled license text', () => {
        const descriptor = readJson('../../spec/database-package/v1/examples/initial-sql-script/datapackage.json');
        descriptor.licenses = [{ name: 'MIT' }];

        expect(validate(descriptor)).toBe(false);
        expect(validate.errors).toContainEqual(expect.objectContaining({ keyword: 'required' }));
    });

    it('rejects a remote URL as a license path', () => {
        const descriptor = readJson('../../spec/database-package/v1/examples/initial-sql-script/datapackage.json');
        descriptor.licenses = [{ name: 'MIT', path: 'https://opensource.org/license/mit' }];

        expect(validate(descriptor)).toBe(false);
        expect(validate.errors).toContainEqual(expect.objectContaining({ keyword: 'pattern' }));
    });

    it('accepts optional notice and provenance file references', () => {
        const descriptor = readJson('../../spec/database-package/v1/examples/initial-sql-script/datapackage.json');
        descriptor.notices = [{ title: 'Example notice', path: 'NOTICES/Example.txt' }];
        descriptor.provenance = { path: 'PROVENANCE.anything', mediatype: 'text/plain' };

        expect(validate(descriptor), JSON.stringify(validate.errors, null, 2)).toBe(true);
    });

    it('enforces conventional notice and provenance locations', () => {
        const descriptor = readJson('../../spec/database-package/v1/examples/initial-sql-script/datapackage.json');
        descriptor.notices = [{ path: 'Example.txt' }];
        descriptor.provenance = { path: 'metadata/PROVENANCE.json', mediatype: 'application/json' };

        expect(validate(descriptor)).toBe(false);
        expect(validate.errors).toContainEqual(expect.objectContaining({ keyword: 'pattern' }));
    });

    it('requires notice files to use the plain-text extension', () => {
        const descriptor = readJson('../../spec/database-package/v1/examples/initial-sql-script/datapackage.json');
        descriptor.notices = [{ path: 'NOTICES/Example.md' }];

        expect(validate(descriptor)).toBe(false);
        expect(validate.errors).toContainEqual(expect.objectContaining({ keyword: 'pattern' }));
    });

    it.each([
        'text/plain',
        'text/markdown',
        'application/json',
        'application/ld+json',
        'application/xml',
        'application/yaml',
    ])('accepts textual provenance media type %s', mediatype => {
        const descriptor = readJson('../../spec/database-package/v1/examples/initial-sql-script/datapackage.json');
        descriptor.provenance = { path: 'PROVENANCE', mediatype };

        expect(validate(descriptor), JSON.stringify(validate.errors, null, 2)).toBe(true);
    });

    it.each([
        { path: 'PROVENANCE.txt' },
        { path: 'PROVENANCE.data', mediatype: 'application/octet-stream' },
        { path: 'PROVENANCE.json', mediatype: 'APPLICATION/JSON' },
    ])('rejects provenance without a supported textual media type: %j', provenance => {
        const descriptor = readJson('../../spec/database-package/v1/examples/initial-sql-script/datapackage.json');
        descriptor.provenance = provenance;

        expect(validate(descriptor)).toBe(false);
    });
});

function readJson(relativePath: string): Record<string, unknown> {
    return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8')) as Record<string, unknown>;
}
