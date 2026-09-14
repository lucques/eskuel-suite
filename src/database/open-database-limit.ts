export type OpenDatabaseSlot = {
    release(): void;
};

let openDatabaseCount = 0;

export function reserveOpenDatabaseSlot(maxOpenDatabases: number): OpenDatabaseSlot | null {
    if (openDatabaseCount >= maxOpenDatabases) {
        return null;
    }
    else {
        openDatabaseCount++;
        let released = false;
        return {
            release() {
                if (!released) {
                    released = true;
                    openDatabaseCount--;
                }
            },
        };
    }
}
