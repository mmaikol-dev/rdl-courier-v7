import { useState } from 'react';
import { usePage, router } from '@inertiajs/react';
import { Check, ChevronsUpDown, Globe, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { type SharedData } from '@/types';

export function CountryFilter() {
  const { countries, selectedCountry, selectedCurrency, auth } = usePage<SharedData>().props;
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  if (!countries || countries.length === 0 || !auth.user) {
    return null;
  }

  const role = auth.user.roles?.toLowerCase().trim();
  if (role !== 'g.o.d' && role !== 'merchant') {
    return null;
  }

  function handleChange(value: string) {
    setLoading(true);
    router.post(
      route('select-country'),
      { country: value === '__all__' ? '' : value },
      {
        preserveState: true,
        preserveScroll: true,
        onFinish: () => {
          setLoading(false);
          setOpen(false);
        },
      },
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-label="Select country"
            aria-expanded={open}
            disabled={loading}
            className="h-9 max-w-36 justify-between gap-2 rounded-full border-transparent bg-transparent px-2.5 text-foreground shadow-none hover:bg-background hover:shadow-sm focus-visible:bg-background sm:max-w-48"
          >
            {loading ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
            ) : (
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Globe className="size-3.5" />
              </span>
            )}
            <span className="flex min-w-0 flex-col items-start leading-tight">
              <span className="hidden text-[9px] font-medium uppercase tracking-wider text-muted-foreground sm:block">Country</span>
              <span className="max-w-24 truncate text-xs font-semibold sm:max-w-32">{selectedCountry || 'All countries'}</span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground/70" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 rounded-xl p-0 shadow-lg" sideOffset={8}>
          <Command>
            <CommandInput placeholder="Search countries..." />
            <CommandList>
              {loading ? (
                <div className="space-y-2 p-2" role="status" aria-label="Loading country options">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-8 w-full" />
                  ))}
                </div>
              ) : (
                <>
                  <CommandEmpty>No country found.</CommandEmpty>
                  <CommandGroup heading="Available countries">
                    <CommandItem value="All countries" onSelect={() => handleChange('__all__')}>
                      <Check className={!selectedCountry ? 'opacity-100' : 'opacity-0'} />
                      All countries
                    </CommandItem>
                    {countries.map((country) => (
                      <CommandItem key={country.id} value={country.name} onSelect={() => handleChange(country.name)}>
                        <Check className={selectedCountry === country.name ? 'opacity-100' : 'opacity-0'} />
                        <span className="flex min-w-0 items-center gap-2">
                          {country.currency && (
                            <span className="min-w-9 rounded-md bg-muted px-1.5 py-0.5 text-center text-[10px] font-semibold text-muted-foreground">
                              {country.currency}
                            </span>
                          )}
                          <span className="truncate">{country.name}</span>
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedCountry && selectedCurrency && (
        <span className="hidden rounded-md bg-background/80 px-1.5 py-1 text-[10px] font-semibold tracking-wide text-muted-foreground sm:inline">
          {selectedCurrency}
        </span>
      )}
    </div>
  );
}
