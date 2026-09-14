export type BrowserViewLayout = "desktop" | "mobile";

export const chooseInitialBrowserViewLayout = (): BrowserViewLayout => {
    return window.matchMedia("(max-width: 767.98px)").matches ? "mobile" : "desktop";
};
