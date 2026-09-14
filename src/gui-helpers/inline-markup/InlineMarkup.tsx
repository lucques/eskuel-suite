import { Fragment, type ReactNode } from 'react';

import { RenderWithLineBreaks } from '../render-with-line-breaks/RenderWithLineBreaks';
import { InlineSql } from '../sql-listing/SqlListing';

type EmphasisFrame = {
    stars: number,
    key: number,
    children: ReactNode[],
};

export function InlineMarkup({ text }: { text: string }) {
    return <>{renderInlineMarkup(text)}</>;
}

function renderInlineMarkup(text: string): ReactNode {
    const frames: EmphasisFrame[] = [{ stars: 0, key: 0, children: [] }];
    const append = (node: ReactNode) => frames[frames.length - 1].children.push(node);

    // Index matching backtick runs once, including those that are literal inside code.
    const nextBacktick = new Map<number, number>();
    const lastBacktickByLength = new Map<number, number>();
    const backticks = [...text.matchAll(/`+/g)];
    for (let index = backticks.length - 1; index >= 0; index--) {
        const run = backticks[index];
        const next = lastBacktickByLength.get(run[0].length);
        if (next !== undefined) {
            nextBacktick.set(run.index, next);
        }
        lastBacktickByLength.set(run[0].length, run.index);
    }

    let position = 0;
    while (position < text.length) {
        const character = text[position];
        if (character === '\\' && /[\\*`]/.test(text[position + 1] ?? '')) {
            append(text[position + 1]);
            position += 2;
        }
        else if (character === '`') {
            let end = position + 1;
            while (text[end] === '`') {
                end++;
            }
            const closing = nextBacktick.get(position);
            if (closing === undefined) {
                append(text.slice(position, end));
                position = end;
            }
            else {
                append(<InlineSql key={position} sql={text.slice(end, closing)} />);
                position = closing + end - position;
            }
        }
        else if (character === '*') {
            let end = position + 1;
            while (text[end] === '*') {
                end++;
            }
            let remaining = end - position;
            // This subset supports *, **, and ***; longer runs stay literal.
            if (remaining > 3) {
                append(text.slice(position, end));
            }
            else {
                const before = text[position - 1] ?? '';
                const after = text[end] ?? '';
                const beforeSpace = before === '' || /\s/.test(before);
                const afterSpace = after === '' || /\s/.test(after);
                const beforePunctuation = /[\p{P}\p{S}]/u.test(before);
                const afterPunctuation = /[\p{P}\p{S}]/u.test(after);
                const canClose = !beforeSpace && (!beforePunctuation || afterSpace || afterPunctuation);
                const canOpen = !afterSpace && (!afterPunctuation || beforeSpace || beforePunctuation);
                while (canClose && remaining > 0 && frames.length > 1) {
                    const frame = frames[frames.length - 1];
                    const used = Math.min(2, remaining, frame.stars);
                    const formatted = used === 2
                        ? <strong key={position}>{frame.children}</strong>
                        : <em key={position}>{frame.children}</em>;
                    frame.stars -= used;
                    remaining -= used;
                    if (frame.stars === 0) {
                        frames.pop();
                        append(formatted);
                    }
                    else {
                        frame.children = [formatted];
                    }
                }
                if (remaining > 0) {
                    if (canOpen) {
                        // Bound React tree depth for excessively nested input.
                        if (frames.length >= 32) {
                            return <RenderWithLineBreaks text={text} />;
                        }
                        else {
                            frames.push({ stars: remaining, key: position, children: [] });
                        }
                    }
                    else {
                        append('*'.repeat(remaining));
                    }
                }
            }
            position = end;
        }
        else if (character === '\n') {
            append(<br key={position} />);
            position++;
        }
        else {
            let end = position + 1;
            while (end < text.length && !/[\\`*\n]/.test(text[end])) {
                end++;
            }
            append(text.slice(position, end));
            position = end;
        }
    }

    // Restore unmatched opening markers, retaining any complete formatting inside.
    while (frames.length > 1) {
        const frame = frames.pop()!;
        append(<Fragment key={frame.key}>{'*'.repeat(frame.stars)}{frame.children}</Fragment>);
    }
    return frames[0].children;
}
