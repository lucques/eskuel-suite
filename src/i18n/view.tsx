import React from "react";

export function render(
    template: string,
    replacements: Partial<Record<string, React.ReactNode>>
) {
    return template.split(/({{\w+}})/g).map((part, i) => {
        const key = part.match(/{{(\w+)}}/)?.[1];
        return key ? <React.Fragment key={i}>{replacements[key]}</React.Fragment> : part;
    });
}
