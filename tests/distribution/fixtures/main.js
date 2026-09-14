import { BrowserApp, GameConsoleApp, GameEditorApp } from 'eskuel-suite';

const parameters = new URLSearchParams(window.location.search);
const app = parameters.get('app');
if (app === 'browser') {
    const system = parameters.get('system');
    new BrowserApp('root', { initialDatabaseUrls: [`/${system}.sql`] }).init();
}
else if (app === 'console') {
    new GameConsoleApp('root', { initialGameUrl: '/game.xml', persistGameProgress: false }).init();
}
else if (app === 'editor') {
    new GameEditorApp('root', { initialGameUrls: ['/game.xml'] }).init();
}
else {
    throw new Error('Unknown distribution smoke-test application');
}
