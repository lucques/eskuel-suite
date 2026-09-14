import { v4 as uuidv4 } from 'uuid';

export type CodeEditorURI = string & { readonly __brand: 'CodeEditorURI' };

const modelDisposers = new Map<CodeEditorURI, () => void>();

export function makeCodeEditorURI(): CodeEditorURI {
    return `inmemory:///${uuidv4()}.txt` as CodeEditorURI;
}

export function registerCodeEditorModel(uri: CodeEditorURI, dispose: () => void): void {
    modelDisposers.set(uri, dispose);
}

export function disposeCodeEditorModel(uri: CodeEditorURI): void {
    const dispose = modelDisposers.get(uri);
    modelDisposers.delete(uri);
    dispose?.();
}
