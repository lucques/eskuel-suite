import { Game, XMLFail, GameState, xmlToGame, areResultsEqual, GameResult, GameResultCorrect, GameResultMiss, ParseXMLFail, Scene, FetchXMLFail } from './game-pure';
import { FetchInitScriptFail, ParseSchemaFail, RunInitScriptFail, SqlResult, StaticDb } from './sql-js-api';
import { Fail, FetchFail, FileSource, Success, assert, generateId, materializeFileSource } from './util';
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
export type StatusFailed     = { kind: 'failed', error: XMLFail } // Fields have been requested to activate and failed to do so
export type Status = StatusPending | StatusActive | StatusFailed

export class EditorInstance {
    
    readonly id: string;

    private name:   string;

    private game:   Promise<Success<Game>      | Fail<XMLFail>>;
    private db:     Promise<Success<StaticDb>  | Fail<XMLFail | RunInitScriptFail>>;
    
    private status: Status = { kind: 'pending' };
    
    // Not part of `status`.
    private schema:      Promise<Success<Schema>    | Fail<XMLFail | RunInitScriptFail | ParseSchemaFail>>;

    constructor(name: string, gameSource: FileSource) {
        this.id = 'editor-instance-' + generateId();

        this.name = name;

        // `game`: Init; thereby track status
        const gameSourceContent: Promise<Success<string> | Fail<FetchXMLFail>> =
            gameSource.type === 'fetch'
            ? fetch(gameSource.url).then((response: Response): Promise<Success<string> | Fail<FetchXMLFail>> => {
                if (!response.ok) {
                    // Fail: 'fetch-xml'
                    return Promise.resolve({ ok: false, error: { kind: 'fetch-xml', url: gameSource.url } });
                }
                else {
                    return response.text()
                        .then((text: string): Promise<Success<string> | Fail<FetchXMLFail>> => {
                            return Promise.resolve({ ok: true, data: text });
                        });
                }
            })
            : Promise.resolve({ ok: true, data: gameSource.content });
        this.game = gameSourceContent
            .then((textRes: Success<string> | Fail<FetchXMLFail>): Success<Game> | Fail<XMLFail> => {
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
            })
            .then(res => this.updateStatusAfterGameResult(res)); // Track status
        
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
    async resolve(): Promise<Success<void> | Fail<XMLFail>> {
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

    async getGame(): Promise<Success<Game> | Fail<XMLFail>> {
        return this.game;
    }

    async getSchema(): Promise<Success<Schema> | Fail<XMLFail | RunInitScriptFail | ParseSchemaFail>> {
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
        const newGame = new Game(title, teaser, copyright, game.initialSqlScript, game.scenes);
        this.game = Promise.resolve({ok: true, data: newGame});

        // No need to update database
    }

    async onCommitInitialSqlScript(dbSource: FileSource): Promise<void> {
        const gameRes = await this.game;
        assert(gameRes.ok, 'Illegal state');
        const game  = gameRes.data;

        // Materialize initial SQL script
        return materializeFileSource(dbSource).then((sqlRes: Success<string> | Fail<FetchFail>) => {
            if (sqlRes.ok) {
                // Update game
                const newGame = new Game(game.title, game.teaser, game.copyright, sqlRes.data, game.scenes);
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

    async onCommitScene(index: number, scene: Scene) {
        const gameRes = await this.game;
        assert(gameRes.ok, 'Illegal state');
        const game  = gameRes.data;

        // Assertions
        assert(index < game.scenes.length, 'Illegal state');

        // Update game
        const newScenes = game.scenes.map((s, i) => i === index ? scene : s);
        const newGame = new Game(game.title, game.teaser, game.copyright, game.initialSqlScript, newScenes);
        this.game = Promise.resolve({ok: true, data: newGame});

        // Nothing to do with the database
    }

    async onAddScene(scene: Scene) {
        const gameRes = await this.game;
        assert(gameRes.ok, 'Illegal state');
        const game  = gameRes.data;

        // Update game
        const newScenes = [...game.scenes, scene];
        const newGame = new Game(game.title, game.teaser, game.copyright, game.initialSqlScript, newScenes);
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
        const newGame = new Game(game.title, game.teaser, game.copyright, game.initialSqlScript, newScenes);
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
        const newGame = new Game(game.title, game.teaser, game.copyright, game.initialSqlScript, newScenes);
        this.game = Promise.resolve({ok: true, data: newGame});

        // Nothing to do with the database
    }
    


    //////////////////
    // Track status //
    //////////////////

    // Move status according to state machine described above
    // At the end of every async operation, this function must be called:
    // - `updateStatus` transitions status to "active"/"failed" when the operation is resolved

    private async updateStatusAfterGameResult<T>(gameRes: Success<T> | Fail<XMLFail>): Promise<Success<T> | Fail<XMLFail>> {
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

    private createFreshDbAndSchema(): { db: Promise<Success<StaticDb>   | Fail<XMLFail | RunInitScriptFail>>,
                                        schema: Promise<Success<Schema> | Fail<XMLFail | RunInitScriptFail | ParseSchemaFail>>}
    {
        // `db`: Reset
        const db = this.game
            .then((gameRes: Success<Game> | Fail<XMLFail | RunInitScriptFail>): Success<StaticDb> | Fail<XMLFail | RunInitScriptFail> => {
                if (gameRes.ok) {
                    return { ok: true, data: new StaticDb(gameRes.data.initialSqlScript) };
                }
                else {
                    return gameRes;
                }
            })
            .then((dbRes: Success<StaticDb> | Fail<XMLFail | RunInitScriptFail>): Promise<Success<StaticDb> | Fail<XMLFail | RunInitScriptFail>> => {
                if (!dbRes.ok) {
                    return Promise.resolve(dbRes)
                }
                else {
                    const res: Promise<Success<StaticDb> | Fail<XMLFail | RunInitScriptFail>> =
                        dbRes.data.resolve().then(
                            ()      => { return Promise.resolve(dbRes); },
                            (error: RunInitScriptFail | FetchInitScriptFail) => {
                                const e: RunInitScriptFail | FetchInitScriptFail = error;

                                // Assertion holds because there is no SQL file to fetch
                                assert(error.kind !== 'fetch-init-script');
                                return { ok: false, error: error };
                            }
                        );

                    return res;
                }
            });

        const schema = db
            .then((db: Success<StaticDb> | Fail<XMLFail | RunInitScriptFail>): Promise<Success<Schema> | Fail<XMLFail | RunInitScriptFail | ParseSchemaFail>> => {
                if (db.ok) {
                    return db.data.querySchema().then((schema: Success<Schema> | Fail<RunInitScriptFail | FetchInitScriptFail | ParseSchemaFail>): Success<Schema> | Fail<XMLFail | RunInitScriptFail | ParseSchemaFail> => {
                        if (schema.ok) {
                            return { ok: true, data: schema.data };
                        }
                        else {
                            // Assertion holds because there is no SQL file to fetch
                            assert(schema.error.kind === 'run-init-script' || schema.error.kind === 'parse-schema');
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