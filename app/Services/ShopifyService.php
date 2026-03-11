<?php

namespace App\Services;

use GuzzleHttp\Client;

class ShopifyService
{
    protected $shop;
    protected $accessToken;
    protected $client;

    public function __construct($shop, $accessToken)
    {
        $this->shop = $shop;
        $this->accessToken = $accessToken;
        $this->client = new Client([
            'base_uri' => "https://{$this->shop}.myshopify.com/admin/api/2025-01/",
            'headers' => [
                'X-Shopify-Access-Token' => $this->accessToken,
                'Content-Type' => 'application/json',
            ],
        ]);
    }

    public function fetchOrders()
    {
        try {
            $response = $this->client->request('GET', 'orders.json');
            return json_decode($response->getBody()->getContents(), true);
        } catch (\Exception $e) {
            // Log the exception message for debugging
            \Log::error('Shopify API Request Failed: ' . $e->getMessage());
            return [];
        }
    }
}