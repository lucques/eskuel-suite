import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { expect, it, vi } from 'vitest';

import { SettingsContext } from '../../settings/context';
import { defaultSettings } from '../../settings/store';
import { InlineMarkup } from './InlineMarkup';

vi.mock('react-syntax-highlighter', async importOriginal => {
    const actual = await importOriginal<typeof import('react-syntax-highlighter')>();
    return {
        ...actual,
        Prism: vi.fn((props: ComponentProps<typeof actual.Prism>) => <actual.Prism {...props} />),
    };
});

function renderMarkup(text: string, darkMode = false): string {
    const markup = renderToStaticMarkup(
        <SettingsContext.Provider value={{ settings: defaultSettings, darkMode, updateSettings: () => {} }}>
            <InlineMarkup text={text} />
        </SettingsContext.Provider>,
    );

    // Compare text and semantic markup independently of syntax-highlighting decoration.
    return markup
        .replace(/<\/?span\b[^>]*>/g, '')
        .replace(/<code\b[^>]*>/g, '<code>')
        .replace(/<code>[\s\S]*?<\/code>/g, code => code.replace(/\n/g, '<br/>'));
}

it.each([
    ['', ''],
    ['First line\n\nThird line\n', 'First line<br/><br/>Third line<br/>'],
    ['Use `SELECT *` with *care* and **attention**.', 'Use <code>SELECT *</code> with <em>care</em> and <strong>attention</strong>.'],
    ['**bold with *italic* inside**', '<strong>bold with <em>italic</em> inside</strong>'],
    ['*italic with **bold** inside*', '<em>italic with <strong>bold</strong> inside</em>'],
    ['**bold (*italic*) inside**', '<strong>bold (<em>italic</em>) inside</strong>'],
    ['***both***', '<em><strong>both</strong></em>'],
    ['***both** italic*', '<em><strong>both</strong> italic</em>'],
    ['***both* bold**', '<strong><em>both</em> bold</strong>'],
    ['**bold *both***', '<strong>bold <em>both</em></strong>'],
    ['*italic **both***', '<em>italic <strong>both</strong></em>'],
    ['**Use `SELECT` here**', '<strong>Use <code>SELECT</code> here</strong>'],
    ['`**literal** \\*`', '<code>**literal** \\*</code>'],
    ['``SELECT `name` FROM users``', '<code>SELECT `name` FROM users</code>'],
    ['*first\nsecond*\n`a\nb`', '<em>first<br/>second</em><br/><code>a<br/>b</code>'],
    ['SELECT * FROM a; SELECT * FROM b;', 'SELECT * FROM a; SELECT * FROM b;'],
    ['* text* / ** text** / *text * / **text **', '* text* / ** text** / *text * / **text **'],
    ['\\*literal\\* \\`code\\` \\\\ path\\name', '*literal* `code` \\ path\\name'],
    ['unfinished *text and `code', 'unfinished *text and `code'],
    ['*unfinished **bold**', '*unfinished <strong>bold</strong>'],
    ['****literal****', '****literal****'],
    ['# Heading\n* list\n[link](javascript:alert(1)) _text_', '# Heading<br/>* list<br/>[link](javascript:alert(1)) _text_'],
])('renders inline markup in %j', (text, expected) => {
    expect(renderMarkup(text)).toBe(expected);
});

it('escapes HTML in ordinary text, emphasis, and code', () => {
    const text = '<script>alert(1)</script> **<img src=x onerror=alert(1)>** `<b>&</b>`';

    expect(renderMarkup(text)).toBe(
        '&lt;script&gt;alert(1)&lt;/script&gt; <strong>&lt;img src=x onerror=alert(1)&gt;</strong> <code>&lt;b&gt;&amp;&lt;/b&gt;</code>',
    );
});

it('leaves excessively nested input literal without overflowing the render stack', () => {
    const text = '*nested '.repeat(1000) + 'end' + '*'.repeat(1000);

    expect(renderMarkup(text)).toBe(text);
});

it.each([false, true])('uses SQL for code spans with darkMode=%s', darkMode => {
    vi.mocked(SyntaxHighlighter).mockClear();
    const sql = 'SELECT *\nFROM users WHERE name = \'Ada\';';

    expect(renderMarkup('Query: `' + sql + '`', darkMode)).toBe(
        'Query: <code>SELECT *<br/>FROM users WHERE name = &#x27;Ada&#x27;;</code>',
    );
    expect(vi.mocked(SyntaxHighlighter).mock.calls[0][0]).toMatchObject({
        language: 'sql',
        children: sql,
    });
});
