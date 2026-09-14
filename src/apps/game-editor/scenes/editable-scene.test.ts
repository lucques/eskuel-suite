import { describe, expect, it } from 'vitest';

import type { TextScene } from '../../../game/model';
import { createEditableScene } from './editable-scene';

describe('createEditableScene', () => {
    it('preserves editable identity for an unchanged source scene', () => {
        const scene: TextScene = { type: 'text', text: 'Scene' };

        const firstEditableScene = createEditableScene(scene);
        const secondEditableScene = createEditableScene(scene);

        expect(secondEditableScene).toBe(firstEditableScene);
    });

    it('assigns a different identity and key to a replacement scene', () => {
        const firstScene: TextScene = { type: 'text', text: 'Scene' };
        const replacementScene: TextScene = { type: 'text', text: 'Scene' };

        const firstEditableScene = createEditableScene(firstScene);
        const replacementEditableScene = createEditableScene(replacementScene);

        expect(replacementEditableScene).not.toBe(firstEditableScene);
        expect(replacementEditableScene.key).not.toBe(firstEditableScene.key);
    });
});
