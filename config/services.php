<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'resend' => [
        'key' => env('RESEND_KEY'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'mpesa' => [
        'env' => env('MPESA_ENV', 'sandbox'),
        'consumer_key' => env('MPESA_CONSUMER_KEY'),
        'consumer_secret' => env('MPESA_CONSUMER_SECRET'),
        'shortcode' => env('MPESA_SHORTCODE'),
        'passkey' => env('MPESA_PASSKEY'),
        'callback_url' => env('MPESA_CALLBACK_URL'),
        'oauth_url' => env('MPESA_OAUTH_URL'),
        'stk_url' => env('MPESA_STK_URL'),
        'stk_query_url' => env('MPESA_STK_QUERY_URL'),
    ],

    'wasender' => [
        'api_key' => env('WASENDER_API_KEY'),
        'overdue_alert_api_key' => env('WASENDER_OVERDUE_ALERT_API_KEY'),
        'call_center_agents' => array_values(array_filter(array_map('trim', explode(',', (string) env('WASENDER_CALL_CENTER_AGENTS', ''))))),
    ],

    'whatsapp_cloud' => [
        'phone_number_id' => env('WHATSAPP_CLOUD_PHONE_ID'),
        'access_token' => env('WHATSAPP_CLOUD_ACCESS_TOKEN'),
        'api_version' => env('WHATSAPP_CLOUD_API_VERSION', 'v22.0'),
        'verify_token' => env('WHATSAPP_WEBHOOK_VERIFY_TOKEN'),
    ],

    'openwa' => [
        'base_url' => env('OPENWA_BASE_URL', 'https://api.sitebase.co.ke'),
        'api_key' => env('OPENWA_API_KEY'),
        'sessions' => [
            '254' => env('OPENWA_SESSION_KENYA'),
            '255' => env('OPENWA_SESSION_TANZANIA'),
            '256' => env('OPENWA_SESSION_UGANDA'),
            '260' => env('OPENWA_SESSION_ZAMBIA'),
        ],
    ],

    'wawp' => [
        'base_url' => env('WAWP_BASE_URL', 'https://api.wawp.net'),
        'instance_id' => env('WAWP_INSTANCE_ID'),
        'access_token' => env('WAWP_ACCESS_TOKEN'),
        'timeout' => env('WAWP_TIMEOUT', 20),
    ],

    'product_alert' => [
        'phones' => env('PRODUCT_ALERT_PHONES', ''),
    ],

    'africastalking' => [
        'api_key' => env('AFRICASTALKING_API_KEY'),
        'username' => env('AFRICASTALKING_USERNAME'),
        'call_from' => env('AFRICASTALKING_CALL_FROM'),
        'queue_name' => env('AFRICASTALKING_QUEUE_NAME'),
        'callcenter_api_key' => env('AFRICASTALKING_CALLCENTER_API_KEY', env('AFRICASTALKING_API_KEY')),
        'callcenter_from' => env('AFRICASTALKING_CALLCENTER_FROM', env('AFRICASTALKING_CALL_FROM')),
    ],

    'quicksms' => [
        'api_url' => env('QUICKSMS_API_URL'),
        'api_key' => env('QUICKSMS_API_KEY'),
        'partner_id' => env('QUICKSMS_PARTNER_ID'),
        'shortcode' => env('QUICKSMS_SHORTCODE', 'Real Deal'),
    ],

];
