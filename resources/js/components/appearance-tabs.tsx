import { Appearance, ThemeName, useAppearance } from '@/hooks/use-appearance';
import { cn } from '@/lib/utils';
import { Check, LucideIcon, Monitor, Moon, Sun } from 'lucide-react';
import { HTMLAttributes } from 'react';

const colorThemes: { value: ThemeName; label: string; description: string; colors: string[] }[] = [
    { value: 'amber-minimal', label: 'Amber Minimal', description: 'Warm yellow on clean neutral surfaces', colors: ['oklch(0.852 0.199 91.936)', 'oklch(0.705 0.213 47.604)', 'oklch(0.97 0 0)', 'oklch(0.145 0 0)'] },
    { value: 'candyland', label: 'Candyland', description: 'Candy pink with cool mist neutrals', colors: ['oklch(0.525 0.223 3.958)', 'oklch(0.81 0.117 11.638)', 'oklch(0.963 0.002 197.1)', 'oklch(0.148 0.004 228.8)'] },
    { value: 'nature', label: 'Nature', description: 'Forest green with soft olive neutrals', colors: ['oklch(0.527 0.154 150.069)', 'oklch(0.871 0.15 154.449)', 'oklch(0.966 0.005 106.5)', 'oklch(0.153 0.006 107.1)'] },
    { value: 'tangerine', label: 'Tangerine', description: 'Bright orange with blue chart accents', colors: ['oklch(0.553 0.195 38.402)', 'oklch(0.623 0.214 259.815)', 'oklch(0.97 0.001 106.424)', 'oklch(0.147 0.004 49.25)'] },
    { value: 'doom-64', label: 'Doom 64', description: 'Blood red with dark taupe neutrals', colors: ['oklch(0.505 0.213 27.518)', 'oklch(0.637 0.237 25.331)', 'oklch(0.96 0.002 17.2)', 'oklch(0.147 0.004 49.3)'] },
];

export default function AppearanceToggleTab({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
    const { appearance, updateAppearance, theme, updateTheme } = useAppearance();
    const modes: { value: Appearance; icon: LucideIcon; label: string }[] = [
        { value: 'light', icon: Sun, label: 'Light' },
        { value: 'dark', icon: Moon, label: 'Dark' },
        { value: 'system', icon: Monitor, label: 'System' },
    ];

    return (
        <div className={cn('space-y-6', className)} {...props}>
            <section className="space-y-3">
                <div>
                    <h3 className="text-sm font-medium">Display mode</h3>
                    <p className="text-sm text-muted-foreground">Choose light, dark, or follow your device.</p>
                </div>
                <div role="group" aria-label="Display mode" className="inline-flex gap-1 rounded-lg bg-muted p-1">
                    {modes.map(({ value, icon: Icon, label }) => (
                        <button
                            key={value}
                            type="button"
                            aria-pressed={appearance === value}
                            onClick={() => updateAppearance(value)}
                            className={cn(
                                'flex items-center rounded-md px-3.5 py-1.5 text-sm transition-colors',
                                appearance === value ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
                            )}
                        >
                            <Icon className="mr-1.5 size-4" />{label}
                        </button>
                    ))}
                </div>
            </section>

            <section className="space-y-3">
                <div>
                    <h3 className="text-sm font-medium">Theme</h3>
                    <p className="text-sm text-muted-foreground">Choose a preset palette and style. Your selection is saved on this device.</p>
                </div>
                <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {colorThemes.map((option) => {
                        const selected = theme === option.value;
                        return (
                            <button
                                key={option.value}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                onClick={() => updateTheme(option.value)}
                                className={cn(
                                    'rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/40',
                                    selected ? 'border-primary ring-2 ring-primary/20' : 'border-border',
                                )}
                            >
                                <span className="flex items-start justify-between gap-3">
                                    <span>
                                        <span className="block text-sm font-medium">{option.label}</span>
                                        <span className="mt-1 block text-xs text-muted-foreground">{option.description}</span>
                                    </span>
                                    {selected ? <Check className="size-4 shrink-0 text-primary" aria-hidden="true" /> : null}
                                </span>
                                <span className="mt-3 flex gap-1.5" aria-label={`${option.label} palette`}>
                                    {option.colors.map((color, index) => (
                                        <span
                                            key={index}
                                            className="size-5 rounded-full border border-foreground/10"
                                            style={{ backgroundColor: color }}
                                            aria-hidden="true"
                                        />
                                    ))}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
