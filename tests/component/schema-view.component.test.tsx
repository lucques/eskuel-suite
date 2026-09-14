import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { expect, it } from 'vitest';
import { render } from 'vitest-browser-react';

import { SchemaView } from '../../src/schema/SchemaView';
import { ColInfo, TableInfo } from '../../src/schema/model';

const i18n = createInstance();
await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
        en: {
            common: {
                schema: {
                    foreign_key: 'Foreign key',
                    foreign_key_primary_key_reference: 'References the primary key in {{table}}',
                    foreign_key_reference: 'References {{column}} in {{table}}',
                    primary_key: 'Primary key',
                    underlined: 'underlined',
                },
            },
        },
    },
    defaultNS: 'common',
    showSupportNotice: false,
});

it('marks foreign-key columns with an arrow describing their reference', async () => {
    const table = new TableInfo(
        'orders',
        [new ColInfo('customer_id', 'INTEGER')],
        [],
        {
            customer_id: [{
                kind: 'column',
                foreignTable: 'customers',
                foreignCol: 'id',
            }],
        },
    );
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <SchemaView schemaStatus={{ kind: 'loaded', data: [table] }} />
        </I18nextProvider>,
    );
    const foreignKeyArrow = screen.getByLabelText('References id in customers');

    await expect.element(foreignKeyArrow).toHaveTextContent('↑');
    await expect.element(screen.getByText('customer_id')).toBeVisible();
    await foreignKeyArrow.hover();
    await expect.element(screen.getByRole('tooltip')).toHaveTextContent('References id in customers');
});

it('describes a foreign key that implicitly targets the parent primary key', async () => {
    const table = new TableInfo(
        'orders',
        [new ColInfo('customer_id', 'INTEGER')],
        [],
        {
            customer_id: [{
                kind: 'primary-key',
                foreignTable: 'customers',
            }],
        },
    );
    const screen = render(
        <I18nextProvider i18n={i18n}>
            <SchemaView schemaStatus={{ kind: 'loaded', data: [table] }} />
        </I18nextProvider>,
    );
    const foreignKeyArrow = screen.getByLabelText('References the primary key in customers');

    await expect.element(foreignKeyArrow).toHaveTextContent('↑');
    await foreignKeyArrow.hover();
    await expect.element(screen.getByRole('tooltip')).toHaveTextContent('References the primary key in customers');
});
