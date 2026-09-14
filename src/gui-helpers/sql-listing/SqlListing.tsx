import type { ReactNode } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vs as lightSyntaxStyle, vscDarkPlus as darkSyntaxStyle } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { useSettings } from '../../settings/settings';
import styles from './SqlListing.module.css';

export function SqlListing({ sql, className }: {
    sql: string,
    className?: string,
}) {
    const { darkMode } = useSettings();
    const classNames = className === undefined ? styles.root : `${styles.root} ${className}`;

    return (
        <SyntaxHighlighter
            language='sql'
            style={darkMode ? darkSyntaxStyle : lightSyntaxStyle}
            className={classNames}
        >
            {sql}
        </SyntaxHighlighter>
    );
}

export function InlineSql({ sql }: { sql: string }) {
    const { darkMode } = useSettings();

    return (
        <SyntaxHighlighter
            language='sql'
            style={darkMode ? darkSyntaxStyle : lightSyntaxStyle}
            PreTag={InlineContainer}
            codeTagProps={{
                className: 'language-sql',
                style: { color: 'inherit', whiteSpace: 'pre-wrap' },
            }}
        >
            {sql}
        </SyntaxHighlighter>
    );
}

// Inline code needs only the code element, without the highlighter's block wrapper.
function InlineContainer({ children }: { children?: ReactNode }) {
    return <>{children}</>;
}
