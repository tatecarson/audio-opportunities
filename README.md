# Audio Directory

A dense, Swiss-style directory of **verified employers** and **graduate programs**
for audio / sound-design students. Built with [Astro](https://astro.build) and backed
live by an Airtable base at build time.

- **Employers** (`/`) — studios, makers, and houses hiring audio grads.
- **Programs** (`/programs`) — MA / MM / MFA / MS / PhD and certificate programs.

Both tables support client-side faceted filtering (sector / size / geography, or
degree / specialization / region / funding) with live counts and an A–Z toggle.

> **Only verified records appear.** A record is included only if its **Last Verified**
> field in Airtable contains a date. Everything else is skipped at build time.

---

## Connecting Airtable (one-time setup)

The site reads your Airtable base directly via the Airtable REST API. You need a
**Personal Access Token (PAT)** and the **base ID**.

### 1. Create a Personal Access Token

1. Go to **https://airtable.com/create/tokens**.
2. Click **Create new token**. Give it a name, e.g. `audio-directory-readonly`.
3. Under **Scopes**, add:
   - `data.records:read`
   - `schema.bases:read`
4. Under **Access**, click **Add a base** and choose the **Audio Directory** base
   (the one containing the *Employers* and *Graduate Programs* tables).
5. Click **Create token** and **copy** the token (starts with `pat…`). You won't see
   it again, so paste it somewhere safe for the next step.

### 2. Find the base ID

1. Open the base in your browser. The URL looks like:
   `https://airtable.com/appyqRTTdm4p0Ze0P/tblvb6D40R0SIlkrw/...`
2. The part starting with **`app`** is the base ID — here `appyqRTTdm4p0Ze0P`
   (already the default for this project).

### 3. Add credentials to `.env`

```sh
cp .env.example .env
```

Edit `.env`:

```
AIRTABLE_TOKEN=pat...your token...
AIRTABLE_BASE_ID=appyqRTTdm4p0Ze0P
```

`.env` is git-ignored — your token never gets committed.

---

## Develop & build

```sh
npm install      # first time only
npm run dev      # local dev at http://localhost:4321
npm run build    # static build into ./dist
npm run preview  # preview the production build
```

The data is fetched **at build time**. To refresh the site after editing records in
Airtable, just re-run `npm run build` (or restart `npm run dev`).

### Offline / no-token fallback

If `AIRTABLE_TOKEN` is not set, the data layer falls back to a local snapshot at
`src/data/snapshot.json` (git-ignored). This is only a convenience for offline work
or CI without secrets — **the live Airtable API is the source of truth.** To
regenerate or seed a snapshot, export the two tables (verified records only) into:

```json
{
  "Employers": [{ "fields": { "Name": "...", "Sector": ["..."], "Last Verified": "2026-05-15", ... } }],
  "Graduate Programs": [{ "fields": { "Program Name": "...", "Last Verified": "2026-05-30", ... } }]
}
```

---

## How the data maps

`src/lib/airtable.ts` fetches each table, **keeps only records with a `Last Verified`
date**, and maps Airtable fields to typed objects. Facet options (and their counts)
are derived from the data, so adding a new sector or degree type in Airtable just
works — no code change needed.

| Airtable table       | Page         | Filter facets                                  |
| -------------------- | ------------ | ---------------------------------------------- |
| `Employers`          | `/`          | Sector, Company Size, Hiring Geography         |
| `Graduate Programs`  | `/programs`  | Degree Type, Specialization, Region, Funding   |

---

## Project structure

```
src/
├── lib/airtable.ts        # build-time Airtable fetch + Last-Verified filter + facets
├── layouts/Base.astro     # html shell, fonts, global styles
├── components/
│   ├── Topbar.astro       # brand + Employers/Programs tabs
│   └── FacetGroup.astro   # one filter dimension (checkboxes + counts)
├── scripts/directory.ts   # client-side faceted filtering + A–Z sort
├── styles/global.css      # Swiss / utility / dense design tokens
└── pages/
    ├── index.astro        # Employers
    └── programs.astro     # Graduate Programs
```

## Task tracking

Work is tracked with [beads](https://github.com/steveyegge/beads) (`bd list`).
