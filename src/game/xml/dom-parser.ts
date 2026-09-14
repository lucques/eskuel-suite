import type { XmlElement, XmlParser } from './model';

export const domXmlParser: XmlParser = {
    parse(text) {
        try {
            const document = new DOMParser().parseFromString(text, 'application/xml');
            const parserError = document.querySelector('parsererror');
            if (parserError !== null) {
                return {
                    ok: false,
                    error: {
                        kind: 'parse-xml',
                        details: parserError.textContent?.trim() || 'Malformed XML',
                    },
                };
            }
            else {
                return { ok: true, data: normalizeElement(document.documentElement) };
            }
        }
        catch (error: unknown) {
            return {
                ok: false,
                error: { kind: 'parse-xml', details: String(error) },
            };
        }
    },
};

function normalizeElement(element: Element): XmlElement {
    return {
        name: element.nodeName,
        text: element.textContent ?? '',
        attributes: Object.fromEntries(Array.from(element.attributes, attribute => [attribute.name, attribute.value])),
        children: Array.from(element.children, normalizeElement),
    };
}
