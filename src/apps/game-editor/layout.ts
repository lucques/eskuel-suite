export type GameEditorViewLayout = 'desktop' | 'mobile';

export const chooseInitialGameEditorViewLayout = (): GameEditorViewLayout => {
    return window.matchMedia('(max-width: 767.98px)').matches ? 'mobile' : 'desktop';
};
