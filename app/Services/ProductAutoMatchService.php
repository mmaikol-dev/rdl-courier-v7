<?php

namespace App\Services;

use App\Models\Product;
use App\Models\SheetOrder;
use Illuminate\Support\Facades\Log;

class ProductAutoMatchService
{
    /**
     * Attempt to auto-match an order's product_name to a Product record.
     * Returns the matched product ID or null if no match is found.
     */
    public function match(SheetOrder $order): ?int
    {
        $productName = trim((string) ($order->product_name ?? ''));

        if ($productName === '') {
            return null;
        }

        // For comma-separated product names (Shopify), try the first item
        $searchName = $this->extractPrimaryProductName($productName);

        $merchant = $order->merchant ?? null;
        $country = $order->country ?? null;

        // 1. Exact match by name + merchant + country
        $product = $this->matchExact($searchName, $merchant, $country);
        if ($product) {
            return $product->id;
        }

        // 2. Code match (if the name looks like a product code)
        if ($this->looksLikeCode($searchName)) {
            $product = $this->matchByCode($searchName, $merchant, $country);
            if ($product) {
                return $product->id;
            }
        }

        // 3. Fuzzy match via LIKE
        $product = $this->matchFuzzy($searchName, $merchant, $country);
        if ($product) {
            return $product->id;
        }

        Log::info('Product auto-match: no match found', [
            'order_id' => $order->id,
            'order_no' => $order->order_no,
            'product_name' => $productName,
            'merchant' => $merchant,
            'country' => $country,
        ]);

        return null;
    }

    /**
     * Batch-match multiple orders at once. Returns [order_id => product_id] map.
     */
    public function matchMany($orders): array
    {
        $map = [];

        foreach ($orders as $order) {
            $productId = $this->match($order);
            if ($productId !== null) {
                $map[$order->id] = $productId;
            }
        }

        return $map;
    }

    /**
     * Apply matching results to orders by setting inventory_product_id.
     */
    public function applyMatches(SheetOrder $order, ?int $productId): void
    {
        if ($productId === null) {
            return;
        }

        $order->forceFill(['inventory_product_id' => $productId])->save();

        Log::info('Product auto-match applied', [
            'order_id' => $order->id,
            'order_no' => $order->order_no,
            'product_id' => $productId,
        ]);
    }

    private function extractPrimaryProductName(string $productName): string
    {
        // Take the first item from a comma-separated list
        $parts = array_map('trim', explode(',', $productName));

        return $parts[0] ?? $productName;
    }

    private function matchExact(string $name, ?string $merchant, ?string $country): ?Product
    {
        $query = Product::query()
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($name)]);

        if ($merchant !== null) {
            $query->whereRaw('LOWER(merchant) = ?', [mb_strtolower($merchant)]);
        }

        if ($country !== null) {
            $query->whereRaw('LOWER(country) = ?', [mb_strtolower($country)]);
        }

        return $query->first();
    }

    private function matchByCode(string $name, ?string $merchant, ?string $country): ?Product
    {
        $query = Product::query()
            ->whereRaw('LOWER(code) = ?', [mb_strtolower($name)]);

        if ($merchant !== null) {
            $query->whereRaw('LOWER(merchant) = ?', [mb_strtolower($merchant)]);
        }

        if ($country !== null) {
            $query->whereRaw('LOWER(country) = ?', [mb_strtolower($country)]);
        }

        return $query->first();
    }

    private function matchFuzzy(string $name, ?string $merchant, ?string $country): ?Product
    {
        // Use the first meaningful words for LIKE matching
        $words = preg_split('/\s+/', $name);
        $words = array_filter($words, fn ($w) => strlen($w) >= 3);

        if (empty($words)) {
            return null;
        }

        // Take up to 3 most meaningful words
        $words = array_slice($words, 0, 3);
        $likePattern = '%'.implode('%', $words).'%';

        $query = Product::query()
            ->whereRaw('LOWER(name) LIKE ?', [mb_strtolower($likePattern)]);

        if ($merchant !== null) {
            $query->whereRaw('LOWER(merchant) = ?', [mb_strtolower($merchant)]);
        }

        if ($country !== null) {
            $query->whereRaw('LOWER(country) = ?', [mb_strtolower($country)]);
        }

        return $query->first();
    }

    private function looksLikeCode(string $name): bool
    {
        // Codes typically match patterns like PC-00001, SKU-123, ABC123
        return (bool) preg_match('/^[A-Z]{1,5}[-]?\d{2,}/i', $name);
    }
}
