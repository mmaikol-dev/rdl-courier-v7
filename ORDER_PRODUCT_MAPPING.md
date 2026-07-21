# Order → Product Mapping & Auto-Deduction

## Current State

The system already has partial infrastructure but **no auto-mapping**:

- `sheet_orders.product_name` exists as **free text** — never resolved to a `products.id`
- `inventory_product_id` on `sheet_orders` is only set **after manual deduction** in `InventoryDeductionController`
- Shopify imports collapse line items into a comma-joined string, losing per-item data
- No `order_items` pivot table exists — one order = one product_name string

## The Gap

Every import path (Google Sheets, CSV, Shopify, manual) stores `product_name` as text. The `InventoryDeductionController` then requires a human to manually pick which product each order maps to.

---

## Phase 1: Auto-Match on Import

### Concept

When an order arrives with `product_name = "Blue Widget"`, try to find a matching `Product` record automatically and store the FK.

### Matching Strategy (in priority order)

**1. Exact match by name + merchant + country**

```
Order:  product_name="Blue Widget", merchant="Shop A", country="Kenya"
Query:  Product::where('name', 'Blue Widget')
            ->where('merchant', 'Shop A')
            ->where('country', 'Kenya')
            ->first()
Result: ✅ Found → set inventory_product_id = 42
```

**2. Code match**

```
Order:  product_name="PC-00042"
Query:  Product::where('code', 'PC-00042')
            ->where('merchant', 'Shop A')
            ->first()
Result: ✅ Found → set inventory_product_id = 42
```

**3. Fuzzy match (Levenshtein / LIKE)**

```
Order:  product_name="Blue Widgit"  (typo)
Query:  Product::where('name', 'LIKE', '%Blue Wid%')
            ->where('merchant', 'Shop A')
            ->first()
Result: ✅ Found "Blue Widget" → set inventory_product_id = 42
```

**4. No match → flag for manual resolution**

```
Order:  product_name="Mystery Item"
Result: ❌ No match → leave inventory_product_id = null
        Add to a "unmatched orders" queue visible in the deduction UI
```

### Where to hook this in

```
SheetOrderImportService::import()  ← line ~40 where product_name is validated
```

After the SheetOrder is created, run the auto-match. Same for:

- `ImportController::store()` (CSV import)
- `ImportShopifyOrders` command (Shopify)
- `SheetOrderController::store()` (manual creation)

### Deduction flow after auto-match

```
Before:  User opens InventoryDeductionController → sees unmatched orders → manually picks product
After:   User opens InventoryDeductionController → orders already have product_id → just confirm quantities → deduct
```

### Edge cases to handle

| Case | Solution |
|------|----------|
| Two products with same name, different merchants | Filter by `merchant` + `country` |
| Shopify sends variant titles ("Blue Widget - Large") | Strip size/color suffixes before matching |
| Product renamed after import | Use `product.code` as primary key when available |
| Multiple line items per order | Phase 1 can only handle one product per order — this is a known limitation |

---

## Phase 2: Order Items Table

### Concept

Instead of storing one `product_name` string on `sheet_orders`, create a child table that holds individual line items, each linked to a product.

### Schema

```
order_items:
  id                bigint PK
  sheet_order_id    bigint FK → sheet_orders.id (cascade delete)
  product_id        bigint FK → products.id (nullable, set after auto-match)
  product_name      string   (raw name from import source)
  quantity          integer
  unit_price        decimal (nullable)
  created_at        timestamp
  updated_at        timestamp
```

### Data flow example

**Shopify import (before):**

```
Shopify order:
  line_items: [
    { name: "Blue Widget", quantity: 2, price: 15.00 },
    { name: "Red Gadget",  quantity: 1, price: 25.00 }
  ]

sheet_orders:
  product_name = "Blue Widget, Red Gadget"   ← lost per-item quantity
  quantity = 3                                ← summed, can't split
```

**Shopify import (after):**

```
sheet_orders:
  (no product_name or quantity here anymore)

order_items:
  | product_name | quantity | product_id |
  |--------------|----------|------------|
  | Blue Widget  | 2        | 42 (auto)  |
  | Red Gadget   | 1        | 17 (auto)  |
```

### Auto-match in the new model

```
OrderItem::boot():
  creating → run fuzzy match against Product table
             set product_id if found
```

### Deduction flow with order_items

```
InventoryDeductionController now:
  1. Shows delivered orders grouped by their order_items
  2. Each item already has product_id (auto-matched)
  3. User reviews: "Order #123 → 2x Blue Widget (PC-00042) → deduct from stock"
  4. Confirms → stock deducted per item
```

### Relationships to add

```
SheetOrder:
  hasMany(OrderItem::class)        ← replaces linkedProduct()

Product:
  hasMany(OrderItem::class)        ← "which orders use this product"

OrderItem:
  belongsTo(SheetOrder::class)
  belongsTo(Product::class)
```

### Migration strategy for existing data

```
1. Create order_items table
2. For each existing sheet_order with a product_name:
   - Split by comma (Shopify legacy data)
   - Create one OrderItem per segment
   - Run auto-match to set product_id
3. Keep sheet_orders.product_name as read-only fallback
4. New imports go directly to order_items
```

---

## Summary: What Each Phase Buys You

| Capability | Phase 1 | Phase 2 |
|------------|---------|---------|
| Auto-match single-product orders | ✅ | ✅ |
| Multi-product orders | ❌ | ✅ |
| Per-line-item quantity tracking | ❌ | ✅ |
| Manual deduction step eliminated | ✅ | ✅ |
| Shopify line items preserved | ❌ | ✅ |
| Complexity | Low | Medium |
| Database changes | None (just populate existing column) | New table + migration |
| Import service changes | Add matching logic | Add matching + split logic |

**Recommendation:** Start with Phase 1 to get immediate value, then graduate to Phase 2 when multi-product orders become a real need.
