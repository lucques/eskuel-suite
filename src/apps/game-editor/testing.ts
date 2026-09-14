import _ from 'lodash';

import type { SqlResult, SqlResultError, SqlResultSucc } from '../../database/api';
import type { Scene } from '../../game/model';

export type SceneTestStatus =
    | { kind: 'none' }
    | { kind: 'unknown' }
    | { kind: 'select-result', result: SqlResult }
    | { kind: 'manipulate-result', outcome: 'sql-sol-error', result: SqlResultError }
    | { kind: 'manipulate-result', outcome: 'sql-check-error', result: SqlResultError }
    | { kind: 'manipulate-result', outcome: 'sql-check-no-witness', result: SqlResultSucc }
    | { kind: 'manipulate-result', outcome: 'success', result: SqlResultSucc };

export function createSceneTestStatus(scene: Scene): SceneTestStatus {
    switch (scene.type) {
        case 'text':
        case 'image':
            return { kind: 'none' };
        case 'select':
        case 'manipulate':
            return { kind: 'unknown' };
        default: { const _n: never = scene; return _n; }
    }
}

export function createSceneTestStatuses(scenes: Scene[]): SceneTestStatus[] {
    return scenes.map(createSceneTestStatus);
}

export function invalidateTaskStatusesFrom(
    scenes: Scene[],
    statuses: SceneTestStatus[],
    startIndex: number,
): SceneTestStatus[] {
    return scenes.map((scene, index) => index < startIndex ? statuses[index] : createSceneTestStatus(scene));
}

export function areSqlResultsExactlyEqual(a: SqlResult, b: SqlResult): boolean {
    if (a.type === 'error') {
        return b.type === 'error' && a.message === b.message;
    }
    else if (a.type === 'succ') {
        return b.type === 'succ' && _.isEqual(a.result, b.result);
    }
    else { const _n: never = a; return _n; }
}

export function getStatusResult(status: SceneTestStatus): SqlResult | null {
    switch (status.kind) {
        case 'none':
        case 'unknown':
            return null;
        case 'select-result':
        case 'manipulate-result':
            return status.result;
        default: { const _n: never = status; return _n; }
    }
}
