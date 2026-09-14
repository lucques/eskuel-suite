import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution';

import 'bootstrap/dist/css/bootstrap.min.css';
import '../../base.css'

import { GameConsoleApp } from './component';
import { standaloneGameCatalog, standaloneGameFiles } from '../standalone-catalog';
import { getStandaloneInitialLanguage } from '../standalone-language';

const initialLanguage = getStandaloneInitialLanguage();
const xmlUrlParameter = new URLSearchParams(window.location.search).get('xml');
const initialGameOptions = xmlUrlParameter === null
    ? { initialGameUrl: standaloneGameFiles[initialLanguage].url }
    : { initialGameUrl: new URL(xmlUrlParameter, document.baseURI).href };

const gameConsole = new GameConsoleApp(
    'root',
    {
        gameCatalog: standaloneGameCatalog,
        ...initialGameOptions,
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
