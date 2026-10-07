<?php

namespace App\Support;

use DateTimeImmutable;
use DateTimeInterface;

/**
 * Value coercion for spreadsheet-sourced cells.
 *
 * Google Sheets and merchant uploads hand back *formatted* text, not typed
 * values: amounts arrive as "4,399.00" or "KES 4,399.00", dates as "15/01/2026"
 * or "Jan 15, 2026", quantities as "2 pcs". A plain (float)/(int) cast turns
 * every one of those into a silently wrong number (4,399.00 becomes 4.0), which
 * then propagates into financial reports. So every value is parsed explicitly
 * here and returns null when the cell holds nothing usable — a genuine blank is
 * never confused with a zero.
 */
final class SpreadsheetValue
{
    /**
     * Parse a number out of a spreadsheet cell.
     *
     * Handles thousands separators, currency codes/symbols, and accounting
     * negatives such as "(1,250.50)" and "1250.50-".
     */
    public static function decimal(mixed $value): ?float
    {
        if ($value === null || is_bool($value) || is_array($value) || is_object($value)) {
            return null;
        }

        if (is_int($value) || is_float($value)) {
            return (float) $value;
        }

        // Normalise the various space characters spreadsheets use for thousands.
        $raw = trim(str_replace(["\xC2\xA0", "\xE2\x80\xAF", "\xE2\x80\x89"], ' ', (string) $value));

        if ($raw === '') {
            return null;
        }

        $negative = false;

        // Accounting negatives: (1,250.50)
        if (preg_match('/^\((.*)\)$/s', $raw, $matches) === 1) {
            $negative = true;
            $raw = trim($matches[1]);
        } elseif (str_ends_with($raw, '-')) {
            $negative = true;
            $raw = rtrim(substr($raw, 0, -1));
        }

        if (str_starts_with($raw, '-')) {
            $negative = !$negative;
        }

        // Keep only digits and separators — this drops currency codes and symbols.
        $clean = preg_replace('/[^0-9.,]/', '', $raw);

        if ($clean === null || trim($clean, '.,') === '') {
            return null;
        }

        $lastComma = strrpos($clean, ',');
        $lastDot = strrpos($clean, '.');
        $commaCount = substr_count($clean, ',');
        $dotCount = substr_count($clean, '.');

        if ($lastComma !== false && $lastDot !== false) {
            // Both present: whichever comes last is the decimal separator.
            $decimal = $lastComma > $lastDot ? ',' : '.';
            $thousands = $decimal === ',' ? '.' : ',';
            $clean = str_replace($thousands, '', $clean);
            $clean = str_replace($decimal, '.', $clean);
        } elseif ($commaCount > 1 || $dotCount > 1) {
            // Repeated separators of one kind are always thousands grouping.
            $clean = str_replace([',', '.'], '', $clean);
        } elseif ($lastComma !== false) {
            // A single comma is a decimal point only when exactly 1-2 digits follow it.
            $clean = preg_match('/^\d+,\d{1,2}$/', $clean) === 1
                ? str_replace(',', '.', $clean)
                : str_replace(',', '', $clean);
        }

        if (preg_match('/^\d+(\.\d+)?$/', $clean) !== 1) {
            return null;
        }

        return ($negative ? -1 : 1) * (float) $clean;
    }

    /**
     * Parse a whole-number cell such as a quantity.
     *
     * Runs through decimal() rather than grabbing the first digit run, so
     * "1,250" yields 1250 instead of 1. Returns null when the cell holds no
     * digits at all.
     */
    public static function integer(mixed $value): ?int
    {
        $decimal = self::decimal($value);

        return $decimal === null ? null : (int) round($decimal);
    }

    /**
     * Parse a date cell into a `Y-m-d` string, or null when unreadable.
     *
     * Sheets render dates according to the spreadsheet's locale, so the same
     * column can hand back "2026-01-15", "15/01/2026" or "Jan 15, 2026". Formats
     * are tried in a fixed order and day-first is preferred over month-first
     * because the ambiguous case (both <= 12) is far more commonly D/M/Y in this
     * deployment's East African markets. Anything that cannot be read strictly
     * returns null rather than being guessed at.
     */
    public static function date(mixed $value): ?string
    {
        if ($value instanceof DateTimeInterface) {
            return $value->format('Y-m-d');
        }

        if ($value === null || is_bool($value) || is_array($value) || is_object($value)) {
            return null;
        }

        $raw = trim((string) $value);

        if ($raw === '') {
            return null;
        }

        // Each candidate is a progressively looser reading of the same cell. The
        // raw string is tried first so textual months such as "Jan 15, 2026"
        // survive intact — splitting those on whitespace would leave just "Jan".
        $candidates = [$raw];

        // Drop a trailing time component: "2026-01-15 13:45:00", "15/01/2026T08:00".
        $stripped = trim(preg_replace('/[T ]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*\w*$/', '', $raw) ?? $raw);

        if ($stripped !== '' && $stripped !== $raw) {
            $candidates[] = $stripped;
        }

        // Compact ISO: 20260115
        if (preg_match('/^\d{8}$/', $stripped) === 1) {
            $candidates[] = $stripped;
        }

        $formats = [
            '!Y-m-d', '!Y/m/d', '!d-m-Y', '!d/m/Y', '!d.m.Y', '!m/d/Y', '!m-d-Y',
            '!j M Y', '!j F Y', '!j M, Y', '!j F, Y', '!M j, Y', '!F j, Y', '!Ymd',
        ];

        foreach ($candidates as $candidate) {
            foreach ($formats as $format) {
                if ($parsed = self::tryFormat($candidate, $format)) {
                    return $parsed;
                }
            }
        }

        return null;
    }

    /**
     * Trim a cell to a non-empty string, or null when it is blank.
     */
    public static function text(mixed $value): ?string
    {
        if ($value === null || is_array($value) || is_object($value) || is_bool($value)) {
            return null;
        }

        $trimmed = trim((string) $value);

        return $trimmed === '' ? null : $trimmed;
    }

    /**
     * Strictly parse one format, rejecting PHP's lenient overflow behaviour
     * (e.g. createFromFormat('!d/m/Y', '32/01/2026') would otherwise roll over
     * into February).
     */
    private static function tryFormat(string $date, string $format): ?string
    {
        $parsed = DateTimeImmutable::createFromFormat($format, $date);

        if ($parsed === false) {
            return null;
        }

        $errors = DateTimeImmutable::getLastErrors();

        if (is_array($errors) && (($errors['warning_count'] ?? 0) > 0 || ($errors['error_count'] ?? 0) > 0)) {
            return null;
        }

        return $parsed->format('Y-m-d');
    }
}
