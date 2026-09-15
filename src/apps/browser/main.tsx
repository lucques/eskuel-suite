import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution';

import 'bootstrap/dist/css/bootstrap.min.css';
import '../../base.css'

import { BrowserApp } from './component';
import { standaloneDatabaseCatalog } from '../standalone-catalog';
import { getStandaloneInitialLanguage } from '../standalone-language';
import { getStandaloneFileUrl } from '../standalone-file';

const initialLanguage = getStandaloneInitialLanguage();
const fileUrl = getStandaloneFileUrl(window.location.search, document.baseURI);

const browser = new BrowserApp('root', {
    databaseCatalog: standaloneDatabaseCatalog,
    initialDatabaseUrls: fileUrl === undefined
        ? standaloneDatabaseCatalog.map(entry => entry.localizations[initialLanguage].files[0].url)
        : [fileUrl],
    linksCenterLeft: [{
        en: { title: 'Browse Databases', url: '../' },
        de: { title: 'Datenbanken durchstöbern', url: '../' },
    }],
    linksRight: [{
        en: { title: 'Home', url: '../' },
        de: { title: 'Startseite', url: '../' },
    }],
});
browser.init()
