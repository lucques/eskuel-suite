import _ from 'lodash';
import { Fail, Success, assert, isFail, isSuccess } from './util';
import { FetchInitScriptFail, ParseSchemaFail, RunInitScriptFail, SqlResult, SqlResultError, SqlResultSucc } from './sql-js-api';
import { Schema } from './schema';

import * as he from 'he';
const heOptions = {
    // useNamedReferences: true,
    // allowUnsafeSymbols: false
};

//////////////////////////////////
// Failures during game loading //
//////////////////////////////////

export type FetchXMLFail = { kind: 'fetch-xml', url: string }
export type ParseXMLFail = { kind: 'parse-xml', details: string }
export type XMLFail = FetchXMLFail | ParseXMLFail;


////////////////////////////////
// Status of game db + schema //
////////////////////////////////

export type SchemaStatusPending = { kind: 'pending' };
export type SchemaStatusLoaded  = { kind: 'loaded', data: Schema };
export type SchemaStatusFailed  = { kind: 'failed', error: ParseSchemaFail };
export type SchemaStatus        = SchemaStatusPending | SchemaStatusLoaded | SchemaStatusFailed;

export type GameDatabaseStatusPending = { kind: 'pending' };
export type GameDatabaseStatusLoaded  = { kind: 'loaded', data: Schema };
export type GameDatabaseStatusFailed  = { kind: 'failed', error: FetchInitScriptFail | RunInitScriptFail | ParseSchemaFail };
export type GameDatabaseStatus = GameDatabaseStatusPending | GameDatabaseStatusLoaded | GameDatabaseStatusFailed;


/////////////////////
// Main data types //
/////////////////////

export class Game {
    constructor(
        readonly title: string,
        readonly teaser: string,
        readonly copyright: string,
        readonly initialSqlScript: string,
        readonly scenes: Scene[])
    {
        assert(scenes.length > 0, 'There must be at least one scene');
    }

    freshState(): GameState {
        return {
            curSceneIndex:  0,
            curSceneSolved: this.scenes[0].type === 'text' ? null : false
        };
    }


    ////////////
    // Change //
    ////////////

    advanceScene(s: GameState): GameState {
        assert(s.curSceneIndex+1 < this.scenes.length, 'There is no next scene');

        return {
            curSceneIndex:  s.curSceneIndex+1,
            curSceneSolved: this.scenes[s.curSceneIndex+1].type === 'text' ? null : false
        };
    }

    markSolved(s: GameState): GameState {
        return {
            curSceneIndex:  s.curSceneIndex,
            curSceneSolved: true
        };
    }


    /////////////
    // Getters //
    /////////////

    getCurScene(s: GameState): Scene {
        return this.scenes[s.curSceneIndex];
    }

    isCurSceneTask(s: GameState): boolean {
        return this.getCurScene(s).type === 'select' || this.getCurScene(s).type === 'manipulate';
    }

    isCurSceneUnsolvedTask(s: GameState): boolean {
        return this.isCurSceneTask(s) && s.curSceneSolved === false;
    }

    isFinished(s: GameState): boolean {
        return s.curSceneIndex == this.scenes.length-1 && !this.isCurSceneUnsolvedTask(s);
    }
}

export type TextScene   = {
    type: 'text';
    text: string
}
export type SelectScene = {
    type: 'select';
    text: string;
    sqlSol: string;
    sqlPlaceholder: string;
    isRowOrderRelevant: boolean;
    isColOrderRelevant: boolean;
    areColNamesRelevant: boolean
}
export type ManipulateScene = {
    type: 'manipulate',
    text: string;
    sqlSol: string;
    sqlCheck: string;
    sqlPlaceholder: string
}
export type Scene = TextScene | SelectScene | ManipulateScene;

export type GameState = {
    curSceneIndex:  number,
    curSceneSolved: boolean | null,  // It is possible to have solved a scene but still remain in that scene (not yet advanced to next one)
}


///////////////////////////
// Game SQL result types //
///////////////////////////

export type GameResultCorrect        = { type: 'correct',         res: SqlResult }  // Query solved scene
export type GameResultMiss           = { type: 'miss',            res: SqlResult }  // Query did not solve scene
export type GameResultHintSelect     = { type: 'hint-select',     expectedResult: SqlResult }
export type GameResultHintManipulate = { type: 'hint-manipulate', checkResult: SqlResult }

export type GameResult = GameResultCorrect | GameResultMiss | GameResultHintSelect | GameResultHintManipulate;

export function gameSqlResultHash(r: GameResult): string {
    if (r.type === 'correct' || r.type === 'miss') {
        return r.res.timestamp.getTime().toString();
    }
    else if (r.type === 'hint-select') {
        return r.expectedResult.timestamp.getTime().toString();
    }
    else {
        return r.checkResult.timestamp.getTime().toString();
    }
}


/////////////
// Parsing //
/////////////

export function xmlToGame(xml: XMLDocument): Success<Game> | Fail<ParseXMLFail> {

    // Title
    const titleNode = xml.querySelector('title');
    if (titleNode === null) {
        return { ok: false, error: { kind: 'parse-xml', details: '<title>...</title> is missing' } };
    }
    const title = titleNode.textContent?.trim() ?? '';

    // Teaser
    const teaserNode = xml.querySelector('teaser');
    if (teaserNode === null) {
        return { ok: false, error: { kind: 'parse-xml', details: '<teaser>...</teaser> is missing' } };
    }
    const teaser = teaserNode.textContent?.trim() ?? '';

    // Copyright
    const copyrightNode = xml.querySelector('copyright');
    if (copyrightNode === null) {
        return { ok: false, error: { kind: 'parse-xml', details: '<copyright>...</copyright> is missing' } };
    }
    const copyright = copyrightNode.textContent?.trim() ?? '';

    // Initial SQL script
    const initialSqlScriptNode = xml.querySelector('initial-sql-script');
    if (initialSqlScriptNode === null) {
        return { ok: false, error: { kind: 'parse-xml', details: '<initial-sql-script>...</initial-sql-script> is missing' } };
    }
    const initialSqlScript = initialSqlScriptNode.textContent?.trim() ?? '';

    // Scenes
    const scenesNode = xml.querySelector('scenes');

    if (scenesNode === null) {
        return { ok: false, error: { kind: 'parse-xml', details: '<scenes>...</scenes> are missing' } };
    }
    if (scenesNode.children.length === 0) {
        return { ok: false, error: { kind: 'parse-xml', details: '<scenes>...</scenes> must contain at least one scene' } };
    }

    const sceneResults: (Success<Scene> | Fail<ParseXMLFail>)[] = Array.from(scenesNode.children).map(sceneNode => {
        if (sceneNode.nodeName === 'text-scene') {
            const textNode = sceneNode.querySelector('text');
            if (textNode === null) {
                return { ok: false, error: { kind: 'parse-xml', details: '<text>...</text> is missing' } };
            }

            return {ok: true, data: { type: 'text', text: textNode.textContent?.trim() ?? '' } };
        }
        else if (sceneNode.nodeName === 'select-scene') {
            const textNode = sceneNode.querySelector('text');
            if (textNode === null) {
                return { ok: false, error: { kind: 'parse-xml', details: '<text>...</text> is missing' } };
            }

            const sqlSolutionNode = sceneNode.querySelector('sql-solution');
            if (sqlSolutionNode === null) {
                return { ok: false, error: { kind: 'parse-xml', details: '<sql-solution>...</sql-solution> is missing' } };
            }

            const sqlPlaceholder = sceneNode.querySelector('sql-placeholder')?.textContent?.trim() ?? '';

            const isRowOrderRelevant = sceneNode.getAttribute('is-row-order-relevant')?.trim() === 'true';
            const isColOrderRelevant = sceneNode.getAttribute('is-col-order-relevant')?.trim() === 'true';
            const areColNamesRelevant = sceneNode.getAttribute('are-col-names-relevant')?.trim() === 'true';


            return {ok: true, data: {
                type: 'select',
                text: textNode.textContent?.trim() ?? '',
                sqlSol: sqlSolutionNode.textContent?.trim() ?? '',
                sqlPlaceholder,
                isRowOrderRelevant: isRowOrderRelevant,
                isColOrderRelevant: isColOrderRelevant,
                areColNamesRelevant
            } };
        }
        else if (sceneNode.nodeName === 'manipulate-scene') {
            const textNode = sceneNode.querySelector('text');
            if (textNode === null) {
                return { ok: false, error: { kind: 'parse-xml', details: '<text>...</text> is missing' } };
            }

            const sqlCheckNode = sceneNode.querySelector('sql-check');
            if (sqlCheckNode === null) {
                return { ok: false, error: { kind: 'parse-xml', details: '<sql-check>...</sql-check> is missing' } };
            }

            const sqlSolNode = sceneNode.querySelector('sql-solution');
            if (sqlSolNode === null) {
                return { ok: false, error: { kind: 'parse-xml', details: '<sql-solution>...</sql-solution> is missing' } };
            }

            const sqlPlaceholder = sceneNode.querySelector('sql-placeholder')?.textContent?.trim() ?? '';

            return {ok: true, data: {
                type: 'manipulate',
                text: textNode.textContent?.trim() ?? '',
                sqlSol: sqlSolNode.textContent?.trim() ?? '',
                sqlCheck: sqlCheckNode.textContent?.trim() ?? '',
                sqlPlaceholder
            } };
        }
        else {
            return { ok: false, error: { kind: 'parse-xml', details: `Unknown scene type: ${sceneNode.nodeName}` } };
        }
    });

    if (sceneResults.some(isFail)) {
        return { ok: false, error: { kind: 'parse-xml', details: 'At least one scene failed to parse: ' + sceneResults.filter(isFail).map(f => f.error.details).join('. ') } };
    }

    // All scenes successfully parsed, so map to a single success array
    const scenes = sceneResults.filter(isSuccess).map(result => result.data);

    // Return the game
    return { ok: true, data: new Game(
        title, teaser, copyright, initialSqlScript, scenes
    ) };
}

export function gameToXML(g: Game): string {
    const scenes = g.scenes.map(scene => {
        if (scene.type === 'text') {
            return `        <text-scene>
            <text>${he.encode(scene.text, heOptions)}</text>
        </text-scene>`;
        }
        else if (scene.type === 'select') {
            return `        <select-scene is-row-order-relevant="${scene.isRowOrderRelevant ? 'true' : 'false'}" is-col-order-relevant="${scene.isColOrderRelevant ? 'true' : 'false'}" are-col-names-relevant="${scene.areColNamesRelevant ? 'true' : 'false'}">
            <text>${he.encode(scene.text, heOptions)}</text>
            <sql-solution>${he.encode(scene.sqlSol, heOptions)}</sql-solution>
            <sql-placeholder>${he.encode(scene.sqlPlaceholder, heOptions)}</sql-placeholder>
        </select-scene>`;
        }
        else {
            return `        <manipulate-scene>
            <text>${he.encode(scene.text, heOptions)}</text>
            <sql-solution>${he.encode(scene.sqlSol, heOptions)}</sql-solution>
            <sql-check>${he.encode(scene.sqlCheck, heOptions)}</sql-check>
            <sql-placeholder>${he.encode(scene.sqlPlaceholder, heOptions)}</sql-placeholder>
        </manipulate-scene>`;
        }
    }).join("\n");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<game>
    <head>
        <title>${he.encode(g.title, heOptions)}</title>
        <teaser>${he.encode(g.teaser, heOptions)}</teaser>
        <copyright>${he.encode(g.copyright, heOptions)}</copyright>
    </head>
    <scenes>
${scenes}
    </scenes>
    <initial-sql-script>
${he.encode(g.initialSqlScript, heOptions)}
    </initial-sql-script>
</game>`;
}


///////////////////////
// Equality-checking //
///////////////////////

export function areResultsEqual(a: initSqlJs.QueryExecResult, b: initSqlJs.QueryExecResult, isRowOrderRelevant: boolean, isColOrderRelevant: boolean, areColNamesRelevant: boolean): boolean {
    // Number of rows must match; number of columns too.
    if (a.values.length != b.values.length || a.columns.length != b.columns.length) {
        return false;
    }

    // Potentially, col names must match
    if (areColNamesRelevant && !_.isEqual(_.sortBy(a.columns), _.sortBy(b.columns))) {
        return false;
    }
    
    // If col order is relevant, take identity permutation
    // Else,
    //   − if col names relevant,   compute permutations only on the col names 
    //   − if col names irrelevant, wipe out col names and compute *all* permutations
    const permutations =
        isColOrderRelevant
        ? [Array.from({length: a.columns.length}, (_, i) => i)] // Identity permutation
        : areColNamesRelevant
          ? computePermutations(a.columns, b.columns)
          : computePermutations(a.columns.map(() => ''), b.columns.map(() => ''));

    // It is only relevant whether *some* of the permutations yields row-wise equality. 
    let existsCorrectPermutation = false;

    for (const permutation of permutations)
    {
        // Because sorting is in-place, make copies first.
        const aValues = _.cloneDeep(a.values);
        const bValues = _.cloneDeep(b.values);

        // If col names are relevant, permute them and check.
        if (areColNamesRelevant) {
            const aColumns = permute(a.columns, permutation);
            if (!_.isEqual(aColumns, b.columns)) {
                continue;
            }
        }

        // Permute every row.
        for (let i = 0; i < aValues.length; i++) {
            aValues[i] = permute(aValues[i], permutation);
        }

        // If order is irrelevant, sort `a` and `b` in the same way.
        // This is a standard JS sort (treats entries as strings). Important here is that permutation happened *before*.
        if (!isRowOrderRelevant) {
            aValues.sort();
            bValues.sort();
        }

        let isCurrentPermutationCorrect = true;

        // Compare row-wise.
        for (let i = 0; i < aValues.length; i++) {           
            if (!_.isEqual(aValues[i], bValues[i])) {
                isCurrentPermutationCorrect = false;
                break;
            }
        }

        if (isCurrentPermutationCorrect) {
            existsCorrectPermutation = true;
            break;
        }
    }

    return existsCorrectPermutation;
}

/**
 * `source` and `target` contain the same elements, but in potentially different
 * order. There may be duplicates! That's when there are multiple permutations.
 */
function computePermutations(source: string[], target: string[]): number[][] {
    assert(_.isEqual(_.sortBy(source), _.sortBy(target)), 'Columns must match');

    function computePermutationsRec(source: [number, string][], target: [number, string][]): number[][] {
        // No need to clone here since TypeScript ensures immutability in this context
        if (target.length === 0) {
            return [[]];
        } else {
            const curElement = target[0][1]; // Adjusted to directly access the first element

            // Find `curElement` in the source array
            const candidates = source.filter(x => x[1] === curElement);

            let permutations: number[][] = [];

            for (const candidate of candidates) {
                const restSource = source.filter(x => x !== candidate);
                const restTarget = target.slice(1); // Use slice to get the tail
                const restPermutations = computePermutationsRec(restSource, restTarget);
                for (const restPermutation of restPermutations) {
                    restPermutation.unshift(candidate[0]);
                }

                permutations = [...permutations, ...restPermutations];
            }

            return permutations;
        }
    }

    // Convert string arrays to arrays of tuples with indices, and call the recursive function
    return computePermutationsRec(source.map((el, idx) => [idx, el]), target.map((el, idx) => [idx, el]));
}

function permute(source: any[], permutation: number[]): any[] {
    let target: any[] = [];
    for (let i = 0; i < permutation.length; i++) {
        target.push(source[permutation[i]]);
    }
    return target;
}