<?php

namespace App\Exceptions;

use Exception;

/**
 * Raised when a sheet pull cannot proceed at all — the spreadsheet is
 * unreachable, the requested tab does not exist, or the tab's layout makes the
 * blank-status filter unsafe to apply.
 *
 * Distinct from a per-row rejection, which is collected and reported as part of
 * the import summary rather than aborting the run.
 */
class SheetImportException extends Exception {}
