import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution';

import 'bootstrap/dist/css/bootstrap.min.css';
import '../../base.css'

import { GameConsoleApp } from './component';
import { standaloneGameCatalog, standaloneGameFiles } from '../standalone-catalog';
import { getStandaloneInitialLanguage } from '../standalone-language';
import { getStandaloneFileUrl } from '../standalone-file';

const initialLanguage = getStandaloneInitialLanguage();
const fileUrl = getStandaloneFileUrl(window.location.search, document.baseURI);

const gameConsole = new GameConsoleApp(
    'root',
    {
        gameCatalog: standaloneGameCatalog,
        initialGameUrl: fileUrl ?? standaloneGameFiles[initialLanguage].url,
        linksCenterLeft: [{
            en: { title: 'Browse Games', url: '../' },
            de: { title: 'Spiele durchstöbern', url: '../' },
        }],
        linksRight: [{
            en: { title: 'Home', url: '../' },
            de: { title: 'Startseite', url: '../' },
        }],
        persistGameProgress: true,
    },
);
gameConsole.init();
