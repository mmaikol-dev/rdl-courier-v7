import { ChangelogTrace, type ChangelogEntry } from '@/components/changelog-trace';
import { Button } from '@/components/ui/button';
import { WorkflowCanvas, type WorkflowEdge, type WorkflowNode } from '@/components/workflow-canvas';
import { Head, Link } from '@inertiajs/react';
import { ArrowRight, Boxes, Check, ChevronRight, CircleHelp, Code2, KeyRound, Package, ShieldCheck, Webhook } from 'lucide-react';
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
    "address": "Westlands",
    "city": "Nairobi",
    "country": "Kenya",
    "phone": "+254700000000",
    "alt_no": null,
    "status": "Dispatched",
    "inventory_deducted_at": null,
    "call_count": 3,
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
    "sku": "SKU-123",
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
      "id": 15,
      "name": "Sam Agent",
      "store_name": "Westlands",
      "store_phone": "+254700000000",
      "transfer_count": 5,
      "total_transferred": 38,
      "total_deducted": 4,
      "remaining_quantity": 34,
      "last_transfer_at": "2026-10-29T08:15:00.000000Z",
      "products": [
        {
          "product_id": 72,
          "product_name": "Windproof Lighter",
          "product_code": "SKU-123",
          "merchant": "Example Merchant",
          "transfer_count": 3,
          "total_quantity": 20,
          "total_deducted": 2,
          "remaining_quantity": 18,
          "first_transfer_date": "2026-10-20T09:00:00.000000Z",
          "last_transfer_date": "2026-10-29T08:15:00.000000Z"
        }
      ]
    }
  ],
  "per_page": 50,
  "total": 1
}`,
};

const webhookEventExamples = {
    'order.created': `{
  "id": 1842,
  "order_no": "ORD-2026-1042",
  "order_date": "2026-10-29T00:00:00.000000Z",
  "amount": "2500.00",
  "quantity": 1,
  "product_name": "Windproof Lighter",
  "delivery_date": "2026-10-30T00:00:00.000000Z",
  "client_name": "Jane Doe",
  "address": "Westlands",
  "city": "Nairobi",
  "country": "Kenya",
  "phone": "+254700000000",
  "alt_no": null,
  "status": null,
  "code": null,
  "confirmed": false,
  "created_at": "2026-10-29T08:15:00.000000Z",
  "updated_at": "2026-10-29T08:15:00+00:00",
  "edited_at": null,
  "call_count": 0
}`,
    'order.updated': `{
  "id": 1842,
  "order_no": "ORD-2026-1042",
  "order_date": "2026-10-29T00:00:00.000000Z",
  "amount": "2500.00",
  "quantity": 1,
  "product_name": "Windproof Lighter",
  "delivery_date": "2026-10-30T00:00:00.000000Z",
  "client_name": "Jane Doe",
  "address": "Westlands",
  "city": "Nairobi",
  "country": "Kenya",
  "phone": "+254700000000",
  "alt_no": null,
  "status": "Dispatched",
  "code": null,
  "confirmed": false,
  "created_at": "2026-10-29T08:15:00.000000Z",
  "updated_at": "2026-10-30T09:20:00+00:00",
  "edited_at": "2026-10-30T09:20:00.000000Z",
  "call_count": 3
}`,
    'product.created': `{"id":72,"sku":"SKU-123","name":"Windproof Lighter","quantity":20,"updated_at":"2026-10-29T08:15:00+00:00"}`,
    'product.updated': `{"id":72,"sku":"SKU-123","name":"Windproof Lighter","quantity":18,"updated_at":"2026-10-29T08:20:00+00:00"}`,
    'transfer.created': `{"id":842,"movement_type":"sent","product_id":72,"quantity":10,"agent_id":15,"created_at":"2026-10-29T08:15:00+00:00"}`,
    'transfer.returned': `{"id":391,"movement_type":"returned","code":"RET-0391","product_id":72,"quantity":2,"agent_id":15,"reason":"Customer return","performed_by":"Warehouse User","created_at":"2026-10-29T08:20:00+00:00"}`,
};

type Language = keyof typeof examples;
const languageLabels: Record<Language, string> = {
    curl: 'cURL',
    node: 'Node.js',
    php: 'PHP',
    python: 'Python',
    java: 'Java',
    csharp: 'C#',
    go: 'Go',
};
type WebhookLanguage = keyof typeof webhookExamples;
const webhookLanguageLabels: Record<WebhookLanguage, string> = {
    node: 'Node.js',
    laravel: 'Laravel / PHP',
    python: 'Python / Flask',
    java: 'Java / Spring',
    csharp: 'C# / ASP.NET',
    go: 'Go / net/http',
};
type ApiResource = keyof typeof apiResponseExamples;

const orderStatusBadgeColors: Record<string, string> = {
    'New Orders': 'border-border bg-muted text-muted-foreground',
    Scheduled: 'border-status-scheduled/40 bg-status-scheduled text-status-scheduled-foreground',
    Rescheduled: 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200',
    Dispatched: 'border-status-dispatched bg-status-dispatched text-status-dispatched-foreground',
    Delivered: 'border-success/30 bg-success/10 text-success',
    Returned: 'border-destructive/30 bg-destructive/10 text-destructive',
    Cancelled: 'border-destructive/30 bg-destructive/10 text-destructive',
    Followup: 'border-status-followup/40 bg-status-followup text-status-followup-foreground',
    Pending: 'border-warning/30 bg-warning/10 text-warning-foreground',
    Duplicate: 'border-border bg-accent text-foreground',
    OutofStock: 'border-warning/30 bg-warning/10 text-warning-foreground',
    Expired: 'border-warning/30 bg-warning/10 text-warning-foreground',
    WrongContact: 'border-border bg-muted text-foreground',
};

function SectionTitle({ eyebrow, title, children }: { eyebrow: string; title?: string; children: React.ReactNode }) {
    return (
        <div className="mb-6 max-w-2xl">
            <div className="flex items-center gap-2">
                <span className="size-2 shrink-0 rounded-full bg-foreground/70 shadow-[0_0_0_3px_var(--background)] ring-1 ring-border" />
                <p className="font-mono text-xs tracking-[0.18em] text-primary uppercase">{eyebrow}</p>
                <span className="h-px flex-1 bg-border" />
            </div>
            {title && <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>}
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{children}</p>
        </div>
    );
}

function CodeBlock({ code, language }: { code: string; language: string }) {
    const tokenPattern =
        /(\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:async|await|function|const|let|var|return|throw|new|if|for|of|in|import|from|using|package|func|defer|go|public|static|void|class|int|string|try|catch|foreach|as|echo|print_r|true|false|null|None|nil|undefined|True|False)\b|\b\d+\b)/g;
    const highlighted = code
        .split(tokenPattern)
        .filter((part) => part !== '')
        .map((part, index) => {
            let color = '';
            if (/^(\/\/|#)/.test(part)) color = 'text-muted-foreground italic';
            else if (/^("|'|`)/.test(part)) color = 'text-emerald-600 dark:text-emerald-400';
            else if (/^\d+$/.test(part)) color = 'text-amber-600 dark:text-amber-300';
            else if (/^(true|false|null|None|nil|undefined|True|False)$/.test(part)) color = 'text-rose-600 dark:text-rose-400';
            else if (
                /^(async|await|function|const|let|var|return|throw|new|if|for|of|in|import|from|using|package|func|defer|go|public|static|void|class|int|string|try|catch|foreach|as|echo|print_r)$/.test(
                    part,
                )
            )
                color = 'text-sky-700 dark:text-sky-300';
            return (
                <span key={index} className={color}>
                    {part}
                </span>
            );
        });

    return (
        <div className="overflow-hidden rounded-xl border bg-slate-950 text-slate-100 dark:bg-[#090d14]">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
                <div className="flex gap-1.5" aria-hidden="true">
                    <span className="size-2 rounded-full bg-rose-400/80" />
                    <span className="size-2 rounded-full bg-amber-300/80" />
                    <span className="size-2 rounded-full bg-emerald-400/80" />
                </div>
                <span className="font-mono text-[10px] text-slate-400">{language}</span>
            </div>
            <pre className="overflow-x-auto p-4 text-xs leading-6">
                <code data-language={language}>{highlighted}</code>
            </pre>
        </div>
    );
}

const quickStartNodes: WorkflowNode[] = [
    {
        id: 'credentials',
        title: 'Create API key',
        subtitle: 'Merchant API access',
        x: 20,
        y: 60,
        icon: <KeyRound className="size-4" />,
        status: 'complete',
        detail: 'Create an integration and grant only the scopes your system needs.',
    },
    {
        id: 'token',
        title: 'Store the token',
        subtitle: 'Server environment',
        x: 230,
        y: 60,
        icon: <ShieldCheck className="size-4" />,
        status: 'complete',
        detail: 'Keep RDL_API_TOKEN on your server. Never expose it in browser code.',
    },
    {
        id: 'request',
        title: 'Send request',
        subtitle: 'HTTPS + Bearer',
        x: 440,
        y: 60,
        icon: <Code2 className="size-4" />,
        status: 'running',
        detail: 'Call an endpoint with the token in the Authorization header.',
    },
    {
        id: 'response',
        title: 'Read JSON',
        subtitle: 'Scoped response',
        x: 650,
        y: 60,
        icon: <Package className="size-4" />,
        status: 'queued',
        detail: 'Realdeal returns only records belonging to the key’s merchant.',
    },
];
const quickStartEdges: WorkflowEdge[] = [
    { id: 'credentials-token', from: 'credentials', to: 'token' },
    { id: 'token-request', from: 'token', to: 'request' },
    { id: 'request-response', from: 'request', to: 'response' },
];

const endpointNodes: WorkflowNode[] = [
    {
        id: 'client',
        title: 'Your system',
        subtitle: 'Merchant application',
        x: 20,
        y: 110,
        icon: <Code2 className="size-4" />,
        status: 'complete',
        detail: 'Your server makes the request and handles the JSON response.',
    },
    {
        id: 'gateway',
        title: 'Merchant API',
        subtitle: 'Bearer token + scope',
        x: 220,
        y: 110,
        icon: <Boxes className="size-4" />,
        status: 'running',
        detail: 'The API authenticates the key and checks the matching permission.',
    },
    {
        id: 'orders',
        title: 'Orders',
        subtitle: 'Read, create, edit',
        x: 430,
        y: 20,
        icon: <Package className="size-4" />,
        status: 'queued',
        detail: 'orders:read and orders:write cover order data and import status.',
    },
    {
        id: 'products',
        title: 'Products',
        subtitle: 'Read, create',
        x: 430,
        y: 100,
        icon: <Boxes className="size-4" />,
        status: 'queued',
        detail: 'products:read and products:write cover catalogue data and SKUs.',
    },
    {
        id: 'shipments',
        title: 'Shipments',
        subtitle: 'Create inbound',
        x: 430,
        y: 180,
        icon: <Package className="size-4" />,
        status: 'queued',
        detail: 'shipments:write creates an inbound shipment with EXPECTED status.',
    },
    {
        id: 'transfers',
        title: 'Transfers',
        subtitle: 'Agent summaries',
        x: 430,
        y: 260,
        icon: <Webhook className="size-4" />,
        status: 'queued',
        detail: 'transfers:read returns agent cards, product totals and movement feeds.',
    },
];
const endpointEdges: WorkflowEdge[] = [
    { id: 'client-gateway', from: 'client', to: 'gateway' },
    { id: 'gateway-orders', from: 'gateway', to: 'orders' },
    { id: 'gateway-products', from: 'gateway', to: 'products' },
    { id: 'gateway-shipments', from: 'gateway', to: 'shipments' },
    { id: 'gateway-transfers', from: 'gateway', to: 'transfers' },
];

const webhookNodes: WorkflowNode[] = [
    {
        id: 'event',
        title: 'Record changes',
        subtitle: 'Order, product, transfer',
        x: 20,
        y: 60,
        icon: <Package className="size-4" />,
        status: 'complete',
        detail: 'Realdeal records the event and the current record snapshot.',
    },
    {
        id: 'sign',
        title: 'Sign payload',
        subtitle: 'HMAC-SHA256',
        x: 210,
        y: 60,
        icon: <ShieldCheck className="size-4" />,
        status: 'complete',
        detail: 'The raw JSON body is signed with your webhook secret.',
    },
    {
        id: 'post',
        title: 'POST webhook',
        subtitle: 'Public HTTPS URL',
        x: 400,
        y: 60,
        icon: <Webhook className="size-4" />,
        status: 'running',
        detail: 'Signed events are delivered to your configured receiver.',
    },
    {
        id: 'verify',
        title: 'Verify signature',
        subtitle: 'Raw body + secret',
        x: 590,
        y: 60,
        icon: <ShieldCheck className="size-4" />,
        status: 'queued',
        detail: 'Compare the signature before parsing or trusting the event.',
    },
    {
        id: 'sync',
        title: 'Sync your system',
        subtitle: 'Return 2xx',
        x: 780,
        y: 60,
        icon: <Code2 className="size-4" />,
        status: 'queued',
        detail: 'Process the event quickly and return 2xx to stop retries.',
    },
];
const webhookEdges: WorkflowEdge[] = [
    { id: 'event-sign', from: 'event', to: 'sign' },
    { id: 'sign-post', from: 'sign', to: 'post' },
    { id: 'post-verify', from: 'post', to: 'verify' },
    { id: 'verify-sync', from: 'verify', to: 'sync' },
];

const errorNodes: WorkflowNode[] = [
    {
        id: 'request',
        title: 'API request',
        subtitle: 'HTTPS + Bearer',
        x: 20,
        y: 40,
        icon: <Code2 className="size-4" />,
        status: 'complete',
        detail: 'Your server sends the request with its token and payload.',
    },
    {
        id: 'guard',
        title: 'Validate',
        subtitle: 'Token, scope, input',
        x: 220,
        y: 40,
        icon: <ShieldCheck className="size-4" />,
        status: 'running',
        detail: 'The API checks credentials, permissions, parameters and state.',
    },
    {
        id: 'success',
        title: '2xx response',
        subtitle: 'Request accepted',
        x: 430,
        y: 20,
        icon: <Check className="size-4" />,
        status: 'complete',
        detail: 'The request is accepted or returns the requested data.',
    },
    {
        id: 'auth',
        title: '401 / 403',
        subtitle: 'Access problem',
        x: 430,
        y: 100,
        icon: <ShieldCheck className="size-4" />,
        status: 'error',
        detail: 'Token is invalid or the integration lacks the required permission.',
    },
    {
        id: 'input',
        title: '409 / 422 / 404 / 429',
        subtitle: 'Request problem',
        x: 430,
        y: 180,
        icon: <CircleHelp className="size-4" />,
        status: 'queued',
        detail: 'Check validation, order state, record ID or rate limit guidance.',
    },
];
const errorEdges: WorkflowEdge[] = [
    { id: 'request-guard', from: 'request', to: 'guard' },
    { id: 'guard-success', from: 'guard', to: 'success' },
    { id: 'guard-auth', from: 'guard', to: 'auth' },
    { id: 'guard-input', from: 'guard', to: 'input' },
];

function ApiWorkflow({
    label,
    nodes,
    edges,
    width = 820,
    height = 280,
}: {
    label: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    width?: number;
    height?: number;
}) {
    return (
        <div className="mt-5 overflow-hidden rounded-2xl border bg-muted/10 p-3 sm:p-4">
            <WorkflowCanvas label={label} nodes={nodes} edges={edges} width={width} height={height} />
        </div>
    );
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

    return (
        <main className="min-h-screen bg-background text-foreground">
            <Head title="Merchant API developer guide" />
            <header className="border-b">
                <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
                    <Link href="/developers/api" className="flex items-center gap-2 font-semibold">
                        <span className="grid size-8 place-items-center rounded-lg border">
                            <Boxes className="size-4" />
                        </span>
                        Realdeal API <span className="rounded-full border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">v1</span>
                    </Link>
                    <nav className="flex items-center gap-2">
                        <a href="#quick-start" className="hidden text-sm text-muted-foreground hover:text-foreground sm:block">
                            Quick start
                        </a>
                        <Button asChild size="sm">
                            <Link href="/login">
                                Sign in <ChevronRight className="ml-1 size-4" />
                            </Link>
                        </Button>
                    </nav>
                </div>
            </header>

            <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
                <section className="grid gap-8 border-b py-12 sm:py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-14 lg:py-20">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] text-muted-foreground">
                            <span className="size-1.5 rounded-full bg-emerald-500" />
                            PUBLIC DEVELOPER DOCUMENTATION
                        </div>
                        <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Connect your system to Realdeal.</h1>
                        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                            Read your orders, products, stock movements, and returns, or submit orders and inbound shipments from the systems your
                            team already uses. This guide walks through access, requests, and event notifications.
                        </p>
                        <div className="mt-6 flex flex-wrap gap-3">
                            <Button asChild>
                                <a href="#quick-start">
                                    Make your first request <ArrowRight className="ml-2 size-4" />
                                </a>
                            </Button>
                            <Button asChild variant="outline">
                                <a href="#webhooks">
                                    Set up webhooks <Webhook className="ml-2 size-4" />
                                </a>
                            </Button>
                        </div>
                    </div>
                    <div className="rounded-[20px] border bg-card p-4 shadow-[inset_0_0_0_1px_var(--border)] sm:p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-semibold">Integration workflow</p>
                                <p className="mt-1 text-xs text-muted-foreground">A typical read and update cycle</p>
                            </div>
                            <Code2 className="size-4 text-muted-foreground" />
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                            {[
                                { n: '01', icon: KeyRound, title: 'Get access', body: 'Merchant creates a key and selects permissions.' },
                                { n: '02', icon: Code2, title: 'Send request', body: 'Your app calls an endpoint with the bearer token.' },
                                { n: '03', icon: Package, title: 'Read data', body: 'Realdeal returns only this merchant’s records.' },
                                { n: '04', icon: Webhook, title: 'Receive events', body: 'Optional signed webhooks notify your app.' },
                            ].map(({ n, icon: Icon, title, body }) => (
                                <div key={n} className="min-w-0 rounded-xl border bg-background p-3">
                                    <div className="flex items-center justify-between">
                                        <Icon className="size-4 text-primary" />
                                        <span className="font-mono text-[10px] text-muted-foreground">{n}</span>
                                    </div>
                                    <h3 className="mt-3 text-xs font-semibold">{title}</h3>
                                    <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{body}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {(() => {
                    const entries: ChangelogEntry[] = [
                        {
                            id: 'quick-start',
                            version: '01',
                            title: 'Make your first request',
                            tags: ['new'],
                            date: '2026-10-29',
                            body: (
                                <>
                                    <SectionTitle eyebrow="01 / QUICK START">
                                        You can integrate with any language or framework that can make HTTPS requests and read JSON. Start with a
                                        token and one GET request.
                                    </SectionTitle>
                                    <ApiWorkflow
                                        label="First request workflow"
                                        nodes={quickStartNodes}
                                        edges={quickStartEdges}
                                        width={840}
                                        height={220}
                                    />
                                    <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
                                        <div className="space-y-3">
                                            {[
                                                [
                                                    'Create a key',
                                                    'Sign in and open Merchant API access. Create an integration and choose the permissions it needs.',
                                                ],
                                                [
                                                    'Store the token safely',
                                                    'Copy the token once and save it in your server environment as RDL_API_TOKEN. Never put it in a browser app or public repository.',
                                                ],
                                                ['Call an endpoint', 'Send the token in the Authorization: Bearer header over HTTPS.'],
                                            ].map(([title, body], index) => (
                                                <div key={title} className="flex gap-3 rounded-xl border p-4">
                                                    <span className="grid size-7 shrink-0 place-items-center rounded-full border font-mono text-xs">
                                                        {index + 1}
                                                    </span>
                                                    <div>
                                                        <h3 className="text-sm font-semibold">{title}</h3>
                                                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{body}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="overflow-hidden rounded-xl border bg-card">
                                            <div className="space-y-3 border-b p-3">
                                                <div>
                                                    <p className="mb-2 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                                                        Choose an endpoint
                                                    </p>
                                                    <div className="flex flex-wrap gap-1">
                                                        {(Object.keys(apiResponseExamples) as ApiResource[]).map((resource) => (
                                                            <button
                                                                key={resource}
                                                                type="button"
                                                                onClick={() => setApiResource(resource)}
                                                                className={`rounded-full px-2.5 py-1.5 text-xs capitalize ${apiResource === resource ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}
                                                            >
                                                                {resource}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <div className="flex flex-wrap gap-1">
                                                        {(Object.keys(examples) as Language[]).map((key) => (
                                                            <button
                                                                key={key}
                                                                type="button"
                                                                onClick={() => setLanguage(key)}
                                                                className={`rounded-full px-2.5 py-1.5 text-xs ${language === key ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}
                                                            >
                                                                {languageLabels[key]}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={copyExample}
                                                        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs"
                                                    >
                                                        {copied ? <Check className="size-3.5" /> : <Code2 className="size-3.5" />}
                                                        {copied ? 'Copied' : 'Copy request'}
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="p-3">
                                                <p className="mb-2 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                                                    Request · GET /api/merchant/v1/{apiResource}
                                                </p>
                                                <CodeBlock code={selectedRequestExample} language={languageLabels[language]} />
                                            </div>
                                            <div className="border-t p-3">
                                                <p className="mb-2 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                                                    Example JSON response
                                                </p>
                                                <CodeBlock code={apiResponseExamples[apiResource]} language="JSON" />
                                            </div>
                                            <p className="border-t px-4 py-3 text-xs text-muted-foreground">
                                                Replace <code className="rounded bg-muted px-1">https://your-domain.example</code> with the Realdeal
                                                host provided to your account. Example records are illustrative.
                                            </p>
                                        </div>
                                    </div>
                                </>
                            ),
                        },
                        {
                            id: 'endpoints',
                            version: '02',
                            title: 'Read data, manage orders and products, or submit shipments',
                            tags: ['improved'],
                            date: '2026-11-06',
                            body: (
                                <>
                                    <SectionTitle eyebrow="02 / API ENDPOINTS">
                                        Each key needs the matching permission. Order and product data is limited to the merchant account connected to
                                        that key. Shipment items must belong to that merchant and the selected warehouse country.
                                    </SectionTitle>
                                    <ApiWorkflow label="API resource workflow" nodes={endpointNodes} edges={endpointEdges} width={640} height={360} />
                                    <div className="overflow-hidden rounded-xl border">
                                        <div className="hidden grid-cols-[100px_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1.2fr)] gap-4 bg-muted/40 px-4 py-3 text-[10px] font-medium tracking-wider text-muted-foreground uppercase md:grid">
                                            <span>Method</span>
                                            <span>Endpoint</span>
                                            <span>Permission</span>
                                            <span>Returns</span>
                                        </div>
                                        {[
                                            ['GET', '/api/merchant/v1/orders', 'orders:read', 'Merchant orders and their current statuses'],
                                            ['POST', '/api/merchant/v1/orders', 'orders:write', 'Submit a new order for processing'],
                                            [
                                                'PATCH',
                                                '/api/merchant/v1/orders/{external_order_id}',
                                                'orders:write',
                                                'Edit order details or cancel an eligible order',
                                            ],
                                            [
                                                'GET',
                                                '/api/merchant/v1/orders/import-status/{external_order_id}',
                                                'orders:write',
                                                'Check an incoming order import status',
                                            ],
                                            [
                                                'POST',
                                                '/api/merchant/v1/shipments',
                                                'shipments:write',
                                                'Create an inbound shipment for a supported warehouse',
                                            ],
                                            ['GET', '/api/merchant/v1/products', 'products:read', 'Product details and available quantities'],
                                            ['POST', '/api/merchant/v1/products', 'products:write', 'Create a product with a merchant-supplied SKU'],
                                            [
                                                'GET',
                                                '/api/merchant/v1/transfers',
                                                'transfers:read',
                                                'Agents with their product transfer summaries in one response',
                                            ],
                                        ].map(([method, path, scope, description]) => (
                                            <div
                                                key={path}
                                                className="grid min-w-0 gap-2 border-t p-3 sm:p-4 md:grid-cols-[100px_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1.2fr)] md:items-center md:gap-4"
                                            >
                                                <span className="w-fit rounded border px-2 py-1 font-mono text-[10px]">{method}</span>
                                                <code className="min-w-0 text-xs break-all">{path}</code>
                                                <code className="min-w-0 text-xs break-all text-muted-foreground">{scope}</code>
                                                <p className="min-w-0 text-xs break-words text-muted-foreground">{description}</p>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                                        <div className="rounded-xl border bg-card p-4">
                                            <h3 className="text-sm font-semibold">Submit an order</h3>
                                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                                Send the documented order fields plus a stable <code>external_order_id</code> from your system. The
                                                external ID makes retries safe. Realdeal assigns the merchant and initial status from the API key.
                                            </p>
                                            <div className="mt-3">
                                                <CodeBlock
                                                    language="JSON"
                                                    code={`{
  "external_order_id": "shop-58192",
  "order_no": "R-58192",
  "order_date": "2026-10-30",
  "amount": 2450.00,
  "quantity": 2,
  "product_name": "Example product",
  "delivery_date": "2026-11-01",
  "client_name": "Jane Customer",
  "address": "Westlands, Nairobi",
  "city": "Nairobi",
  "country": "Kenya",
  "phone": "+254700000000",
  "alt_no": null,
  "instructions": "Call on arrival"
}`}
                                                />
                                            </div>
                                        </div>
                                        <div className="rounded-xl border bg-card p-4">
                                            <h3 className="text-sm font-semibold">Queued response · HTTP 202 Accepted</h3>
                                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                                A new order returns <code>HTTP 202 Accepted</code> while it is queued for processing. This confirms
                                                acceptance, not that processing has finished. Poll the status route using the same external ID to
                                                check the final result. Repeating the same ID and payload is safe; reusing it with changed data
                                                returns HTTP 409.
                                            </p>
                                            <div className="mt-3">
                                                <CodeBlock
                                                    language="JSON"
                                                    code={`{
  "accepted": true,
  "duplicate": false,
  "external_order_id": "shop-58192",
  "order_no": "R-58192",
  "status": "pending",
  "request_id": 812
}`}
                                                />
                                            </div>
                                            <p className="mt-3 text-xs leading-5 text-muted-foreground">
                                                The status route returns <code>pending</code>, <code>processing</code>, <code>processed</code>,{' '}
                                                <code>failed</code>, or <code>skipped</code>. Failed or skipped submissions can be retried with the
                                                same ID and payload.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                                        <div className="rounded-xl border bg-card p-4">
                                            <h3 className="text-sm font-semibold">Edit an order</h3>
                                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                                Use the external order ID from your original POST. Customer and order details can be changed only
                                                after import finishes and before dispatch or inventory deduction. Orders with <code>Dispatched</code>{' '}
                                                or <code>Delivered</code> status cannot be edited; those requests return HTTP 409.
                                            </p>
                                            <div className="mt-3">
                                                <CodeBlock
                                                    language="HTTP + JSON"
                                                    code={`PATCH /api/merchant/v1/orders/shop-58192
Authorization: Bearer $RDL_API_TOKEN
Content-Type: application/json

{
  "client_name": "Jane Customer",
  "phone": "+256700000000",
  "address": "Plot 10, Kampala",
  "quantity": 2
}`}
                                                />
                                            </div>
                                        </div>
                                        <div className="rounded-xl border bg-card p-4">
                                            <h3 className="text-sm font-semibold">Cancel an order</h3>
                                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                                Use the same PATCH endpoint to set status to <code>New Orders</code>, <code>Scheduled</code>, or{' '}
                                                <code>Cancelled</code>. Cancellation is allowed after import finishes but before dispatch or inventory
                                                deduction. Merchants cannot set <code>Dispatched</code> or <code>Delivered</code>; orders already in
                                                those states cannot be edited or have their status changed.
                                            </p>
                                            <div className="mt-3">
                                                <CodeBlock
                                                    language="HTTP + JSON"
                                                    code={`PATCH /api/merchant/v1/orders/shop-58192
Authorization: Bearer $RDL_API_TOKEN
Content-Type: application/json

{ "status": "Scheduled" }`}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                                        <div className="rounded-xl border bg-card p-4">
                                            <h3 className="text-sm font-semibold">Create a product with your SKU</h3>
                                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                                Requires <code>products:write</code>. Send the merchant's SKU in <code>sku</code>; it is stored as the
                                                product's <code>code</code> without imposing a format. It must be unique. Merchant ownership comes
                                                from the API key, and the country must be configured in Realdeal; merchants can use any configured
                                                country. Quantity, quantity alert, buying price, and selling price default to zero. Category defaults
                                                to the standard category (ID 10 when configured, otherwise the first existing category); send{' '}
                                                <code>category_id</code> to choose another one. Product reads include both <code>code</code> and its{' '}
                                                <code>sku</code> alias.
                                            </p>
                                            <div className="mt-3">
                                                <CodeBlock
                                                    language="JSON"
                                                    code={`POST /api/merchant/v1/products
Authorization: Bearer $RDL_API_TOKEN
Content-Type: application/json

{
  "name": "Example product",
  "sku": "CSW-UG-ABC1234567",
  "country": "Uganda",
  "quantity": 0,
  "quantity_alert": 0,
  "buying_price": 0,
  "selling_price": 0
}`}
                                                />
                                            </div>
                                            <p className="mt-3 text-xs text-muted-foreground">
                                                Success returns HTTP 201 with the new product ID, SKU, country, quantity, quantity alert, prices, and
                                                selected category. Quantity alert and prices default to zero if omitted. To receive product webhooks,
                                                also grant <code>products:read</code> and subscribe to the event.
                                            </p>
                                        </div>
                                        <div className="rounded-xl border bg-card p-4">
                                            <h3 className="text-sm font-semibold">Order status values</h3>
                                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                                Order reads return the stored status, preserving capitalization. Blank status is presented as{' '}
                                                <code>New Orders</code>. Integrators can use these status values and meanings:
                                            </p>
                                            <ul className="mt-3 grid gap-1 text-xs leading-5 text-muted-foreground sm:grid-cols-2">
                                                {[
                                                    ['New Orders', 'New order awaiting call centre review'],
                                                    ['Scheduled', 'Delivery has been scheduled'],
                                                    ['Rescheduled', 'Delivery date changed and rescheduled'],
                                                    ['Dispatched', 'Assigned and handed to an agent'],
                                                    ['Delivered', 'Delivery completed'],
                                                    ['Returned', 'Order was returned'],
                                                    ['Cancelled', 'Cancelled before dispatch'],
                                                    ['Followup', 'Call centre needs another customer follow-up'],
                                                    ['Pending', 'Awaiting a delivery outcome'],
                                                    ['Duplicate', 'Identified as a duplicate order'],
                                                    ['OutofStock', 'Product unavailable for fulfilment'],
                                                    ['Expired', 'Order is no longer active'],
                                                    ['WrongContact', 'Customer contact details are invalid'],
                                                ].map(([status, meaning]) => (
                                                    <li key={status} className="flex flex-wrap items-center gap-2">
                                                        <span
                                                            className={`inline-flex w-fit items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium ${orderStatusBadgeColors[status] ?? 'border-border bg-muted text-foreground'}`}
                                                        >
                                                            {status}
                                                        </span>
                                                        <span>— {meaning}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                            <p className="mt-3 text-xs leading-5 text-muted-foreground">
                                                This list is the order status contract for integrations. Values are case-sensitive as returned. The
                                                import-status endpoint is separate and returns <code>pending</code>, <code>processing</code>,{' '}
                                                <code>processed</code>, <code>failed</code>, or <code>skipped</code>.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="mt-5 rounded-xl border bg-card p-4">
                                        <h3 className="text-sm font-semibold">Create an inbound shipment</h3>
                                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                            Send <code>POST /api/merchant/v1/shipments</code> with the <code>shipments:write</code> permission.
                                            Supplier and warehouse are required. Each item uses a product name, optional SKU, and expected quantity—no
                                            product ID is needed. An existing SKU is reused only if it belongs to your merchant and the warehouse
                                            country. A new product is created with zero stock; this also requires <code>products:write</code>. The API
                                            generates the shipment number and starts it with <code>EXPECTED</code> status.
                                        </p>
                                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
                                            <div>
                                                <p className="mb-2 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                                                    Request · HTTP POST
                                                </p>
                                                <CodeBlock
                                                    language="JSON"
                                                    code={`{
  "supplier": "Example Supplier",
  "supplier_reference": "PO-2026-1042",
  "carrier": "Example Freight",
  "tracking_number": "TRK-482901",
  "expected_on": "2026-11-25",
  "cartons": 12,
  "warehouse_code": "NAI1",
  "note": "Handle cartons with care",
  "items": [
    { "product_name": "Windproof Lighter", "product_code": "SKU-123", "expected_quantity": 24 },
    { "product_name": "Canvas Travel Bag", "expected_quantity": 10 }
  ]
}`}
                                                />
                                            </div>
                                            <div>
                                                <p className="mb-2 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                                                    Response · HTTP 201 Created
                                                </p>
                                                <CodeBlock
                                                    language="JSON"
                                                    code={`{
  "message": "Shipment created.",
  "shipment": {
    "id": 42,
    "shipment_number": "IN-NAI1-00042",
    "supplier": "Example Supplier",
    "supplier_reference": "PO-2026-1042",
    "carrier": "Example Freight",
    "tracking_number": "TRK-482901",
    "expected_on": "2026-11-25",
    "cartons": 12,
    "warehouse_code": "NAI1",
    "warehouse_name": "Real deal",
    "country": "Kenya",
    "status": "EXPECTED",
    "note": "Handle cartons with care",
    "items": [
      {
        "product_name": "Windproof Lighter",
        "product_code": "SKU-123",
        "expected_quantity": 24,
        "received_quantity": 0
      }
    ]
  }
}`}
                                                />
                                            </div>
                                        </div>
                                        <div className="mt-4">
                                            <h4 className="text-xs font-semibold">Request fields</h4>
                                            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                                {[
                                                    ['supplier', 'Required', 'Supplier or origin name.'],
                                                    ['warehouse_code', 'Required', 'Receiving warehouse code, such as NAI1 or UG-WH.'],
                                                    ['items', 'Required', 'Array with at least one shipment item.'],
                                                    ['items[].product_name', 'Required', 'Product name. A product record is created if needed.'],
                                                    [
                                                        'items[].product_code',
                                                        'Optional',
                                                        'SKU/code. An existing SKU is reused for this merchant and country; a new product gets a generated SKU if omitted.',
                                                    ],
                                                    [
                                                        'items[].expected_quantity',
                                                        'Required',
                                                        'Expected units for this product; integer from 1 to 10,000,000.',
                                                    ],
                                                    ['supplier_reference', 'Optional', 'Your purchase order or supplier reference.'],
                                                    ['carrier', 'Optional', 'Carrier or courier name.'],
                                                    ['tracking_number', 'Optional', 'Carrier tracking reference.'],
                                                    ['expected_on', 'Optional', 'Expected arrival date in YYYY-MM-DD format.'],
                                                    ['cartons', 'Optional', 'Carton count; integer from 0 to 100,000.'],
                                                    ['note', 'Optional', 'Note for the receiving team.'],
                                                ].map(([field, requirement, description]) => (
                                                    <div key={field} className="min-w-0 rounded-lg border bg-muted/20 p-2.5">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <code className="text-[11px] break-all">{field}</code>
                                                            <span
                                                                className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase ${requirement === 'Required' ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-border bg-background text-muted-foreground'}`}
                                                            >
                                                                {requirement}
                                                            </span>
                                                        </div>
                                                        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{description}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <p className="mt-3 text-xs leading-5 text-muted-foreground">
                                            Each African country has a receiving warehouse option; existing named warehouses keep their current codes,
                                            and other country hubs use the country’s ISO code followed by <code>-WH</code> (for example,{' '}
                                            <code>UG-WH</code>). If a new product needs to be created, the integration must also have{' '}
                                            <code>products:write</code>. New products start with zero stock; received quantities are added to
                                            inventory when the shipment is received.
                                        </p>
                                    </div>
                                    <div className="mt-5 rounded-xl border bg-card p-4">
                                        <h3 className="text-sm font-semibold">Transfers page data in one request</h3>
                                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                            Call <code>GET /api/merchant/v1/transfers</code> to receive all agents who have transfers for this
                                            merchant, with each agent’s product totals nested under them. This matches the Transfers page’s agent
                                            cards and product summary. It includes transferred, deducted and remaining quantities, plus first and last
                                            transfer dates. Results remain limited to products belonging to the API key’s merchant.
                                        </p>
                                        <div className="mt-3">
                                            <CodeBlock
                                                language="JSON"
                                                code={`{
  "data": [
    {
      "id": 15,
      "name": "Sam Agent",
      "store_name": "Westlands",
      "store_phone": "+254700000000",
      "transfer_count": 5,
      "total_transferred": 38,
      "total_deducted": 4,
      "last_transfer_at": "2026-10-29T08:15:00.000000Z",
      "remaining_quantity": 34,
      "products": [
        {
          "product_id": 72,
          "product_name": "Windproof Lighter",
          "product_code": "SKU-123",
          "merchant": "Example Merchant",
          "transfer_count": 3,
          "total_quantity": 20,
          "total_deducted": 2,
          "remaining_quantity": 18,
          "first_transfer_date": "2026-10-20T09:00:00.000000Z",
          "last_transfer_date": "2026-10-29T08:15:00.000000Z"
        }
      ]
    }
  ],
  "current_page": 1,
  "per_page": 50,
  "total": 1
}`}
                                            />
                                        </div>
                                        <p className="mt-3 text-xs leading-5 text-muted-foreground">
                                            Use <code>?per_page=50</code> to paginate agents. Add <code>?agent_id=15</code> to return only one agent.
                                            Use <code>?view=movements</code> for the flat sent/returned movement feed.
                                        </p>
                                        <div className="mt-4 border-t pt-4">
                                            <p className="mb-2 text-xs font-semibold">Read and display the nested response</p>
                                            <CodeBlock
                                                language="JavaScript"
                                                code={`const response = await fetch(
  'https://your-domain.example/api/merchant/v1/transfers?per_page=50',
  { headers: { Authorization: \`Bearer \${process.env.RDL_API_TOKEN}\`, Accept: 'application/json' } }
);

if (!response.ok) throw new Error(\`Transfers API returned \${response.status}\`);
const page = await response.json();

for (const agent of page.data) {
  console.log(agent.name, agent.total_transferred, agent.remaining_quantity);
  for (const product of agent.products) {
    console.log(product.product_name, product.transfer_count,
      product.total_quantity, product.total_deducted, product.remaining_quantity);
  }
}`}
                                            />
                                        </div>
                                        <p className="mt-4 border-t pt-4 text-xs leading-5 text-muted-foreground">
                                            This is a live summary: each request recalculates the totals from transfer and deduction records, so new
                                            activity appears in the next response. The endpoint returns agents who have transfers for this merchant,
                                            with each agent’s product rows nested in the same response. Add <code>?agent_id=15</code> to fetch just
                                            one agent.
                                        </p>
                                    </div>
                                    <div className="mt-5 overflow-hidden rounded-xl border bg-card">
                                        <div className="border-b p-3">
                                            <h3 className="text-sm font-semibold">Example API response payloads</h3>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                These are representative paginated responses. Your actual records and values will differ.
                                            </p>
                                            <div className="mt-3 flex flex-wrap gap-1">
                                                {(Object.keys(apiResponseExamples) as ApiResource[]).map((resource) => (
                                                    <button
                                                        key={resource}
                                                        type="button"
                                                        onClick={() => setApiResource(resource)}
                                                        className={`rounded-full px-3 py-1.5 text-xs capitalize ${apiResource === resource ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}
                                                    >
                                                        {resource}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="p-3">
                                            <CodeBlock language="JSON" code={apiResponseExamples[apiResource]} />
                                        </div>
                                        <p className="border-t px-4 py-3 text-xs leading-5 text-muted-foreground">
                                            The default transfers response groups products under each agent. Add <code>?view=movements</code> to get
                                            individual sent and returned records with a <code>movement_type</code> of <code>sent</code> or{' '}
                                            <code>returned</code>.
                                        </p>
                                    </div>
                                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                                        <div className="rounded-xl border p-4">
                                            <h3 className="text-sm font-semibold">Pagination and incremental sync</h3>
                                            <p className="mt-2 text-xs leading-5 text-muted-foreground">
                                                Responses include <code>data</code>, <code>current_page</code>, <code>next_page_url</code>, and other
                                                pagination details. Use <code>?per_page=50</code> (maximum 100) to choose page size. Use{' '}
                                                <code>&amp;updated_since=2026-10-01T00:00:00Z</code> to fetch records changed since a timestamp.
                                            </p>
                                            <CodeBlock
                                                language="URL"
                                                code="GET /api/merchant/v1/orders?per_page=50&amp;updated_since=2026-10-01T00:00:00Z"
                                            />
                                        </div>
                                        <div className="rounded-xl border p-4">
                                            <h3 className="text-sm font-semibold">Optional movement feed</h3>
                                            <p className="mt-2 text-xs leading-5 text-muted-foreground">
                                                Use <code>?view=movements</code> when you need individual outgoing stock and return records. The{' '}
                                                <code>movement_type</code> distinguishes <code>sent</code> from <code>returned</code>; a return may
                                                include a reason and return code.
                                            </p>
                                            <div className="mt-3 flex gap-2">
                                                <span className="rounded-full border px-2.5 py-1 font-mono text-[10px]">sent</span>
                                                <span className="rounded-full border px-2.5 py-1 font-mono text-[10px]">returned</span>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ),
                        },
                        {
                            id: 'webhooks',
                            version: '03',
                            title: 'Use webhooks for changes',
                            tags: ['new'],
                            date: '2026-11-16',
                            body: (
                                <>
                                    <SectionTitle eyebrow="03 / EVENT DELIVERY">
                                        Webhooks notify your server when selected order, product, or stock movement events happen. For transfers, use
                                        the event to know when to refresh the agent and product summary from the transfers endpoint. Configure a
                                        public HTTPS receiver and choose events in Merchant API access.
                                    </SectionTitle>
                                    <ApiWorkflow
                                        label="Webhook delivery workflow"
                                        nodes={webhookNodes}
                                        edges={webhookEdges}
                                        width={970}
                                        height={220}
                                    />
                                    <div className="mb-5 rounded-xl border bg-muted/20 p-4 sm:p-5">
                                        <h3 className="text-sm font-semibold">Connect the receiver to Realdeal</h3>
                                        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                            {[
                                                [
                                                    '1 · Add receiver code',
                                                    'Add one of the examples below to your server. It checks the signature and accepts incoming event POSTs.',
                                                ],
                                                [
                                                    '2 · Deploy over HTTPS',
                                                    'Deploy the route at a public HTTPS URL, for example https://merchant.example/webhooks/rdl.',
                                                ],
                                                [
                                                    '3 · Configure the integration',
                                                    'In Realdeal, open Merchant API access → Edit integration settings. Save the URL and select events.',
                                                ],
                                                [
                                                    '4 · Save secret and test',
                                                    'Copy the signing secret into your server environment, then choose Save and test webhook.',
                                                ],
                                            ].map(([title, text]) => (
                                                <div key={title} className="rounded-lg border bg-background p-3">
                                                    <p className="text-xs font-semibold">{title}</p>
                                                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{text}</p>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="mt-3 text-xs leading-5 text-muted-foreground">
                                            The receiver code runs on the merchant’s server. The URL and event subscriptions are saved in Realdeal’s
                                            integration settings; a separate API call to register the webhook is not required.
                                        </p>
                                    </div>
                                    <div className="grid gap-5 lg:grid-cols-2">
                                        <div className="space-y-4">
                                            <div className="rounded-xl border p-4">
                                                <div className="flex items-center gap-2">
                                                    <Webhook className="size-4 text-primary" />
                                                    <h3 className="text-sm font-semibold">Events you can subscribe to</h3>
                                                </div>
                                                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                                    {[
                                                        'order.created',
                                                        'order.updated',
                                                        'product.created',
                                                        'product.updated',
                                                        'transfer.created',
                                                        'transfer.returned',
                                                    ].map((event) => (
                                                        <code key={event} className="rounded-lg border bg-muted/30 px-3 py-2 text-xs">
                                                            {event}
                                                        </code>
                                                    ))}
                                                </div>
                                                <p className="mt-3 text-[10px] leading-5 text-muted-foreground">
                                                    Order events require <code>orders:read</code>, product events require <code>products:read</code>,
                                                    and transfer events require <code>transfers:read</code>.
                                                </p>
                                            </div>
                                            <div className="rounded-xl border p-4">
                                                <h3 className="text-sm font-semibold">What your server receives</h3>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    Realdeal sends a POST with JSON. Both <code>order.created</code> and <code>order.updated</code>{' '}
                                                    include the full current order snapshot, not only the changed fields. Order events also include{' '}
                                                    <code>call_count</code>, the number of instruction history entries recorded for that order.
                                                </p>
                                                <div className="mt-3 space-y-2 font-mono text-[11px]">
                                                    <p className="rounded bg-muted/50 p-2">X-RDL-Event: order.created or order.updated</p>
                                                    <p className="rounded bg-muted/50 p-2">X-RDL-Signature: sha256=&lt;signature&gt;</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="rounded-xl border bg-card p-4">
                                            <h3 className="text-sm font-semibold">Order webhook payload example</h3>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                This envelope and data shape apply to both order events. For <code>order.updated</code>,{' '}
                                                <code>data</code> contains the latest values for all listed fields, not just the fields that changed.
                                            </p>
                                            <div className="mt-3">
                                                <CodeBlock
                                                    language="JSON"
                                                    code={`{
  "id": "event-uuid",
  "type": "order.created",
  "created_at": "2026-10-29T08:15:00+00:00",
  "data": {
    "id": 1842,
    "order_no": "ORD-2026-1042",
    "order_date": "2026-10-29T00:00:00.000000Z",
    "amount": "2500.00",
    "quantity": 1,
    "product_name": "Windproof Lighter",
    "delivery_date": "2026-10-30T00:00:00.000000Z",
    "client_name": "Jane Doe",
    "address": "Westlands",
    "city": "Nairobi",
    "country": "Kenya",
    "phone": "+254700000000",
    "alt_no": null,
    "status": null,
    "code": null,
    "confirmed": false,
    "created_at": "2026-10-29T08:15:00.000000Z",
    "updated_at": "2026-10-29T08:15:00+00:00",
    "edited_at": null,
    "call_count": 0
  }
}`}
                                                />
                                            </div>
                                            <p className="mt-3 text-xs leading-5 text-muted-foreground">
                                                Verify the signature using the raw request body and the webhook signing secret. Return a 2xx response
                                                promptly; non-2xx responses are retried. Transfer events are listed in the event examples below.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4">
                                        <p className="flex items-center gap-2 text-sm font-semibold">
                                            <ShieldCheck className="size-4" />
                                            Verify the signature before processing
                                        </p>
                                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                            Compute HMAC-SHA256 over the exact raw JSON body using your webhook secret. Compare it with the hex value
                                            after <code>sha256=</code> in <code>X-RDL-Signature</code>, using a constant-time comparison. The test
                                            button sends the signed event <code>integration.test</code>.
                                        </p>
                                    </div>
                                    <div className="mt-5 overflow-hidden rounded-xl border bg-card">
                                        <div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center sm:justify-between">
                                            <div>
                                                <h3 className="text-sm font-semibold">Webhook receiver code</h3>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    Verify the signature against the raw request body, then parse the JSON.
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-1">
                                                {(Object.keys(webhookExamples) as WebhookLanguage[]).map((key) => (
                                                    <button
                                                        key={key}
                                                        type="button"
                                                        onClick={() => {
                                                            setWebhookLanguage(key);
                                                            setWebhookCopied(false);
                                                        }}
                                                        className={`rounded-full px-2.5 py-1.5 text-xs ${webhookLanguage === key ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}
                                                    >
                                                        {webhookLanguageLabels[key]}
                                                    </button>
                                                ))}
                                                <button
                                                    type="button"
                                                    onClick={copyWebhookExample}
                                                    className="ml-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs"
                                                >
                                                    {webhookCopied ? <Check className="size-3.5" /> : <Code2 className="size-3.5" />}
                                                    {webhookCopied ? 'Copied' : 'Copy code'}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="p-3">
                                            <CodeBlock code={webhookExamples[webhookLanguage]} language={webhookLanguageLabels[webhookLanguage]} />
                                        </div>
                                        <p className="border-t px-4 py-3 text-xs leading-5 text-muted-foreground">
                                            Set <code>RDL_WEBHOOK_SECRET</code> to the signing secret shown when you create or configure the webhook.
                                            Do not JSON-parse or modify the request body before checking its signature. Return HTTP 2xx after
                                            accepting the event.
                                        </p>
                                    </div>
                                    <div className="mt-5 overflow-hidden rounded-xl border bg-card">
                                        <div className="border-b p-4">
                                            <h3 className="text-sm font-semibold">Example data for every webhook event</h3>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                Each example below is the event’s <code>data</code> object inside the common webhook envelope shown
                                                above. Created and updated order events include the same full set of fields; updated events carry
                                                current values for the whole order.
                                            </p>
                                        </div>
                                        <div className="divide-y">
                                            {Object.entries(webhookEventExamples).map(([event, data]) => (
                                                <div
                                                    key={event}
                                                    className="grid min-w-0 gap-2 p-3 sm:p-4 md:grid-cols-[180px_minmax(0,1fr)] md:items-start"
                                                >
                                                    <code className="min-w-0 text-xs font-semibold break-all">{event}</code>
                                                    <code className="min-w-0 rounded-md bg-muted/40 p-2 font-mono text-[10px] leading-5 break-all">
                                                        {data}
                                                    </code>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="border-t px-4 py-3 text-xs leading-5 text-muted-foreground">
                                            The webhook envelope also includes a unique <code>id</code>, the event <code>type</code>, and{' '}
                                            <code>created_at</code>. Transfer field permissions can limit transfer data fields;{' '}
                                            <code>movement_type</code> is always included.
                                        </p>
                                    </div>
                                </>
                            ),
                        },
                        {
                            id: 'errors',
                            version: '04',
                            title: 'Handle common responses',
                            tags: ['fixed'],
                            date: '2026-11-20',
                            body: (
                                <>
                                    <SectionTitle eyebrow="04 / TROUBLESHOOTING">
                                        Check the HTTP status first. Error responses include a JSON <code>message</code>; validation errors can also
                                        include an <code>errors</code> object.
                                    </SectionTitle>
                                    <ApiWorkflow label="Response workflow" nodes={errorNodes} edges={errorEdges} width={640} height={280} />
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {[
                                            ['401', 'Token missing, invalid, or revoked. Check the bearer token and integration status.'],
                                            ['403', 'The integration does not have the required permission, or merchant API access is disabled.'],
                                            ['422', 'A query value is invalid. Check the validation message and correct the request.'],
                                            [
                                                '409',
                                                'The order is being processed, already cancelled, or past the point where merchant edits/cancellation are allowed.',
                                            ],
                                            ['404', 'The external order ID or requested record was not found for this integration.'],
                                            ['429', 'Rate limit reached. Wait briefly before retrying.'],
                                        ].map(([code, text]) => (
                                            <div key={code} className="rounded-xl border p-4">
                                                <p className="font-mono text-lg font-semibold">{code}</p>
                                                <p className="mt-2 text-xs leading-5 text-muted-foreground">{text}</p>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-5 flex flex-col gap-4 rounded-xl border bg-muted/20 p-5 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <h3 className="text-sm font-semibold">Ready to connect?</h3>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                Sign in to create an integration and copy your API credentials.
                                            </p>
                                        </div>
                                        <Button asChild>
                                            <Link href="/login">
                                                Open merchant API access <ArrowRight className="ml-2 size-4" />
                                            </Link>
                                        </Button>
                                    </div>
                                    <p className="mt-6 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                                        <CircleHelp className="mt-0.5 size-4 shrink-0" />
                                        Keep API tokens and webhook secrets on your server. Never share them in browser code, screenshots, or support
                                        tickets.
                                    </p>
                                </>
                            ),
                        },
                    ];
                    return <ChangelogTrace entries={entries} initialCount={5} />;
                })()}
            </div>
            <footer className="border-t">
                <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
                    <span>Realdeal Merchant API · v1</span>
                    <span>HTTPS · JSON · Bearer token authentication</span>
                </div>
            </footer>
        </main>
    );
}
