import { ESKUEL_DATABASE_PACKAGE_PROFILE } from '../../../src/database/package';
import { ESKUEL_GAME_PACKAGE_PROFILE } from '../../../src/game/package';
import type { GamePackageInfo } from '../../../src/game/package';

export function createGamePackageInfo(): GamePackageInfo {
    return {
        descriptor: {
            $schema: ESKUEL_GAME_PACKAGE_PROFILE,
            name: 'example-game',
            title: 'Example game',
            version: '1.0.0',
            contributors: [{ title: 'Game author', roles: ['creator'] }],
            licenses: [{ name: 'Game-License', title: 'Game License', path: 'LICENSES/Game.txt' }],
            resources: [{
                name: 'game',
                path: 'data/example-game.xml',
                format: 'xml',
                mediatype: 'application/xml',
                bytes: 1,
                hash: `sha256:${'0'.repeat(64)}`,
            }, {
                name: 'database',
                path: 'dependencies/database.eskueldb',
                format: 'eskueldb',
                mediatype: 'application/zip',
                bytes: 1,
                hash: `sha256:${'1'.repeat(64)}`,
            }],
        },
        licenses: [{
            metadata: { name: 'Game-License', title: 'Game License', path: 'LICENSES/Game.txt' },
            text: 'Game license text',
        }],
        notices: [],
        database: {
            descriptor: {
                $schema: ESKUEL_DATABASE_PACKAGE_PROFILE,
                name: 'example-database',
                title: 'Example database',
                version: '1.0.0',
                contributors: [{ title: 'Database author', roles: ['creator'] }],
                licenses: [{
                    name: 'Database-License',
                    title: 'Database License',
                    path: 'LICENSES/Database.txt',
                }],
                resources: [{
                    name: 'example-database',
                    path: 'data/example.sql',
                    format: 'sql',
                    mediatype: 'application/sql',
                    bytes: 1,
                    hash: `sha256:${'2'.repeat(64)}`,
                    'eskuel:database': {
                        artifactType: 'initial-sql-script',
                        system: 'sqlite',
                        systemMinVersion: '3.0.0',
                    },
                }],
            },
            licenses: [{
                metadata: {
                    name: 'Database-License',
                    title: 'Database License',
                    path: 'LICENSES/Database.txt',
                },
                text: 'Database license text',
            }],
            notices: [],
        },
    };
}
