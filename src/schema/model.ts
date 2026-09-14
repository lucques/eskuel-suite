export class ColInfo {
    constructor(public readonly name: string, public readonly type: string) {}
}

export type ForeignKeyPart =
    | {
        readonly kind: 'column',
        readonly foreignTable: string,
        readonly foreignCol: string,
    }
    | {
        readonly kind: 'primary-key',
        readonly foreignTable: string,
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
