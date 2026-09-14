import type { TFunction } from 'i18next';

import type { InitDbFail } from '../database/api';
import type { LoadDatabaseFail } from '../database/loader';
import type { LoadGameFail } from '../game/loader';
import type { ErrorPresentation } from '../gui-helpers/nonready-view/NonreadyView';

export function gameLoadErrorToPresentation(
    error: LoadGameFail,
    t: TFunction<'common'>,
): ErrorPresentation {
    switch (error.kind) {
        case 'fetch-xml':
        case 'fetch-game-package':
            return {
                title: t('initialization.game_fetch_title'),
                message: t('initialization.game_fetch_message', { url: error.url }),
            };
        case 'parse-xml':
            return {
                title: t('initialization.game_parse_title'),
                message: t('initialization.game_parse_message'),
                details: error.details,
            };
        case 'parse-game-package':
            return {
                title: t('initialization.game_package_title'),
                message: t('initialization.game_package_message'),
                details: error.details,
            };
        case 'file-size-too-large':
            return {
                title: t('initialization.game_too_large_title'),
                message: t('initialization.game_too_large_message'),
            };
        case 'image-resource-limit':
            if (error.resource === 'file-bytes') {
                return {
                    title: t('initialization.game_image_too_large_title'),
                    message: t('initialization.game_image_too_large_message', { sceneNumber: error.sceneNumber }),
                    details: `Maximum image file size: ${error.limit} bytes`,
                };
            }
            else if (error.resource === 'width') {
                return {
                    title: t('initialization.game_image_dimensions_too_large_title'),
                    message: t('initialization.game_image_dimensions_too_large_message', { sceneNumber: error.sceneNumber }),
                    details: `Maximum image width: ${error.limit} pixels`,
                };
            }
            else if (error.resource === 'height') {
                return {
                    title: t('initialization.game_image_dimensions_too_large_title'),
                    message: t('initialization.game_image_dimensions_too_large_message', { sceneNumber: error.sceneNumber }),
                    details: `Maximum image height: ${error.limit} pixels`,
                };
            }
            else { const _n: never = error.resource; return _n; }
        default: {
            const _n: never = error;
            return _n;
        }
    }
}

export function databaseSourceErrorToPresentation(
    error: LoadDatabaseFail | InitDbFail,
    t: TFunction<'common'>,
): ErrorPresentation {
    switch (error.kind) {
        case 'fetch-db':
            return {
                title: t('initialization.database_fetch_title'),
                message: t('initialization.database_fetch_message', { url: error.url }),
            };
        case 'file-size-too-large':
            return {
                title: t('initialization.database_too_large_title'),
                message: t('initialization.database_too_large_message'),
            };
        case 'run-init-script':
            return {
                title: t('initialization.database_initialize_title'),
                message: t('initialization.database_initialize_message'),
                details: error.details,
            };
        case 'parse-sql-metadata':
            return {
                title: t('initialization.database_metadata_title'),
                message: t('initialization.database_metadata_message'),
                details: error.details,
            };
        case 'parse-database-package':
            return {
                title: t('initialization.database_package_title'),
                message: t('initialization.database_package_message'),
                details: error.details,
            };
        case 'unsupported-database-system':
            return {
                title: t('initialization.database_system_title'),
                message: t('initialization.database_system_message', { system: error.system }),
                details: error.details,
            };
        case 'read-sqlite-db':
            return {
                title: t('initialization.database_read_title'),
                message: t('initialization.database_read_message'),
                details: error.details,
            };
        case 'unsupported-database-system-version':
            return {
                title: t('initialization.database_system_version_title'),
                message: t('initialization.database_system_version_message', {
                    system: error.system,
                    requiredMinVersion: error.requiredMinVersion,
                    actualVersion: error.actualVersion,
                }),
                details: error.details,
            };
        case 'database-engine':
            return {
                title: t('initialization.database_engine_title'),
                message: t('initialization.database_engine_message'),
                details: error.details,
            };
        default: {
            const _n: never = error;
            return _n;
        }
    }
}

export function sessionErrorToPresentation(
    details: string,
    t: TFunction<'common'>,
): ErrorPresentation {
    return {
        title: t('initialization.session_error_title'),
        message: t('initialization.session_error_message'),
        details,
    };
}
