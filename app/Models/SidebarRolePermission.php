<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SidebarRolePermission extends Model
{
    protected $fillable = [
        'role',
        'visible_items',
    ];

    protected $casts = [
        'visible_items' => 'array',
    ];
}
