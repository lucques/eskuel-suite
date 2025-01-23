import { Game, LoadGameFail, GameState, xmlToGame, areResultsEqual, GameResult, GameResultCorrect, GameResultMiss, FetchXMLFail, GameSource, GameInitStatus } from './game-pure';
import { InitDbFail, ParseSchemaFail, SqlResult, StaticDb } from './sql-js-api';
import { Fail, Success, assert, generateId } from './util';
import { Schema } from './schema';


// Terminology:
// - "game state"
//    - consists of an object of type `GameState`
// - "internal game state"
//    - consists of the following three fields: `userDb`, `refDb`, `gameState`
//    - needs to be kept in sync
//    - manipulation is therefore encapsulated in last section of the `GameInstance` class

type InternalState = {
    userDb:    StaticDb,
    refDb:     StaticDb,
    gameState: GameState,
    // Cache for solutions
    curReferenceSolutionResults: SqlResult | null,
    curReferenceCheckResults:    SqlResult | null
}

export class GameInstance {

    readonly id: string;
    
    private game:        Promise<Success<Game>      | Fail<LoadGameFail>>;

    // Internal state
    private internalState: Promise<Success<InternalState> | Fail<LoadGameFail | InitDbFail>>;
    
    private status: GameInitStatus = { kind: 'pending' };
    
    // Not part of `status`.
    private schema:      Promise<Success<Schema>    | Fail<LoadGameFail | InitDbFail | ParseSchemaFail>>;

    constructor(source: GameSource, initiallySkipFirstScenes?: number) {
        this.id = 'game-instance-' + generateId();

        // `game`: Init; thereby track status
        if (source.type === 'xml') {
            const rawSource = source.source;
            
            const gameSourceContent: Promise<Success<string> | Fail<FetchXMLFail>> =
                rawSource.type === 'fetch'
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
                : Promise.resolve({ ok: true, data: rawSource.content });
            this.game = gameSourceContent
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
                })
                .then(res => this.updateStatusAfterGameResult(res)); // Track status
        }
        else {
            this.game = Promise.resolve({ ok: true, data: source.source });
        }
        
        // `userDb`:    Init; thereby track status
        // `refDb`:     Init; thereby track status
        // `gameState`: Init
        this.internalState = this.createFreshInternalState();

        // Skip?
        if (initiallySkipFirstScenes !== undefined) {
            this.internalState = this.internalState.then(
                (internalStateRes: Success<InternalState> | Fail<LoadGameFail | InitDbFail>): Promise<Success<InternalState> | Fail<LoadGameFail | InitDbFail>> => {
                    if (!internalStateRes.ok) {
                        return Promise.resolve({ ok: false, error: internalStateRes.error });
                    }

                    return this.game.then(
                        (gameRes: Success<Game>| Fail<LoadGameFail>): Promise<Success<InternalState> | Fail<LoadGameFail | InitDbFail>> => {
                            if (!gameRes.ok) {
                                return Promise.resolve({ ok: false, error: gameRes.error });
                            }
        
                            return this.onSkipMultipleScenesPure(gameRes.data, initiallySkipFirstScenes, internalStateRes);
                        });
                });
        }

        // Update status
        this.internalState = this.internalState.then(res => this.updateStatusAfterInternalStateInit(res)); // Track status


        // `schema`:    Init
        this.schema = this.internalState
            .then(internalStateRes => {
                if (!internalStateRes.ok) {
                    return Promise.resolve({ ok: false, error: internalStateRes.error });
                }

                return internalStateRes.data.refDb.querySchema().then(schema => {
                    if (schema.ok) {
                        return { ok: true, data: schema.data };
                    }
                    else {
                        return { ok: false, error: schema.error };
                    };
                });
            });
    }

    getStatus(): GameInitStatus {
        return this.status;
    }


    //////////////
    // Requests //
    //////////////

    /**
     * Technically, no value really is requested.
     * The effect of this operation is though that the status is "active" or "failed"
     */
    async resolve(): Promise<Success<void> | Fail<LoadGameFail | InitDbFail>> {
        return this.internalState.then(
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

    async getGameState(): Promise<Success<GameState> | Fail<LoadGameFail | InitDbFail>> {
        const internalStateRes = await this.internalState;

        if (!internalStateRes.ok) {
            return { ok: false, error: internalStateRes.error };
        }

        return { ok: true, data: internalStateRes.data.gameState };
    }

    async getSchema(): Promise<Success<Schema> | Fail<LoadGameFail | InitDbFail | ParseSchemaFail>> {
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
        const internalState = await this.internalState;
        assert(gameRes.ok && internalState.ok, 'Illegal state');
        const game  = gameRes.data;
        const gameState = internalState.data.gameState;

        assert(!game.isCurSceneUnsolvedTask(gameState), 'Current scene is unsolved task');
        // Advance to next scene
        await this.advanceScene();
    }

    async onSubmitQuery(sql: string): Promise<GameResultCorrect | GameResultMiss> {
        const gameRes  = await this.game;
        const internalState = await this.internalState;
        assert(gameRes.ok && internalState.ok, 'Illegal state');
        const game  = gameRes.data;
        const gameState = internalState.data.gameState;
        const userDb = internalState.data.userDb;

        const curScene = game.getCurScene(gameState);
        assert(curScene.type === 'select' || curScene.type === 'manipulate', 'Cannot submit query for current scene\'s type');
        assert(game.isCurSceneUnsolvedTask(gameState), 'Cannot submit query when there is nothing to solve')

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
                    correct = correct && areResultsEqual(userTables[i], refTables[i], curScene.isRowOrderRelevant, curScene.isColOrderRelevant, curScene.areColNamesRelevant);
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
                    correct = correct && areResultsEqual(userCheckTables[i], refCheckTables[i], false, true, true);
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
        const internalStateRes = await this.internalState;
        assert(gameRes.ok && internalStateRes.ok, 'Illegal state');
        const game  = gameRes.data;
        const gameState = internalStateRes.data.gameState;

        assert(game.isCurSceneUnsolvedTask(gameState), 'There should be no need to reset the user db when there is nothing to solve');
        // Reset
        await this.resetToScene(gameState.curSceneIndex);
    }

    async onShowHint(): Promise<GameResult> {
        const gameRes  = await this.game;
        const internalStateRes = await this.internalState;
        assert(gameRes.ok && internalStateRes.ok, 'Illegal state');
        const game  = gameRes.data;
        const gameState = internalStateRes.data.gameState;

        assert(game.isCurSceneUnsolvedTask(gameState), 'Current scene is not an unsolved task');

        // 'select' scene
        if (game.getCurScene(gameState).type === 'select') {
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

    // TODO: Not used
    async onNextSceneEvenIfUnsolved(): Promise<void> {
        const gameRes  = await this.game;
        const internalStateRes = await this.internalState;
        assert(gameRes.ok && internalStateRes.ok, 'Illegal state');

        // Advance to next scene
        await this.advanceScene();
    }

    async onSkipMultipleScenes(n: number): Promise<void> {
        for (let i = 0; i < n; i++) {
            await this.onNextSceneEvenIfUnsolved();
        }
    }

    async onSkipMultipleScenesPure(game: Game, n: number, internalState: Success<InternalState> | Fail<LoadGameFail | InitDbFail>): Promise<Success<InternalState> | Fail<LoadGameFail | InitDbFail>> {
        assert(internalState.ok, 'Illegal state');

        let curInternalState: Success<InternalState> | Fail<LoadGameFail | InitDbFail> = internalState;

        for (let i = 0; i < n; i++) {
            curInternalState = await this.advanceScenePure(game, curInternalState);
        }

        return curInternalState;
    }


    //////////////////
    // Track status //
    //////////////////

    // Move status according to state machine described above
    // At the end of every async operation, this function must be called:
    // - `updateStatus` transitions status to "active"/"failed" when the operation is resolved

    private async updateStatusAfterGameResult<T>(gameRes: Success<T> | Fail<LoadGameFail>): Promise<Success<T> | Fail<LoadGameFail>> {
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

    private async updateStatusAfterInternalStateInit<T>(res: Success<T> | Fail<LoadGameFail | InitDbFail>): Promise<Success<T> | Fail<LoadGameFail | InitDbFail>> {
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
        const gameRes  = await this.game;
        const internalStateRes = await this.internalState;
        assert(gameRes.ok && internalStateRes.ok, 'Illegal state');
        const game  = gameRes.data;
        const internalState = internalStateRes.data;

        if (internalState.curReferenceSolutionResults === null) {
            const curScene = game.getCurScene(internalState.gameState);

            // Assertions
            assert(curScene.type === 'select');

            // Query `referenceDb`
            const resultsRes = await internalState.refDb.exec(curScene.sqlSol);

            // Assertions
            assert(resultsRes.ok);

            // Update cache
            internalState.curReferenceSolutionResults = resultsRes.data;
            this.internalState = Promise.resolve({ok: true, data: internalState});
        };

        // Update the timestamp. This is to make each `SqlResult` appear as uniquely requested.
        // Uniqueness is used to differentiate by `key` in React maps.
        return {
            ...internalState.curReferenceSolutionResults,
            timestamp: new Date(),
        };
    }

    private async getReferenceCheckResults(): Promise<SqlResult> {
        const gameRes  = await this.game;
        const internalStateRes = await this.internalState;
        assert(gameRes.ok && internalStateRes.ok, 'Illegal state');
        const game  = gameRes.data;
        const internalState = internalStateRes.data;

        if (internalState.curReferenceCheckResults === null) {
            const curScene = game.getCurScene(internalState.gameState);

            // Assertions
            assert(curScene.type === 'manipulate');

            // Query `referenceDb`: Check.
            const checkRes = await internalState.refDb.exec(curScene.sqlCheck);

            // Assertions
            assert(checkRes.ok);

            // Update cache
            internalState.curReferenceCheckResults = checkRes.data;
            this.internalState = Promise.resolve({ok: true, data: internalState});
        }

        // Update the timestamp. This is to make each `SqlResult` appear as uniquely requested.
        // Uniqueness is used to differentiate by `key` in React maps.
        return {
            ...internalState.curReferenceCheckResults,
            timestamp: new Date(),
        };
    }

    // TODO: Work in progress. Reorganize how the game state is manipulated.
    private async advanceScene(): Promise<void> {
        const gameRes  = await this.game;
        const internalStateRes = await this.internalState;
        assert(gameRes.ok && internalStateRes.ok, 'Illegal state');
        const game  = gameRes.data;
        const internalState = internalStateRes.data;

        const curScene = game.getCurScene(internalState.gameState);

        // Only if not solved by user: Manipulate also `userDb`
        if (curScene.type == 'manipulate' && game.isCurSceneUnsolvedTask(internalState.gameState)) {
            await internalState.userDb.exec(curScene.sqlSol);
        }
        
        // Compute new game state
        const newState = game.advanceScene(internalState.gameState);

        /////////////////////////////////
        // Update game state and cache //
        /////////////////////////////////

        internalState.gameState = newState;
        internalState.curReferenceSolutionResults = null;
        internalState.curReferenceCheckResults = null;

        // If "manipulate" scene: Manipulate ref db
        const newScene = game.getCurScene(newState);
        if (newScene.type === 'manipulate') {
            // Manipulate `refDb`: Results don't matter, even an error is permitted.
            await internalState.refDb.exec(newScene.sqlSol);
        }

        // Update
        this.internalState = Promise.resolve({ok: true, data: internalState});
    }

    private async advanceScenePure(game: Game, internalState: Success<InternalState> | Fail<LoadGameFail | InitDbFail>): Promise<Success<InternalState> | Fail<LoadGameFail | InitDbFail>> {
        assert(internalState.ok, 'Illegal state');
        let curState = internalState.data.gameState;

        const currScene = game.getCurScene(curState);

        // Only if not solved by user: Manipulate also `userDb`
        if (currScene.type == 'manipulate' && game.isCurSceneUnsolvedTask(curState)) {
            await internalState.data.userDb.exec(currScene.sqlSol);
        }

        // Compute new game state
        const newState = game.advanceScene(curState);

        
        /////////////////////////////////
        // Update game state and cache //
        /////////////////////////////////

        internalState.data.gameState = newState;
        internalState.data.curReferenceSolutionResults = null;
        internalState.data.curReferenceCheckResults = null;

        // If "manipulate" scene: Manipulate ref db
        const curScene = game.getCurScene(newState);
        if (curScene.type === 'manipulate') {
            // Manipulate `refDb`: Results don't matter, even an error is permitted.
            await internalState.data.refDb.exec(curScene.sqlSol);
        }

        return internalState;
    }

    private async markSceneSolved(): Promise<void> {
        const gameRes  = await this.game;
        const internalStateRes = await this.internalState;
        assert(gameRes.ok && internalStateRes.ok, 'Illegal state');
        const game  = gameRes.data;
        const internalState = internalStateRes.data;

        // Manipulate game state
        internalState.gameState = game.markSolved(internalState.gameState);

        // Update game state
        this.internalState = Promise.resolve({ok: true, data: internalState});
    }

    private async resetToScene(n: number) {
        this.resetInternalState();

        for (let i = 0; i < n; i++) {
            await this.advanceScene();
        }
    }

    // The following functions `resetInternalState` and `createFreshInternalState` are only split because `resetInternalState` cannot be used in constructor (limitation of TS's type system).
    private resetInternalState() {
        this.internalState = this.createFreshInternalState();
    }

    private async createFreshInternalState(): Promise<Success<InternalState> | Fail<LoadGameFail | InitDbFail>> {
        // Resolve `game`
        const gameRes = await this.game;

        if (!gameRes.ok) {
            return Promise.resolve({ ok: false, error: gameRes.error });
        }

        const game = gameRes.data;

        const userDb = new StaticDb(gameRes.data.dbData);
        const refDb = new StaticDb(gameRes.data.dbData);

        // Resolve `userDb`
        const userDbRes = await userDb.resolve();

        if (!userDbRes.ok) {
            return Promise.resolve({ ok: false, error: userDbRes.error });
        }

        // Resolve `refDb`
        const refDbRes = await refDb.resolve();

        if (!refDbRes.ok) {
            return Promise.resolve({ ok: false, error: refDbRes.error });
        }

        // State
        const state = {
            userDb: userDb,
            refDb: refDb,
            gameState: game.freshState(),
            curReferenceSolutionResults: null,
            curReferenceCheckResults: null
        };

        // If "manipulate" scene: Manipulate ref db
        const newScene = game.getCurScene(state.gameState);
        if (newScene.type === 'manipulate') {
            // Manipulate `refDb`: Results don't matter, even an error is permitted.
            await state.refDb.exec(newScene.sqlSol);
        }

        // Success
        return Promise.resolve({ok: true, data: state});
    }
}