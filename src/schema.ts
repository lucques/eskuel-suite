import { Fail, Success } from "./util";


//////////////////////////
// Types for SQL schema //
//////////////////////////

export class ColInfo {
    constructor(public readonly name: string, public readonly type: string) {}
}

export class ForeignKeyPart {
    constructor(public readonly foreignTable: string, public readonly foreignCol: string) {}
}

export class TableInfo {
    constructor(
        public readonly name: string,
        public readonly cols: ColInfo[],
        public readonly primaryKey: string[],
        public readonly foreignKeys: {[key: string]: ForeignKeyPart[]}
    ) {}
}

export type Schema = TableInfo[];


////////////////////////////////////////////////////
// Extract schema from SQL CREATE TABLE statement //
////////////////////////////////////////////////////

type InternalTableFail = { kind: 'internal-table' }
type ExtractionFail    = { kind: 'extraction', details: string }

export function extractTableInfo(createTableStatement: string): Success<TableInfo> | Fail<InternalTableFail | ExtractionFail> {
    ////////////////////////////
    // Parsing infrastructure //
    ////////////////////////////

console.log(createTableStatement);

    // Tag function for template literals that is used to produce regexes
    let r = String.raw;

    // Use `idRegex` to capture an identifier (e.g. table name, col name, etc.)
    const idRegexp = r`(` +
                       r`[\p{L}_]+` + r`|` + // single word
                       r`"[^"]+"`   + r`|` + // any word sequence enclosed by "
                       r`'[^']+'`   + r`|` + // any word sequence enclosed by '
                        '`[^`]+`'          + // any word sequence enclosed by `
                     r`)`;
    
    function parseId(match: string): string {
        if (match.startsWith('"') || match.startsWith('\'') || match.startsWith('`')) {
            return match.slice(1, -1);
        }
        return match;
    }

    // Use `[\s\S]` to match *any* character (`.` does not match `\n`)

    // Groups: 1. table name, 2. column definitions
    const createTableStatementRegexp = new RegExp(r`CREATE TABLE\s+` + idRegexp + r`\s*\(([\s\S]*)\)`, 'u');
    // Groups: 1. column names
    const primaryKeyRegexp           = new RegExp(r`PRIMARY KEY\s*\(([^)]+)\)`);
    // Groups: 1. column name, 2. foreign table, 3. foreign column
    const foreignKeyRegexp           = new RegExp(r`FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s*` + idRegexp + r`\s*\(([^)]+)\)`, 'u');
    // Groups: 1. column name, 2. rest
    const colRegexp                  = new RegExp(idRegexp + r`\s*([\s\S]*)`, 'u');


    ///////////
    // Do it //
    ///////////

    const matches = createTableStatement.match(createTableStatementRegexp);

    if (matches === null || matches.length !== 3) {
        return { ok: false, error: { kind: 'extraction', details: 'Could not parse SQL CREATE TABLE statement.' } };
    }

    const name  = parseId(matches[1]);

    // Ignore internal SQLite tables
    if (name === 'sqlite_sequence') {
        return { ok: false, error: { kind: 'internal-table' } };
    }

    const colsData = matches[2].replace(/--.*\n/g, ''); // Remove SQL comments

    const tableChunkMatches = colsData.match(/([^\(,]+(?:\([^\)]+\))?)+/g);

    if (tableChunkMatches === null) {
        return { ok: false, error: { kind: 'extraction', details: 'Could not parse table definition' } };
    }

    const cols:        ColInfo[]                         = [];
    const primaryKey:  string[]                          = [];
    const foreignKeys: {[key: string]: ForeignKeyPart[]} = {};

    for (const tableChunk of tableChunkMatches)
    {
        const tableChunkTrimmed = tableChunk.trim();

        // Determine which of the following three cases we have.
        // 1. Explicit primary key?
        if (tableChunkTrimmed.startsWith('PRIMARY KEY')) {
            const match = tableChunkTrimmed.match(primaryKeyRegexp);
            if (match === null) {
                return { ok: false, error: { kind: 'extraction', details: 'Could not parse PRIMARY KEY statement: `' + tableChunkTrimmed + '`'} };
            }

            const names = match[1].split(',').map(name => parseId(name.trim()));

            for (const name of names) {
                primaryKey.push(name);
            }
        }
        // 2. Explicit foreign key?
        else if (tableChunkTrimmed.startsWith('FOREIGN KEY')) {
            const match = tableChunkTrimmed.match(foreignKeyRegexp);
            if (match === null || match.length !== 4) {
                return { ok: false, error: { kind: 'extraction', details: 'Could not parse FOREIGN KEY statement + `' + tableChunkTrimmed + '`'} };
            }

            const col = parseId(match[1]);
            if (foreignKeys[col] === undefined) {
                foreignKeys[col] = [];
            }
            foreignKeys[col].push(new ForeignKeyPart(parseId(match[2]), parseId(match[3])));
        }
        // 3. Ordinary col?
        else {
            const match = tableChunkTrimmed.match(colRegexp);
            if (match === null || match.length !== 3) {
                console.log(match);
                return { ok: false, error: { kind: 'extraction', details: 'Could not parse column definition: `' + tableChunkTrimmed + '`'} };
            }
            const name = parseId(match[1]);
            const rest = match[2].trim();
            const remainingChunks = rest.split(/\s+/).join(' ').trim();

            if (remainingChunks.includes('PRIMARY KEY')) {
                // Remove `PRIMARY KEY` string
                const type = remainingChunks.split('PRIMARY KEY').join('').trim();

                cols.push({
                    name,
                    type
                });

                primaryKey.push(name);
            }
            else {
                cols.push({
                    name,
                    type: remainingChunks
                });
            }
        }
    }
    
    return { ok: true, data: { name, cols, primaryKey, foreignKeys } };
}