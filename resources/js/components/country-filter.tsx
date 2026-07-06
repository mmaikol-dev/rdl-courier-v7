import { useState } from 'react';
import { usePage, router } from '@inertiajs/react';
import { Globe, Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type SharedData } from '@/types';

export function CountryFilter() {
  const { countries, selectedCountry, selectedCurrency, auth } = usePage<SharedData>().props;
  const [loading, setLoading] = useState(false);

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
        onFinish: () => setLoading(false),
        onError: () => setLoading(false),
      },
    );
  }

  return (
    <div className="px-3 py-2 border-b border-sidebar-border/50">
      <div className="flex items-center gap-2">
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <Select value={selectedCountry || '__all__'} onValueChange={handleChange}>
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue placeholder="All countries" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All countries</SelectItem>
            {countries.map((c) => (
              <SelectItem key={c.id} value={c.name}>
                <span className="flex items-center gap-2">
                  {c.currency && <span className="text-muted-foreground">{c.currency}</span>}
                  {c.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {selectedCountry && selectedCurrency && (
        <p className="mt-1 text-[10px] text-muted-foreground/60 group-data-[state=collapsed]:hidden">
          {selectedCurrency}
        </p>
      )}
    </div>
  );
}
