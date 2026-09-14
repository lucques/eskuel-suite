import { describe, expect, it, vi } from 'vitest';

import {
    disposeCodeEditorModel,
    makeCodeEditorURI,
    registerCodeEditorModel,
} from './uri';

describe('code editor model registry', () => {
    it('disposes a registered model at most once', () => {
        const uri = makeCodeEditorURI();
        const dispose = vi.fn();
        registerCodeEditorModel(uri, dispose);

        disposeCodeEditorModel(uri);
        disposeCodeEditorModel(uri);

        expect(dispose).toHaveBeenCalledOnce();
    });
});
