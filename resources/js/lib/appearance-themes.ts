import type { ThemeName } from '@/hooks/use-appearance';

export const colorThemes: { value: ThemeName; label: string; description: string; colors: string[] }[] = [
    { value: 'amber-minimal', label: 'Amber Minimal', description: 'Warm yellow on clean neutral surfaces', colors: ['oklch(0.852 0.199 91.936)', 'oklch(0.705 0.213 47.604)', 'oklch(0.97 0 0)', 'oklch(0.145 0 0)'] },
    { value: 'candyland', label: 'Candyland', description: 'Candy pink with cool mist neutrals', colors: ['oklch(0.525 0.223 3.958)', 'oklch(0.81 0.117 11.638)', 'oklch(0.963 0.002 197.1)', 'oklch(0.148 0.004 228.8)'] },
    { value: 'nature', label: 'Nature', description: 'Forest green with soft olive neutrals', colors: ['oklch(0.527 0.154 150.069)', 'oklch(0.871 0.15 154.449)', 'oklch(0.966 0.005 106.5)', 'oklch(0.153 0.006 107.1)'] },
    { value: 'tangerine', label: 'Tangerine', description: 'Bright orange with blue chart accents', colors: ['oklch(0.553 0.195 38.402)', 'oklch(0.623 0.214 259.815)', 'oklch(0.97 0.001 106.424)', 'oklch(0.147 0.004 49.25)'] },
    { value: 'doom-64', label: 'Doom 64', description: 'Blood red with dark taupe neutrals', colors: ['oklch(0.505 0.213 27.518)', 'oklch(0.637 0.237 25.331)', 'oklch(0.96 0.002 17.2)', 'oklch(0.147 0.004 49.3)'] },
    { value: 'valorant', label: 'Valorant', description: 'Tactical dark surfaces with sharp red accents', colors: ['oklch(0.58 0.24 20)', 'oklch(0.72 0.18 20)', 'oklch(0.18 0.015 250)', 'oklch(0.12 0.02 250)'] },
    { value: 'red', label: 'Red', description: 'High-energy red on clean, focused surfaces', colors: ['oklch(0.637 0.237 25.331)', 'oklch(0.704 0.191 22.216)', 'oklch(0.97 0 0)', 'oklch(0.145 0 0)'] },
    { value: 'neo-brutalism', label: 'Neo Brutalism', description: 'Square edges, bold color, and hard shadows', colors: ['oklch(0.84 0.19 95)', 'oklch(0.7 0.22 25)', 'oklch(0.98 0 0)', 'oklch(0.05 0 0)'] },
    { value: 'claude', label: 'Claude', description: 'Warm orange accents on soft taupe neutrals', colors: ['oklch(0.553 0.195 38.402)', 'oklch(0.705 0.213 47.604)', 'oklch(0.96 0.002 17.2)', 'oklch(0.147 0.004 49.3)'] },
    { value: 'ghibli-studio', label: 'Studio Ghibli', description: 'Fresh lime accents with earthy olive neutrals', colors: ['oklch(0.841 0.238 128.85)', 'oklch(0.705 0.213 47.604)', 'oklch(0.966 0.005 106.5)', 'oklch(0.153 0.006 107.1)'] },
    { value: 'spotify', label: 'Spotify', description: 'Deep green accents on clean neutral surfaces', colors: ['oklch(0.527 0.154 150.069)', 'oklch(0.723 0.219 149.579)', 'oklch(0.97 0 0)', 'oklch(0.145 0 0)'] },
];
