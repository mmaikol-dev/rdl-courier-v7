<?php

namespace App\Support;

final class MerchantApiFieldCatalog
{
    public const TRANSFER_FIELDS = [
        'movement_type', 'id', 'product_id', 'product_name', 'product_code', 'merchant', 'quantity',
        'agent_id', 'agent_name', 'date', 'region', 'store_name', 'from', 'country', 'reason',
        'performed_by', 'code', 'created_at', 'updated_at',
    ];
}
