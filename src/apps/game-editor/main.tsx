import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution';

import 'bootstrap/dist/css/bootstrap.min.css';
import '../../base.css';
import { GameEditorApp } from './component';
import { standaloneGameCatalog, standaloneGameFiles } from '../standalone-catalog';
import { getStandaloneInitialLanguage } from '../standalone-language';

const initialLanguage = getStandaloneInitialLanguage();

const gameEditor = new GameEditorApp(
    'root',
    {
        gameCatalog: standaloneGameCatalog,
        initialGameUrls: [standaloneGameFiles[initialLanguage].url],
        linksCenterLeft: [{
            en: { title: 'Browse Games', url: '../' },
            de: { title: 'Spiele durchstöbern', url: '../' },
        }],
        linksRight: [{
            en: { title: 'Home', url: '../' },
            de: { title: 'Startseite', url: '../' },
        }],
        persistGameDrafts: true,
    },
);
gameEditor.init();
