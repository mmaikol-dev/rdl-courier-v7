<?php

namespace Tests\Feature;

use App\Models\SheetOrder;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

/**
 * Covers the CSV/Excel upload path's date handling: an unreadable or blank
 * order_date must never be coerced into 1970-01-01 — unreadable cells fall back
 * to the upload date, and a readable day-first date is kept.
 *
 * Must run under phpunit.mysql.xml: there is no migration creating
 * sheet_orders, so the sqlite in-memory schema cannot hold these tables.
 */
class ImportControllerTest extends TestCase
{
    use DatabaseTransactions;

    private function csv(string $body): UploadedFile
    {
        return UploadedFile::fake()->createWithContent('orders.csv', $body);
    }

    private function upload(User $user, UploadedFile $file): void
    {
        $this->actingAs($user)
            ->post('/orders/import', [
                'file' => $file,
                'sheet_id' => 'sheet-1',
                'sheet_name' => 'Sheet1',
                'store_name' => 'RDL1',
                'country' => 'Kenya',
                'merchant' => 'Acme',
            ])
            ->assertOk();
    }

    public function test_an_unreadable_order_date_falls_back_to_the_upload_date_not_1970(): void
    {
        $user = User::factory()->create([
            'roles' => 'dispatch',
            'store_address' => 'Kenya',
            'email_verified_at' => now(),
        ]);

        $csv = implode("\n", [
            'order_date,order_no,amount,client_name,city,phone,quantity',
            'not a date,ORD-A,100,Test,Nairobi,0712345678,2',
            ',ORD-B,100,Test,Nairobi,0712345678,2',
            '15/01/2026,ORD-C,100,Test,Nairobi,0712345678,2',
        ]);

        $this->upload($user, $this->csv($csv));

        // Unreadable cell -> upload date, not 1970-01-01.
        $this->assertSame(
            now()->toDateString(),
            SheetOrder::where('order_no', 'ORD-A')->first()->order_date?->format('Y-m-d')
        );

        // Blank cell -> upload date.
        $this->assertSame(
            now()->toDateString(),
            SheetOrder::where('order_no', 'ORD-B')->first()->order_date?->format('Y-m-d')
        );

        // A readable day-first date is preserved.
        $this->assertSame(
            '2026-01-15',
            SheetOrder::where('order_no', 'ORD-C')->first()->order_date?->format('Y-m-d')
        );
    }
}
