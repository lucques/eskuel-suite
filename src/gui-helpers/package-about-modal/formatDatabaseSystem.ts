export function formatDatabaseSystem(system: 'sqlite' | 'postgresql'): string {
    switch (system) {
        case 'sqlite':
            return 'SQLite';
        case 'postgresql':
            return 'PostgreSQL';
        default: { const _n: never = system; return _n; }
    }
}
