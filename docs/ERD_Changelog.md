# ERD Update (v3) — Web app tables (Assignment #4)

**Why:** The web app turns the catalog into a marketplace. Several sellers can now offer the same catalog item at their own
price, and Contractors collect offers in a cart before ordering. This needed two new tables and two new columns. Each
change is a numbered SQL file in `db/init/`, so a fresh database gets the same schema.

**Entity count:** MVP 13 (was 11), Full Version 18 (was 16).

| # | Table | Change | Reason | File |
|---|---|---|---|---|
| 1 | Categories | Added `description` (VARCHAR(255), optional) | Shown on the category cards; the Admin edits it. The 10 ETL categories get a short description. | `03_categories_description.sql`, `08_category_descriptions.sql` |
| 2 | Listings (new) | `listing_id` PK, `item_id` FK → Items, `seller_id` FK → Users, `price`, `stock`, `min_order`, `lead_days`, `description`, `created_at`; UNIQUE (`item_id`, `seller_id`) | One seller's offer for one catalog item. This is the many-to-many table between sellers and items that v2 listed under "Future improvement". `price` is DECIMAL(12,2) like `avg_price`; CHECK constraints keep price, stock and lead time ≥ 0 and the minimum order ≥ 1. | `04`, `05`, `06_listings_*.sql` |
| 3 | Users | Added `description` (VARCHAR(255)), filled by the ETL from companies.tsv | The company's own business description, shown to buyers as the seller's "About" text. Before v3 it was only used to derive `account_type`. | `01_etl.sql` |
| 4 | CartItems (new) | `cart_item_id` PK, `buyer_id` FK → Users, `listing_id` FK → Listings (ON DELETE CASCADE), `quantity` (≥ 1), `added_at`; UNIQUE (`buyer_id`, `listing_id`) | A Contractor's cart before ordering. When a seller deletes a listing, it simply disappears from carts. | `09_cart_items.sql` |
| 5 | Items | Added `is_reviewed` (BOOLEAN, default TRUE); `source_material_id` and `avg_price` may now be NULL | A seller can add a product that is not in the catalog yet. It gets `is_reviewed` = FALSE (shown as "New") until the Admin has checked it, has no source material ID and no market average yet. | `12_seller_products.sql` |
| 6 | MarketListings (view, not a table) | `SELECT` of the Listings whose seller is not a Rejected Supplier | When the Admin rejects a Supplier, their products disappear from every buyer page without being deleted; undoing the rejection brings them back. Buyer pages read `MarketListings`, seller and Admin pages read `Listings`. | `13_admin_review.sql` |
| 7 | Suppliers | Added `review_note` (VARCHAR(255), optional); Full Version ERD now also shows `verification_status` | The Admin approves a Supplier when the company is legit (an ISO certificate helps but is not required) and must give a reason when rejecting one. The Supplier sees the reason in My Products. | `14_supplier_review_note.sql` |

**Notifications** (already in the MVP ERD) is now used: the app writes a message to a seller when the Admin approves or
rejects them, removes one of their listings, or approves, renames, merges or removes a product they added.

**Items.listed_by** no longer says who *sells* an item (that is in `Listings`, several sellers per item). It now records
the seller who *added* a product in the app; it is NULL for the products that came from the source data.

**Item names** (ETL step 2.6): a part in brackets is attached to the part before it ("Fine aggregate (Coarse sand, for
mixing)" instead of "Fine aggregate - (Coarse sand, for mixing)"), names that are only a bracket lose the brackets, and
material 67827638, whose source name is only "(Used as a crusher)", is renamed "Crawler type (used as a crusher)" like the
similar rows 205, 206 and 251.

**Demo data** (the source data has no sellers' offers or certificates): an Admin account (`02_admin_user.sql`), about 1,100
demo offers from 21 Suppliers and all 27 Rental partners with made-up sample descriptions (`07_demo_listings.sql`),
3 demo projects for the demo Contractor (`10_demo_projects.sql`), made-up ISO certificates marked "(demo)" for about
70% of Suppliers, who are then 'Approved' (`11_demo_certifications.sql`), and for the Admin pages 6 more certificates
"waiting for review" plus 3 seller-added "New" products with their listings (`13_admin_review.sql`).

---

# ERD Update (v2) — Changelog

**Why:** The professor's TSV files (materials, companies, transactions) don't fit the original ERD in a few places, and we don't need every column or every item provided. We kept only the data Project Flow uses: **materials sold by suppliers** and **equipment rented by equipment rental companies** (machines and rentable site equipment such as temporary lighting, movable barriers and temporary toilets), stored in one catalog that users can search by category. Construction work done by subcontractors (installation, excavation, scaffolding erection) is out of scope. The changes apply to both the MVP and Full Version diagrams.

**Entity count:** MVP 11 (was 11), Full Version 16 (was 16). MaterialList and EquipmentList are merged into Items, Categories is new, and OrderMaterials and OrderEquipment are merged into OrderItems.

## Table changes

| # | Table | Change | Reason |
|---|---|---|---|
| 1 | Users | Added `source_company_id`, `company_name`, `phone`, `address` | companies.tsv provides these, and a marketplace needs contact details. Source IDs keep their leading zeros (e.g. `03028108`). `email` is not unique, because 127 emails are shared by different companies. |
| 2 | Categories (new) | `category_id` PK, `category_name` | Users search the catalog by category. A separate table keeps category names in one place (3NF). |
| 3 | Items (replaces MaterialList + EquipmentList) | `item_id` PK, `source_material_id`, `category_id` FK, `listed_by` FK → Users (nullable), `item_name`, `unit`, `avg_price`, `is_rentable` | Materials and equipment come from the same source file with the same columns. One catalog avoids two near-identical tables. `is_rentable` marks items offered for rent rather than for sale; rental is not limited to machines, so it belongs to each item, not to its category. `listed_by` is empty in the source data, so it is nullable. |
| 4 | OrderItems (replaces OrderMaterials + OrderEquipment) | `order_id` + `item_id` (composite PK, FKs), `quantity`, `unit_price`, `discount_rate` | One line table for both purchases and rentals. `quantity` is read in the item's unit: 50 kg of wire, or 8 Hours of a compactor rental. Each transaction has its own price and discount. |
| 5 | PurchaseOrders | Added `source_transaction_id` | Traces each order back to its raw row. `proj_id` stays nullable, because the data has no projects. |
| 6 | AI_ProcurementAlerts, AI_AuxiliaryRecommendations (Full Version) | `material_id` → `item_id`, `suggested_material_id` → `suggested_item_id` | They now point to Items. |

## Items in scope

materials.tsv mixes products, machines, labour, testing and construction work. Each item is classified in SQL by keywords in its name:

| Group | Items | Loaded as |
|---|---|---|
| Material | 334 | Items in 9 material categories (10 of them rentable) |
| Machine | 26 | Items in the Machines category (all rentable, with operator) |
| Construction work (subcontractor) | 37 | Not loaded: installation, excavation, demolition, transport, scaffolding erection |
| Labour | 35 | Not loaded: workers hired per day or hour |
| Testing | 24 | Not loaded: laboratory and inspection services |
| Unidentified | 2 | Not loaded: names with no description (`Products.`, `Rebar.`) |

Categories: Pipes & Drainage, Safety & Site Equipment, Concrete & Cement, Steel & Metal, Aggregates & Soil, Asphalt & Paving, Landscaping, Formwork & Timber, Others, and Machines.

**Rentable items** (`is_rentable = true`): all 26 machines (priced per Hour, Day or Trip) and 10 site-equipment items whose names say they are rented or temporary (e.g. "Construction Signs… Rental", "Construction Warning Lights… Depreciation", "Temporary toilets", "Temporary lighting equipment", "Movable chevaux de frise", "Flooded movable guardrail", steel sheet piles for temporary retaining). All other items are for sale.

## Account types

companies.tsv has no account-type column, so `Users.account_type` is derived from the business described in `description` (20 business types). A company is Rental or Supplier only when the description clearly says so; all others describe construction work.

| account_type | Descriptions | Companies |
|---|---|---|
| Rental | Construction equipment rental and service | 27 |
| Supplier | Supplier of bulk aggregates and sand · Supplier of high-quality construction materials · Provider of sustainable timber products · Landscape and hardscape materials | 98 |
| Contractor | The other 15, incl. temporary traffic and fencing solutions, and structural steel fabrication and erection | 375 |

119 company names suggest a different business than their description (e.g. "Crest Hardware" is described as historic restoration). Names are brand names, so the description decides. Every company placed valid orders, so every user also has a Contractors row (buyer role).

## Columns not used

| File | Column | Reason |
|---|---|---|
| materials | `PriceStdev` | Market statistic; no MVP feature uses it |
| materials | `NoSamples` | Price-survey metadata, not a property of the item |
| companies | `description` | Used during Transform to derive `account_type`; since v3 also stored as `Users.description` |
| companies | `comments` | Marketing free text; no MVP feature uses it |
| transactions | `total_price` | 2,535 values are wrong (quantity not applied); `total_value` is recomputed as quantity × unit_price × (1 − discount_rate/100) |
| transactions | `notes` | Redundant: its percentage always equals `discount_rate` |

Derived values are not stored per line, to stay in 3NF. `PurchaseOrders.total_value` is kept on purpose, because Project Flow's commission is calculated from it.

## Columns with no source data
- `Users.password`: generated as a placeholder hash during the ETL; the data has no logins.
- `Items.listed_by`: left NULL; the data doesn't say which supplier or rental partner lists each item.
- `PurchaseOrders.order_status`: set to `Delivered` for all loaded orders, because they are historical transactions.
- `Suppliers.iso_certification`, `Suppliers.verification_status`, `Contractors.role`: left NULL (or a default such as `Pending`).

## Rows filtered out
- Transactions whose `company_id` or `material_id` doesn't exist in companies.tsv or materials.tsv.
- Transactions dated 1950–1980, outside the real 2018–2025 range.
- Transactions for out-of-scope items (construction work, labour, testing, unidentified items).

## Unchanged
Contractors, Suppliers, EquipmentRentals, Projects, ProjectDocumentation, Notifications and the other Advanced tables. Projects, ProjectDocumentation and Notifications have no source data, so they load empty.

## Assumptions
- `company_id` in transactions is the buyer (Contractor).
- One transaction row becomes one PurchaseOrder with one OrderItems line.

## Future improvement
If several suppliers sell the same item, `listed_by` can be replaced by a many-to-many table (supplier, item, price).
Done in v3: the `Listings` table.
