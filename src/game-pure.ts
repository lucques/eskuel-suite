import _ from 'lodash';
import { Fail, Success, assert, isFail, isSuccess } from './util';
import { SqlResult, SqlResultError, SqlResultSucc } from './sql-js-api';


//////////////////////////////////
// Failures during game loading //
//////////////////////////////////

export type FetchXMLFail = { kind: 'fetch-xml', url: string }
export type ParseXMLFail = { kind: 'parse-xml', details: string }
export type XMLFail = FetchXMLFail | ParseXMLFail;


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

export type TextScene   = { type: 'text';   text: string }
export type SelectScene = { type: 'select'; text: string; sqlSol: string; sqlPlaceholder: string; isOrderRelevant: boolean }
export type ManipulateScene = { type: 'manipulate', text: string; sqlSol: string; sqlCheck: string; sqlPlaceholder: string }
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

            const isOrderRelevant = sceneNode.getAttribute('is-order-relevant')?.trim() === 'true';

            return {ok: true, data: {
                type: 'select',
                text: textNode.textContent?.trim() ?? '',
                sqlSol: sqlSolutionNode.textContent?.trim() ?? '',
                sqlPlaceholder,
                isOrderRelevant
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
            return `<text-scene><text>${scene.text}</text></text-scene>`;
        }
        else if (scene.type === 'select') {
            return `<select-scene is-order-relevant="${scene.isOrderRelevant}"><text>${scene.text}</text><sql-solution>${scene.sqlSol}</sql-solution><sql-placeholder>${scene.sqlPlaceholder}</sql-placeholder></select-scene>`;
        }
        else {
            return `<manipulate-scene><text>${scene.text}</text><sql-solution>${scene.sqlSol}</sql-solution><sql-check>${scene.sqlCheck}</sql-check><sql-placeholder>${scene.sqlPlaceholder}</sql-placeholder></manipulate-scene>`;
        }
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<game>
    <head>
        <title>${g.title}</title>
        <teaser>${g.teaser}</teaser>
        <copyright>${g.copyright}</copyright>
    </head>
    <scenes>
        ${scenes}
    </scenes>
    <initial-sql-script>
        ${g.initialSqlScript}
    </initial-sql-script>
</game>`;
}


///////////////////////
// Equality-checking //
///////////////////////

export function areResultsEqual(a: initSqlJs.QueryExecResult, b: initSqlJs.QueryExecResult, isOrderRelevant: boolean) {
    // Number of rows must match
    if (a.values.length != b.values.length) {
        return false;
    }

    const aColumns = _.map(a.columns, s => s.toLowerCase());
    const bColumns = _.map(b.columns, s => s.toLowerCase());

    // Col names must match
    if (!_.isEqual(_.sortBy(aColumns), _.sortBy(bColumns))) {
        return false;
    }
    
    const permutationen = computePermutations(aColumns, bColumns);

    // It is only relevant whether *a* permutation yields row-wise equality. 
    let existsCorrectPermutation = false;

    for (const permutation of permutationen)
    {
        // Because sorting is in-place, make copies first.
        const aValues = _.cloneDeep(a.values);
        const bValues = _.cloneDeep(b.values);

        // Permute.
        for (let i = 0; i < aValues.length; i++) {
            aValues[i] = permute(aValues[i], permutation);
        }

        // If order is irrelevant, sort `a` and `b` in the same way.
        // This is a standard JS sort (treats entries as strings). Important here is that permutations happened *before*.
        if (!isOrderRelevant) {
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

function computePermutations(source: string[], target: string[]): number[][] {
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