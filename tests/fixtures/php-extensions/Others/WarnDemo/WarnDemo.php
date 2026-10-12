<?php

namespace Paymenter\Extensions\Others\WarnDemo;

use App\Attributes\ExtensionMeta;
use App\Classes\Extension\Extension;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

#[ExtensionMeta(name: 'Warn Demo', description: 'Uses the shim', version: '1.2.3', author: 'Tester')]
class WarnDemo extends Extension
{
    public function getConfig($values = [])
    {
        return [['name' => 'greeting', 'type' => 'text', 'label' => 'Greeting', 'hint' => new \Illuminate\Support\HtmlString('<b>hi</b>')]];
    }

    public function hello($name)
    {
        return Cache::remember('warn-demo-' . $name, 60, fn () => Str::studly($this->config('greeting') . ' ' . $name));
    }

    public function collection()
    {
        return collect([3, 1, 2])->sort()->map(fn ($x) => $x * 2)->values()->all();
    }
}
