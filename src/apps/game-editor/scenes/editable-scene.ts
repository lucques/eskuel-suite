import type { ImageScene, ManipulateScene, Scene, SelectScene, TextScene } from '../../../game/model';

export type Editable<T> = T & { key: string };

export type EditableScene =
    | Editable<TextScene>
    | Editable<ImageScene>
    | Editable<SelectScene>
    | Editable<ManipulateScene>;

let nextEditableSceneKey = 0;
const editableScenes = new WeakMap<Scene, EditableScene>();

export function createEditableScene(scene: Scene): EditableScene {
    const existingEditableScene = editableScenes.get(scene);
    const editableScene = existingEditableScene ?? { ...scene, key: (nextEditableSceneKey++).toString() };
    editableScenes.set(scene, editableScene);
    return editableScene;
}
