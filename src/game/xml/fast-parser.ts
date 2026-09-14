import { XMLParser, XMLValidator } from 'fast-xml-parser';

import type { XmlElement, XmlParser } from './model';

type UnknownRecord = Record<string, unknown>;

const parser = new XMLParser({
    attributeNamePrefix: '',
    htmlEntities: true,
    ignoreAttributes: false,
    parseAttributeValue: false,
    parseTagValue: false,
    preserveOrder: true,
    textNodeName: '#text',
    trimValues: false,
});

export const fastXmlParser: XmlParser = {
    parse(text) {
        const validation = XMLValidator.validate(text);
        if (validation !== true) {
            return {
                ok: false,
                error: {
                    kind: 'parse-xml',
                    details: `${validation.err.msg} at line ${validation.err.line}, column ${validation.err.col}`,
                },
            };
        }
        else {
            try {
                const parsed: unknown = parser.parse(text);
                if (Array.isArray(parsed)) {
                    const roots = parsed.flatMap(item => {
                        const element = normalizeElement(item);
                        return element === null ? [] : [element];
                    });
                    if (roots.length === 1) {
                        return { ok: true, data: roots[0] };
                    }
                    else {
                        return {
                            ok: false,
                            error: { kind: 'parse-xml', details: 'Expected exactly one XML root element' },
                        };
                    }
                }
                else {
                    return {
                        ok: false,
                        error: { kind: 'parse-xml', details: 'XML parser returned an invalid document' },
                    };
                }
            }
            catch (error: unknown) {
                return {
                    ok: false,
                    error: { kind: 'parse-xml', details: String(error) },
                };
            }
        }
    },
};

function normalizeElement(value: unknown): XmlElement | null {
    if (!isRecord(value)) {
        return null;
    }
    else {
        const elementNames = Object.keys(value).filter(name => isElementName(name));
        if (elementNames.length !== 1) {
            return null;
        }
        else {
            const name = elementNames[0];
            const content = value[name];
            if (!Array.isArray(content)) {
                return null;
            }
            else {
                const children: XmlElement[] = [];
                let text = '';
                for (const item of content) {
                    if (isRecord(item) && typeof item['#text'] === 'string') {
                        text += item['#text'];
                    }
                    else {
                        const child = normalizeElement(item);
                        // Comments, declarations, and other non-element nodes normalize to null.
                        if (child !== null) {
                            children.push(child);
                            text += child.text;
                        }
                    }
                }

                return {
                    name,
                    text,
                    attributes: normalizeAttributes(value[':@']),
                    children,
                };
            }
        }
    }
}

function normalizeAttributes(value: unknown): Readonly<Record<string, string>> {
    if (!isRecord(value)) {
        return {};
    }
    else {
        return Object.fromEntries(Object.entries(value).flatMap(([name, attribute]) =>
            typeof attribute === 'string' ? [[name, attribute]] : []));
    }
}

function isElementName(name: string): boolean {
    return name !== ':@' && !name.startsWith('#') && !name.startsWith('?') && !name.startsWith('!');
}

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
