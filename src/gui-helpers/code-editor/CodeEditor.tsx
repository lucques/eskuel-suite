// Reusable component for program editor or world editors that are based on program text (= source code)

import React, { type JSX } from "react";
import { Editor } from "@monaco-editor/react";
import "bootstrap-icons/font/bootstrap-icons.css";

import { useTranslation, type FallbackNs } from "react-i18next";
import type { Namespace, TFunction } from "i18next";

import styles from "./CodeEditor.module.css";
import { monaco } from "./monaco";
import { assert } from "../../util";
import type { CodeEditorURI } from './uri';
import { registerCodeEditorModel } from './uri';

export type { CodeEditorURI } from './uri';


/////////
// API //
/////////

// Type parameters:
// - D = Pending detail type. When status is 'pending', this type carries
//       additional information like "parsing" or "compiling"
// - P = Problem type, e.g. "SyntaxError | TypeError"
// - T = Translation namespace type. Depends on problem type `P`.
//       Belongs to i18next library.

// Props:
// - PendingDetailView: React.ComponentType<{ data: D }>;
// - ProblemTitleView:  React.ComponentType<{ problem: P }>;
// - ProblemBodyView:   React.ComponentType<{ problem: P, handle: CodeEditorHandle }>;
// - problemToTitle:    (tc: TFunction<'common'>, t: TFunction<T>, problem: P) => string;
// - problemToLoc:      (problem: P) => Loc | null;
//   - Used to jump from problems to code locations


export type ProblemStatus<D> =
| { kind: 'fresh' }                   // no compilation etc. done yet
| { kind: 'idle' }                    // no pending work
| { kind: 'pending', detail: D };     // compilation etc. in progress

export type Loc = {
    start: Pos,
    end:   Pos
}

export type Pos = {
    line:   number,
    column: number
};


////////////
// Handle //
////////////

export interface CodeEditorHandle {
    getValue: () => string;
    setValue: (value: string) => void;
    setValueIfUninitialized: (value: string) => void;
    jumpTo: (loc: Loc) => void;
}

export type CodeEditorOptions = monaco.editor.IStandaloneEditorConstructionOptions;

export type ControlledCodeEditorValueProps = {
    value: string;
    onChange: (value: string) => void;
    initialValue?: never;
    onInput?: never;
};

export type UncontrolledCodeEditorValueProps = {
    value?: never;
    onChange?: never;
    initialValue?: string;
    onInput?: () => void;
};

export type CodeEditorValueProps = ControlledCodeEditorValueProps | UncontrolledCodeEditorValueProps;

const hasControlledValue = (props: CodeEditorValueProps): props is ControlledCodeEditorValueProps => {
    return props.value !== undefined;
};

type CodeEditorProps<D, P, T extends Namespace> = CodeEditorValueProps & {
    ns: T;
    PendingDetailView: React.ComponentType<{ data: D }>;
    ProblemTitleView: React.ComponentType<{ p: P }>;
    ProblemBodyView: React.ComponentType<{ p: P, jumpTo: (loc: Loc) => void | null }>;
    problemToTitle: (tc: TFunction<FallbackNs<'common'>>, t: TFunction<FallbackNs<T>>, p: P) => string;
    problemToLoc: (p: P) => Loc | null;
    uri?: CodeEditorURI;
    readOnly?: boolean;
    problemStatus: ProblemStatus<D>;
    problems: P[];
    darkMode: boolean;
    language: string;
    height?: number | string;
    className?: string;
    options?: CodeEditorOptions;
};


/////////////////////
// React component //
/////////////////////

/**
 * Value ownership and Monaco model lifetime are independent choices:
 *
 * | Value mode | No URI: ephemeral model | Stable URI: retained model |
 * |------------|-------------------------|----------------------------|
 * | Controlled (`value`/`onChange`) | React restores text after remount; Monaco history is discarded. Ideal for form fields. | React owns the text while Monaco retains model history and markers across remounts. |
 * | Uncontrolled (`initialValue`) | Monaco owns a temporary value and discards it with the model on unmount. | Monaco owns the value and retains model history across remounts. Ideal for session SQL editors. |
 *
 * Supplying a URI retains the Monaco model on unmount. The owner of that URI must dispose
 * the model when it is no longer needed. Omitting the URI creates an ephemeral model that
 * is disposed automatically.
 */

export const CodeEditor = React.forwardRef(CodeEditorInner) as <D, P, T extends Namespace>(props: CodeEditorProps<D, P, T> & { ref?: React.Ref<CodeEditorHandle> }) => JSX.Element;

function CodeEditorInner<D, P, T extends Namespace>(
  props: CodeEditorProps<D, P, T>,
  ref: React.Ref<CodeEditorHandle>
) {
    const {
        ns,
        PendingDetailView,
        ProblemTitleView,
        ProblemBodyView,
        problemToTitle,
        problemToLoc,
        uri,
        readOnly = false,
        problemStatus,
        problems,
        darkMode,
        language,
        height = '100%',
        className,
        options,
    } = props;
    const controlledValueProps = hasControlledValue(props) ? props : undefined;
    const uncontrolledValueProps = hasControlledValue(props) ? undefined : props;
    const isControlled = controlledValueProps !== undefined;
    const value = controlledValueProps?.value;
    const onChange = controlledValueProps?.onChange;
    const initialValue = uncontrolledValueProps?.initialValue;
    const onInput = uncontrolledValueProps?.onInput;
    const { t: tc } = useTranslation("common");
    const { t } = useTranslation(ns);


    //////////////////
    // Setup Monaco //
    //////////////////

    const editorOptions = React.useMemo<monaco.editor.IStandaloneEditorConstructionOptions>(() => ({
        minimap: { enabled: false },
        fontSize: 14,
        smoothScrolling: true,
        scrollBeyondLastLine: false,
        tabSize: 4,
        ...options,
        readOnly,

        // Big-file friendly:
        // wordBasedSuggestions: "off",
        // occurrencesHighlight: "off",
        // selectionHighlight: false,
        // codeLens: false,
        // folding: false,
        // renderValidationDecorations: "on",
        // bracketPairColorization: { enabled: false },
        // guides: {
        //     bracketPairs: false,
        //     indentation: false,
        // },
    }), [options, readOnly]);

    // Store the correct Monaco namespace
    const monacoRef = React.useRef<typeof monaco | null>(null);
    // Store the current editor instance
    const editorRef = React.useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    // This is the text model
    const modelRef = React.useRef<monaco.editor.ITextModel | null>(null);

    // Store value here in case monaco editor is not yet mounted
    type InitStatus =
        | { kind: 'pending', value: string }
        | { kind: 'initialized' }
        | { kind: 'uninitialized' };
    const initStatusRef = React.useRef<InitStatus>(initialValue !== undefined ? { kind: 'initialized' } : { kind: 'uninitialized' });

    // Handle: Function to build the handle object
    const handle: CodeEditorHandle = React.useMemo<CodeEditorHandle>(() => ({
        getValue: () => {
            if (modelRef.current !== null) {
                return modelRef.current.getValue();
            }
            else if (isControlled) {
                return value ?? '';
            }
            else if (initStatusRef.current.kind === 'pending') {
                return initStatusRef.current.value;
            }
            else if (initStatusRef.current.kind === 'initialized') {
                return initialValue ?? '';
            }
            else {
                return '';
            }
        },
        setValue: (nextValue: string) => {
            if (onChange !== undefined) {
                onChange(nextValue);
            }
            else if (modelRef.current) {
                modelRef.current.setValue(nextValue);
            }
            else {
                initStatusRef.current = { kind: 'pending', value: nextValue };
            }
        },
        setValueIfUninitialized: (nextValue: string) => {
            if (!isControlled && initStatusRef.current.kind === 'uninitialized') {
                if (modelRef.current) {
                    modelRef.current.setValue(nextValue);
                    initStatusRef.current = { kind: 'initialized' };
                }
                else {
                    initStatusRef.current = { kind: 'pending', value: nextValue };
                }
            }
        },
        jumpTo: (loc) => {
            if (editorRef.current) {
                const range: monaco.IRange = {
                    startLineNumber: loc.start.line,
                    startColumn: loc.start.column,
                    endLineNumber: loc.end.line,
                    endColumn: loc.end.column,
                };

                editorRef.current.setSelection(range);
                editorRef.current.revealRangeInCenter(range);
                editorRef.current.focus();
            }
        },
    }), [initialValue, isControlled, onChange, value]);
    // Handle: Expose to parent
    React.useImperativeHandle(ref, () => handle, [handle]);


    //////////////////
    // Update theme //
    //////////////////

    const updateTheme = React.useCallback(() => {
        monacoRef.current?.editor.setTheme(
            darkMode ? "vs-dark" : "vs-light"
        );
    }, [darkMode]);

    React.useEffect(() => {
        updateTheme();
    }, [updateTheme]);

    React.useEffect(() => {
        editorRef.current?.updateOptions({ readOnly });
    }, [readOnly]);


    /////////////////////
    // Update problems //
    /////////////////////

    const updateProblems = React.useCallback(() => {
        if (!monacoRef.current || !modelRef.current) return;

        const markers: monaco.editor.IMarkerData[] = problems.flatMap((p) => {
            const loc = problemToLoc(p);
            if (!loc) return [];

            return [{
                severity: monaco.MarkerSeverity.Error,
                message: problemToTitle(tc, t, p),
                startLineNumber: loc.start.line,
                startColumn: loc.start.column,
                endLineNumber: loc.end.line,
                endColumn: loc.end.column,
            }];
        });

        monacoRef.current.editor.setModelMarkers(
            modelRef.current,
            "compilation",
            markers
        );
    }, [
        problems,
        problemToLoc,
        problemToTitle,
        tc,
        t,
    ]);

    React.useEffect(() => {
        updateProblems();
    }, [updateProblems]);


    /////////////////////////
    // Mount Monaco editor //
    /////////////////////////

    const onMount = React.useCallback((editor: monaco.editor.IStandaloneCodeEditor, monacoNs: typeof monaco) => {
        monacoRef.current = monacoNs;
        editorRef.current = editor;
        modelRef.current = editor.getModel();

        assert(modelRef.current !== null, "Monaco editor does not have a text model");
        const model = modelRef.current;

        if (uri !== undefined) {
            registerCodeEditorModel(uri, () => {
                if (!model.isDisposed()) {
                    model.dispose();
                }
            });
        }

        // If there is a pending value, set it now
        if (initStatusRef.current.kind === 'pending') {
            modelRef.current.setValue(initStatusRef.current.value);
            initStatusRef.current = { kind: 'initialized' };
        }

        // Trigger updates initially
        updateTheme();
        updateProblems();
    }, [updateProblems, updateTheme, uri]);


    const handleEditorChange = React.useCallback((nextValue: string | undefined) => {
        if (onChange !== undefined) {
            onChange(nextValue ?? '');
        }
        else {
            onInput?.();
        }
    }, [onChange, onInput]);


    ////////////
    // Render //
    ////////////

    return (
        <div className={styles.scrollableContent} style={{ height }}>
            <Editor
                path={uri}
                height="100%"
                language={language}
                theme={darkMode ? "vs-dark" : "vs-light"}
                keepCurrentModel={uri !== undefined}
                value={value}
                defaultValue={!isControlled && initStatusRef.current.kind === 'initialized' ? initialValue : undefined}
                onMount={onMount}
                onChange={handleEditorChange}
                options={editorOptions}
                className={className}
            />
        </div>
    );
}
