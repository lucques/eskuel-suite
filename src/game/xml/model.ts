import type { Fail, Success } from '../../util';

export type ParseXMLFail = { kind: 'parse-xml', details: string };

export type XmlElement = {
    name: string;
    text: string;
    attributes: Readonly<Record<string, string>>;
    children: readonly XmlElement[];
};

export type XmlParser = {
    parse(text: string): Success<XmlElement> | Fail<ParseXMLFail>;
};
