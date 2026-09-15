export function getStandaloneFileUrl(search: string, baseUrl: string): string | undefined {
    const file = new URLSearchParams(search).get('file');
    return file === null ? undefined : new URL(file, baseUrl).href;
}
