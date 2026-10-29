import { Appearance, useAppearance } from '@/hooks/use-appearance';
import { colorThemes } from '@/lib/appearance-themes';
import { cn } from '@/lib/utils';
import { Check, LucideIcon, Monitor, Moon, Sun } from 'lucide-react';
import { HTMLAttributes } from 'react';

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
