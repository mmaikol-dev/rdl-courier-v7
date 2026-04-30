<?php

namespace App\Services;

use App\Models\Product;
use App\Models\User;
use App\Support\CountryAccess;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ProductStockAlertService
{
    public function __construct(private readonly WhatsAppFallbackService $whatsApp) {}

    public function maybeSend(Product $product, int $previousQuantity, int $newQuantity, ?string $context = null): void
    {
        $alertThreshold = (int) ($product->quantity_alert ?? 0);

        if ($alertThreshold <= 0) {
            return;
        }

        if (! ($newQuantity <= $alertThreshold && $newQuantity < $previousQuantity)) {
            return;
        }

        $phones = $this->alertPhones($product);

        if ($phones === []) {
            Log::warning('Low stock alert skipped: no alert phones found for roles.', [
                'product_id' => $product->id,
                'product_code' => $product->code,
            ]);
            return;
        }

        $message = $this->buildMessage($product, $newQuantity, $alertThreshold, $context);
        $countryCode = $this->countryCodeForProduct($product);

        foreach ($phones as $phone) {
            try {
                $result = $this->whatsApp->sendText($phone, $message, [
                    'country_code' => $countryCode,
                ]);
                Log::info('Low stock alert sent.', [
                    'product_id' => $product->id,
                    'to' => $result['to'] ?? $phone,
                    'provider' => $result['provider'] ?? 'unknown',
                    'message_id' => $result['message_id'] ?? null,
                ]);
            } catch (\Throwable $e) {
                Log::error('Low stock alert failed.', [
                    'product_id' => $product->id,
                    'phone' => $phone,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }

    private function alertPhones(Product $product): array
    {
        $globalRole = 'g.o.d';
        $scopedRoles = ['operations', 'finance', 'warehouse', 'merchant'];
        $countryCode = $this->countryCodeForProduct($product);
        $phones = collect();

        $globalPhones = User::query()
            ->whereNotNull('store_phone')
            ->where('store_phone', '!=', '')
            ->whereRaw('LOWER(TRIM(roles)) = ?', [$globalRole])
            ->pluck('store_phone')
            ->map(fn ($phone) => $this->whatsApp->formatForStorage((string) $phone, $countryCode))
            ->filter();

        $phones = $phones->merge($globalPhones);

        $countryName = CountryAccess::normalizeCountryName($product->country);

        if ($countryName) {
            $scopedPhones = User::query()
                ->whereNotNull('store_phone')
                ->where('store_phone', '!=', '')
                ->whereIn(DB::raw('LOWER(TRIM(roles))'), $scopedRoles)
                ->whereRaw('LOWER(TRIM(store_address)) = ?', [$countryName])
                ->pluck('store_phone')
                ->map(fn ($phone) => $this->whatsApp->formatForStorage((string) $phone, $countryCode))
                ->filter();

            $phones = $phones->merge($scopedPhones);
        } else {
            Log::warning('Low stock alert: product has no country for scoping; only G.O.D will be notified.', [
                'product_id' => $product->id,
                'product_code' => $product->code,
            ]);
        }

        $phones = $phones->unique()->values()->all();

        return $phones;
    }

    private function countryCodeForProduct(Product $product): string
    {
        $country = strtolower(trim((string) ($product->country ?? '')));

        if ($country === 'tanzania' || $country === 'tz') {
            return '255';
        }

        return '254';
    }

    private function buildMessage(Product $product, int $newQuantity, int $alertThreshold, ?string $context): string
    {
        $merchant = $product->merchant ?: $product->store_name ?: 'Unknown';
        $contextLine = $context ? "Context: {$context}\n" : '';

        return <<<MESSAGE
⚠️ LOW STOCK ALERT ⚠️

📦 Product: {$product->name}
🏷️ Code: {$product->code}
🧾 Merchant: {$merchant}
📉 Stock: {$newQuantity}
🚨 Alert Level: {$alertThreshold}
{$contextLine}
Please restock as soon as possible.
MESSAGE;
    }
}
