import { Fail, Success, decodeFromBase64, encodeToBase64, isFail, isSuccess } from '../../util';
import { DbData } from '../../database/api';
import {
    DEFAULT_DATABASE_SYSTEM_MIN_VERSIONS,
    isDatabaseSystem,
    isDatabaseSystemVersion,
    parseSqlScriptMetadata,
} from '../../database/system';
import type { DatabaseSystem } from '../../database/system';
import {
    DEFAULT_IMAGE_RESOURCE_LIMITS,
    detectImageMediaType,
    imageDimensionLimitFailure,
    imageFileSizeLimitFailure,
    isImageMediaType,
    readImageDimensions,
} from '../image';
import type { EmbeddedImageResourceLimitFail, ImageResourceLimits, SceneImageResourceLimitFail } from '../image';
import { Game } from '../model';
import type { OrdinaryHint, Scene } from '../model';
import type { ParseXMLFail, XmlElement } from './model';

import he from 'he';
const heOptions = {
    // useNamedReferences: true,
    // allowUnsafeSymbols: false
};

export function xmlToGame(
    xml: XmlElement,
    imageLimits: ImageResourceLimits = DEFAULT_IMAGE_RESOURCE_LIMITS,
): Success<Game> | Fail<ParseXMLFail | SceneImageResourceLimitFail> {

    const gameFormat = readGameFormat(xml);
    // Versioned documents require strict structure validation; legacy documents retain permissive decoding.
    if (!gameFormat.ok) {
        return gameFormat;
    }
    else if (gameFormat.data.kind === 'v1' || gameFormat.data.kind === 'v2') {
        const structure = validateVersionedGameStructure(xml, gameFormat.data);
        // Decode only documents that pass strict structural validation.
        if (!structure.ok) {
            return structureFailureForFormat(structure, gameFormat.data);
        }
    }

    // Title
    const titleNode = findDescendant(xml, 'title');
    if (titleNode === null) {
        return { ok: false, error: { kind: 'parse-xml', details: '<title>...</title> is missing' } };
    }
    const title = titleNode.text.trim();

    // Teaser
    const teaserNode = findDescendant(xml, 'teaser');
    if (teaserNode === null) {
        return { ok: false, error: { kind: 'parse-xml', details: '<teaser>...</teaser> is missing' } };
    }
    const teaser = teaserNode.text.trim();

    // Copyright
    const copyrightNode = findDescendant(xml, 'copyright');
    if (copyrightNode === null) {
        return { ok: false, error: { kind: 'parse-xml', details: '<copyright>...</copyright> is missing' } };
    }
    const copyright = copyrightNode.text.trim();

    // Db data

    // Initial SQL script
    let dbData: DbData | null = null;

    const initialSqlScriptNode = findDescendant(xml, 'initial-sql-script');
    if (initialSqlScriptNode === null) {
        const sqliteDbNode = findDescendant(xml, 'sqlite-db');
        if (sqliteDbNode != null) {
            const base64string = sqliteDbNode.text.trim();
            dbData = {
                type: 'sqlite-db',
                system: 'sqlite',
                systemMinVersion: gameFormat.data.dbSystemMinVersion,
                data: decodeFromBase64(base64string),
            };
        }
    }
    else {
        const sql = initialSqlScriptNode.text.trim();
        const metadata = parseSqlScriptMetadata(sql);
        if (!metadata.ok) {
            return xmlFail(`Invalid SQL metadata in <initial-sql-script>: ${metadata.error.details}`);
        }
        else if (metadata.data.hasExplicitMetadata && metadata.data.system !== gameFormat.data.dbSystem) {
            return xmlFail(
                `Game declares database system ${gameFormat.data.dbSystem}, `
                + `but its initial SQL script declares ${metadata.data.system}`,
            );
        }
        else if (metadata.data.hasExplicitMetadata
            && metadata.data.systemMinVersion !== gameFormat.data.dbSystemMinVersion) {
            return xmlFail(
                `Game declares db-system-min-version ${gameFormat.data.dbSystemMinVersion}, `
                + `but its initial SQL script declares ${metadata.data.systemMinVersion}`,
            );
        }
        else {
            dbData = {
                type: 'initial-sql-script',
                system: gameFormat.data.dbSystem,
                systemMinVersion: gameFormat.data.dbSystemMinVersion,
                sql,
            };
        }
    }

    // An embedded SQLite database is compatible only with the SQLite system.
    if (dbData?.type === 'sqlite-db' && gameFormat.data.dbSystem !== 'sqlite') {
        return xmlFail('An embedded <sqlite-db> requires db-system="sqlite"');
    }

    // Scenes
    const scenesNode = findDescendant(xml, 'scenes');

    if (scenesNode === null) {
        return { ok: false, error: { kind: 'parse-xml', details: '<scenes>...</scenes> are missing' } };
    }
    if (scenesNode.children.length === 0) {
        return { ok: false, error: { kind: 'parse-xml', details: '<scenes>...</scenes> must contain at least one scene' } };
    }

    const sceneResults: (Success<Scene> | Fail<ParseXMLFail | SceneImageResourceLimitFail>)[] = scenesNode.children.map((sceneNode, sceneIndex) => {
        if (sceneNode.name === 'text-scene') {
            const textNode = findDescendant(sceneNode, 'text');
            if (textNode === null) {
                return { ok: false, error: { kind: 'parse-xml', details: '<text>...</text> is missing' } };
            }

            return {ok: true, data: { type: 'text', text: textNode.text.trim() } };
        }
        else if (sceneNode.name === 'image-scene') {
            const imageSceneResult = parseImageScene(sceneNode, gameFormat.data, imageLimits);
            if (imageSceneResult.ok) {
                return imageSceneResult;
            }
            else if (imageSceneResult.error.kind === 'image-resource-limit') {
                return {
                    ok: false,
                    error: {
                        ...imageSceneResult.error,
                        sceneNumber: sceneIndex + 1,
                    },
                };
            }
            else if (imageSceneResult.error.kind === 'parse-xml') {
                return {
                    ok: false,
                    error: imageSceneResult.error,
                };
            }
            else { const _n: never = imageSceneResult.error; return _n; }
        }
        else if (sceneNode.name === 'select-scene') {
            const textNode = findDescendant(sceneNode, 'text');
            if (textNode === null) {
                return { ok: false, error: { kind: 'parse-xml', details: '<text>...</text> is missing' } };
            }

            const sqlSolutionNode = findDescendant(sceneNode, 'sql-solution');
            if (sqlSolutionNode === null) {
                return { ok: false, error: { kind: 'parse-xml', details: '<sql-solution>...</sql-solution> is missing' } };
            }

            const sqlPlaceholder = findDescendant(sceneNode, 'sql-placeholder')?.text.trim() ?? '';

            const isRowOrderRelevant = sceneNode.attributes['is-row-order-relevant']?.trim() === 'true';
            const isColOrderRelevant = sceneNode.attributes['is-col-order-relevant']?.trim() === 'true';
            const areColNamesRelevant = sceneNode.attributes['are-col-names-relevant']?.trim() === 'true';
            const ordinaryHints = parseOrdinaryHints(sceneNode, gameFormat.data);
            const hasSolHint = gameFormat.data.kind === 'v2'
                && sceneNode.attributes['has-sol-hint'] === 'true';

            return {ok: true, data: {
                type: 'select',
                text: textNode.text.trim(),
                sqlSol: sqlSolutionNode.text.trim(),
                sqlPlaceholder,
                isRowOrderRelevant: isRowOrderRelevant,
                isColOrderRelevant: isColOrderRelevant,
                areColNamesRelevant,
                ordinaryHints,
                hasSolHint,
            } };
        }
        else if (sceneNode.name === 'manipulate-scene') {
            const textNode = findDescendant(sceneNode, 'text');
            if (textNode === null) {
                return { ok: false, error: { kind: 'parse-xml', details: '<text>...</text> is missing' } };
            }

            const sqlCheckNode = findDescendant(sceneNode, 'sql-check');
            if (sqlCheckNode === null) {
                return { ok: false, error: { kind: 'parse-xml', details: '<sql-check>...</sql-check> is missing' } };
            }

            const sqlSolNode = findDescendant(sceneNode, 'sql-solution');
            if (sqlSolNode === null) {
                return { ok: false, error: { kind: 'parse-xml', details: '<sql-solution>...</sql-solution> is missing' } };
            }

            const sqlPlaceholder = findDescendant(sceneNode, 'sql-placeholder')?.text.trim() ?? '';
            const ordinaryHints = parseOrdinaryHints(sceneNode, gameFormat.data);
            const hasSolHint = gameFormat.data.kind === 'v2'
                && sceneNode.attributes['has-sol-hint'] === 'true';

            return {ok: true, data: {
                type: 'manipulate',
                text: textNode.text.trim(),
                sqlSol: sqlSolNode.text.trim(),
                sqlCheck: sqlCheckNode.text.trim(),
                sqlPlaceholder,
                ordinaryHints,
                hasSolHint,
            } };
        }
        else {
            return { ok: false, error: { kind: 'parse-xml', details: `Unknown scene type: ${sceneNode.name}` } };
        }
    });

    for (const result of sceneResults) {
        // Propagate the first image resource-limit failure immediately.
        if (!result.ok && result.error.kind === 'image-resource-limit') {
            return result;
        }
    }

    if (sceneResults.some(isFail)) {
        return {
            ok: false,
            error: {
                kind: 'parse-xml',
                details: 'At least one scene failed to parse: ' + sceneResults
                    .filter(isFail)
                    .map(failure => failure.error.kind === 'parse-xml' ? failure.error.details : '')
                    .join('. '),
            },
        };
    }

    // All scenes successfully parsed, so map to a single success array
    const scenes = sceneResults.filter(isSuccess).map(result => result.data);

    // Return the game
    return { ok: true, data: new Game(
        title,
        teaser,
        copyright,
        dbData,
        scenes,
        gameFormat.data.dbSystem,
        gameFormat.data.dbSystemMinVersion,
    ) };
}

type GameFormat = {
    kind: 'legacy';
    dbSystem: 'sqlite';
    dbSystemMinVersion: string;
} | {
    kind: 'v1';
    dbSystem: DatabaseSystem;
    dbSystemMinVersion: string;
} | {
    kind: 'v2';
    dbSystem: DatabaseSystem;
    dbSystemMinVersion: string;
};

function readGameFormat(xml: XmlElement): Success<GameFormat> | Fail<ParseXMLFail> {
    if (xml.name !== 'game') {
        return xmlFail(`Expected <game> as the XML root element, found <${xml.name}>`);
    }
    else {
        const formatVersion = xml.attributes['format-version'];
        const dbSystem = xml.attributes['db-system'];
        const dbSystemMinVersion = xml.attributes['db-system-min-version'];
        if (formatVersion === undefined) {
            if (dbSystem === undefined && dbSystemMinVersion === undefined) {
                return {
                    ok: true,
                    data: {
                        kind: 'legacy',
                        dbSystem: 'sqlite',
                        dbSystemMinVersion: DEFAULT_DATABASE_SYSTEM_MIN_VERSIONS.sqlite,
                    },
                };
            }
            else {
                return xmlFail('A game with database-system metadata must also declare format-version');
            }
        }
        else if (formatVersion !== '1' && formatVersion !== '2') {
            return xmlFail(`Unsupported game format version: ${formatVersion}`);
        }
        else if (dbSystem === undefined) {
            return xmlFail(`Game format version ${formatVersion} requires the db-system attribute`);
        }
        else if (!isDatabaseSystem(dbSystem)) {
            return xmlFail(`Unknown game database system: ${dbSystem}`);
        }
        else if (dbSystemMinVersion === undefined) {
            return xmlFail(`Game format version ${formatVersion} requires the db-system-min-version attribute`);
        }
        else if (!isDatabaseSystemVersion(dbSystemMinVersion)) {
            return xmlFail(`Invalid game database-system minimum version: ${dbSystemMinVersion}`);
        }
        else {
            return {
                ok: true,
                data: {
                    kind: formatVersion === '1' ? 'v1' : 'v2',
                    dbSystem,
                    dbSystemMinVersion,
                },
            };
        }
    }
}

function validateVersionedGameStructure(
    xml: XmlElement,
    gameFormat: Extract<GameFormat, { kind: 'v1' | 'v2' }>,
): Success<void> | Fail<ParseXMLFail> {
    const rootAttributes = validateAttributes(xml, ['format-version', 'db-system', 'db-system-min-version']);
    if (!rootAttributes.ok) {
        return rootAttributes;
    }
    else {
        const rootNames = xml.children.map(child => child.name);
        const expectedRootNames = rootNames.length === 2
            ? ['head', 'scenes']
            : rootNames[2] === 'initial-sql-script'
                ? ['head', 'scenes', 'initial-sql-script']
                : ['head', 'scenes', 'sqlite-db'];
        if (!arraysEqual(rootNames, expectedRootNames)) {
            return invalidStructure(
                '<game> must contain <head>, <scenes>, and optionally exactly one database source in that order',
            );
        }
        else {
            const head = xml.children[0];
            const scenes = xml.children[1];
            const headResult = validateContainer(head, [], ['title', 'teaser', 'copyright']);
            if (!headResult.ok) {
                return headResult;
            }
            else {
                for (const child of head.children) {
                    const leafResult = validateLeaf(child, []);
                    // Stop at the first invalid head element.
                    if (!leafResult.ok) {
                        return leafResult;
                    }
                }

                const scenesAttributes = validateAttributes(scenes, []);
                if (!scenesAttributes.ok) {
                    return scenesAttributes;
                }
                else if (scenes.children.length === 0) {
                    return invalidStructure('<scenes> must contain at least one scene');
                }
                else {
                    for (const scene of scenes.children) {
                        const sceneResult = validateSceneStructure(scene, gameFormat);
                        // Stop at the first invalid scene.
                        if (!sceneResult.ok) {
                            return sceneResult;
                        }
                    }
                }

                // A database source is optional and is validated only when present.
                const database = xml.children[2];
                if (database !== undefined) {
                    const databaseResult = validateLeaf(database, []);
                    // Reject an invalid optional database element.
                    if (!databaseResult.ok) {
                        return databaseResult;
                    }
                }

                return { ok: true, data: undefined };
            }
        }
    }
}

function validateSceneStructure(
    scene: XmlElement,
    gameFormat: Extract<GameFormat, { kind: 'v1' | 'v2' }>,
): Success<void> | Fail<ParseXMLFail> {
    if (scene.name === 'text-scene') {
        const container = validateContainer(scene, [], ['text']);
        if (!container.ok) {
            return container;
        }
        else {
            return validateLeaf(scene.children[0], []);
        }
    }
    else if (scene.name === 'image-scene') {
        const leaf = validateLeaf(scene, ['media-type']);
        if (!leaf.ok) {
            return leaf;
        }
        else {
            const mediaType = scene.attributes['media-type'];
            if (mediaType === undefined) {
                return invalidStructure('<image-scene> requires the media-type attribute');
            }
            else if (!isImageMediaType(mediaType)) {
                return invalidStructure(`Unsupported image media type: ${mediaType}`);
            }
            else {
                return { ok: true, data: undefined };
            }
        }
    }
    else if (scene.name === 'select-scene') {
        const attributes = validateBooleanAttributes(scene, [
            'is-row-order-relevant',
            'is-col-order-relevant',
            'are-col-names-relevant',
            ...(gameFormat.kind === 'v2' ? ['has-sol-hint'] : []),
        ]);
        if (!attributes.ok) {
            return attributes;
        }
        else {
            return gameFormat.kind === 'v1'
                ? validateOptionalTrailingChild(scene, ['text', 'sql-solution'], 'sql-placeholder')
                : validateVersion2TaskScene(scene, ['text', 'sql-solution']);
        }
    }
    else if (scene.name === 'manipulate-scene') {
        const attributes = gameFormat.kind === 'v1'
            ? validateAttributes(scene, [])
            : validateBooleanAttributes(scene, ['has-sol-hint']);
        if (!attributes.ok) {
            return attributes;
        }
        else {
            return gameFormat.kind === 'v1'
                ? validateOptionalTrailingChild(scene, ['text', 'sql-solution', 'sql-check'], 'sql-placeholder')
                : validateVersion2TaskScene(scene, ['text', 'sql-solution', 'sql-check']);
        }
    }
    else {
        return invalidStructure(`Unknown scene type: ${scene.name}`);
    }
}

function validateVersion2TaskScene(
    scene: XmlElement,
    requiredNames: string[],
): Success<void> | Fail<ParseXMLFail> {
    const childNames = scene.children.map(child => child.name);
    const allowedNames = [
        requiredNames,
        [...requiredNames, 'sql-placeholder'],
        [...requiredNames, 'hints'],
        [...requiredNames, 'sql-placeholder', 'hints'],
    ];
    if (!allowedNames.some(expectedNames => arraysEqual(childNames, expectedNames))) {
        return invalidStructure(
            `<${scene.name}> must contain ${requiredNames.map(name => `<${name}>`).join(', ')}, optionally followed by <sql-placeholder>, and optionally followed by final <hints>`,
        );
    }
    else {
        for (const child of scene.children) {
            if (child.name === 'hints') {
                const ordinaryHintsResult = validateOrdinaryHintsStructure(child);
                if (!ordinaryHintsResult.ok) {
                    return ordinaryHintsResult;
                }
            }
            else {
                const leafResult = validateLeaf(child, []);
                if (!leafResult.ok) {
                    return leafResult;
                }
            }
        }
        return { ok: true, data: undefined };
    }
}

function validateOrdinaryHintsStructure(ordinaryHints: XmlElement): Success<void> | Fail<ParseXMLFail> {
    const attributes = validateAttributes(ordinaryHints, []);
    if (!attributes.ok) {
        return attributes;
    }
    else {
        let ordinaryExpectedResultHintCount = 0;
        for (const ordinaryHint of ordinaryHints.children) {
            if (ordinaryHint.name === 'text-hint') {
                const leafResult = validateLeaf(ordinaryHint, []);
                if (!leafResult.ok) {
                    return leafResult;
                }
            }
            else if (ordinaryHint.name === 'expected-result-hint') {
                ordinaryExpectedResultHintCount++;
                const leafResult = validateLeaf(ordinaryHint, []);
                if (!leafResult.ok) {
                    return leafResult;
                }
                else if (ordinaryHint.text.trim() !== '') {
                    return invalidStructure('<expected-result-hint> must not contain text');
                }
            }
            else {
                return invalidStructure(`Unknown ordinary hint type: ${ordinaryHint.name}`);
            }
        }

        if (ordinaryExpectedResultHintCount > 1) {
            return invalidStructure('<hints> must not contain more than one <expected-result-hint>');
        }
        else {
            return { ok: true, data: undefined };
        }
    }
}

function validateOptionalTrailingChild(
    element: XmlElement,
    requiredNames: string[],
    optionalName: string,
): Success<void> | Fail<ParseXMLFail> {
    const childNames = element.children.map(child => child.name);
    const expectedNames = childNames.length === requiredNames.length
        ? requiredNames
        : [...requiredNames, optionalName];
    if (!arraysEqual(childNames, expectedNames)) {
        return invalidStructure(
            `<${element.name}> must contain ${expectedNames.map(name => `<${name}>`).join(', ')} in that order`,
        );
    }
    else {
        for (const child of element.children) {
            const leafResult = validateLeaf(child, []);
            // Stop at the first invalid child.
            if (!leafResult.ok) {
                return leafResult;
            }
        }
        return { ok: true, data: undefined };
    }
}

function validateContainer(
    element: XmlElement,
    allowedAttributes: string[],
    expectedChildNames: string[],
): Success<void> | Fail<ParseXMLFail> {
    const attributes = validateAttributes(element, allowedAttributes);
    if (!attributes.ok) {
        return attributes;
    }
    else if (!arraysEqual(element.children.map(child => child.name), expectedChildNames)) {
        return invalidStructure(
            `<${element.name}> must contain ${expectedChildNames.map(name => `<${name}>`).join(', ')} in that order`,
        );
    }
    else {
        return { ok: true, data: undefined };
    }
}

function validateLeaf(
    element: XmlElement,
    allowedAttributes: string[],
): Success<void> | Fail<ParseXMLFail> {
    const attributes = validateAttributes(element, allowedAttributes);
    if (!attributes.ok) {
        return attributes;
    }
    else if (element.children.length !== 0) {
        return invalidStructure(`<${element.name}> must not contain child elements`);
    }
    else {
        return { ok: true, data: undefined };
    }
}

function validateBooleanAttributes(
    element: XmlElement,
    allowedAttributes: string[],
): Success<void> | Fail<ParseXMLFail> {
    const attributes = validateAttributes(element, allowedAttributes);
    if (!attributes.ok) {
        return attributes;
    }
    else {
        for (const [name, value] of Object.entries(element.attributes)) {
            // Reject the first attribute whose value is not boolean.
            if (value !== 'true' && value !== 'false') {
                return invalidStructure(`Attribute ${name} on <${element.name}> must be true or false`);
            }
        }
        return { ok: true, data: undefined };
    }
}

function validateAttributes(
    element: XmlElement,
    allowedAttributes: string[],
): Success<void> | Fail<ParseXMLFail> {
    const unknown = Object.keys(element.attributes).find(name => !allowedAttributes.includes(name));
    if (unknown !== undefined) {
        return invalidStructure(`Unknown attribute ${unknown} on <${element.name}>`);
    }
    else {
        return { ok: true, data: undefined };
    }
}

function arraysEqual(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((value, index) => value === b[index]);
}

function invalidStructure(details: string): Fail<ParseXMLFail> {
    return xmlFail(`Invalid game format version 1 structure: ${details}`);
}

function structureFailureForFormat(
    failure: Fail<ParseXMLFail>,
    gameFormat: Extract<GameFormat, { kind: 'v1' | 'v2' }>,
): Fail<ParseXMLFail> {
    if (gameFormat.kind === 'v1') {
        return failure;
    }
    else if (gameFormat.kind === 'v2') {
        return xmlFail(failure.error.details.replace(
            'Invalid game format version 1 structure:',
            'Invalid game format version 2 structure:',
        ));
    }
    else { const _n: never = gameFormat; return _n; }
}

function xmlFail(details: string): Fail<ParseXMLFail> {
    return { ok: false, error: { kind: 'parse-xml', details } };
}

function parseOrdinaryHints(sceneNode: XmlElement, gameFormat: GameFormat): OrdinaryHint[] {
    if (gameFormat.kind === 'legacy' || gameFormat.kind === 'v1') {
        return [{ type: 'expected-result' }];
    }
    else if (gameFormat.kind === 'v2') {
        const ordinaryHintsNode = sceneNode.children.find(child => child.name === 'hints');
        if (ordinaryHintsNode === undefined) {
            return [];
        }
        else {
            return ordinaryHintsNode.children.map(ordinaryHintNode => {
                if (ordinaryHintNode.name === 'text-hint') {
                    return { type: 'text', text: ordinaryHintNode.text.trim() };
                }
                else if (ordinaryHintNode.name === 'expected-result-hint') {
                    return { type: 'expected-result' };
                }
                else {
                    throw new Error(`Unexpected validated ordinary hint type: ${ordinaryHintNode.name}`);
                }
            });
        }
    }
    else { const _n: never = gameFormat; return _n; }
}

function parseImageScene(
    sceneNode: XmlElement,
    gameFormat: GameFormat,
    imageLimits: ImageResourceLimits,
): Success<Scene> | Fail<ParseXMLFail | EmbeddedImageResourceLimitFail> {
    const raw = sceneNode.text.trim();
    let base64string = raw;
    if (gameFormat.kind === 'legacy') {
        const dataUrl = /^data:[^;,]+;base64,(.*)$/su.exec(raw);
        // Legacy files accept both data URLs and raw base64.
        if (dataUrl !== null) {
            base64string = dataUrl[1];
        }
    }
    else {
        // Versioned games store raw base64 only.
        if (raw.startsWith('data:')) {
            return xmlFail(`Game format version ${gameFormat.kind === 'v1' ? '1' : '2'} image data must not use a data-URL prefix`);
        }
    }

    const normalizedBase64 = base64string.replace(/\s/gu, '');
    const estimatedFileBytes = decodedBase64ByteLength(normalizedBase64);
    const estimatedFileSizeFailure = imageFileSizeLimitFailure(estimatedFileBytes, imageLimits);
    // Enforce the estimated file-size limit before decoding.
    if (estimatedFileSizeFailure !== null) {
        return { ok: false, error: estimatedFileSizeFailure };
    }

    let decoded: Uint8Array;
    try {
        decoded = decodeFromBase64(normalizedBase64);
    }
    catch {
        return xmlFail('An <image-scene> contains invalid base64 data');
    }

    const fileSizeFailure = imageFileSizeLimitFailure(decoded.byteLength, imageLimits);
    // Continue to format and dimension validation only when the decoded data fits the file-size limit.
    if (fileSizeFailure !== null) {
        return { ok: false, error: fileSizeFailure };
    }

    const detectedMediaType = detectImageMediaType(decoded);
    if (detectedMediaType === null) {
        return xmlFail('An <image-scene> contains an unsupported or invalid image');
    }
    else {
        const dimensions = readImageDimensions(decoded, detectedMediaType);
        if (dimensions === null) {
            return xmlFail('An <image-scene> does not contain readable image dimensions');
        }
        else {
            const dimensionLimitFailure = imageDimensionLimitFailure(dimensions, imageLimits);
            // Decode the scene only when its width and height fit the embedded-image limits.
            if (dimensionLimitFailure !== null) {
                return { ok: false, error: dimensionLimitFailure };
            }
        }
    }

    if (gameFormat.kind === 'legacy') {
        return {
            ok: true,
            data: {
                type: 'image',
                base64string: normalizedBase64,
                mediaType: detectedMediaType,
            },
        };
    }
    else {
        const declaredMediaType = sceneNode.attributes['media-type'];
        if (declaredMediaType === undefined || !isImageMediaType(declaredMediaType)) {
            return xmlFail(`Game format version ${gameFormat.kind === 'v1' ? '1' : '2'} requires a supported image media type`);
        }
        else if (declaredMediaType !== detectedMediaType) {
            return xmlFail(
                `Image declares ${declaredMediaType}, but its data is ${detectedMediaType}`,
            );
        }
        else {
            return {
                ok: true,
                data: {
                    type: 'image',
                    base64string: normalizedBase64,
                    mediaType: declaredMediaType,
                },
            };
        }
    }
}

function decodedBase64ByteLength(value: string): number {
    const padding = value.endsWith('==')
        ? 2
        : value.endsWith('=')
            ? 1
            : 0;
    return Math.max(0, Math.floor(value.length * 3 / 4) - padding);
}

function findDescendant(element: XmlElement, name: string): XmlElement | null {
    for (const child of element.children) {
        if (child.name === name) {
            return child;
        }
        else {
            const descendant = findDescendant(child, name);
            // Return the first matching descendant; otherwise continue with the next child.
            if (descendant !== null) {
                return descendant;
            }
        }
    }
    return null;
}


//////////////
// Printing //
//////////////

export function gameToXML(g: Game): string {
    const scenes = g.scenes.map(scene => {
        if (scene.type === 'text') {
            return `        <text-scene>
            <text>${he.encode(scene.text, heOptions)}</text>
        </text-scene>`;
        }
        if (scene.type === 'image') {
            return `        <image-scene media-type="${scene.mediaType}">${he.encode(scene.base64string)}</image-scene>`;
        }
        else if (scene.type === 'select') {
            const ordinaryHints = ordinaryHintsToXML(scene.ordinaryHints);
            return `        <select-scene is-row-order-relevant="${scene.isRowOrderRelevant ? 'true' : 'false'}" is-col-order-relevant="${scene.isColOrderRelevant ? 'true' : 'false'}" are-col-names-relevant="${scene.areColNamesRelevant ? 'true' : 'false'}" has-sol-hint="${scene.hasSolHint ? 'true' : 'false'}">
            <text>${he.encode(scene.text, heOptions)}</text>
            <sql-solution>${he.encode(scene.sqlSol, heOptions)}</sql-solution>
            <sql-placeholder>${he.encode(scene.sqlPlaceholder, heOptions)}</sql-placeholder>${ordinaryHints}
        </select-scene>`;
        }
        else if (scene.type === 'manipulate') {
            const ordinaryHints = ordinaryHintsToXML(scene.ordinaryHints);
            return `        <manipulate-scene has-sol-hint="${scene.hasSolHint ? 'true' : 'false'}">
            <text>${he.encode(scene.text, heOptions)}</text>
            <sql-solution>${he.encode(scene.sqlSol, heOptions)}</sql-solution>
            <sql-check>${he.encode(scene.sqlCheck, heOptions)}</sql-check>
            <sql-placeholder>${he.encode(scene.sqlPlaceholder, heOptions)}</sql-placeholder>${ordinaryHints}
        </manipulate-scene>`;
        }
        else { const _n: never = scene; return _n; }
    }).join('\n');

    const dbData =
        g.dbData === null
        ? ''
        : (g.dbData.type === 'initial-sql-script'
            ? `<initial-sql-script>${he.encode(g.dbData.sql, heOptions)}</initial-sql-script>`
            : `<sqlite-db>${he.encode(encodeToBase64(g.dbData.data), heOptions)}</sqlite-db>`);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<game format-version="2" db-system="${g.dbSystem}" db-system-min-version="${g.dbSystemMinVersion}">
    <head>
        <title>${he.encode(g.title, heOptions)}</title>
        <teaser>${he.encode(g.teaser, heOptions)}</teaser>
        <copyright>${he.encode(g.copyright, heOptions)}</copyright>
    </head>
    <scenes>
${scenes}
    </scenes>
    ${dbData}
</game>`;
}

function ordinaryHintsToXML(ordinaryHints: OrdinaryHint[]): string {
    if (ordinaryHints.length === 0) {
        return '';
    }
    else {
        const children = ordinaryHints.map(ordinaryHint => {
            if (ordinaryHint.type === 'text') {
                return `                <text-hint>${he.encode(ordinaryHint.text, heOptions)}</text-hint>`;
            }
            else if (ordinaryHint.type === 'expected-result') {
                return '                <expected-result-hint />';
            }
            else { const _n: never = ordinaryHint; return _n; }
        }).join('\n');
        return `
            <hints>
${children}
            </hints>`;
    }
}
