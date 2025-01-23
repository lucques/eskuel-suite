import { Game, LoadGameFail, xmlToGame, Scene, FetchXMLFail, GameSource } from './game-pure';
import { DbSource, FetchDbFail, InitDbFail, ParseSchemaFail, RunInitScriptFail, StaticDb } from './sql-js-api';
import { Fail, FetchFail, Success, assert, generateId, materializeBinarySource, materializeTextSource } from './util';
import { Schema } from './schema';


// Terminology:
// - "instance": Represents basically the model behind a tab
// - "status"
//   - Held in field `status`
//   - Describes the life cycle of the instance and usually settles in the beginning of the instance's life
//   - Affected by initial loading of the field `game`.
//     The status can be depicted by a simple state machine, starting with "pending".
//     Transitions are reflexive and monotone (= once active, always active; once failed, always failed).
//     - "pending" -- game_ok--> "active"
//     - "active"  -- game_ok--> "active"
//     - "pending" --!game_ok--> "failed"
//     - "failed"  --!game_ok--> "failed"
//   - The status is not affected by the init script or the schema. Both may fail for themselves.
// - "state"
//    - The currently held game *is* the editor's state 

export type StatusPending    = { kind: 'pending' } // Fields have been requested to activate, but request may be unresolved
export type StatusActive     = { kind: 'active'  } // Fields have been requested to activate and done so successfully
export type StatusFailed     = { kind: 'failed', error: LoadGameFail } // Fields have been requested to activate and failed to do so
export type Status = StatusPending | StatusActive | StatusFailed

export class EditorInstance {
    
    readonly id: string;

    private name:   string;

    private game:   Promise<Success<Game>      | Fail<LoadGameFail>>;
    private db:     Promise<Success<StaticDb>  | Fail<LoadGameFail | InitDbFail>>;
    
    private status: Status = { kind: 'pending' };
    
    // Not part of `status`.
    private schema:      Promise<Success<Schema>    | Fail<LoadGameFail | InitDbFail | ParseSchemaFail>>;

    constructor(name: string, source: GameSource) {
        this.id = 'editor-instance-' + generateId();

        this.name = name;

        // `game`: Init; thereby track status
        if (source.type === 'xml') {
            const rawSource = source.source;

            const sourceContent: Promise<Success<string> | Fail<FetchXMLFail>> =
                (rawSource.type === 'fetch'
                    ? fetch(rawSource.url).then((response: Response): Promise<Success<string> | Fail<FetchXMLFail>> => {
                        if (!response.ok) {
                            // Fail: 'fetch-xml'
                            return Promise.resolve({ ok: false, error: { kind: 'fetch-xml', url: rawSource.url } });
                        }
                        else {
                            return response.text()
                                .then((text: string): Promise<Success<string> | Fail<FetchXMLFail>> => {
                                    return Promise.resolve({ ok: true, data: text });
                                });
                        }
                    })
                    : Promise.resolve({ ok: true, data: rawSource.content })
                );

            this.game = sourceContent
                .then((textRes: Success<string> | Fail<FetchXMLFail>): Success<Game> | Fail<LoadGameFail> => {
                    if (!textRes.ok) {
                        return { ok: false, error: textRes.error };
                    }

                    const xml = (new DOMParser()).parseFromString(textRes.data, 'application/xml');
                    const gameRes = xmlToGame(xml);
                    
                    // Fail: 'parse-xml'
                    if (!gameRes.ok) {
                        return { ok: false, error: gameRes.error };
                    }

                    // Success
                    return { ok: true, data: gameRes.data };
                });
        }
        else {
            this.game = Promise.resolve({ ok: true, data: source.source });
        }
        // Track status
        this.game = this.game.then(res => this.updateStatusAfterGameResult(res));
        
        // `db`:     Init
        // `schema`: Init
        const initValues = this.createFreshDbAndSchema();
        this.db          = initValues.db;
        this.schema      = initValues.schema; 
    }

    getStatus(): Status {
        return this.status;
    }


    ///////////////////////////
    // Superficial meta data //
    ///////////////////////////

    // TODO: Remove `name` -- not needed?!
    getName(): string {
        return this.name;
    }


    //////////////
    // Requests //
    //////////////

    /**
     * Technically, no value really is requested.
     * The effect of this operation is though that the status is "active" or "failed"
     */
    async resolve(): Promise<Success<void> | Fail<LoadGameFail>> {
        return this.game.then(
            res => {
                if (!res.ok) {
                    return res;
                }
                else {
                    return { ok: true, data: undefined };
                }
            }
        );
    }

    async getGame(): Promise<Success<Game> | Fail<LoadGameFail>> {
        return this.game;
    }

    async getSchema(): Promise<Success<Schema> | Fail<LoadGameFail | InitDbFail | ParseSchemaFail>> {
        return this.schema;
    }


    //////////////////
    // User actions //
    //////////////////

    // We assert here that the editor is in status "active"

    async onCommitMetaData(title: string, teaser: string, copyright: string) {
        const gameRes = await this.game;
        assert(gameRes.ok, 'Illegal state');
        const game  = gameRes.data;

        // Update game
        const newGame = new Game(title, teaser, copyright, game.dbData, game.scenes);
        this.game = Promise.resolve({ok: true, data: newGame});

        // No need to update database
    }

    async onCommitDbSource(source: DbSource): Promise<void> {
        const gameRes = await this.game;
        assert(gameRes.ok, 'Illegal state');
        const game  = gameRes.data;

        if (source.type === 'initial-sql-script') {
            // Materialize initial SQL script
            return materializeTextSource(source.source).then((sqlRes: Success<string> | Fail<FetchFail>) => {
                if (sqlRes.ok) {
                    // Update game
                    const newGame = new Game(game.title, game.teaser, game.copyright, { type: 'initial-sql-script', sql: sqlRes.data }, game.scenes);
                    this.game = Promise.resolve({ok: true, data: newGame});

                    // Update database
                    Promise.resolve(this.resetDbAndSchema());
                }
                else {
                    // Update game
                    this.game = Promise.resolve({ok: false, error: { kind: 'fetch-xml', url: sqlRes.error.url }});
                }
            });
        }
        else {
            // Materialize SQLite db
            return materializeBinarySource(source.source).then((dataRes: Success<Uint8Array> | Fail<FetchFail>) => {
                if (dataRes.ok) {
                    // Update game
                    const newGame = new Game(game.title, game.teaser, game.copyright, { type: 'sqlite-db', data: dataRes.data }, game.scenes);
                    this.game = Promise.resolve({ok: true, data: newGame});

                    // Update database
                    Promise.resolve(this.resetDbAndSchema());
                }
                else {
                    // Update game
                    this.game = Promise.resolve({ok: false, error: { kind: 'fetch-xml', url: dataRes.error.url }});
                }
            });
        }
    }

    async onCommitScene(index: number, scene: Scene) {
        const gameRes = await this.game;
        assert(gameRes.ok, 'Illegal state');
        const game  = gameRes.data;

        // Assertions
        assert(index < game.scenes.length, 'Illegal state');

        // Update game
        const newScenes = game.scenes.map((s, i) => i === index ? scene : s);
        const newGame = new Game(game.title, game.teaser, game.copyright, game.dbData, newScenes);
        this.game = Promise.resolve({ok: true, data: newGame});

        // Nothing to do with the database
    }

    async onAddScene(scene: Scene) {
        const gameRes = await this.game;
        assert(gameRes.ok, 'Illegal state');
        const game  = gameRes.data;

        // Update game
        const newScenes = [...game.scenes, scene];
        const newGame = new Game(game.title, game.teaser, game.copyright, game.dbData, newScenes);
        this.game = Promise.resolve({ok: true, data: newGame});

        // Nothing to do with the database
    }

    async onDeleteScene(index: number) {
        const gameRes = await this.game;
        assert(gameRes.ok, 'Illegal state');
        const game  = gameRes.data;

        // Assertions
        assert(index < game.scenes.length, 'Illegal state');

        // Update game
        const newScenes = game.scenes.filter((_, i) => i !== index);
        const newGame = new Game(game.title, game.teaser, game.copyright, game.dbData, newScenes);
        this.game = Promise.resolve({ok: true, data: newGame});

        // Nothing to do with the database
    }

    async onReorderScenes(indices: number[]) {
        const gameRes = await this.game;
        assert(gameRes.ok, 'Illegal state');
        const game  = gameRes.data;

        // Assertions
        assert(indices.length === game.scenes.length, 'Illegal state');

        // Update game
        const newScenes = indices.map(i => game.scenes[i]);
        const newGame = new Game(game.title, game.teaser, game.copyright, game.dbData, newScenes);
        this.game = Promise.resolve({ok: true, data: newGame});

        // Nothing to do with the database
    }
    


    //////////////////
    // Track status //
    //////////////////

    // Move status according to state machine described above
    // At the end of every async operation, this function must be called:
    // - `updateStatus` transitions status to "active"/"failed" when the operation is resolved

    private async updateStatusAfterGameResult<T>(gameRes: Success<T> | Fail<LoadGameFail>): Promise<Success<T> | Fail<LoadGameFail>> {
        // "pending" --game_ok--> "active"
        // "active"  --game_ok--> "active"
        if ((this.status.kind === 'pending' || this.status.kind === 'active') && gameRes.ok) {
            this.status = { kind: 'active' };
        }
        // "pending" --!game_ok--> "failed"
        // "failed"  --!game_ok--> "failed"
        else if ((this.status.kind === 'pending' || this.status.kind === 'failed') && !gameRes.ok) {
            this.status = { kind: 'failed', error: gameRes.error };
        }
        else {
            assert(false, 'Illegal status transition');
        }
        return gameRes;
    }


    //////////////////////////////////////////////////////////////
    // Private: Manipulate game state and keep in sync with dbs //
    //////////////////////////////////////////////////////////////

    // We assert here that the game is in status "active"

    // The following functions `resetDbAndSchema` and `createFreshDbAndSchema` are only split because `resetDbAndSchema` cannot be used in constructor (limitation of TS's type system).
    private resetDbAndSchema() {
        const initValues = this.createFreshDbAndSchema();
        this.db          = initValues.db;
        this.schema      = initValues.schema;
    }

    private createFreshDbAndSchema(): { db: Promise<Success<StaticDb> | Fail<LoadGameFail | InitDbFail>>,
                                        schema: Promise<Success<Schema> | Fail<LoadGameFail | InitDbFail | ParseSchemaFail>>}
    {
        // `db`: Reset
        const db = this.game
            .then((gameRes: Success<Game> | Fail<LoadGameFail>): Success<StaticDb> | Fail<LoadGameFail> => {
                if (gameRes.ok) {
                    return { ok: true, data: new StaticDb(gameRes.data.dbData) };
                }
                else {
                    return gameRes;
                }
            })
            .then((dbRes: Success<StaticDb> | Fail<LoadGameFail>): Promise<Success<StaticDb> | Fail<LoadGameFail | InitDbFail>> => {
                if (!dbRes.ok) {
                    return Promise.resolve(dbRes);
                }
                else {
                    const res: Promise<Success<StaticDb> | Fail<LoadGameFail | InitDbFail>> =
                        dbRes.data.resolve().then(
                            ()      => { return Promise.resolve(dbRes); },
                            (error: RunInitScriptFail | FetchDbFail) => {
                                const e: RunInitScriptFail | FetchDbFail = error;

                                // Assertion holds because there is no SQL file to fetch
                                assert(error.kind !== 'fetch-db');
                                return { ok: false, error: error };
                            }
                        );

                    return res;
                }
            });

        const schema = db
            .then((db: Success<StaticDb> | Fail<LoadGameFail | InitDbFail>): Promise<Success<Schema> | Fail<LoadGameFail | InitDbFail | ParseSchemaFail>> => {
                if (db.ok) {
                    return db.data.querySchema().then((schema: Success<Schema> | Fail<InitDbFail | ParseSchemaFail>): Success<Schema> | Fail<LoadGameFail | InitDbFail | ParseSchemaFail> => {
                        if (schema.ok) {
                            return { ok: true, data: schema.data };
                        }
                        else {
                            return { ok: false, error: schema.error };
                        };
                    });
                }
                else {
                    return Promise.resolve({ ok: false, error: db.error });
                }
            });

        return { db, schema };
    }
}