<?php

namespace Paymenter\Extensions\Gateways\BladeGateway;

use App\Classes\Extension\Gateway;
use Illuminate\Support\Facades\Mail;

class BladeGateway extends Gateway
{
    public function pay($invoice, $total)
    {
        return view('bladegateway::pay', ['invoice' => $invoice]);
    }

    public function charge($invoice, $total, $billingAgreement)
    {
        Mail::to('x@example.com')->send('hi');
    }

    public function explode()
    {
        echo "stray output must not corrupt the protocol\n";
        throw new \RuntimeException('boom from php');
    }
}
