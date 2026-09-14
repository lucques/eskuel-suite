import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { Game } from '../../../src/game/model';
import { gameToXML, xmlToGame } from '../../../src/game/xml/codec';
import { fastXmlParser } from '../../../src/game/xml/fast-parser';

type ProductionGameFile = {
    name: string;
    path: string;
};

const productionGamesDirectory = fileURLToPath(
    new URL('../../../public/res/games/', import.meta.url),
);
const productionGameFiles = findXmlFiles(productionGamesDirectory).map(path => ({
    name: relative(productionGamesDirectory, path),
    path,
}));
const version2ExamplePath = fileURLToPath(
    new URL('../../../spec/game-xml/v2/minimal.xml', import.meta.url),
);

describe('production game codec round trips', () => {
    it('finds production games', () => {
        expect(productionGameFiles.length).toBeGreaterThan(0);
    });

    it.each(productionGameFiles)(
        'round-trips production game: $name',
        ({ name, path }) => {
            const originalGame = parseGame(readFileSync(path, 'utf8'), `${name} source XML`);
            const serializedXml = gameToXML(originalGame);
            const roundTrippedGame = parseGame(serializedXml, `${name} serialized XML`);

            expect(roundTrippedGame).toEqual(originalGame);
        },
    );

    it('round-trips the canonical version 2 example with ordered ordinary hints', () => {
        const originalGame = parseGame(readFileSync(version2ExamplePath, 'utf8'), 'version 2 example');
        const roundTrippedGame = parseGame(gameToXML(originalGame), 'serialized version 2 example');

        expect(originalGame.scenes[1]).toMatchObject({
            type: 'select',
            ordinaryHints: [
                { type: 'text', text: 'Read from the example table.' },
                { type: 'expected-result' },
            ],
            hasSolHint: true,
        });
        expect(roundTrippedGame).toEqual(originalGame);
    });
});

function findXmlFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            return findXmlFiles(path);
        }
        else if (entry.isFile() && entry.name.toLowerCase().endsWith('.xml')) {
            return [path];
        }
        else {
            return [];
        }
    }).sort();
}

function parseGame(xml: string, description: string): Game {
    const parsedXml = fastXmlParser.parse(xml);
    if (!parsedXml.ok) {
        throw new Error(`Failed to parse ${description}: ${parsedXml.error.details}`);
    }
    else {
        const parsedGame = xmlToGame(parsedXml.data);
        if (!parsedGame.ok) {
            const details = parsedGame.error.kind === 'parse-xml'
                ? parsedGame.error.details
                : `image ${parsedGame.error.resource} limit ${parsedGame.error.limit} exceeded`;
            throw new Error(`Failed to decode ${description}: ${details}`);
        }
        else {
            return parsedGame.data;
        }
    }
}
