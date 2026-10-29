import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAppearance } from '@/hooks/use-appearance';
import { colorThemes } from '@/lib/appearance-themes';
import { Check, Palette } from 'lucide-react';

export default function ThemeSwitcher() {
    const { theme, updateTheme } = useAppearance();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Change color theme" title="Change color theme">
                    <Palette className="size-5" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[min(70vh,28rem)] w-56 overflow-y-auto">
                {colorThemes.map((option) => {
                    const selected = theme === option.value;

                    return (
                        <DropdownMenuItem key={option.value} onClick={() => updateTheme(option.value)} className="gap-2">
                            <span className="flex min-w-0 flex-1 items-center gap-2">
                                <span className="flex shrink-0 gap-0.5" aria-hidden="true">
                                    {option.colors.slice(0, 3).map((color, index) => (
                                        <span key={index} className="size-3 rounded-full border border-foreground/15" style={{ backgroundColor: color }} />
                                    ))}
                                </span>
                                <span className="truncate">{option.label}</span>
                            </span>
                            {selected ? <Check className="size-4 text-primary" aria-hidden="true" /> : null}
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
