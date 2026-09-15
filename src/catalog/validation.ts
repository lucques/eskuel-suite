import type {
    DatabaseCatalogEntry,
    GameCatalogEntry,
} from './model';

type UnknownRecord = Record<string, unknown>;

export function assertGameCatalog(candidate: unknown): asserts candidate is readonly GameCatalogEntry[] {
    validateCatalog(candidate, 'Game catalog');
}

export function assertDatabaseCatalog(candidate: unknown): asserts candidate is readonly DatabaseCatalogEntry[] {
    validateCatalog(candidate, 'Database catalog');
}

function validateCatalog(
    candidate: unknown,
    context: string,
): void {
    const entries = requireArray(candidate, context);
    validateUniqueEntryIds(entries, context);
    entries.forEach((entry, index) => validateCatalogEntry(entry, `${context} entry ${index + 1}`));
}

function validateUniqueEntryIds(entries: readonly unknown[], context: string): void {
    const ids = new Set<string>();
    for (const [index, entry] of entries.entries()) {
        const record = requireRecord(entry, `${context} entry ${index + 1}`);
        const id = requireNonEmptyString(record.id, `${context} entry ${index + 1}.id`);
        if (ids.has(id)) {
            invalid(`${context} contains duplicate ID '${id}'`);
        }
        else {
            ids.add(id);
        }
    }
}

function validateCatalogEntry(
    candidate: unknown,
    context: string,
): void {
    const entry = requireRecord(candidate, context);
    requireNonEmptyString(entry.id, `${context}.id`);
    const localizations = requireRecord(entry.localizations, `${context}.localizations`);
    requireNonEmptyRecord(localizations, `${context}.localizations`);
    for (const [language, localizationCandidate] of Object.entries(localizations)) {
        requireNonEmptyString(language, `${context}.localizations language`);
        validateLocalization(localizationCandidate, `${context}.localizations.${language}`);
    }
}

function validateLocalization(
    candidate: unknown,
    context: string,
): void {
    const localization = requireRecord(candidate, context);
    requireNonEmptyString(localization.title, `${context}.title`);
    validateOptionalNonEmptyString(localization, 'pageUrl', context);
    const files = requireArray(localization.files, `${context}.files`);
    const filenames = new Set<string>();
    for (const [index, fileCandidate] of files.entries()) {
        const fileContext = `${context}.files[${index}]`;
        const file = requireRecord(fileCandidate, fileContext);
        requireNonEmptyString(file.url, `${fileContext}.url`);
        const filename = requireNonEmptyString(file.filename, `${fileContext}.filename`);
        if (filenames.has(filename)) {
            invalid(`${context}.files contains duplicate filename '${filename}'`);
        }
        else {
            filenames.add(filename);
        }
    }
}

function validateOptionalNonEmptyString(record: UnknownRecord, property: string, context: string): void {
    if (property in record) {
        requireNonEmptyString(record[property], `${context}.${property}`);
    }
}

function requireNonEmptyRecord(record: UnknownRecord, context: string): void {
    if (Object.keys(record).length === 0) {
        invalid(`${context} must not be empty`);
    }
}

function requireRecord(candidate: unknown, context: string): UnknownRecord {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
        return invalid(`${context} must be an object`);
    }
    else {
        return candidate as UnknownRecord;
    }
}

function requireArray(candidate: unknown, context: string): readonly unknown[] {
    if (!Array.isArray(candidate)) {
        return invalid(`${context} must be an array`);
    }
    else {
        return candidate;
    }
}

function requireNonEmptyString(candidate: unknown, context: string): string {
    if (typeof candidate !== 'string' || candidate.trim() === '') {
        return invalid(`${context} must be a non-empty string`);
    }
    else {
        return candidate;
    }
}

function invalid(message: string): never {
    throw new TypeError(`Invalid Eskuel catalog: ${message}`);
}
