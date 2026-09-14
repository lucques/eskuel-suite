import { describe, expect, it } from 'vitest';

import type { XmlParser } from '../../../src/game/xml/model';

const orderedXml = `<?xml version='1.0' encoding='UTF-8'?>
<game language='en'><scenes><text-scene><text>First &#xFC; &amp; intro</text></text-scene><select-scene required='true'><text><![CDATA[SELECT <value>]]></text></select-scene><text-scene><text>Last</text></text-scene></scenes></game>`;

export function describeXmlParserContract(name: string, parser: XmlParser): void {
    describe(name, () => {
        it('normalizes element order, attributes, entities, and CDATA', () => {
            const result = parser.parse(orderedXml);
            if (!result.ok) {
                throw new Error(result.error.details);
            }
            else {
                expect(result.data.name).toBe('game');
                expect(result.data.attributes).toEqual({ language: 'en' });
                expect(result.data.children).toHaveLength(1);

                const scenes = result.data.children[0];
                expect(scenes.name).toBe('scenes');
                expect(scenes.children.map(scene => scene.name)).toEqual([
                    'text-scene',
                    'select-scene',
                    'text-scene',
                ]);
                expect(scenes.children[0].children[0].text).toBe('First ü & intro');
                expect(scenes.children[1].attributes).toEqual({ required: 'true' });
                expect(scenes.children[1].children[0].text).toBe('SELECT <value>');
            }
        });

        it('rejects malformed XML', () => {
            const result = parser.parse('<game><scenes></game>');
            expect(result).toMatchObject({
                ok: false,
                error: { kind: 'parse-xml' },
            });
        });
    });
}
