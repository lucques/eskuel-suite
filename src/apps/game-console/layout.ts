export type GameConsoleViewLayout = 'desktop' | 'mobile';

export const chooseInitialGameConsoleViewLayout = (): GameConsoleViewLayout => {
    return window.matchMedia('(max-width: 767.98px)').matches ? 'mobile' : 'desktop';
};
