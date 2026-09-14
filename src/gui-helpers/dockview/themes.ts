//////////////
// Dockview //
//////////////

import { themeDark, themeLight, type DockviewTheme } from "dockview-core"
import { assert } from "../../util"

import 'dockview-react/dist/styles/dockview.css';
import './themes.css';


const themeLightWithoutGap: DockviewTheme = {
    ...themeLight,
    name: 'light-without-gap',
    className: 'dockview-theme-light dockview-theme-light-without-gap',
}

const themeLightWithoutGapShort: DockviewTheme = {
    ...themeLight,
    name: 'light-without-gap-short',
    className: 'dockview-theme-light dockview-theme-light-without-gap-short',
}

const themeDarkWithoutGap: DockviewTheme = {
    ...themeDark,
    name: 'dark-without-gap',
    className: 'dockview-theme-dark dockview-theme-dark-without-gap',
}

const themeDarkWithoutGapShort: DockviewTheme = {
    ...themeDark,
    name: 'dark-without-gap-short',
    className: 'dockview-theme-dark dockview-theme-dark-without-gap-short',
}

const themeLightWithGap: DockviewTheme = {
    ...themeLight,
    name: 'light-with-gap',
    className: 'dockview-theme-light dockview-theme-light-with-gap',
    gap: 20
}

const themeDarkWithGap: DockviewTheme = {
    ...themeDark,
    name: 'dark-with-gap',
    className: 'dockview-theme-dark dockview-theme-dark-with-gap',
    gap: 20
}

export function getDockviewTheme(darkMode: boolean, withGap: boolean, short: boolean): DockviewTheme {
    assert(!(withGap && short), 'withGap = true and short = true is not supported'); 

    if (darkMode) {
        return withGap ? themeDarkWithGap : (short ? themeDarkWithoutGapShort : themeDarkWithoutGap);
    } else {
        return withGap ? themeLightWithGap : (short ? themeLightWithoutGapShort : themeLightWithoutGap);
    }
}
