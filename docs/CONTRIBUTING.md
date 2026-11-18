# Team workflow

## One-time setup (each person)
```bash
git config user.name  "Your Name"          # the same name every time
git config user.email "you@mail.ntust.edu.tw"   # an email that is added to your GitHub account
```
Commits are credited by this name/email, so never commit from the other person's account.

## Branches and pull requests
- `main` always works. Nobody commits directly to it.
- One branch per feature: `feature/<short-name>` (e.g. `feature/categories-crud`, `feature/listings-crud`).
- Small commits with a clear message, right after each working step:
  `Add category create form`, `Add category delete route`.
- Open a pull request for each finished feature; the teammate reviews and merges it.
- Before starting work: `git checkout main && git pull`, then create your branch.

## Folder rules
| Folder | What goes there |
|---|---|
| `routes/` | One router file per feature (`categories.js`, `listings.js`, `cart.js`, `auth.js`) |
| `views/<feature>/` | Pages of that feature. Fragments returned by HTMX go in `views/partials/` |
| `middleware/` | Shared checks (e.g. `requireLogin`, `requireRole`) |
| `public/` | CSS, JS, images. `public/uploads/` is for product photos and is not committed |
| `db/init/` | Numbered SQL files, see `db/README.md` |
| `docs/` | ERDs, changelog, this file |

Working in separate route and view files keeps merge conflicts rare. If you must edit a shared file
(`app.js`, `views/layouts/main.hbs`, `views/partials/menu.hbs`), keep the change small and merge it quickly.

## Never commit
`.env`, `node_modules/`, uploaded photos, real passwords.
