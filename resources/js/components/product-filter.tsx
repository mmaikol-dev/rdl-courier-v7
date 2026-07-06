import { useState } from 'react';
import { usePage, router } from '@inertiajs/react';
import { Package, Filter, Loader2, ChevronsUpDown, Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { type SharedData } from '@/types';

interface ProductFilterProps {
  value?: string | null;
  param?: string;
  preserveState?: boolean;
  preserveScroll?: boolean;
}

export function ProductFilter({ value, param = 'product', preserveState = false, preserveScroll = false }: ProductFilterProps) {
  const { productOptions } = usePage<SharedData>().props;
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  if (!productOptions || productOptions.length === 0) {
    return null;
  }

  function handleSelect(product: string) {
    setOpen(false);
    setLoading(true);
    const url = new URL(window.location.href);
    if (product === '__all__') {
      url.searchParams.delete(param);
    } else {
      url.searchParams.set(param, product);
    }
    router.get(url.pathname + url.search, {}, {
      preserveState,
      preserveScroll,
      onFinish: () => setLoading(false),
      onError: () => setLoading(false),
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={loading}
          className="h-8 w-[200px] justify-between text-xs font-normal"
        >
          {loading ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin shrink-0" />
          ) : (
            <Package className="mr-2 h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{value ?? 'All products'}</span>
          <ChevronsUpDown className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="end">
        <Command>
          <CommandInput placeholder="Search products..." />
          <CommandList>
            <CommandEmpty>No product found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__all__" onSelect={() => handleSelect('__all__')}>
                <Check className={cn('mr-2 h-3 w-3', !value ? 'opacity-100' : 'opacity-0')} />
                All products
              </CommandItem>
              {productOptions.map((name) => (
                <CommandItem key={name} value={name} onSelect={() => handleSelect(name)}>
                  <Check className={cn('mr-2 h-3 w-3', value === name ? 'opacity-100' : 'opacity-0')} />
                  {name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
