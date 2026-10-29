import { Button } from '@/components/ui/button';
import { Head, Link } from '@inertiajs/react';
import { ArrowDown, ArrowRight, Boxes, Check, ChevronRight, CircleHelp, Code2, KeyRound, Package, ShieldCheck, Webhook } from 'lucide-react';
import * as React from 'react';

const examples = {
    curl: `curl -G 'https://your-domain.example/api/merchant/v1/orders' \\
  --data-urlencode 'per_page=50' \\
  -H 'Authorization: Bearer $RDL_API_TOKEN' \\
  -H 'Accept: application/json'`,
    node: `// Node.js 18+
async function main() {
  const response = await fetch(
    'https://your-domain.example/api/merchant/v1/orders?per_page=50',
    { headers: { Authorization: \`Bearer \${process.env.RDL_API_TOKEN}\`, Accept: 'application/json' } }
  );

  if (!response.ok) throw new Error(\`RDL API returned \${response.status}\`);
  const page = await response.json();
  for (const item of page.data) console.log(item);
}

main().catch(console.error);`,
    php: `$client = new \\GuzzleHttp\\Client(['base_uri' => 'https://your-domain.example']);
$response = $client->get('/api/merchant/v1/orders', [
    'headers' => [
        'Authorization' => 'Bearer ' . getenv('RDL_API_TOKEN'),
        'Accept' => 'application/json',
    ],
    'query' => ['per_page' => 50],
]);

$page = json_decode($response->getBody(), true);
foreach ($page['data'] as $item) {
    print_r($item);
}`,
    python: `import os
import requests

response = requests.get(
    'https://your-domain.example/api/merchant/v1/orders',
    headers={'Authorization': f"Bearer {os.environ['RDL_API_TOKEN']}", 'Accept': 'application/json'},
    params={'per_page': 50},
    timeout=15,
)
response.raise_for_status()
page = response.json()
for item in page['data']:
    print(item)`,
    java: `import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

var request = HttpRequest.newBuilder()
    .uri(URI.create("https://your-domain.example/api/merchant/v1/orders?per_page=50"))
    .header("Authorization", "Bearer " + System.getenv("RDL_API_TOKEN"))
    .header("Accept", "application/json")
    .GET()
    .build();
var response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
if (response.statusCode() / 100 != 2) throw new RuntimeException("RDL API returned " + response.statusCode());
System.out.println(response.body());`,
    csharp: `using System.Net.Http.Headers;

using var client = new HttpClient();
client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
    "Bearer", Environment.GetEnvironmentVariable("RDL_API_TOKEN"));
client.DefaultRequestHeaders.Accept.ParseAdd("application/json");

using var response = await client.GetAsync(
    "https://your-domain.example/api/merchant/v1/orders?per_page=50");
response.EnsureSuccessStatusCode();
Console.WriteLine(await response.Content.ReadAsStringAsync());`,
    go: `package main

import (
    "fmt"
    "io"
    "net/http"
    "os"
)

func main() {
    req, _ := http.NewRequest("GET", "https://your-domain.example/api/merchant/v1/orders?per_page=50", nil)
    req.Header.Set("Authorization", "Bearer "+os.Getenv("RDL_API_TOKEN"))
    req.Header.Set("Accept", "application/json")
    response, err := http.DefaultClient.Do(req)
    if err != nil { panic(err) }
    defer response.Body.Close()
    body, _ := io.ReadAll(response.Body)
    if response.StatusCode/100 != 2 { panic(fmt.Sprintf("RDL API returned %d: %s", response.StatusCode, body)) }
    fmt.Println(string(body))
}`,
};

const webhookExamples = {
    node: `import express from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';

const app = express();

// Register this route before express.json() so req.body stays raw bytes.
app.post('/webhooks/rdl', express.raw({ type: 'application/json' }), (req, res) => {
  const secret = process.env.RDL_WEBHOOK_SECRET;
  const provided = req.get('X-RDL-Signature') ?? '';
  const expected = 'sha256=' + createHmac('sha256', secret).update(req.body).digest('hex');
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);

  if (providedBytes.length !== expectedBytes.length || !timingSafeEqual(providedBytes, expectedBytes)) {
    return res.sendStatus(401);
  }

  const event = JSON.parse(req.body.toString('utf8'));
  if (event.type === 'integration.test') console.log('Webhook test received');
  else console.log('Handle event:', event.type, event.data);
  return res.sendStatus(200);
});`,
    laravel: `use Illuminate\\Http\\Request;
use Illuminate\\Support\\Facades\\Route;

Route::post('/webhooks/rdl', function (Request $request) {
    $rawBody = $request->getContent();
    $provided = $request->header('X-RDL-Signature', '');
    $secret = (string) env('RDL_WEBHOOK_SECRET');
    $expected = 'sha256=' . hash_hmac('sha256', $rawBody, $secret);

    if (! hash_equals($expected, $provided)) {
        return response()->json(['message' => 'Invalid signature'], 401);
    }

    $event = json_decode($rawBody, true, 512, JSON_THROW_ON_ERROR);
    if ($event['type'] === 'integration.test') {
        logger()->info('RDL webhook test received');
    } else {
        // Queue or handle $event['type'] and $event['data'] here.
    }

    return response()->json(['received' => true]);
});`,
    python: `import hashlib
import hmac
import json
import os
from flask import Flask, jsonify, request

app = Flask(__name__)

@app.post('/webhooks/rdl')
def receive_rdl_webhook():
    raw_body = request.get_data()
    provided = request.headers.get('X-RDL-Signature', '')
    digest = hmac.new(os.environ['RDL_WEBHOOK_SECRET'].encode(), raw_body, hashlib.sha256).hexdigest()
    expected = f'sha256={digest}'

    if not hmac.compare_digest(expected, provided):
        return jsonify(message='Invalid signature'), 401

    event = json.loads(raw_body)
    if event['type'] == 'integration.test':
        print('Webhook test received')
    else:
        # Queue or handle event['type'] and event['data'] here.
    return jsonify(received=True), 200`,
    java: `import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
class RdlWebhookController {
  @PostMapping(value = "/webhooks/rdl", consumes = "application/json")
  ResponseEntity<String> receive(
      @RequestBody byte[] rawBody,
      @RequestHeader(value = "X-RDL-Signature", defaultValue = "") String provided
  ) throws Exception {
    var secret = System.getenv("RDL_WEBHOOK_SECRET");
    var mac = Mac.getInstance("HmacSHA256");
    mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
    var expected = "sha256=" + HexFormat.of().formatHex(mac.doFinal(rawBody));
    if (!MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), provided.getBytes(StandardCharsets.UTF_8))) {
      return ResponseEntity.status(401).body("Invalid signature");
    }
    // Parse rawBody as JSON only after signature verification, then handle the event.
    return ResponseEntity.ok("received");
  }
}`,
    csharp: `using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

app.MapPost("/webhooks/rdl", async (HttpRequest request) =>
{
    using var buffer = new MemoryStream();
    await request.Body.CopyToAsync(buffer);
    var rawBody = buffer.ToArray();
    var secret = Environment.GetEnvironmentVariable("RDL_WEBHOOK_SECRET") ?? "";
    var digest = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), rawBody);
    var expected = "sha256=" + Convert.ToHexString(digest).ToLowerInvariant();
    var provided = request.Headers["X-RDL-Signature"].ToString();
    if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(provided)))
        return Results.Unauthorized();

    using var eventJson = JsonDocument.Parse(rawBody); // Parse only after verifying the signature.
    var eventType = eventJson.RootElement.GetProperty("type").GetString();
    if (eventType == "integration.test") Console.WriteLine("Webhook test received");
    return Results.Ok();
});`,
    go: `package main

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "encoding/json"
    "io"
    "net/http"
    "os"
)

func main() {
    http.HandleFunc("/webhooks/rdl", func(w http.ResponseWriter, r *http.Request) {
        rawBody, err := io.ReadAll(r.Body)
        if err != nil { http.Error(w, "Bad request", http.StatusBadRequest); return }
        mac := hmac.New(sha256.New, []byte(os.Getenv("RDL_WEBHOOK_SECRET")))
        mac.Write(rawBody)
        expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
        if !hmac.Equal([]byte(expected), []byte(r.Header.Get("X-RDL-Signature"))) {
            http.Error(w, "Invalid signature", http.StatusUnauthorized); return
        }
        var event struct { Type string \`json:"type"\` }
        if err := json.Unmarshal(rawBody, &event); err != nil { http.Error(w, "Invalid JSON", 400); return }
        // Handle event.Type after signature verification.
        w.WriteHeader(http.StatusOK)
    })
    http.ListenAndServe(":8080", nil)
}`,
};

const apiResponseExamples = {
    orders: `{
  "current_page": 1,
  "data": [{
    "id": 1842,
    "order_no": "ORD-2026-1042",
    "order_date": "2026-10-28",
    "amount": "125.00",
    "quantity": 2,
    "product_name": "Windproof Lighter",
    "delivery_date": "2026-10-30",
    "client_name": "Jane Doe",
    "client_city": "Nairobi",
    "address": "Westlands",
    "city": "Nairobi",
    "country": "Kenya",
    "phone": "+254700000000",
    "alt_no": null,
    "status": "Dispatched",
    "code": "SKU-123",
    "confirmed": 1,
    "created_at": "2026-10-28T09:30:00.000000Z",
    "updated_at": "2026-10-29T08:15:00.000000Z"
  }],
  "per_page": 50,
  "next_page_url": null,
  "total": 1
}`,
    products: `{
  "current_page": 1,
  "data": [{
    "id": 72,
    "name": "Windproof Lighter",
    "code": "SKU-123",
    "slug": "windproof-lighter",
    "quantity": 20,
    "selling_price": "12.50",
    "tax": "0.00",
    "tax_type": null,
    "category_id": 4,
    "store_name": "Main store",
    "country": "Kenya",
    "unit_id": 1,
    "updated_at": "2026-10-29T08:15:00.000000Z"
  }],
  "per_page": 50,
  "next_page_url": null,
  "total": 1
}`,
    transfers: `{
  "current_page": 1,
  "data": [
    {
      "movement_type": "returned",
      "id": 391,
      "product_id": 72,
      "product_name": "Windproof Lighter",
      "product_code": "SKU-123",
      "merchant": "Example Merchant",
      "quantity": 2,
      "agent_id": 15,
      "agent_name": "Sam Agent",
      "date": "2026-10-29",
      "country": "Kenya",
      "reason": "Customer return",
      "performed_by": "Warehouse User",
      "code": "RET-0391",
      "created_at": "2026-10-29T08:15:00.000000Z",
      "updated_at": "2026-10-29T08:15:00.000000Z"
    },
    {
      "movement_type": "sent",
      "id": 842,
      "product_id": 72,
      "product_name": "Windproof Lighter",
      "product_code": "SKU-123",
      "merchant": "Example Merchant",
      "quantity": 10,
      "agent_id": 15,
      "agent_name": "Sam Agent",
      "date": "2026-10-28",
      "region": "Nairobi",
      "store_name": "Westlands",
      "from": "Main warehouse",
      "country": "Kenya",
      "reason": null,
      "performed_by": "Warehouse User",
      "code": null,
      "created_at": "2026-10-28T11:00:00.000000Z",
      "updated_at": "2026-10-28T11:00:00.000000Z"
    }
  ],
  "per_page": 50,
  "next_page_url": null,
  "total": 2
}`,
};

const webhookEventExamples = {
    'order.created': `{"id":1842,"order_no":"ORD-2026-1042","status":"Pending","updated_at":"2026-10-29T08:15:00+00:00"}`,
    'order.updated': `{"id":1842,"order_no":"ORD-2026-1042","status":"Dispatched","updated_at":"2026-10-29T08:15:00+00:00"}`,
    'product.created': `{"id":72,"sku":"SKU-123","name":"Windproof Lighter","quantity":20,"updated_at":"2026-10-29T08:15:00+00:00"}`,
    'product.updated': `{"id":72,"sku":"SKU-123","name":"Windproof Lighter","quantity":18,"updated_at":"2026-10-29T08:20:00+00:00"}`,
    'transfer.created': `{"id":842,"movement_type":"sent","product_id":72,"quantity":10,"agent_id":15,"created_at":"2026-10-29T08:15:00+00:00"}`,
    'transfer.returned': `{"id":391,"movement_type":"returned","code":"RET-0391","product_id":72,"quantity":2,"agent_id":15,"reason":"Customer return","performed_by":"Warehouse User","created_at":"2026-10-29T08:20:00+00:00"}`,
};

type Language = keyof typeof examples;
const languageLabels: Record<Language, string> = { curl: 'cURL', node: 'Node.js', php: 'PHP', python: 'Python', java: 'Java', csharp: 'C#', go: 'Go' };
type WebhookLanguage = keyof typeof webhookExamples;
const webhookLanguageLabels: Record<WebhookLanguage, string> = { node: 'Node.js', laravel: 'Laravel / PHP', python: 'Python / Flask', java: 'Java / Spring', csharp: 'C# / ASP.NET', go: 'Go / net/http' };
type ApiResource = keyof typeof apiResponseExamples;

function SectionTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
    return <div className="mb-6 max-w-2xl"><p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">{eyebrow}</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{children}</p></div>;
}

function CodeBlock({ code, language }: { code: string; language: string }) {
    const tokenPattern = /(\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:async|await|function|const|let|var|return|throw|new|if|for|of|in|import|from|using|package|func|defer|go|public|static|void|class|int|string|try|catch|foreach|as|echo|print_r|true|false|null|None|nil|undefined|True|False)\b|\b\d+\b)/g;
    const highlighted = code.split(tokenPattern).filter((part) => part !== '').map((part, index) => {
        let color = '';
        if (/^(\/\/|#)/.test(part)) color = 'text-muted-foreground italic';
        else if (/^("|'|`)/.test(part)) color = 'text-emerald-600 dark:text-emerald-400';
        else if (/^\d+$/.test(part)) color = 'text-amber-600 dark:text-amber-300';
        else if (/^(true|false|null|None|nil|undefined|True|False)$/.test(part)) color = 'text-rose-600 dark:text-rose-400';
        else if (/^(async|await|function|const|let|var|return|throw|new|if|for|of|in|import|from|using|package|func|defer|go|public|static|void|class|int|string|try|catch|foreach|as|echo|print_r)$/.test(part)) color = 'text-sky-700 dark:text-sky-300';
        return <span key={index} className={color}>{part}</span>;
    });

    return <div className="overflow-hidden rounded-xl border bg-slate-950 text-slate-100 dark:bg-[#090d14]"><div className="flex items-center justify-between border-b border-white/10 px-4 py-2"><div className="flex gap-1.5" aria-hidden="true"><span className="size-2 rounded-full bg-rose-400/80" /><span className="size-2 rounded-full bg-amber-300/80" /><span className="size-2 rounded-full bg-emerald-400/80" /></div><span className="font-mono text-[10px] text-slate-400">{language}</span></div><pre className="overflow-x-auto p-4 text-xs leading-6"><code data-language={language}>{highlighted}</code></pre></div>;
}

export default function ApiDeveloperGuide() {
    const [language, setLanguage] = React.useState<Language>('node');
    const [apiResource, setApiResource] = React.useState<ApiResource>('orders');
    const [webhookLanguage, setWebhookLanguage] = React.useState<WebhookLanguage>('node');
    const [copied, setCopied] = React.useState(false);
    const [webhookCopied, setWebhookCopied] = React.useState(false);
    const selectedRequestExample = examples[language].replaceAll('/api/merchant/v1/orders', `/api/merchant/v1/${apiResource}`);

    const copyExample = async () => {
        try {
            await navigator.clipboard.writeText(selectedRequestExample);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
        } catch {
            setCopied(false);
        }
    };

    const copyWebhookExample = async () => {
        try {
            await navigator.clipboard.writeText(webhookExamples[webhookLanguage]);
            setWebhookCopied(true);
            window.setTimeout(() => setWebhookCopied(false), 1600);
        } catch {
            setWebhookCopied(false);
        }
    };

    return <main className="min-h-screen bg-background text-foreground">
        <Head title="Merchant API developer guide" />
        <header className="border-b">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
                <Link href="/developers/api" className="flex items-center gap-2 font-semibold"><span className="grid size-8 place-items-center rounded-lg border"><Boxes className="size-4" /></span>Realdeal API <span className="rounded-full border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">v1</span></Link>
                <nav className="flex items-center gap-2"><a href="#quick-start" className="hidden text-sm text-muted-foreground hover:text-foreground sm:block">Quick start</a><Button asChild size="sm"><Link href="/login">Sign in <ChevronRight className="ml-1 size-4" /></Link></Button></nav>
            </div>
        </header>

        <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
            <section className="grid gap-8 border-b py-12 sm:py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-14 lg:py-20">
                <div>
                    <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] text-muted-foreground"><span className="size-1.5 rounded-full bg-emerald-500" />PUBLIC DEVELOPER DOCUMENTATION</div>
                    <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Connect your system to Realdeal.</h1>
                    <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">Read your orders, products, stock movements, and returns from the systems and languages your team already uses. This guide walks through access, requests, and event notifications.</p>
                    <div className="mt-6 flex flex-wrap gap-3"><Button asChild><a href="#quick-start">Make your first request <ArrowRight className="ml-2 size-4" /></a></Button><Button asChild variant="outline"><a href="#webhooks">Set up webhooks <Webhook className="ml-2 size-4" /></a></Button></div>
                </div>
                <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
                    <div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-semibold">Integration workflow</p><p className="mt-1 text-xs text-muted-foreground">A typical read and update cycle</p></div><Code2 className="size-4 text-muted-foreground" /></div>
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] sm:items-stretch">
                        {[
                            { n: '01', icon: KeyRound, title: 'Get access', body: 'Merchant creates a key and selects permissions.' },
                            { n: '02', icon: Code2, title: 'Send request', body: 'Your app calls an endpoint with the bearer token.' },
                            { n: '03', icon: Package, title: 'Read data', body: 'Realdeal returns only this merchant’s records.' },
                            { n: '04', icon: Webhook, title: 'Receive events', body: 'Optional signed webhooks notify your app.' },
                        ].map(({ n, icon: Icon, title, body }, index) => <React.Fragment key={n}>
                            <div className="rounded-xl border bg-background p-3"><div className="flex items-center justify-between"><Icon className="size-4 text-primary" /><span className="font-mono text-[10px] text-muted-foreground">{n}</span></div><h3 className="mt-3 text-xs font-semibold">{title}</h3><p className="mt-1 text-[10px] leading-4 text-muted-foreground">{body}</p></div>
                            {index < 3 && <div className="flex justify-center text-muted-foreground sm:items-center"><ArrowDown className="size-4 sm:hidden" /><ArrowRight className="hidden size-4 sm:block" /></div>}
                        </React.Fragment>)}
                    </div>
                </div>
            </section>

            <section id="quick-start" className="scroll-mt-8 border-b py-12 sm:py-16">
                <SectionTitle eyebrow="01 / QUICK START" title="Make your first request">You can integrate with any language or framework that can make HTTPS requests and read JSON. Start with a token and one GET request.</SectionTitle>
                <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
                    <div className="space-y-3">
                        {[
                            ['Create a key', 'Sign in and open Merchant API access. Create an integration and choose the permissions it needs.'],
                            ['Store the token safely', 'Copy the token once and save it in your server environment as RDL_API_TOKEN. Never put it in a browser app or public repository.'],
                            ['Call an endpoint', 'Send the token in the Authorization: Bearer header over HTTPS.'],
                        ].map(([title, body], index) => <div key={title} className="flex gap-3 rounded-xl border p-4"><span className="grid size-7 shrink-0 place-items-center rounded-full border font-mono text-xs">{index + 1}</span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{body}</p></div></div>)}
                    </div>
                    <div className="overflow-hidden rounded-xl border bg-card">
                        <div className="space-y-3 border-b p-3"><div><p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Choose an endpoint</p><div className="flex flex-wrap gap-1">{(Object.keys(apiResponseExamples) as ApiResource[]).map((resource) => <button key={resource} type="button" onClick={() => setApiResource(resource)} className={`rounded-md px-2.5 py-1.5 text-xs capitalize ${apiResource === resource ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}>{resource}</button>)}</div></div><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-1">{(Object.keys(examples) as Language[]).map((key) => <button key={key} type="button" onClick={() => setLanguage(key)} className={`rounded-md px-2.5 py-1.5 text-xs ${language === key ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}>{languageLabels[key]}</button>)}</div><button type="button" onClick={copyExample} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs">{copied ? <Check className="size-3.5" /> : <Code2 className="size-3.5" />}{copied ? 'Copied' : 'Copy request'}</button></div></div>
                        <div className="p-3"><p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Request · GET /api/merchant/v1/{apiResource}</p><CodeBlock code={selectedRequestExample} language={languageLabels[language]} /></div>
                        <div className="border-t p-3"><p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Example JSON response</p><CodeBlock code={apiResponseExamples[apiResource]} language="JSON" /></div>
                        <p className="border-t px-4 py-3 text-xs text-muted-foreground">Replace <code className="rounded bg-muted px-1">https://your-domain.example</code> with the Realdeal host provided to your account. Example records are illustrative.</p>
                    </div>
                </div>
            </section>

            <section id="endpoints" className="scroll-mt-8 border-b py-12 sm:py-16">
                <SectionTitle eyebrow="02 / AVAILABLE DATA" title="Three read endpoints">Each key needs the matching permission. Records are automatically limited to the merchant account connected to that key.</SectionTitle>
                <div className="overflow-hidden rounded-xl border">
                    <div className="hidden grid-cols-[100px_1.1fr_1fr_1fr] gap-4 bg-muted/40 px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:grid"><span>Method</span><span>Endpoint</span><span>Permission</span><span>Returns</span></div>
                    {[
                        ['GET', '/api/merchant/v1/orders', 'orders:read', 'Merchant orders and their current statuses'],
                        ['GET', '/api/merchant/v1/products', 'products:read', 'Product details and available quantities'],
                        ['GET', '/api/merchant/v1/transfers', 'transfers:read', 'Sent stock and returned stock movements'],
                    ].map(([method, path, scope, description]) => <div key={path} className="grid gap-2 border-t p-4 sm:grid-cols-[100px_1.1fr_1fr_1fr] sm:items-center sm:gap-4"><span className="w-fit rounded border px-2 py-1 font-mono text-[10px]">{method}</span><code className="break-all text-xs">{path}</code><code className="text-xs text-muted-foreground">{scope}</code><p className="text-xs text-muted-foreground">{description}</p></div>)}
                </div>
                <div className="mt-5 overflow-hidden rounded-xl border bg-card">
                    <div className="border-b p-3"><h3 className="text-sm font-semibold">Example API response payloads</h3><p className="mt-1 text-xs text-muted-foreground">These are representative paginated responses. Your actual records and values will differ.</p><div className="mt-3 flex flex-wrap gap-1">{(Object.keys(apiResponseExamples) as ApiResource[]).map((resource) => <button key={resource} type="button" onClick={() => setApiResource(resource)} className={`rounded-md px-3 py-1.5 text-xs capitalize ${apiResource === resource ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}>{resource}</button>)}</div></div>
                    <div className="p-3"><CodeBlock language="JSON" code={apiResponseExamples[apiResource]} /></div>
                    <p className="border-t px-4 py-3 text-xs leading-5 text-muted-foreground">The transfers response combines sent and returned stock records. Its <code>movement_type</code> is <code>sent</code> or <code>returned</code>. Transfer fields follow the integration’s saved field permissions.</p>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border p-4"><h3 className="text-sm font-semibold">Pagination and incremental sync</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">Responses include <code>data</code>, <code>current_page</code>, <code>next_page_url</code>, and other pagination details. Use <code>?per_page=50</code> (maximum 100) to choose page size. Use <code>&amp;updated_since=2026-10-01T00:00:00Z</code> to fetch records changed since a timestamp.</p><CodeBlock language="URL" code="GET /api/merchant/v1/orders?per_page=50&amp;updated_since=2026-10-01T00:00:00Z" /></div>
                    <div className="rounded-xl border p-4"><h3 className="text-sm font-semibold">Transfers include returns</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">The transfers endpoint returns both outgoing stock and returns in one paginated list. Use <code>movement_type</code> to tell them apart: <code>sent</code> or <code>returned</code>. A return may include a reason and return code.</p><div className="mt-3 flex gap-2"><span className="rounded-full border px-2.5 py-1 font-mono text-[10px]">sent</span><span className="rounded-full border px-2.5 py-1 font-mono text-[10px]">returned</span></div></div>
                </div>
            </section>

            <section id="webhooks" className="scroll-mt-8 border-b py-12 sm:py-16">
                <SectionTitle eyebrow="03 / EVENT DELIVERY" title="Use webhooks for changes">Webhooks notify your server when selected order, product, or stock movement events happen. Configure a public HTTPS receiver and choose events in Merchant API access.</SectionTitle>
                <div className="mb-5 rounded-xl border bg-muted/20 p-4 sm:p-5">
                    <h3 className="text-sm font-semibold">Connect the receiver to Realdeal</h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
                        ['1 · Add receiver code', 'Add one of the examples below to your server. It checks the signature and accepts incoming event POSTs.'],
                        ['2 · Deploy over HTTPS', 'Deploy the route at a public HTTPS URL, for example https://merchant.example/webhooks/rdl.'],
                        ['3 · Configure the integration', 'In Realdeal, open Merchant API access → Edit integration settings. Save the URL and select events.'],
                        ['4 · Save secret and test', 'Copy the signing secret into your server environment, then choose Save and test webhook.'],
                    ].map(([title, text]) => <div key={title} className="rounded-lg border bg-background p-3"><p className="text-xs font-semibold">{title}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{text}</p></div>)}</div>
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">The receiver code runs on the merchant’s server. The URL and event subscriptions are saved in Realdeal’s integration settings; a separate API call to register the webhook is not required.</p>
                </div>
                <div className="grid gap-5 lg:grid-cols-2">
                    <div className="space-y-4">
                        <div className="rounded-xl border p-4"><div className="flex items-center gap-2"><Webhook className="size-4 text-primary" /><h3 className="text-sm font-semibold">Events you can subscribe to</h3></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{['order.created', 'order.updated', 'product.created', 'product.updated', 'transfer.created', 'transfer.returned'].map((event) => <code key={event} className="rounded-lg border bg-muted/30 px-3 py-2 text-xs">{event}</code>)}</div></div>
                        <div className="rounded-xl border p-4"><h3 className="text-sm font-semibold">What your server receives</h3><p className="mt-1 text-xs text-muted-foreground">Realdeal sends a POST with JSON and these headers:</p><div className="mt-3 space-y-2 font-mono text-[11px]"><p className="rounded bg-muted/50 p-2">X-RDL-Event: order.updated</p><p className="rounded bg-muted/50 p-2">X-RDL-Signature: sha256=&lt;signature&gt;</p></div></div>
                    </div>
                    <div className="rounded-xl border bg-card p-4"><h3 className="text-sm font-semibold">Webhook payload example</h3><p className="mt-1 text-xs text-muted-foreground">The event type and data identify what changed.</p><div className="mt-3"><CodeBlock language="JSON" code={`{
  "id": "event-uuid",
  "type": "transfer.returned",
  "created_at": "2026-10-29T08:15:00+00:00",
  "data": {
    "movement_type": "returned",
    "id": 391,
    "product_name": "Windproof Lighter",
    "quantity": 2,
    "reason": "Customer return"
  }
}`} /></div><p className="mt-3 text-xs leading-5 text-muted-foreground">Verify the signature using the raw request body and the webhook signing secret. Return a 2xx response promptly; non-2xx responses are retried.</p></div>
                </div>
                <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4"><p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4" />Verify the signature before processing</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Compute HMAC-SHA256 over the exact raw JSON body using your webhook secret. Compare it with the hex value after <code>sha256=</code> in <code>X-RDL-Signature</code>, using a constant-time comparison. The test button sends the signed event <code>integration.test</code>.</p></div>
                <div className="mt-5 overflow-hidden rounded-xl border bg-card">
                    <div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-semibold">Webhook receiver code</h3><p className="mt-1 text-xs text-muted-foreground">Verify the signature against the raw request body, then parse the JSON.</p></div><div className="flex flex-wrap items-center gap-1">{(Object.keys(webhookExamples) as WebhookLanguage[]).map((key) => <button key={key} type="button" onClick={() => { setWebhookLanguage(key); setWebhookCopied(false); }} className={`rounded-md px-2.5 py-1.5 text-xs ${webhookLanguage === key ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}>{webhookLanguageLabels[key]}</button>)}<button type="button" onClick={copyWebhookExample} className="ml-1 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs">{webhookCopied ? <Check className="size-3.5" /> : <Code2 className="size-3.5" />}{webhookCopied ? 'Copied' : 'Copy code'}</button></div></div>
                    <div className="p-3"><CodeBlock code={webhookExamples[webhookLanguage]} language={webhookLanguageLabels[webhookLanguage]} /></div>
                    <p className="border-t px-4 py-3 text-xs leading-5 text-muted-foreground">Set <code>RDL_WEBHOOK_SECRET</code> to the signing secret shown when you create or configure the webhook. Do not JSON-parse or modify the request body before checking its signature. Return HTTP 2xx after accepting the event.</p>
                </div>
                <div className="mt-5 overflow-hidden rounded-xl border bg-card">
                    <div className="border-b p-4"><h3 className="text-sm font-semibold">Example data for every webhook event</h3><p className="mt-1 text-xs text-muted-foreground">Each example below is the event’s <code>data</code> object inside the common webhook envelope shown above.</p></div>
                    <div className="divide-y">{Object.entries(webhookEventExamples).map(([event, data]) => <div key={event} className="grid gap-2 p-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-start"><code className="text-xs font-semibold">{event}</code><code className="break-all rounded-md bg-muted/40 p-2 font-mono text-[10px] leading-5">{data}</code></div>)}</div>
                    <p className="border-t px-4 py-3 text-xs leading-5 text-muted-foreground">The webhook envelope also includes a unique <code>id</code>, the event <code>type</code>, and <code>created_at</code>. Transfer field permissions can limit transfer data fields; <code>movement_type</code> is always included.</p>
                </div>
            </section>

            <section id="errors" className="scroll-mt-8 py-12 sm:py-16">
                <SectionTitle eyebrow="04 / TROUBLESHOOTING" title="Handle common responses">Check the HTTP status first. Error responses include a JSON <code>message</code>; validation errors can also include an <code>errors</code> object.</SectionTitle>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
                    ['401', 'Token missing, invalid, or revoked. Check the bearer token and integration status.'],
                    ['403', 'The integration does not have the required permission, or merchant API access is disabled.'],
                    ['422', 'A query value is invalid. Check the validation message and correct the request.'],
                    ['429', 'Rate limit reached. Wait briefly before retrying.'],
                ].map(([code, text]) => <div key={code} className="rounded-xl border p-4"><p className="font-mono text-lg font-semibold">{code}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{text}</p></div>)}</div>
                <div className="mt-5 flex flex-col gap-4 rounded-xl border bg-muted/20 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-semibold">Ready to connect?</h3><p className="mt-1 text-xs text-muted-foreground">Sign in to create an integration and copy your API credentials.</p></div><Button asChild><Link href="/login">Open merchant API access <ArrowRight className="ml-2 size-4" /></Link></Button></div>
                <p className="mt-6 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><CircleHelp className="mt-0.5 size-4 shrink-0" />Keep API tokens and webhook secrets on your server. Never share them in browser code, screenshots, or support tickets.</p>
            </section>
        </div>
        <footer className="border-t"><div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"><span>Realdeal Merchant API · v1</span><span>HTTPS · JSON · Bearer token authentication</span></div></footer>
    </main>;
}
