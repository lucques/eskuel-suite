import type { MouseEvent, ReactNode } from 'react';

export function GuardedNavigationLink({
    href,
    children,
    className = undefined,
    onNavigate,
}: {
    href: string;
    children: ReactNode;
    className?: string;
    onNavigate: (url: string) => void;
}) {
    const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
        const isUnmodifiedPrimaryActivation = event.button === 0
            && !event.altKey
            && !event.ctrlKey
            && !event.metaKey
            && !event.shiftKey;
        if (isUnmodifiedPrimaryActivation) {
            event.preventDefault();
            onNavigate(href);
        }
    };

    return (
        <a href={href} className={className} onClick={onClick}>
            {children}
        </a>
    );
}
