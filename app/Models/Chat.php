<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Chat extends Model
{
    protected $table = 'whatsapp'; // 👈 important

    protected $fillable = [
        'to',
        'client_name',
        'store_name',
        'status',
        'sid',
        'message',
        'type',
        'media_url',
        'media_type',
        'mime_type',
        'media_path',
    ];
}
