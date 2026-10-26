<?php

namespace App\Services;

use Google_Client;
use Google_Service_Sheets;
use RuntimeException;

/**
 * Read-only access to Google Sheets.
 *
 * Centralises the service-account wiring that was previously duplicated (and
 * divergent) across controllers and commands, so the sheets page and the pull
 * importer both talk to the API through one place.
 *
 * The credential path is injectable because two service accounts exist in this
 * deployment: the reader defaults to the one that backs the sheets page. The
 * outbound *write* sync uses a different account — that path is not covered here
 * on purpose.
 */
class GoogleSheetsReader
{
    private ?Google_Service_Sheets $service = null;

    public function __construct(
        private readonly ?string $credentialsPath = null,
    ) {}

    public function service(): Google_Service_Sheets
    {
        if ($this->service !== null) {
            return $this->service;
        }

        $path = $this->credentialsPath ?: storage_path('rdl-478707-7e105ca93b29.json');

        if (! is_readable($path)) {
            throw new RuntimeException("Google service account credentials are missing at [{$path}].");
        }

        $client = new Google_Client;
        $client->setAuthConfig($path);
        $client->addScope(Google_Service_Sheets::SPREADSHEETS_READONLY);

        return $this->service = new Google_Service_Sheets($client);
    }

    /**
     * List the tab names inside a spreadsheet.
     *
     * @return array<int, string>
     */
    public function tabNames(string $spreadsheetId): array
    {
        try {
            $spreadsheet = $this->service()->spreadsheets->get($spreadsheetId);
        } catch (\Throwable $e) {
            throw new RuntimeException(
                "Could not open spreadsheet [{$spreadsheetId}]: ".$this->reason($e),
                0,
                $e
            );
        }

        $tabs = [];

        foreach ($spreadsheet->getSheets() ?? [] as $sheet) {
            $tabs[] = $sheet->getProperties()->getTitle();
        }

        return $tabs;
    }

    /**
     * Read a tab as plain row arrays, skipping fully empty trailing cells.
     *
     * @return array<int, array<int, mixed>>
     */
    public function rows(
        string $spreadsheetId,
        string $tabName,
        ?string $columns = 'A:R',
        ?int $maxRows = null,
        int $startRow = 1
    ): array
    {
        $rangeColumns = $columns ?: '';

        if ($startRow > 1 && preg_match('/^([A-Z]+):([A-Z]+)$/i', $rangeColumns, $matches) === 1) {
            $firstRow = max(1, $startRow);
            $lastRow = $maxRows === null ? '' : (string) ($firstRow + $maxRows - 1);
            $rangeColumns = $matches[1].$firstRow.':'.$matches[2].$lastRow;
        } elseif ($startRow > 1) {
            throw new RuntimeException('A start row can only be used with a whole-column range such as A:R.');
        } elseif ($maxRows !== null && preg_match('/^([A-Z]+):([A-Z]+)$/i', $rangeColumns, $matches) === 1) {
            $rangeColumns = $matches[1].'1:'.$matches[2].$maxRows;
        }

        $range = $rangeColumns !== ''
            ? $this->quoteTab($tabName).'!'.$rangeColumns
            : $this->quoteTab($tabName);

        try {
            $response = $this->service()->spreadsheets_values->get($spreadsheetId, $range);
        } catch (\Throwable $e) {
            throw new RuntimeException(
                "Could not read tab [{$tabName}]: ".$this->reason($e),
                0,
                $e
            );
        }

        $rows = $response->getValues() ?? [];

        if ($maxRows !== null && count($rows) > $maxRows) {
            $rows = array_slice($rows, 0, $maxRows);
        }

        return array_map(static fn (array $row): array => array_values($row), $rows);
    }

    /**
     * Tab names may contain apostrophes, which have to be doubled to keep the
     * A1 notation valid.
     */
    private function quoteTab(string $tabName): string
    {
        return "'".str_replace("'", "''", $tabName)."'";
    }

    /**
     * Google nests the useful part of an API failure deep in the message body;
     * surface it instead of a bare HTTP status.
     */
    private function reason(\Throwable $e): string
    {
        $message = $e->getMessage();

        if (preg_match('/"message"\s*:\s*"([^"]+)"/', $message, $matches) === 1) {
            return $matches[1];
        }

        return trim($message) !== '' ? $message : $e::class;
    }
}
