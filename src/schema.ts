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
    // Use `[\s\S]` to match *any* character (`.` does not match `\n`)
    const matches = createTableStatement.match(/CREATE TABLE\s*\"?([\w]+)\"?\s*\(([\s\S]*)\)/);

    if (matches === null || matches.length !== 3) {
        return { ok: false, error: { kind: 'extraction', details: 'Could not parse SQL CREATE TABLE statement.' } };
    }

    const name  = matches[1];

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

        // Determine which of the following three cases we have
        // 1. Explicit primary key?
        if (tableChunkTrimmed.startsWith('PRIMARY KEY')) {
            const matches = tableChunkTrimmed.match(/PRIMARY KEY\s*\((\"?[\w]+\"?)(?:\s*,\s*([\w]+))?\)/);
            if (matches === null) {
                return { ok: false, error: { kind: 'extraction', details: 'Could not parse PRIMARY KEY statement'} };
            }

            matches.shift(); // Remove first match (whole string)
            for (const primarykeyChunk of matches) {
                primaryKey.push(primarykeyChunk);
            }
        }
        // 2. Explicit foreign key?
        else if (tableChunkTrimmed.startsWith('FOREIGN KEY')) {
            const matches = tableChunkTrimmed.match(/FOREIGN KEY\s*\(([\w]+)\)\s*REFERENCES\s*(\w+)\s*\(\s*([\w]+)\s*\)/);
            if (matches === null || matches.length !== 4) {
                return { ok: false, error: { kind: 'extraction', details: 'Could not parse FOREIGN KEY statement'} };
            }

            const col = matches[1];
            if (foreignKeys[col] === undefined) {
                foreignKeys[col] = [];
            }
            foreignKeys[col].push(new ForeignKeyPart(matches[2], matches[3]));
        }
        // 3. Ordinary col?
        else {
            const [name, ...remainingChunks] = tableChunkTrimmed.split(/\s+/);
            const remainingChunksJoined = remainingChunks.join(' ').trim();

            if (remainingChunksJoined.includes('PRIMARY KEY')) {
                // Remove `PRIMARY KEY` string
                const type = remainingChunksJoined.split('PRIMARY KEY').join('').trim();

                cols.push({
                    name,
                    type
                });

                primaryKey.push(name);
            }
            else {
                cols.push({
                    name,
                    type: remainingChunksJoined
                });
            }
        }
    }
    
    return { ok: true, data: { name, cols, primaryKey, foreignKeys } };
}