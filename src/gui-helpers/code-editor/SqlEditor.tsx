import React from 'react';

import { CodeEditor } from './CodeEditor';
import type { CodeEditorHandle, CodeEditorOptions, CodeEditorURI, CodeEditorValueProps } from './CodeEditor';

export type SqlEditorProps = CodeEditorValueProps & {
    uri?: CodeEditorURI;
    readOnly?: boolean;
    darkMode: boolean;
    height?: number | string;
};

const EmptyView = (): null => null;
const noProblems: never[] = [];
const defaultSqlEditorOptions: CodeEditorOptions = {
    fontSize: 18,
    folding: false,
    lineNumbers: 'off',
    stickyScroll: { enabled: false },
};

const noProblemToTitle = (): string => '';
const noProblemToLoc = (): null => null;

export const SqlEditor = React.forwardRef<CodeEditorHandle, SqlEditorProps>(
    function SqlEditor(props, ref) {
        return (
            <CodeEditor<never, never, 'common'>
                {...props}
                ref={ref}
                ns='common'
                language='sql'
                className='form-control p-0 overflow-hidden'
                PendingDetailView={EmptyView}
                ProblemTitleView={EmptyView}
                ProblemBodyView={EmptyView}
                problemToTitle={noProblemToTitle}
                problemToLoc={noProblemToLoc}
                problemStatus={{ kind: 'idle' }}
                problems={noProblems}
                options={defaultSqlEditorOptions}
            />
        );
    },
);
