# Project Flow
Software Engineering in Construction Management

## Student Information
| Name | Student ID |
|------|-------------|
| Ryan Lourentino A. | M11505803 |
| 羅奕展 | M11505505 |


## Run the app

Requires Docker Desktop.

```bash
git clone https://github.com/ryanlourentino/project-flow.git
cd project-flow
cp .env.example .env        # Windows PowerShell: copy .env.example .env
docker compose up --build
```

Open http://localhost:3000 and log in with one of the demo accounts below. The first start builds the database:
`db/init/01_etl.sql` loads the TSV files from `db/data`, then the numbered files `02` to `10` add the web app's tables
and demo data, in order (this takes a little while). Reset the database with `docker compose down -v`.
MySQL is also reachable from a database tool at `127.0.0.1:3307` (user and password from `.env`).

## Project structure

```
app.js            Express entry point (middleware and routers)
config.js         Settings read from .env
db.js             Shared MySQL connection pool
routes/           One router per feature
middleware/       Shared checks (login, roles)
views/            Handlebars layouts, partials and pages
public/           CSS, JS, uploaded photos
db/               TSV source data and numbered SQL init files
docs/             ERDs, changelog, team workflow (CONTRIBUTING.md)
```
## Features (Assignment #4: CRUD with HTMX)

Every page that changes data uses HTMX: the server sends back only the changed part of the page, so nothing reloads.

| Feature | Who | Page | Create | Read | Update | Delete |
|---|---|---|---|---|---|---|
| Categories | Admin manages, everyone browses | `/categories`, `/categories/manage` | Add category | Cards with search, products per category | Rename, description | Only when the category has no products |
| Listings (My Products) | Supplier, Rental | `/listings` | Pick category and product (or add a new product, marked "New" until the Admin reviews it), set price, stock, minimum order, lead time | Own listings with search and pages | Price, stock, terms, description | With confirm |
| Cart | Contractor | `/cart` | "Add to cart" on a product's offers page | Grouped by seller, with totals | Quantity (checked against stock and minimum order) | One line or all |
| Projects | Contractor | `/projects` | Name, site address, phase | In construction order | Name, address, phase | Not while documents belong to it |
| Admin: Suppliers | Admin | `/admin/suppliers` | - | Filter (waiting for review, approved, not reviewed, rejected), search, pages | Approve a legit company (certificate optional), Reject with a reason (hides the supplier's products from buyers), Undo | - |
| Admin: All listings | Admin | `/admin/listings` | - | Every listing, newest first, search, pages; odd prices marked | - | Remove a listing that breaks the rules (the seller is notified) |
| Admin: New products | Admin | `/admin/products` | (sellers add them in My Products) | Products waiting for review | Approve, edit name / unit / category, merge a duplicate into an existing product | Remove the product and its listings |

Buyers compare offers on `/categories/<id>` (lowest price per product) and `/items/<id>` (every seller, cheapest first).
Every change is checked on the server: required fields, number ranges, and that users only change their own data.

## Demo accounts

Every company in the ETL data has an account. Passwords are placeholders for testing only:
the ETL sets each password to `changeme-<company id>`, stored as a SHA-256 hash.

| Account type | What it can do | Username | Password |
|---|---|---|---|
| Admin | Manage: categories, supplier verification, all listings, review of new products | `admin` | `admin1234` |
| Supplier | My Products: list materials with own price and stock; browse and compare offers | `superior_foundations_99_28001683` | `changeme-28001683` |
| Rental | My Products: list rentable equipment; browse and compare offers | `atlas_foundations_51794209` | `changeme-51794209` |
| Contractor | Compare offers, Cart, Projects | `central_hardware_03028108` | `changeme-03028108` |

To find another account of a type:

    docker compose exec db mysql -uroot -prootpassword projectflow -e "SELECT username, source_company_id FROM Users WHERE account_type='Supplier' LIMIT 5;"

Its password is `changeme-` followed by its `source_company_id`.

## Priority Legend

| Priority | Color | Description |
|---|---|---|
|  High | Red | Core functions that should be implemented first |
|  Medium | Yellow | Important functions implemented after the core functions |
|  Low | Green | Lower-priority and future enhancement functions |

```mermaid 
graph LR
	%% Priority Class Definitions
	classDef high fill:#ff4d4f,stroke:#a8071a,stroke-width:2px,color:#ffffff;
	classDef medium fill:#faad14,stroke:#ad6800,stroke-width:2px,color:#ffffff;
	classDef low fill:#52c41a,stroke:#237804,stroke-width:2px,color:#ffffff;

	%% Public Project Flow Website
    subgraph Public["Public Project Flow Website"]
        A[Homepage] --> B["About Us"]
        A --> C["Blog"]

        C --> C1["Our Team"]
        C --> C2["Our History"]

        C1 --> CA1["Profile: Ryan Lourentino"]
        C1 --> CA2["Profile: 羅奕展"]

        A --> D["Contact Us"]
        A --> E["Services"]
    end

    %% Customer Contact Services
    subgraph Contact["Project Flow Contact Services"]
        D --> D1["Contact Info"]
        D1 --> D2["Map & Directions"]
        D1 --> D3["Contact Form"]
    end

    %% Project Flow Application Section
    subgraph App["Project Flow Application"]
        E --> Co1["For Contractors"]
        E --> Sup1["For Suppliers"]
        E --> ER1["For Equipment Rental"]
		E --> Ad1["For Platform Admins"]

		%% Notification Services
		subgraph Notification["Notification Services"]
			E --> N["Notification Management"]
			N --> N1["Order Notification"]
			N --> N2["Order Processing"]
			N2 --> N3["AI Predictive Order Processing"]
			Pro9 --> N1
		end

        %% Contractor Homepage
        subgraph Contractors["Contractor Dashboard"]
            Co1 --> Pro1["Procurement Team"]
            Co1 --> SE1["Site Engineer"]

            Pro1 --> Pro2["Registration"]
            Pro1 --> Pro3["Login"]
            Pro2 --> Pro3
			SE6 --> SE7["Documentation Storage"]
			SE7 --> SE8["Documentation List"]

            %% Procurement Dashboard
            subgraph Procurement["Procurement Dashboard"]
                Pro3 --> Pro4["Dashboard"]
                Pro4 --> Pro5["Supplier List & Ratings"]
                Pro4 --> Pro6["Rental Partner List"]
                N2 --> Pro7["Auxiliary Reminders"]
				Pro4 --> Pro7
				Pro4 --> SE8
				N1 --> Pro4
				Pro5 --> Pro9["Check Out Order"]
				Pro6 --> Pro9
				N3 --> Pro10["AI Auxiliary Reminders"]
				Pro7 --> Pro10
				Pro4 --> Pro11["BIM Upload"]
				Pro11 --> Pro12["AI-Based Predictive Procurement"]
            end

            SE1 --> SE2["Registration"]
            SE1 --> SE3["Login"]
            SE2 --> SE3

            %% Site Engineer Dashboard
            subgraph SiteEngineer["Site Engineer Dashboard"]
                SE3 --> SE4["Dashboard"]
                SE4 --> SE5["Mobile OCR Scanner"]
                SE4 --> SE6["Project Documentation"]
				SE4 --> SE8
            end
        end

        %% Supplier Homepage
        subgraph Suppliers["Supplier Dashboard"]
            Sup1 --> Sup2["Registration"]
            Sup1 --> Sup3["Login"]
            Sup2 --> Sup3
            Sup3 --> Sup4["Dashboard"]
            Sup4 --> Sup5["Inventory Overview"]
            Sup4 --> Sup6["Customer Management"]
			N1 --> Sup4
			Sup6 --> Sup7["Order Processed"]
			Sup7 --> N2
        end

        %% Rental Homepage
        subgraph Rentals["Rental Dashboard"]
            ER1 --> ER2["Registration"]
            ER1 --> ER3["Login"]
            ER2 --> ER3
            ER3 --> ER4["Dashboard"]
            ER4 --> ER5["Equipment Overview"]
            ER4 --> ER6["Customer Management"]
			N1 --> ER4
			ER6 --> ER7["Order Processed"]
			ER7 --> N2
        end

		%% Delivery Services
		subgraph Delivery["Express Delivery Services"]
			Pro9 --> ED["Order Processing"]
			ED --> ED1["Assigning Driver & Delivery Truck"]
			ED1 --> ED2["Truck Location Tracker"]
			ED2 --> Pro4
			ED2 --> SE4
			ED2 --> Sup4
			ED2 --> ER4
		end

		%% Admin Portal
        subgraph Admin["Platform Administration"]
            Ad1 --> Ad2["Login"] --> Ad3["Admin Console"]
            Ad3 --> Ad4["Supplier Verification Gate"]
            Ad3 --> Ad5["Marketplace Quality Control"]
        end
    end

	%% Direct Navigation Links back to Contact
	Sup1 -.-> D1
	ER1 -.-> D1

	%% Priority Class Assignments
	class A,Ad1,Ad2,Ad3,Ad4,Co1,D,D1,E,ER1,ER2,ER3,ER4,ER5,N,PM1,PM2,PM3,PM5,Pro1,Pro2,Pro3,Pro4,SE1,SE2,SE3,SE4,SE6,Sup1,Sup2,Sup3,Sup4 high;
	class Ad5,B,D2,D3,ER6,ER7,N1,N2,PM4,Pro5,Pro6,Pro7,Pro8,Pro9,SE5,SE7,SE8,Sup5,Sup6,Sup7 medium;
	class C,C1,C2,CA1,CA2,ED,ED1,ED2,N3,Pro10,Pro11,Pro12 low;
```
