import { useCallback, useEffect, useState } from 'react';

export type Appearance = 'light' | 'dark' | 'system';
export type ThemeName = 'amber-minimal' | 'candyland' | 'nature' | 'tangerine' | 'doom-64' | 'valorant' | 'red' | 'neo-brutalism' | 'claude' | 'ghibli-studio' | 'spotify';

const DEFAULT_THEME: ThemeName = 'doom-64';
const THEMES: ThemeName[] = ['amber-minimal', 'candyland', 'nature', 'tangerine', 'doom-64', 'valorant', 'red', 'neo-brutalism', 'claude', 'ghibli-studio', 'spotify'];

const prefersDark = () => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

const storedTheme = (): ThemeName => {
    if (typeof localStorage === 'undefined') return DEFAULT_THEME;
    const value = localStorage.getItem('ui-theme') as ThemeName | null;
    return value && THEMES.includes(value) ? value : DEFAULT_THEME;
};

const setCookie = (name: string, value: string, days = 365) => {
    if (typeof document === 'undefined') return;
    const maxAge = days * 24 * 60 * 60;
    document.cookie = `${name}=${value};path=/;max-age=${maxAge};SameSite=Lax`;
};

const applyTheme = (appearance: Appearance, theme: ThemeName) => {
    const isDark = appearance === 'dark' || (appearance === 'system' && prefersDark());
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
};

const mediaQuery = () => typeof window === 'undefined' ? null : window.matchMedia('(prefers-color-scheme: dark)');

const handleSystemThemeChange = () => {
    const appearance = (localStorage.getItem('appearance') as Appearance) || 'system';
    applyTheme(appearance, storedTheme());
};

export function initializeTheme() {
    const appearance = (localStorage.getItem('appearance') as Appearance) || 'system';
    applyTheme(appearance, storedTheme());
    mediaQuery()?.addEventListener('change', handleSystemThemeChange);
}

export function useAppearance() {
    const [appearance, setAppearance] = useState<Appearance>('system');
    const [theme, setTheme] = useState<ThemeName>(DEFAULT_THEME);

    const updateAppearance = useCallback((mode: Appearance) => {
        setAppearance(mode);
        localStorage.setItem('appearance', mode);
        setCookie('appearance', mode);
        applyTheme(mode, storedTheme());
    }, []);

    const updateTheme = useCallback((nextTheme: ThemeName) => {
        setTheme(nextTheme);
        localStorage.setItem('ui-theme', nextTheme);
        applyTheme(appearance, nextTheme);
    }, [appearance]);

    useEffect(() => {
        const savedAppearance = (localStorage.getItem('appearance') as Appearance) || 'system';
        const savedTheme = storedTheme();
        setAppearance(savedAppearance);
        setTheme(savedTheme);
        applyTheme(savedAppearance, savedTheme);

    }, []);

    return { appearance, updateAppearance, theme, updateTheme } as const;
}
