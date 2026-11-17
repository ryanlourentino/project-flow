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
| companies | `description` | Used only during Transform to derive `account_type`; not stored |
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
