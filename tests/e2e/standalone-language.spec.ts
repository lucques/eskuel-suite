import { expect, test } from './fixtures';

const resources = {
    de: {
        databases: ['/res/dbs/fahrschule.sql', '/res/dbs/onlineshop.sql'],
        game: ['/res/games/gewoehnlicher-morgen/gewoehnlicher-morgen.xml'],
        label: 'Deutsch',
    },
    en: {
        databases: ['/res/dbs/driving-school.sql', '/res/dbs/online-shop.sql'],
        game: ['/res/games/ordinary-morning/ordinary-morning.xml'],
        label: 'English',
    },
};

const scenarios = [
    { name: 'detected English', locale: 'en-US', savedLanguage: null, language: 'en' },
    { name: 'detected German', locale: 'de', savedLanguage: null, language: 'de' },
    { name: 'saved German over detected English', locale: 'en-US', savedLanguage: 'de', language: 'de' },
    { name: 'saved English over detected German', locale: 'de', savedLanguage: 'en', language: 'en' },
    { name: 'English fallback for unsupported French', locale: 'fr-FR', savedLanguage: null, language: 'en' },
] as const;

const apps = [
    { path: '/browser/', resource: 'databases' },
    { path: '/game-console/', resource: 'game' },
    { path: '/game-editor/', resource: 'game' },
] as const;

for (const scenario of scenarios) {
    test.describe(scenario.name, () => {
        test.use({ locale: scenario.locale });

        for (const app of apps) {
            test(`${app.path} chooses initial resources once using the startup language`, async ({ context, page }) => {
                await context.addInitScript(language => {
                    localStorage.setItem('eskuel-suite:settings:v1', JSON.stringify({ language }));
                }, scenario.savedLanguage);

                const requestedResources = new Set<string>();
                page.on('request', request => {
                    const pathname = new URL(request.url()).pathname;
                    if (/^\/res\/(?:dbs|games)\//.test(pathname)) {
                        requestedResources.add(pathname);
                    }
                });

                await page.goto(app.path);

                const languageSwitcher = page.locator('#language-switcher');
                const expectedResources = [...resources[scenario.language][app.resource]].sort();
                await expect(languageSwitcher).toContainText(resources[scenario.language].label);
                await expect.poll(() => [...requestedResources].sort()).toEqual(expectedResources);

                const nextLanguage = scenario.language === 'en' ? 'de' : 'en';
                await languageSwitcher.click();
                await page.getByText(resources[nextLanguage].label, { exact: true }).click();
                await expect(languageSwitcher).toContainText(resources[nextLanguage].label);
                expect([...requestedResources].sort()).toEqual(expectedResources);
            });
        }
    });
}
