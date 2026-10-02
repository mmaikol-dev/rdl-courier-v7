<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Picks the three-letter order-number prefix for a merchant's Storeep store.
 *
 * `sheet_orders.order_no` is indexed but NOT unique, and existing data already
 * contains collisions ('OMDA87' x9, 'ADP10000' x3, '' x20). Worse,
 * SheetOrderImportService::findExistingOrderForAppScript() throws when a
 * candidate matches more than one row, which is how failed_jobs filled up.
 *
 * So the prefix is checked against every order in the database and against the
 * prefixes other integrations have already reserved, then locked on the
 * integration row. Order numbers are `<prefix><number>` with no separator, so
 * once orders exist the prefix must never change.
 *
 * OKEA would yield: OKEA -> KEA -> OEA -> OKA -> ...
 */
class StoreepOrderNumberPrefix
{
    public function __construct(
        private readonly int $length = 3,
    ) {
    }

    /**
     * Ordered, de-duplicated guesses for a store name.
     *
     * Prefers the name's own letters before vowel-stripped and reversed
     * variants, so the common case reads naturally.
     *
     * @return string[]
     */
    public function candidates(string $storeName): array
    {
        $letters = $this->letters($storeName);

        if ($letters === []) {
            return [];
        }

        $candidates = [];
        $add = function (?string $value) use (&$candidates): void {
            if ($value === null) {
                return;
            }

            $value = strtoupper($value);

            if (! in_array($value, $candidates, true)) {
                $candidates[] = $value;
            }
        };

        // The name itself when it is already the right length (TRIAL -> TRI).
        if (strlen($letters) === $this->length) {
            $add($letters);
        }

        // Leading run, then every window, in order (OKEA -> OKE, KEA, OEA).
        $add(substr($letters, 0, $this->length));

        for ($offset = 1, $length = strlen($letters); $offset + $this->length <= $length; $offset++) {
            $add(substr($letters, $offset, $this->length));
        }

        // Reversed windows (OKEA -> AOK, AKO).
        $reversed = strrev($letters);

        for ($offset = 0; $offset + $this->length <= strlen($reversed); $offset++) {
            $add(substr($reversed, $offset, $this->length));
        }

        // Consonant skeletons for short or vowel-heavy names (OEA already covers
        // OKEA, but ABILITY needs a fallback that is not just a shuffle).
        $consonants = preg_replace('/[^A-Z]/', '', strtoupper((string) preg_replace('/[^A-Za-z]/', '', $storeName)));
        $add(is_string($consonants) && strlen($consonants) >= $this->length
            ? substr($consonants, 0, $this->length)
            : null);

        return $candidates;
    }

    /**
     * First candidate that collides with neither an existing order number nor
     * another integration's reserved prefix.
     *
     * Collision test is exact-prefix on `sheet_orders.order_no`, so an existing
     * order "KEA1" blocks "KEA" (they would produce KEA1, KEA2, ... and
     * eventually collide).
     */
    public function allocate(string $storeName, ?int $excludeIntegrationId = null): ?string
    {
        foreach ($this->candidates($storeName) as $candidate) {
            if (! $this->isTaken($candidate, $excludeIntegrationId)) {
                return $candidate;
            }
        }

        // Every 3-letter guess is taken (17,576 of them). Widen rather than fail,
        // so onboarding a merchant is never blocked.
        return $this->allocateByLength($storeName, $this->length + 1, $excludeIntegrationId);
    }

    private function allocateByLength(string $storeName, int $length, ?int $excludeIntegrationId): ?string
    {
        $letters = $this->letters($storeName);

        if ($letters === '') {
            return null;
        }

        // Cap the widening so a genuinely hopeless name fails loudly in the UI
        // rather than spinning through every combination of the alphabet.
        for ($width = $length; $width <= min(12, max(strlen($letters), $length)); $width++) {
            foreach ($this->windows($letters, $width) as $candidate) {
                if (! $this->isTaken($candidate, $excludeIntegrationId)) {
                    return $candidate;
                }
            }
        }

        // Last resort: a 3-letter prefix plus a numeric suffix. Unambiguous,
        // still <= 8 chars, and effectively impossible to exhaust.
        for ($suffix = 1; $suffix <= 999; $suffix++) {
            $candidate = strtoupper(substr($letters, 0, 2)).$suffix;

            if (strlen($candidate) <= 8 && ! $this->isTaken($candidate, $excludeIntegrationId)) {
                return $candidate;
            }
        }

        return null;
    }

    /**
     * @return string[]
     */
    private function windows(string $letters, int $length): array
    {
        $out = [];

        for ($offset = 0; $offset + $length <= strlen($letters); $offset++) {
            $out[] = substr($letters, $offset, $length);
        }

        return $out;
    }

    private function isTaken(string $candidate, ?int $excludeIntegrationId): bool
    {
        $reserved = DB::table('storeep_integrations')
            ->where('order_no_prefix', $candidate)
            ->when($excludeIntegrationId !== null, fn ($query) => $query->where('id', '!=', $excludeIntegrationId))
            ->exists();

        if ($reserved) {
            return true;
        }

        return $this->prefixExistsOnOrders($candidate);
    }

    /**
     * True when any order already starts with the candidate.
     *
     * Because order numbers concatenate the prefix and the platform number
     * with no separator, an existing "KEA12" means "KEA" would eventually
     * generate "KEA12" itself.
     */
    private function prefixExistsOnOrders(string $candidate): bool
    {
        return DB::table('sheet_orders')
            ->where('order_no', 'like', $candidate.'%')
            ->exists();
    }

    private function letters(string $storeName): string
    {
        return (string) preg_replace('/[^A-Za-z]/', '', $storeName);
    }
}
