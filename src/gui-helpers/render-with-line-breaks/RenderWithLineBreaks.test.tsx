import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

import { RenderWithLineBreaks } from './RenderWithLineBreaks';

it('replaces every newline with a br element', () => {
    const markup = renderToStaticMarkup(
        <RenderWithLineBreaks text={'First line\n\nThird line\n'} />,
    );

    expect(markup).toBe('First line<br/><br/>Third line<br/>');
});
