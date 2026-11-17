# Database

| Folder | Content |
|---|---|
| `data/` | Source TSV files (`companies`, `materials`, `transactions`). Do not edit. |
| `init/` | SQL files run **in filename order** when the MySQL container starts with an empty volume. |

## Files in `init/`

| File | Purpose |
|---|---|
| `01_etl.sql` | The ETL (extract, transform, load, validate). Creates the 11 ERD tables and loads the clean data. |
| `02_...sql` | Add schema changes here as **new numbered files** (e.g. `02_listings.sql`, `03_order_status.sql`). |

Rules for schema changes:
1. Never edit an old numbered file after it was merged. Add a new one.
2. Every change also updates `docs/ERDiagramMVP.md` and `docs/ERD_Changelog.md`.
3. Init files only run on an empty database. To re-run them: `docker compose down -v && docker compose up --build`.
