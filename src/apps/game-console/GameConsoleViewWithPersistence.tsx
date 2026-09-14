import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Effect } from 'effect';

import { GAME_FINGERPRINT_VERSION } from '../../game/fingerprint';
import type { GameSource } from '../../game/loader';
import type { GameConsoleViewHandle } from './handle';
import type { GameCheckpoint, GameCheckpointStore, GameLocator } from './checkpoint';
import { getGameLocator } from './checkpoint';
import { isGameProgressCompatible, isInitialGameProgress } from './game-progress';
import type { GameProgress } from './game-progress';
import type { GameConsoleSession } from './session';
import { GameConsoleView } from './GameConsoleView';
import { ResumeGameModal } from './ResumeGameModal';

type CheckpointDecision =
    | { kind: 'checking' }
    | { kind: 'prompt', checkpoint: GameCheckpoint }
    | { kind: 'restoring', checkpoint: GameCheckpoint }
    | { kind: 'active' };

export const GameConsoleViewWithPersistence = React.forwardRef<GameConsoleViewHandle, {
    session: GameConsoleSession,
    source: GameSource,
    checkpointStore: GameCheckpointStore,
    baseUrl: string,
}>(function GameConsoleViewWithPersistence({
    session,
    source,
    checkpointStore,
    baseUrl,
}, ref) {
    const subscribe = useCallback((listener: () => void) => session.subscribe(listener), [session]);
    const getSnapshot = useCallback(() => session.getSnapshot(), [session]);
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const [decision, setDecision] = useState<CheckpointDecision>({ kind: 'checking' });
    const lastProgressRef = useRef<string | null>(null);
    const restoreStartedRef = useRef(false);
    const locator = useMemo(() => getGameLocator(source, baseUrl), [baseUrl, source]);

    useEffect(() => {
        if (decision.kind === 'checking' && snapshot.kind === 'ready') {
            lastProgressRef.current = serializeProgress(snapshot.progress);
            if (snapshot.gameFingerprint === null) {
                setDecision({ kind: 'active' });
            }
            else {
                const checkpoint = checkpointStore.findByFingerprint(snapshot.gameFingerprint);
                if (checkpoint === null) {
                    setDecision({ kind: 'active' });
                }
                else if (isGameProgressCompatible(snapshot.game, checkpoint.progress)) {
                    setDecision({ kind: 'prompt', checkpoint });
                }
                else {
                    checkpointStore.remove(snapshot.gameFingerprint);
                    setDecision({ kind: 'active' });
                }
            }
        }
    }, [checkpointStore, decision.kind, snapshot]);

    useEffect(() => {
        if (decision.kind === 'restoring' && !restoreStartedRef.current) {
            restoreStartedRef.current = true;
            void Effect.runPromise(session.restoreProgress(decision.checkpoint.progress)).then(() => {
                const restoredSnapshot = session.getSnapshot();
                if (restoredSnapshot.kind === 'ready') {
                    lastProgressRef.current = serializeProgress(restoredSnapshot.progress);
                    if (restoredSnapshot.gameFingerprint !== null) {
                        if (isInitialGameProgress(restoredSnapshot.game, restoredSnapshot.progress)) {
                            checkpointStore.remove(restoredSnapshot.gameFingerprint);
                        }
                        else {
                            checkpointStore.save(createCheckpoint(
                                restoredSnapshot.gameFingerprint,
                                restoredSnapshot.game.title,
                                locator,
                                restoredSnapshot.progress,
                            ));
                        }
                    }
                }
                setDecision({ kind: 'active' });
            });
        }
    }, [checkpointStore, decision, locator, session]);

    useEffect(() => {
        if (decision.kind === 'active' && snapshot.kind === 'ready' && snapshot.gameFingerprint !== null) {
            const serializedProgress = serializeProgress(snapshot.progress);
            if (lastProgressRef.current === null) {
                lastProgressRef.current = serializedProgress;
            }
            else if (lastProgressRef.current !== serializedProgress) {
                if (isInitialGameProgress(snapshot.game, snapshot.progress)) {
                    checkpointStore.remove(snapshot.gameFingerprint);
                }
                else {
                    checkpointStore.save(createCheckpoint(
                        snapshot.gameFingerprint,
                        snapshot.game.title,
                        locator,
                        snapshot.progress,
                    ));
                }
                lastProgressRef.current = serializedProgress;
            }
        }
    }, [checkpointStore, decision.kind, locator, snapshot]);

    const onResume = (): void => {
        if (decision.kind === 'prompt') {
            setDecision({ kind: 'restoring', checkpoint: decision.checkpoint });
        }
    };

    const onStartOver = (): void => {
        if (decision.kind === 'prompt') {
            checkpointStore.remove(decision.checkpoint.gameFingerprint);
            lastProgressRef.current = snapshot.kind === 'ready'
                ? serializeProgress(snapshot.progress)
                : null;
            setDecision({ kind: 'active' });
        }
    };

    const presentedCheckpoint = decision.kind === 'prompt' || decision.kind === 'restoring'
        ? decision.checkpoint
        : null;

    return (
        <>
            <GameConsoleView ref={ref} session={session} />
            {presentedCheckpoint === null
                ? null
                : <ResumeGameModal
                    gameTitle={presentedCheckpoint.gameTitle}
                    restoring={decision.kind === 'restoring'}
                    onResume={onResume}
                    onStartOver={onStartOver}
                />}
        </>
    );
});

function createCheckpoint(
    gameFingerprint: string,
    gameTitle: string,
    gameLocator: GameLocator,
    progress: GameProgress,
): GameCheckpoint {
    return {
        checkpointVersion: 1,
        fingerprintVersion: GAME_FINGERPRINT_VERSION,
        gameFingerprint,
        gameLocator,
        gameTitle,
        progress: {
            curSceneIndex: progress.curSceneIndex,
            sceneStatuses: [...progress.sceneStatuses],
        },
        updatedAt: Date.now(),
    };
}

function serializeProgress(progress: GameProgress): string {
    return JSON.stringify(progress);
}
