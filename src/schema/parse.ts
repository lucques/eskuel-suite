import type { ColInfo, ForeignKeyPart, TableInfo } from './model';
import type { Fail, Success } from '../util';


////////////////////////////////////////////////////
// Extract schema from SQL CREATE TABLE statement //
////////////////////////////////////////////////////

type InternalTableFail = { kind: 'internal-table' }
type ExtractionFail    = { kind: 'extraction', details: string }

type ParsedIdentifier = {
    value: string,
    end: number,
}

type ParsedParenthesized = {
    content: string,
    end: number,
}

type WordToken = {
    value: string,
    start: number,
    end: number,
}

type ParsedColumnChunk = {
    kind: 'column',
    col: ColInfo,
    isPrimaryKey: boolean,
    foreignKeys: ForeignKeyPart[],
}

type ParsedPrimaryKeyChunk = {
    kind: 'primary-key',
    cols: string[],
}

type ParsedForeignKeyChunk = {
    kind: 'foreign-key',
    localCols: string[],
    foreignTable: string,
    foreignCols: string[] | null,
}

type ParsedIgnoredConstraintChunk = {
    kind: 'ignored-constraint',
}

type ParsedTableChunk = ParsedColumnChunk | ParsedPrimaryKeyChunk | ParsedForeignKeyChunk | ParsedIgnoredConstraintChunk

type ConstraintPrefix = {
    body: string,
    isNamed: boolean,
}

type QuoteStart = '"' | '\'' | '`' | '[';

const createTablePrefixRegexp = /^CREATE\s+(?:(?:TEMP|TEMPORARY)\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/iu;
const bareIdentifierStartRegexp = /^[\p{L}_]$/u;
const bareIdentifierContinuationRegexp = /^[\p{L}\p{N}_$]$/u;
const tableSuffixRegexp = /^(?:(?:WITHOUT\s+ROWID|STRICT)(?:\s*,\s*(?:WITHOUT\s+ROWID|STRICT))?)?\s*;?$/iu;

const columnConstraintKeywords = new Set([
    'AS',
    'CHECK',
    'COLLATE',
    'CONSTRAINT',
    'DEFAULT',
    'GENERATED',
    'REFERENCES',
    'UNIQUE',
]);

export function extractTableInfo(createTableStatement: string): Success<TableInfo> | Fail<InternalTableFail | ExtractionFail> {
    const uncommentedStatement = removeComments(createTableStatement);

    if (uncommentedStatement === null) {
        return extractionFailure('Could not parse comments or quoted text in SQL CREATE TABLE statement.');
    }
    else {
        const tableInfo = parseCreateTableStatement(uncommentedStatement);

        if (tableInfo === null) {
            return extractionFailure('Could not parse SQL CREATE TABLE statement.');
        }
        else if (tableInfo.name === 'sqlite_sequence') {
            return { ok: false, error: { kind: 'internal-table' } };
        }
        else {
            return { ok: true, data: tableInfo };
        }
    }
}

function extractionFailure(details: string): Fail<ExtractionFail> {
    return { ok: false, error: { kind: 'extraction', details } };
}

function parseCreateTableStatement(statement: string): TableInfo | null {
    const trimmedStatement = statement.trim();
    const prefixMatch = trimmedStatement.match(createTablePrefixRegexp);

    if (prefixMatch === null) {
        return null;
    }
    else {
        const parsedName = parseIdentifier(trimmedStatement, prefixMatch[0].length);

        if (parsedName === null) {
            return null;
        }
        else {
            const bodyStart = skipWhitespace(trimmedStatement, parsedName.end);

            if (trimmedStatement[bodyStart] !== '(') {
                return null;
            }
            else {
                const parsedBody = parseParenthesized(trimmedStatement, bodyStart);

                if (parsedBody === null) {
                    return null;
                }
                else {
                    const suffix = normalizeWhitespace(trimmedStatement.slice(parsedBody.end));

                    if (!tableSuffixRegexp.test(suffix)) {
                        return null;
                    }
                    else {
                        return parseTableBody(parsedName.value, parsedBody.content);
                    }
                }
            }
        }
    }
}

function parseTableBody(name: string, body: string): TableInfo | null {
    const chunks = splitAtTopLevelCommas(body);

    if (chunks === null) {
        return null;
    }
    else {
        const cols: ColInfo[] = [];
        const primaryKey: string[] = [];
        const foreignKeys: {[key: string]: ForeignKeyPart[]} = {};
        let isValid = true;

        for (const chunk of chunks) {
            // Parse chunks only until one is found to be invalid.
            if (isValid) {
                const parsedChunk = parseTableChunk(chunk);

                if (parsedChunk === null) {
                    isValid = false;
                }
                else {
                    switch (parsedChunk.kind) {
                        case 'column':
                            cols.push(parsedChunk.col);
                            // Collect only columns declared with an inline primary-key constraint.
                            if (parsedChunk.isPrimaryKey) {
                                primaryKey.push(parsedChunk.col.name);
                            }
                            for (const foreignKey of parsedChunk.foreignKeys) {
                                addForeignKey(foreignKeys, parsedChunk.col.name, foreignKey);
                            }
                            break;
                        case 'primary-key':
                            primaryKey.push(...parsedChunk.cols);
                            break;
                        case 'foreign-key':
                            for (let index = 0; index < parsedChunk.localCols.length; index++) {
                                if (parsedChunk.foreignCols === null) {
                                    addForeignKey(foreignKeys, parsedChunk.localCols[index], {
                                        kind: 'primary-key',
                                        foreignTable: parsedChunk.foreignTable,
                                    });
                                }
                                else {
                                    addForeignKey(foreignKeys, parsedChunk.localCols[index], {
                                        kind: 'column',
                                        foreignTable: parsedChunk.foreignTable,
                                        foreignCol: parsedChunk.foreignCols[index],
                                    });
                                }
                            }
                            break;
                        case 'ignored-constraint':
                            break;
                        default: { const _n: never = parsedChunk; return _n; }
                    }
                }
            }
        }

        if (!isValid || cols.length === 0) {
            return null;
        }
        else {
            return { name, cols, primaryKey, foreignKeys };
        }
    }
}

function parseTableChunk(chunk: string): ParsedTableChunk | null {
    const constraintPrefix = parseConstraintPrefix(chunk);

    if (constraintPrefix === null) {
        return null;
    }
    else {
        const primaryKeyStart = consumeKeywordSequence(constraintPrefix.body, 0, ['PRIMARY', 'KEY']);
        const foreignKeyStart = consumeKeywordSequence(constraintPrefix.body, 0, ['FOREIGN', 'KEY']);
        const uniqueStart = consumeKeyword(constraintPrefix.body, 0, 'UNIQUE');
        const checkStart = consumeKeyword(constraintPrefix.body, 0, 'CHECK');

        if (primaryKeyStart !== null) {
            const primaryKey = parseTablePrimaryKey(constraintPrefix.body, primaryKeyStart);
            return primaryKey === null
                ? null
                : { kind: 'primary-key', cols: primaryKey };
        }
        else if (foreignKeyStart !== null) {
            return parseTableForeignKey(constraintPrefix.body, foreignKeyStart);
        }
        else if (uniqueStart !== null || checkStart !== null) {
            return { kind: 'ignored-constraint' };
        }
        else if (constraintPrefix.isNamed) {
            return null;
        }
        else {
            return parseColumnChunk(chunk);
        }
    }
}

function parseConstraintPrefix(chunk: string): ConstraintPrefix | null {
    const trimmedChunk = chunk.trim();
    const constraintEnd = consumeKeyword(trimmedChunk, 0, 'CONSTRAINT');

    if (constraintEnd === null) {
        return { body: trimmedChunk, isNamed: false };
    }
    else {
        const constraintNameStart = skipWhitespace(trimmedChunk, constraintEnd);
        const constraintName = parseIdentifier(trimmedChunk, constraintNameStart);

        if (constraintName === null) {
            return null;
        }
        else {
            const body = trimmedChunk.slice(constraintName.end).trim();

            if (body.length === 0) {
                return null;
            }
            else {
                return { body, isNamed: true };
            }
        }
    }
}

function parseColumnChunk(chunk: string): ParsedColumnChunk | null {
    const trimmedChunk = chunk.trim();
    const parsedName = parseIdentifier(trimmedChunk, 0);

    if (parsedName === null) {
        return null;
    }
    else {
        const declaration = trimmedChunk.slice(parsedName.end).trim();
        const words = getTopLevelWords(declaration);

        if (words === null) {
            return null;
        }
        else {
            const typeEnd = findDeclaredTypeEnd(declaration, words);
            const type = normalizeWhitespace(declaration.slice(0, typeEnd));
            const isPrimaryKey = containsKeywordSequence(words, ['PRIMARY', 'KEY']);
            const references = parseInlineForeignKeys(declaration, words);

            if (references === null) {
                return null;
            }
            else {
                return {
                    kind: 'column',
                    col: { name: parsedName.value, type },
                    isPrimaryKey,
                    foreignKeys: references,
                };
            }
        }
    }
}

function findDeclaredTypeEnd(declaration: string, words: WordToken[]): number {
    let typeEnd = declaration.length;
    let foundConstraint = false;

    for (let index = 0; index < words.length; index++) {
        // Search only until the beginning of the first constraint has been found.
        if (!foundConstraint) {
            const word = words[index].value.toUpperCase();
            const nextWord = words[index + 1]?.value.toUpperCase();
            const isPrimaryKey = word === 'PRIMARY' && nextWord === 'KEY';
            const isNotNull = word === 'NOT' && nextWord === 'NULL';
            const isOtherConstraint = columnConstraintKeywords.has(word);

            // The declared type ends at the first constraint keyword.
            if (isPrimaryKey || isNotNull || isOtherConstraint) {
                typeEnd = words[index].start;
                foundConstraint = true;
            }
        }
    }

    return typeEnd;
}

function parseInlineForeignKeys(declaration: string, words: WordToken[]): ForeignKeyPart[] | null {
    const foreignKeys: ForeignKeyPart[] = [];
    let isValid = true;

    for (const word of words) {
        // Parse only REFERENCES clauses while the declaration remains valid.
        if (isValid && word.value.toUpperCase() === 'REFERENCES') {
            const foreignTableStart = skipWhitespace(declaration, word.end);
            const foreignTable = parseIdentifier(declaration, foreignTableStart);

            if (foreignTable === null) {
                isValid = false;
            }
            else {
                const foreignColsStart = skipWhitespace(declaration, foreignTable.end);

                if (declaration[foreignColsStart] !== '(') {
                    foreignKeys.push({
                        kind: 'primary-key',
                        foreignTable: foreignTable.value,
                    });
                }
                else {
                    const parsedForeignCols = parseParenthesized(declaration, foreignColsStart);

                    if (parsedForeignCols === null) {
                        isValid = false;
                    }
                    else {
                        const foreignCols = parseIdentifierList(parsedForeignCols.content);

                        if (foreignCols === null || foreignCols.length !== 1) {
                            isValid = false;
                        }
                        else {
                            foreignKeys.push({
                                kind: 'column',
                                foreignTable: foreignTable.value,
                                foreignCol: foreignCols[0],
                            });
                        }
                    }
                }
            }
        }
    }

    return isValid ? foreignKeys : null;
}

function parseTablePrimaryKey(body: string, prefixEnd: number): string[] | null {
    const colsStart = skipWhitespace(body, prefixEnd);

    if (body[colsStart] !== '(') {
        return null;
    }
    else {
        const parsedCols = parseParenthesized(body, colsStart);

        if (parsedCols === null) {
            return null;
        }
        else {
            const cols = parseIndexedIdentifierList(parsedCols.content, true);

            if (cols === null) {
                return null;
            }
            else {
                const suffix = body.slice(parsedCols.end).trim();

                if (!isValidPrimaryKeySuffix(suffix)) {
                    return null;
                }
                else {
                    return cols;
                }
            }
        }
    }
}

function isValidPrimaryKeySuffix(suffix: string): boolean {
    if (suffix.length === 0) {
        return true;
    }
    else {
        const onEnd = consumeKeyword(suffix, 0, 'ON');

        if (onEnd === null) {
            return false;
        }
        else {
            const conflictEnd = consumeKeyword(suffix, onEnd, 'CONFLICT');

            if (conflictEnd === null) {
                return false;
            }
            else {
                const resolution = parseIdentifier(suffix, skipWhitespace(suffix, conflictEnd));
                return resolution !== null && suffix.slice(resolution.end).trim().length === 0;
            }
        }
    }
}

function parseTableForeignKey(body: string, prefixEnd: number): ParsedForeignKeyChunk | null {
    const localColsStart = skipWhitespace(body, prefixEnd);

    if (body[localColsStart] !== '(') {
        return null;
    }
    else {
        const parsedLocalCols = parseParenthesized(body, localColsStart);

        if (parsedLocalCols === null) {
            return null;
        }
        else {
            const localCols = parseIdentifierList(parsedLocalCols.content);
            const referencesEnd = consumeKeyword(body, parsedLocalCols.end, 'REFERENCES');

            if (localCols === null || referencesEnd === null) {
                return null;
            }
            else {
                const foreignTable = parseIdentifier(body, skipWhitespace(body, referencesEnd));

                if (foreignTable === null) {
                    return null;
                }
                else {
                    const foreignColsStart = skipWhitespace(body, foreignTable.end);

                    if (body[foreignColsStart] !== '(') {
                        return {
                            kind: 'foreign-key',
                            localCols,
                            foreignTable: foreignTable.value,
                            foreignCols: null,
                        };
                    }
                    else {
                        const parsedForeignCols = parseParenthesized(body, foreignColsStart);

                        if (parsedForeignCols === null) {
                            return null;
                        }
                        else {
                            const foreignCols = parseIdentifierList(parsedForeignCols.content);

                            if (foreignCols === null || localCols.length !== foreignCols.length) {
                                return null;
                            }
                            else {
                                return {
                                    kind: 'foreign-key',
                                    localCols,
                                    foreignTable: foreignTable.value,
                                    foreignCols,
                                };
                            }
                        }
                    }
                }
            }
        }
    }
}

function parseIdentifierList(source: string): string[] | null {
    const parts = splitAtTopLevelCommas(source);

    if (parts === null) {
        return null;
    }
    else {
        const identifiers: string[] = [];
        let isValid = true;

        for (const part of parts) {
            // Parse identifiers only until one is found to be invalid.
            if (isValid) {
                const trimmedPart = part.trim();
                const identifier = parseIdentifier(trimmedPart, 0);

                if (identifier === null || trimmedPart.slice(identifier.end).trim().length > 0) {
                    isValid = false;
                }
                else {
                    identifiers.push(identifier.value);
                }
            }
        }

        return isValid ? identifiers : null;
    }
}

function parseIndexedIdentifierList(source: string, allowTrailingAutoincrement = false): string[] | null {
    const parts = splitAtTopLevelCommas(source);

    if (parts === null) {
        return null;
    }
    else {
        const identifiers: string[] = [];
        let isValid = true;

        for (let index = 0; index < parts.length; index++) {
            // Parse indexed identifiers only until one is found to be invalid.
            if (isValid) {
                const isLastPart = index === parts.length - 1;
                const identifier = parseIndexedIdentifier(parts[index], allowTrailingAutoincrement && isLastPart);

                if (identifier === null) {
                    isValid = false;
                }
                else {
                    identifiers.push(identifier);
                }
            }
        }

        return isValid ? identifiers : null;
    }
}

function parseIndexedIdentifier(source: string, allowAutoincrement = false): string | null {
    const trimmedSource = source.trim();
    const identifier = parseIdentifier(trimmedSource, 0);

    if (identifier === null) {
        return null;
    }
    else {
        let cursor = identifier.end;
        const collateEnd = consumeKeyword(trimmedSource, cursor, 'COLLATE');

        // Consume the optional collation clause when present.
        if (collateEnd !== null) {
            const collation = parseIdentifier(trimmedSource, skipWhitespace(trimmedSource, collateEnd));

            if (collation === null) {
                return null;
            }
            else {
                cursor = collation.end;
            }
        }

        const ascEnd = consumeKeyword(trimmedSource, cursor, 'ASC');
        const descEnd = consumeKeyword(trimmedSource, cursor, 'DESC');

        // Consume the optional sort-order modifier when present.
        if (ascEnd !== null) {
            cursor = ascEnd;
        }
        else if (descEnd !== null) {
            cursor = descEnd;
        }

        if (allowAutoincrement) {
            const autoincrementEnd = consumeKeyword(trimmedSource, cursor, 'AUTOINCREMENT');

            if (autoincrementEnd !== null) {
                cursor = autoincrementEnd;
            }
        }

        if (trimmedSource.slice(cursor).trim().length > 0) {
            return null;
        }
        else {
            return identifier.value;
        }
    }
}

function addForeignKey(
    foreignKeys: {[key: string]: ForeignKeyPart[]},
    localCol: string,
    foreignKey: ForeignKeyPart,
): void {
    // Initialize storage without replacing references already collected for this column.
    if (foreignKeys[localCol] === undefined) {
        foreignKeys[localCol] = [];
    }

    foreignKeys[localCol].push(foreignKey);
}

function removeComments(source: string): string | null {
    let result = '';
    let cursor = 0;
    let isValid = true;

    while (cursor < source.length && isValid) {
        const char = source[cursor];

        if (isQuote(char)) {
            const quotedEnd = findQuotedEnd(source, cursor, char);

            if (quotedEnd === null) {
                isValid = false;
            }
            else {
                result += source.slice(cursor, quotedEnd);
                cursor = quotedEnd;
            }
        }
        else if (char === '-' && source[cursor + 1] === '-') {
            result += ' ';
            cursor += 2;

            while (cursor < source.length && source[cursor] !== '\n' && source[cursor] !== '\r') {
                cursor++;
            }
        }
        else if (char === '/' && source[cursor + 1] === '*') {
            const commentEnd = source.indexOf('*/', cursor + 2);

            if (commentEnd < 0) {
                isValid = false;
            }
            else {
                result += ' ';
                cursor = commentEnd + 2;
            }
        }
        else {
            result += char;
            cursor++;
        }
    }

    return isValid ? result : null;
}

function splitAtTopLevelCommas(source: string): string[] | null {
    const parts: string[] = [];
    let partStart = 0;
    let cursor = 0;
    let parenthesisDepth = 0;
    let isValid = true;

    while (cursor < source.length && isValid) {
        const char = source[cursor];

        if (isQuote(char)) {
            const quotedEnd = findQuotedEnd(source, cursor, char);

            if (quotedEnd === null) {
                isValid = false;
            }
            else {
                cursor = quotedEnd;
            }
        }
        else if (char === '(') {
            parenthesisDepth++;
            cursor++;
        }
        else if (char === ')') {
            if (parenthesisDepth === 0) {
                isValid = false;
            }
            else {
                parenthesisDepth--;
                cursor++;
            }
        }
        else if (char === ',' && parenthesisDepth === 0) {
            const part = source.slice(partStart, cursor).trim();

            if (part.length === 0) {
                isValid = false;
            }
            else {
                parts.push(part);
                cursor++;
                partStart = cursor;
            }
        }
        else {
            cursor++;
        }
    }

    if (isValid && parenthesisDepth === 0) {
        const finalPart = source.slice(partStart).trim();

        if (finalPart.length === 0) {
            isValid = false;
        }
        else {
            parts.push(finalPart);
        }
    }
    else {
        isValid = false;
    }

    return isValid ? parts : null;
}

function parseParenthesized(source: string, start: number): ParsedParenthesized | null {
    if (source[start] !== '(') {
        return null;
    }
    else {
        let cursor = start;
        let parenthesisDepth = 0;
        let parsed: ParsedParenthesized | null = null;
        let isValid = true;

        while (cursor < source.length && parsed === null && isValid) {
            const char = source[cursor];

            if (isQuote(char)) {
                const quotedEnd = findQuotedEnd(source, cursor, char);

                if (quotedEnd === null) {
                    isValid = false;
                }
                else {
                    cursor = quotedEnd;
                }
            }
            else if (char === '(') {
                parenthesisDepth++;
                cursor++;
            }
            else if (char === ')') {
                parenthesisDepth--;

                if (parenthesisDepth === 0) {
                    parsed = {
                        content: source.slice(start + 1, cursor),
                        end: cursor + 1,
                    };
                }
                else if (parenthesisDepth < 0) {
                    isValid = false;
                }
                else {
                    cursor++;
                }
            }
            else {
                cursor++;
            }
        }

        return isValid ? parsed : null;
    }
}

function getTopLevelWords(source: string): WordToken[] | null {
    const words: WordToken[] = [];
    let cursor = 0;
    let parenthesisDepth = 0;
    let isValid = true;

    while (cursor < source.length && isValid) {
        const char = source[cursor];

        if (isQuote(char)) {
            const quotedEnd = findQuotedEnd(source, cursor, char);

            if (quotedEnd === null) {
                isValid = false;
            }
            else {
                cursor = quotedEnd;
            }
        }
        else if (char === '(') {
            parenthesisDepth++;
            cursor++;
        }
        else if (char === ')') {
            if (parenthesisDepth === 0) {
                isValid = false;
            }
            else {
                parenthesisDepth--;
                cursor++;
            }
        }
        else if (parenthesisDepth === 0 && isBareIdentifierStart(char)) {
            const wordStart = cursor;
            cursor++;

            while (cursor < source.length && isBareIdentifierContinuation(source[cursor])) {
                cursor++;
            }

            words.push({
                value: source.slice(wordStart, cursor),
                start: wordStart,
                end: cursor,
            });
        }
        else {
            cursor++;
        }
    }

    // Reject the token stream only when its parentheses are unbalanced.
    if (parenthesisDepth !== 0) {
        isValid = false;
    }

    return isValid ? words : null;
}

function containsKeywordSequence(words: WordToken[], keywords: string[]): boolean {
    let containsSequence = false;

    for (let index = 0; index <= words.length - keywords.length && !containsSequence; index++) {
        let matches = true;

        for (let keywordIndex = 0; keywordIndex < keywords.length; keywordIndex++) {
            // A mismatch rejects the current keyword sequence.
            if (words[index + keywordIndex].value.toUpperCase() !== keywords[keywordIndex]) {
                matches = false;
            }
        }

        // Stop at the first matching keyword sequence.
        if (matches) {
            containsSequence = true;
        }
    }

    return containsSequence;
}

function parseIdentifier(source: string, start: number): ParsedIdentifier | null {
    const char = source[start];

    if (isQuote(char)) {
        const closingQuote = char === '[' ? ']' : char;
        let value = '';
        let cursor = start + 1;
        let parsed: ParsedIdentifier | null = null;

        while (cursor < source.length && parsed === null) {
            if (source[cursor] === closingQuote) {
                if (char !== '[' && source[cursor + 1] === closingQuote) {
                    value += closingQuote;
                    cursor += 2;
                }
                else {
                    parsed = { value, end: cursor + 1 };
                }
            }
            else {
                value += source[cursor];
                cursor++;
            }
        }

        return parsed;
    }
    else if (isBareIdentifierStart(char)) {
        let cursor = start + 1;

        while (cursor < source.length && isBareIdentifierContinuation(source[cursor])) {
            cursor++;
        }

        return {
            value: source.slice(start, cursor),
            end: cursor,
        };
    }
    else {
        return null;
    }
}

function findQuotedEnd(source: string, start: number, quote: QuoteStart): number | null {
    const closingQuote = quote === '[' ? ']' : quote;
    let cursor = start + 1;
    let end: number | null = null;

    while (cursor < source.length && end === null) {
        if (source[cursor] === closingQuote) {
            if (quote !== '[' && source[cursor + 1] === closingQuote) {
                cursor += 2;
            }
            else {
                end = cursor + 1;
            }
        }
        else {
            cursor++;
        }
    }

    return end;
}

function consumeKeywordSequence(source: string, start: number, keywords: string[]): number | null {
    let cursor = start;
    let isValid = true;

    for (const keyword of keywords) {
        // Consume keywords only until the first mismatch.
        if (isValid) {
            const keywordEnd = consumeKeyword(source, cursor, keyword);

            if (keywordEnd === null) {
                isValid = false;
            }
            else {
                cursor = keywordEnd;
            }
        }
    }

    return isValid ? cursor : null;
}

function consumeKeyword(source: string, start: number, keyword: string): number | null {
    const keywordStart = skipWhitespace(source, start);
    const keywordEnd = keywordStart + keyword.length;
    const candidate = source.slice(keywordStart, keywordEnd);

    if (candidate.toUpperCase() !== keyword || isBareIdentifierContinuation(source[keywordEnd])) {
        return null;
    }
    else {
        return keywordEnd;
    }
}

function skipWhitespace(source: string, start: number): number {
    let cursor = start;

    while (cursor < source.length && /\s/u.test(source[cursor])) {
        cursor++;
    }

    return cursor;
}

function normalizeWhitespace(source: string): string {
    return source.trim().replace(/\s+/gu, ' ');
}

function isQuote(char: string | undefined): char is QuoteStart {
    return char === '"' || char === '\'' || char === '`' || char === '[';
}

function isBareIdentifierStart(char: string | undefined): boolean {
    return char !== undefined && bareIdentifierStartRegexp.test(char);
}

function isBareIdentifierContinuation(char: string | undefined): boolean {
    return char !== undefined && bareIdentifierContinuationRegexp.test(char);
}
