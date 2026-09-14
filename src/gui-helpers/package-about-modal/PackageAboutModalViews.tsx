import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { Contributor, PackageSource } from '../../package/profile';

export function MetadataSection({ title, children }: {
    title: string;
    children: ReactNode;
}) {
    return (
        <section className='mb-4'>
            <h3 className='h6'><strong>{title}</strong></h3>
            {children}
        </section>
    );
}

export function ContributorView({ contributor }: { contributor: Contributor }) {
    const { t } = useTranslation('common');
    const personalName = [contributor.givenName, contributor.familyName].filter(Boolean).join(' ');
    const names = [
        contributor.title,
        personalName === '' ? undefined : personalName,
        contributor.organization,
    ].filter((name): name is string => name !== undefined);
    let roles: string[];
    if (contributor.roles?.length === 1 && contributor.roles[0] === 'creator') {
        roles = [t('package_about.contributor_roles.package_maintainer_only')];
    }
    else {
        roles = (contributor.roles ?? []).filter(
            role => role !== 'creator' && role !== 'dataCreator' && role !== 'contributor',
        );
    }

    return (
        <li>
            {names.map((name, index) => (
                <div key={index}>
                    {name}
                    {index !== 0 || roles.length === 0
                        ? null
                        : <> <em className='text-body-secondary'>({roles.join(', ')})</em></>}
                </div>
            ))}
            {contributor.email === undefined ? null : <div><a href={`mailto:${contributor.email}`}>{contributor.email}</a></div>}
            {contributor.path === undefined ? null : <div><ExternalLink path={contributor.path} /></div>}
        </li>
    );
}

export function SourceView({ source }: { source: PackageSource }) {
    const { t } = useTranslation('common');

    return (
        <li>
            {source.title === undefined ? null : <div>{source.title}</div>}
            {source.version === undefined
                ? null
                : <div className='text-body-secondary'>
                    {t('package_about.source_version', { version: source.version })}
                </div>}
            {source.path === undefined ? null : <div><ExternalLink path={source.path} /></div>}
            {source.email === undefined ? null : <div><a href={`mailto:${source.email}`}>{source.email}</a></div>}
        </li>
    );
}

export function ExternalLink({ path }: { path: string }) {
    return <a href={path} target='_blank' rel='noopener noreferrer'>{path}</a>;
}
