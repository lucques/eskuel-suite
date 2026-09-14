import type { SceneTestStatus } from '../../src/apps/game-editor/testing';
import type { Scene } from '../../src/game/model';

export function checkPassed(status: SceneTestStatus): boolean {
    switch (status.kind) {
        case 'none':
            return true;
        case 'unknown':
            return false;
        case 'select-result':
            return status.result.type === 'succ';
        case 'manipulate-result':
            switch (status.outcome) {
                case 'success':
                    return true;
                case 'sql-sol-error':
                case 'sql-check-error':
                case 'sql-check-no-witness':
                    return false;
                default: { const _n: never = status; return _n; }
            }
        default: { const _n: never = status; return _n; }
    }
}

export function selectSceneRange(scene: string | undefined, scenes: string | undefined, sceneCount: number) {
    if (scene !== undefined && scenes !== undefined) {
        throw new Error('Use either --scene N or --scenes N-M, not both');
    }
    else if (scenes !== undefined) {
        const match = /^(\d+)-(\d+)$/.exec(scenes);
        if (match === null) {
            throw new Error('--scenes must be an inclusive range such as 4-8');
        }
        else {
            const first = Number(match[1]);
            const last = Number(match[2]);
            if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 1 || first > last || last > sceneCount) {
                throw new Error(`--scenes must be an ascending range between 1 and ${sceneCount}`);
            }
            else {
                return { first, last };
            }
        }
    }
    else if (scene !== undefined) {
        const target = Number(scene);
        if (!Number.isSafeInteger(target) || target < 1 || target > sceneCount) {
            throw new Error(`--scene must be between 1 and ${sceneCount}`);
        }
        else {
            return { first: target, last: target };
        }
    }
    else {
        return { first: 1, last: sceneCount };
    }
}

export function sceneIndexEntry(scene: Scene, sceneNumber: number) {
    switch (scene.type) {
        case 'image':
            return { sceneNumber, type: scene.type, mediaType: scene.mediaType };
        case 'text':
        case 'select':
        case 'manipulate': {
            const characters = Array.from(scene.text.replace(/\s+/gu, ' ').trim());
            const preview = characters.length > 120 ? `${characters.slice(0, 119).join('')}…` : characters.join('');
            return { sceneNumber, type: scene.type, preview };
        }
        default: { const _n: never = scene; return _n; }
    }
}

type CheckIssue = {
    sceneNumber: number;
    kind: SceneTestStatus['kind'];
    outcome?: Extract<SceneTestStatus, { kind: 'manipulate-result' }>['outcome'];
    sql?: string;
    error?: string;
};

export function summarizeChecks(statuses: SceneTestStatus[]) {
    const summary = { scenes: statuses.length, passed: 0, failed: 0, untested: 0, noTest: 0 };
    const issues: CheckIssue[] = [];
    for (const [index, status] of statuses.entries()) {
        switch (status.kind) {
            case 'none':
                summary.noTest++;
                break;
            case 'unknown':
                summary.untested++;
                issues.push({ sceneNumber: index + 1, kind: status.kind });
                break;
            case 'select-result':
            case 'manipulate-result':
                if (checkPassed(status)) {
                    summary.passed++;
                }
                else {
                    summary.failed++;
                    issues.push({
                        sceneNumber: index + 1,
                        kind: status.kind,
                        ...(status.kind === 'manipulate-result' ? { outcome: status.outcome } : {}),
                        ...(status.result.type === 'error' ? { sql: status.result.sql, error: status.result.message } : {}),
                    });
                }
                break;
            default: { const _n: never = status; return _n; }
        }
    }
    return { checkSummary: summary, checks: issues };
}
