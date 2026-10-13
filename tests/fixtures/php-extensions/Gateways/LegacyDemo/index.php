<?php

use App\Helpers\ExtensionHelper;
use Illuminate\Support\Facades\Http;

// pre-1.0 function-style extension (archived Paymenter/Extensions repository)
function LegacyDemo_getConfig()
{
    return [['name' => 'api_key', 'type' => 'text', 'label' => 'API key']];
}

function LegacyDemo_pay($total, $products, $orderId)
{
    return Http::get('https://example.test')->json()['url'];
}
