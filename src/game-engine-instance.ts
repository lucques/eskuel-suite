import { Game, XMLFail, GameState, xmlToGame, areResultsEqual, GameResult, GameResultCorrect, GameResultMiss, FetchXMLFail } from './game-pure';
import { FetchInitScriptFail, ParseSchemaFail, RunInitScriptFail, SqlResult, StaticDb } from './sql-js-api';
import { Fail, FileSource, Success, assert, generateId } from './util';
import { Schema } from './schema';


// Terminology:
// - "status"
//   - held in field `status`
//   - describes the life cycle of the game and only gets set in the beginning of the game
//   - affected by initial loading of the fields `game`, `userDb`, `referenceDb`.
//     The status can be depicted by a simple state machine, starting with "pending".
//     Transitions are reflexive and monotone (= once active, always active; once failed, always failed).
//     - "pending" -- game_ok--> "pending"
//     - "active"  -- game_ok--> "active"
//     - "pending" --!game_ok--> "failed"
//     - "failed"  --!game_ok--> "failed"
//     - "pending" -----db_ok--> "active"
//     - "active"  -----db_ok--> "active"
//     - "pending" ----!db_ok--> "failed"
//     - "failed"  ----!db_ok--> "failed"
// - "game state"
//    - consists of an object of type `GameState`
// - "internal game state"
//    - consists of the following three fields: `userDb`, `refDb`, `gameState`
//    - needs to be kept in sync
//    - manipulation is therefore encapsulated in last section of the `GameInstance` class

export type StatusPending    = { kind: 'pending' } // Fields have been requested to activate, but request may be unresolved
export type StatusActive     = { kind: 'active'  } // Fields have been requested to activate and done so successfully
export type StatusFailed     = { kind: 'failed', error: XMLFail | RunInitScriptFail } // Fields have been requested to activate and failed to do so
export type Status = StatusPending | StatusActive | StatusFailed

export class GameInstance {

    readonly id: string;
    
    private game:        Promise<Success<Game>      | Fail<XMLFail>>;
    private userDb:      Promise<Success<StaticDb>  | Fail<XMLFail | RunInitScriptFail>>;
    private refDb: Promise<Success<StaticDb>  | Fail<XMLFail | RunInitScriptFail>>;
    
    private status: Status = { kind: 'pending' };
    
    // Not part of `status`.
    private gameState:   Promise<Success<GameState> | Fail<XMLFail>>;
    private schema:      Promise<Success<Schema>    | Fail<XMLFail | RunInitScriptFail | ParseSchemaFail>>;

    // Cache for solutions
    private curReferenceSolutionResults: Promise<SqlResult> | null = null;
    private curReferenceCheckResults:    Promise<SqlResult> | null = null;

    constructor(gameSource: FileSource) {
        this.id = 'game-instance-' + generateId();

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
        
        // `userDb`:    Init; thereby track status
        // `refDb`:     Init; thereby track status
        // `gameState`: Init
        const initValues = this.createFreshInternalState();
        this.userDb    = initValues.userDb.then(res => this.updateStatusAfterDbInit(res)); // Track status
        this.refDb     = initValues.refDb.then(res =>  this.updateStatusAfterDbInit(res)); // Track status
        this.gameState = initValues.gameState;

        // `schema`:    Init
        this.schema = this.refDb
            .then(db => {
                if (!db.ok) {
                    return Promise.resolve({ ok: false, error: db.error });
                }

                return db.data.querySchema().then(schema => {
                    if (schema.ok) {
                        return { ok: true, data: schema.data };
                    }
                    else {
                        // Assertion holds because there is no SQL file to fetch and the init script has already been run
                        assert(schema.error.kind === 'parse-schema');

                        return { ok: false, error: schema.error };
                    };
                });
            });
    }

    getStatus(): Status {
        return this.status;
    }


    //////////////
    // Requests //
    //////////////

    /**
     * Technically, no value really is requested.
     * The effect of this operation is though that the status is "active" or "failed"
     */
    async resolve(): Promise<Success<void> | Fail<XMLFail | RunInitScriptFail>> {
        return this.userDb.then(
            res => {
                if (!res.ok) {
                    return res;
                }
                else {
                    return this.refDb.then(
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
            }
        );
    }

    async getGame(): Promise<Success<Game> | Fail<XMLFail>> {
        return this.game;
    }

    async getGameState(): Promise<Success<GameState> | Fail<XMLFail>> {
        return this.gameState;
    }

    async getSchema(): Promise<Success<Schema> | Fail<XMLFail | RunInitScriptFail | ParseSchemaFail>> {
        return this.schema;
    }


    //////////////////
    // User actions //
    //////////////////

    // We assert here that the game is in status "active"

    async onReset(): Promise<void> {
        const gameRes  = await this.game;
        assert(gameRes.ok, 'Illegal state');

        // Reset databases and game state. No need to track status here (only tracked on game start)
        this.resetToScene(0);
    }

    async onNextScene(): Promise<void> {
        const gameRes  = await this.game;
        const stateRes = await this.gameState;
        assert(stateRes.ok && gameRes.ok, 'Illegal state');
        const game  = gameRes.data;
        const state = stateRes.data;

        assert(!game.isCurSceneUnsolvedTask(state), 'Current scene is unsolved task');
        // Advance to next scene
        await this.advanceScene();
    }

    async onSubmitQuery(sql: string): Promise<GameResultCorrect | GameResultMiss> {
        const gameRes  = await this.game;
        const stateRes = await this.gameState;
        const userDbRes = await this.userDb;
        assert(stateRes.ok && gameRes.ok && userDbRes.ok, 'Illegal state');
        const game  = gameRes.data;
        const state = stateRes.data;
        const userDb = userDbRes.data;

        const curScene = game.getCurScene(state);
        assert(curScene.type === 'select' || curScene.type === 'manipulate', 'Cannot submit query for current scene\'s type');
        assert(game.isCurSceneUnsolvedTask(state), 'Cannot submit query when there is nothing to solve')

        // Query `userDb`
        const userResultsRes = await userDb.exec(sql);
        assert(userResultsRes.ok);
        const userResults = userResultsRes.data;

        // Compare

        // "select": Check whether the user's solution matches the reference solution
        if (curScene.type === 'select') {
            // Query `referenceDb`
            const refResults = await this.getReferenceSolutionResults();

            // Case 1: User and db both failed. In which manner, does not matter. 
            if (userResults.type === 'error' && refResults.type === 'error') {
                // Solved
                await this.markSceneSolved();

                // Return result
                return { type: 'correct', res: userResults };
            }
            // Case 2: Both succeeded
            else if (userResults.type === 'succ' && refResults.type === 'succ') {
                const userTables = userResults.result;
                const refTables  = refResults.result;

                // Case 2.1: Number of tables don't match
                if (userTables.length != refTables.length) {
                    // Failed
                    // Return result
                    return { type: 'miss', res: userResults };
                }

                // Check each table
                let correct = true;
                for (let i = 0; i < userTables.length; i++) {
                    correct = correct && areResultsEqual(userTables[i], refTables[i], curScene.isOrderRelevant);
                }

                // Case 2.2: Not all tables match
                if (!correct) {                    
                    // Return result
                    return { type: 'miss', res: userResults };
                }

                // Case 2.3: Match 
                // Solved
                await this.markSceneSolved();
                // Return result
                return { type: 'correct', res: userResults };
            }
            // Case 3: User failed
            else if (userResults.type === 'error') {
                // Return result
                return { type: 'miss', res: userResults };
            }
            // Case 4: User succeeded
            else {
                // Return result
                return { type: 'miss', res: userResults };
            }
        }
        // "manipulate": 
        else {
            // Query `userDb` to check
            const userCheckResultsRes = await userDb.exec(curScene.sqlCheck);
            assert(userCheckResultsRes.ok);
            const userCheckResults = userCheckResultsRes.data;

            // Query `refDb` to check
            const refCheckResults = await this.getReferenceCheckResults();

            // Case 1: Check on both user db and ref db failed. In which manner, does not matter. 
            if (userCheckResults.type === 'error' && refCheckResults.type === 'error') {
                // Solved
                await this.markSceneSolved();

                // Return result
                return { type: 'correct', res: userResults };
            }
            // Case 2: Check on both dbs succeeded
            else if (userCheckResults.type === 'succ' && refCheckResults.type === 'succ') {
                const userCheckTables = userCheckResults.result;
                const refCheckTables  = refCheckResults.result;

                // Case 2.1: Number of tables don't match
                if (userCheckTables.length != refCheckTables.length) {
                    // Failed
                    // Return result
                    return { type: 'miss', res: userResults };
                }

                // Check each table
                let correct = true;
                for (let i = 0; i < userCheckTables.length; i++) {
                    correct = correct && areResultsEqual(userCheckTables[i], refCheckTables[i], false);
                }

                // Case 2.2: Not all tables match
                if (!correct) {                    
                    // Return result
                    return { type: 'miss', res: userResults };
                }

                // Case 2.3: Match
                // Solved
                await this.markSceneSolved();
                // Return result
                return { type: 'correct', res: userResults };
            }
            // Case 3: User failed
            else if (userCheckResults.type === 'error') {
                // Return result
                return { type: 'miss', res: userResults };
            }
            // Case 4: User succeeded
            else {
                // Return result
                return { type: 'miss', res: userResults };
            }
        }
    }

    async onResetDbInCurScene(): Promise<void> {
        const gameRes  = await this.game;
        const stateRes = await this.gameState;
        assert(stateRes.ok && gameRes.ok, 'Illegal state');
        const game  = gameRes.data;
        const state = stateRes.data;

        assert(game.isCurSceneUnsolvedTask(state), 'There should be no need to reset the user db when there is nothing to solve');
        // Reset
        await this.resetToScene(state.curSceneIndex);
    }

    async onShowHint(): Promise<GameResult> {
        const gameRes  = await this.game;
        const stateRes = await this.gameState;
        assert(stateRes.ok && gameRes.ok, 'Illegal state');
        const game  = gameRes.data;
        const state = stateRes.data;

        assert(game.isCurSceneUnsolvedTask(state), 'Current scene is not an unsolved task');

        // 'select' scene
        if (game.getCurScene(state).type === 'select') {
            // Query `referenceDb`
            const refResults = await this.getReferenceSolutionResults();
    
            return { type: 'hint-select', expectedResult: refResults };
        }
        // 'manipulate' scene
        else {
            // Query `referenceDb`
            const refResults = await this.getReferenceCheckResults();
    
            return { type: 'hint-manipulate', checkResult: refResults };
        }
    }


    //////////////////////////////
    // User actions, privileged //
    //////////////////////////////

    async onNextSceneEvenIfUnsolved(): Promise<void> {
        const gameRes  = await this.game;
        const stateRes = await this.gameState;
        assert(gameRes.ok && stateRes.ok, 'Illegal state');

        // Advance to next scene
        await this.advanceScene();
    }

    async onSkipMultipleScenes(n: number): Promise<void> {
        for (let i = 0; i < n; i++) {
            await this.onNextSceneEvenIfUnsolved();
        }
    }


    //////////////////
    // Track status //
    //////////////////

    // Move status according to state machine described above
    // At the end of every async operation, this function must be called:
    // - `updateStatus` transitions status to "active"/"failed" when the operation is resolved

    private async updateStatusAfterGameResult<T>(gameRes: Success<T> | Fail<XMLFail>): Promise<Success<T> | Fail<XMLFail>> {
        // "pending" --game_ok--> "pending"
        // "active"  --game_ok--> "active"
        if ((this.status.kind === 'pending' || this.status.kind === 'active') && gameRes.ok) {
            // -
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

    private async updateStatusAfterDbInit<T>(res: Success<T> | Fail<XMLFail | RunInitScriptFail>): Promise<Success<T> | Fail<XMLFail | RunInitScriptFail>> {
        // "pending" --db_ok--> "active"
        // "active"  --db_ok--> "active"
        if ((this.status.kind === 'pending' || this.status.kind === 'active') && res.ok) {
            this.status = { kind: 'active' };
        }
        // "pending" --!db_ok--> "failed"
        // "failed"  --!db_ok--> "failed"
        else if ((this.status.kind === 'pending' || this.status.kind === 'failed') && !res.ok) {
            this.status = { kind: 'failed', error: res.error };
        }
        else {
            assert(false, 'Illegal status transition');
        }

        return res;
    }


    //////////////////////////////////////////////////////////////
    // Private: Manipulate game state and keep in sync with dbs //
    //////////////////////////////////////////////////////////////

    // We assert here that the game is in status "active"

    private async getReferenceSolutionResults(): Promise<SqlResult> {
        if (this.curReferenceSolutionResults === null) {
            const gameRes  = await this.game;
            const stateRes = await this.gameState;
            const refDbRes = await this.refDb;
            assert(stateRes.ok && gameRes.ok && refDbRes.ok, 'Illegal state');
            const game  = gameRes.data;
            const state = stateRes.data;
            const refDb = refDbRes.data;

            const curScene = game.getCurScene(state);

            // Assertions
            assert(curScene.type === 'select');

            // Query `referenceDb`
            const resultsRes = await refDb.exec(curScene.sqlSol);

            // Assertions
            assert(resultsRes.ok);

            this.curReferenceSolutionResults = Promise.resolve(resultsRes.data);
        };

        // Update the timestamp. This is to make each `SqlResult` appear as uniquely requested.
        // Uniqueness is used to differentiate by `key` in React maps.
        return this.curReferenceSolutionResults.then(res => {
            if (res.type === 'succ') {
                return {
                    type: 'succ',
                    timestamp: new Date(),
                    sql: res.sql,
                    result: res.result
                };
            }
            else {
                return {
                    type: 'error',
                    timestamp: new Date(),
                    sql: res.sql,
                    message: res.message
                };
            }
        });
    }

    private async getReferenceCheckResults(): Promise<SqlResult> {
        if (this.curReferenceCheckResults === null) {
            const gameRes  = await this.game;
            const stateRes = await this.gameState;
            const refDbRes = await this.refDb;
            assert(stateRes.ok && gameRes.ok && refDbRes.ok, 'Illegal state');
            const game  = gameRes.data;
            const state = stateRes.data;
            const refDb = refDbRes.data;

            const curScene = game.getCurScene(state);

            // Assertions
            assert(curScene.type === 'manipulate');

            // Query `referenceDb`: Check.
            const checkRes = await refDb.exec(curScene.sqlCheck);

            // Assertions
            assert(checkRes.ok);

            this.curReferenceCheckResults = Promise.resolve(checkRes.data);
        };

        // Update the timestamp. This is to make each `SqlResult` appear as uniquely requested.
        // Uniqueness is used to differentiate by `key` in React maps.
        return this.curReferenceCheckResults.then(res => {
            if (res.type === 'succ') {
                return {
                    type: 'succ',
                    timestamp: new Date(),
                    sql: res.sql,
                    result: res.result
                };
            }
            else {
                return {
                    type: 'error',
                    timestamp: new Date(),
                    sql: res.sql,
                    message: res.message
                };
            }
        });
    }

    private async advanceScene(): Promise<void> {
        const gameRes  = await this.game;
        const stateRes = await this.gameState;
        const refDbRes = await this.refDb;
        assert(stateRes.ok && gameRes.ok && refDbRes.ok, 'Illegal state');
        const game  = gameRes.data;
        const state = stateRes.data;
        const refDb = refDbRes.data;

        // Manipulate game state
        const newState = game.advanceScene(state);
        this.gameState = Promise.resolve({ok: true, data: newState});
        
        // Clear cache
        this.curReferenceSolutionResults = null;
        this.curReferenceCheckResults = null;

        // If "manipulate" scene: Manipulate ref db
        const curScene = game.getCurScene(newState);
        if (curScene.type === 'manipulate') {
            // Manipulate `referenceDb`: Results don't matter, even an error is permitted.
            await refDb.exec(curScene.sqlSol);
        }
    }

    private async markSceneSolved(): Promise<void> {
        const gameRes  = await this.game;
        const stateRes = await this.gameState;
        assert(stateRes.ok && gameRes.ok, 'Illegal state');
        const game  = gameRes.data;
        const state = stateRes.data;

        // Manipulate game state
        this.gameState = Promise.resolve({ok: true, data: game.markSolved(state)});
    }

    private async resetToScene(n: number) {
        this.resetInternalState();

        for (let i = 0; i < n; i++) {
            await this.advanceScene();
        }
    }

    // The following functions `resetInternalState` and `createFreshInternalState` are only split because `resetInternalState` cannot be used in constructor (limitation of TS's type system).
    private resetInternalState() {
        const initValues = this.createFreshInternalState();
        this.userDb    = initValues.userDb;
        this.refDb     = initValues.refDb;
        this.gameState = initValues.gameState;
    }

    private createFreshInternalState(): { userDb:    Promise<Success<StaticDb>  | Fail<XMLFail | RunInitScriptFail>>,
                                          refDb:     Promise<Success<StaticDb>  | Fail<XMLFail | RunInitScriptFail>>,
                                          gameState: Promise<Success<GameState> | Fail<XMLFail>> } {
        // Reset db's

        // `userDb`
        const userDb = this.game
            .then((gameRes: Success<Game> | Fail<XMLFail | RunInitScriptFail>): Success<StaticDb> | Fail<XMLFail | RunInitScriptFail> => {
                if (gameRes.ok) {
                    return { ok: true, data: new StaticDb({ type: 'inline', content: gameRes.data.initialSqlScript }) };
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

        // `referenceDb`
        const refDb = this.game
            .then((gameRes: Success<Game> | Fail<XMLFail | RunInitScriptFail>): Success<StaticDb> | Fail<XMLFail | RunInitScriptFail> => {
                if (gameRes.ok) {
                    return { ok: true, data: new StaticDb({ type: 'inline', content: gameRes.data.initialSqlScript }) };
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
                                // Assertion holds because there is no SQL file to fetch
                                assert(error.kind !== 'fetch-init-script');
                                return { ok: false, error: error };
                            }
                        );

                    return res;
                }
            })
            .then(res => this.updateStatusAfterDbInit(res)); // Track status
        
        // Reset game state

        // Not part of the status, therefore nothing to track here.
        const gameState = this.game
        .then((gameRes): Success<GameState> | Fail<XMLFail> => {
            if (gameRes.ok) {
                return { ok: true, data: gameRes.data.freshState() }
            }
            else {
                return gameRes;
            }
        });

        return { userDb, refDb, gameState };
    }
}