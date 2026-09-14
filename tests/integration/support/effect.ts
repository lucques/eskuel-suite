import { Effect } from 'effect';

export function acquireDisposable<A extends { dispose(): void }>(create: () => A) {
    return Effect.acquireRelease(
        Effect.sync(create),
        resource => Effect.sync(() => resource.dispose()),
    );
}
