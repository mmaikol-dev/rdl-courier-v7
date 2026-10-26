<?php

namespace Tests\Unit;

use App\Support\SpreadsheetValue;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class SpreadsheetValueTest extends TestCase
{
    #[DataProvider('readableDates')]
    public function test_it_parses_readable_date_cells(mixed $value, string $expected): void
    {
        $this->assertSame($expected, SpreadsheetValue::date($value));
    }

    public static function readableDates(): array
    {
        return [
            'iso' => ['2026-01-15', '2026-01-15'],
            'iso with time' => ['2026-01-15 13:45:00', '2026-01-15'],
            'day first' => ['15/01/2026', '2026-01-15'],
            'month name' => ['Jan 15, 2026', '2026-01-15'],
            'compact ymd' => ['20260115', '2026-01-15'],
            'compact ymd int' => [20260115, '2026-01-15'],
            'excel serial' => [46000, '2025-12-09'],
        ];
    }

    #[DataProvider('unreadableDates')]
    public function test_it_returns_null_for_unreadable_cells(mixed $value): void
    {
        $this->assertNull(SpreadsheetValue::date($value));
    }

    public static function unreadableDates(): array
    {
        return [
            'blank' => [''],
            'whitespace' => ['   '],
            'text' => ['not a date'],
            'overflow day' => ['32/01/2026'],
            'overflow month' => ['15/13/2026'],
            'zero serial' => [0],
            'negative serial' => [-5],
        ];
    }
}
