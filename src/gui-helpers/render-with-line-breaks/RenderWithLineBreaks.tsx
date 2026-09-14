import { Fragment } from 'react';

export function RenderWithLineBreaks({ text }: { text: string }) {
    const lines = text.split('\n');

    return (
        <>
            {lines.map((line, index) => (
                <Fragment key={index}>
                    {line}
                    {index < lines.length - 1 ? <br /> : null}
                </Fragment>
            ))}
        </>
    );
}
