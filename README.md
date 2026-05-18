# Agency Control Center

Track every cold-outreach mock, the email you send, every open, every click and
every reply — in one Vercel-hosted dashboard that Claude can update over a JSON API.

```
agency/                       (your existing pitch repos)
agency-control-center/        (this app)
```

---

## What it does

| Surface | What it's for |
|---|---|
| `/` dashboard | Filterable table of every prospect — group by region, sector, or status |
| `/prospects/[slug]` | Single prospect: timeline of opens, clicks, replies, notes |
| `/emails`, `/events` | Raw streams |
| `POST /api/prospects` | Claude creates or updates a prospect row |
| `POST /api/emails` | Claude logs a sent email and gets back a tracking pixel + short-link URLs |
| `POST /api/events` | Claude or a webhook records a note / status change |
| `GET /t/o/[id].png` | 1×1 transparent PNG — opens get logged when the email client fetches it |
| `GET /t/c/[code]` | 302 redirect — clicks get logged on the way through |
| `GET /api/gmail/sync` | Pulls Gmail threads and links inbound replies to outbound emails. Runs every 30 mins via Vercel cron |

---

## Setup

### 1. Database (Neon)

Easiest path: Vercel Marketplace → **Neon Postgres** → attach to a new project.
Or run a local Neon-compatible Postgres. Copy the connection string.

### 2. Env

```bash
cp .env.example .env
```

Fill in:

- `DATABASE_URL` — Neon connection string (must end `?sslmode=require`)
- `CONTROL_API_TOKEN` — long random string. Claude / CLI use this as a Bearer token. Generate with `openssl rand -hex 32`
- `DASHBOARD_PASSWORD` — what you'll type to unlock the dashboard
- `NEXT_PUBLIC_TRACK_BASE` — `http://localhost:3000` locally, your prod URL once deployed
- Gmail vars — leave blank until step 5

### 3. Install + migrate

```bash
pnpm install
pnpm db:push          # creates tables in Neon
pnpm dev              # http://localhost:3000
```

### 4. Seed existing pitches

```bash
pnpm import:pitches
```

This walks `../agency/*-pitch`, infers region + sector from the directory name,
and creates prospect rows in `mock_built` status. Edit
`scripts/pitches.overrides.json` to add real contact emails, deployed URLs,
status changes, etc. Re-run to update.

### 5a. Outlook / Microsoft Graph reply tracking

If you use Outlook (personal or Microsoft 365):

1. https://portal.azure.com → **Entra ID** → **App registrations** → **New registration**
   - Name: `agency-control-center`
   - Supported accounts: **Personal Microsoft accounts only** (for outlook.com/hotmail) **or** "any organisational directory + personal" if you also use 365
   - Redirect URI: leave blank
2. Copy the **Application (client) ID** into `.env` as `OUTLOOK_CLIENT_ID`
3. **Authentication** → enable **"Allow public client flows"** → Save
4. **API permissions** → Add → Microsoft Graph → Delegated permissions:
   - `Mail.Read`
   - `Mail.Send` (only if you also want to send via Graph; not required for tracking)
   - `offline_access`
   → grant consent
5. `pnpm outlook:auth` — paste the printed code at the URL Microsoft shows, sign in, and save the printed `OUTLOOK_REFRESH_TOKEN` (and `OUTLOOK_USER`) back into `.env`
6. `pnpm outlook:sync` — backfills inbound replies for every outbound email that has an `outlookConversationId`

Sending from Outlook: compose normally, then once it's in your Sent folder use `pnpm cc email <slug> --subject ... --outlook-conv-id <conversationId>` to register it. The conversation ID is the `conversationId` field on the message (visible via Graph Explorer or the desktop client's message header dump). Easier path is to send via Graph from the CLI — ask me to add a `pnpm cc send` command if you want that.

The same polling runs in production every 30 minutes via Vercel Cron at `/api/outlook/sync`.

### 5b. Gmail reply tracking (optional but powerful)

1. https://console.cloud.google.com → new project → enable **Gmail API**
2. OAuth consent screen → External → add your email as a test user
3. Credentials → OAuth client → **Desktop** application
4. Paste `client_id` + `client_secret` into `.env`
5. Run `pnpm gmail:auth`, open the printed URL, approve, and copy the
   `GMAIL_REFRESH_TOKEN` it prints back into `.env`
6. `pnpm gmail:sync` — backfills replies for every outbound email you've logged

In production, the same logic runs every 30 minutes via Vercel Cron
(`vercel.json` is already wired up; just add the env vars).

### 6. Deploy to Vercel

```bash
vercel link
vercel env add DATABASE_URL production   # paste your Neon URL
vercel env add CONTROL_API_TOKEN production
vercel env add DASHBOARD_PASSWORD production
vercel env add NEXT_PUBLIC_TRACK_BASE production   # https://your-domain
vercel env add GMAIL_CLIENT_ID production
vercel env add GMAIL_CLIENT_SECRET production
vercel env add GMAIL_REFRESH_TOKEN production
vercel env add GMAIL_USER production
vercel env add CRON_SECRET production    # same value as CONTROL_API_TOKEN
vercel --prod
```

Set `CRON_SECRET` to the same value as `CONTROL_API_TOKEN` so the cron job
authenticates against `requireBearer`.

---

## How Claude uses this

Either via the CLI:

```bash
# create / update a prospect
pnpm cc prospect "Acorn Kitchens" \
  --slug acorn-kitchens \
  --email info@acornkitchens.co.uk \
  --website acornkitchens.co.uk \
  --location "Cardiff" \
  --industry "Kitchens" \
  --status mock_built \
  --pitch https://acorn-kitchens.vercel.app

# log a sent email and get back the tracking pixel + click URLs
pnpm cc email acorn-kitchens \
  --subject "Quick mock for Acorn Kitchens" \
  --to info@acornkitchens.co.uk \
  --from corey@example.com \
  --body "Hi — I built a mock of your site at https://acorn-kitchens.vercel.app …" \
  --link https://acorn-kitchens.vercel.app \
  --link https://acorn-kitchens.vercel.app/booking

# record a note
pnpm cc note acorn-kitchens --text "Phoned 3pm — answerphone, will retry Thursday"

# list / inspect
pnpm cc list
pnpm cc show acorn-kitchens
pnpm cc events
```

Or directly over HTTP — every CLI command is a thin wrapper around `POST /api/*`
with a `Authorization: Bearer $CONTROL_API_TOKEN` header.

---

## Embedding the tracking pixel + links in emails

When `POST /api/emails` succeeds, the response gives you the URLs you must paste
into the outbound email:

```json
{
  "email": { "id": 17, ... },
  "trackingPixel": "https://control.example.com/t/o/17.png",
  "links": [
    { "code": "k7n4q8", "trackUrl": "https://control.example.com/t/c/k7n4q8", "target": "https://acorn-kitchens.vercel.app" }
  ]
}
```

In the email HTML:

```html
<a href="https://control.example.com/t/c/k7n4q8">view the mock</a>
…
<img src="https://control.example.com/t/o/17.png" width="1" height="1" alt="" style="display:none">
```

The pixel triggers an `email_open` event the moment the recipient's client loads
images. The link 302-redirects to the real target and logs a `link_click`.

---

## Filtering + organising

Home page has a filter bar:

- free-text search across business / email / notes
- status dropdown
- region dropdown (auto-built from prospects in DB)
- sector dropdown (auto-built from prospects in DB)
- view toggle: flat list / group by region / group by sector / group by status

Tag chips at the top click-to-filter. Click any of the status cards at the top
to scope the table to that status.

Region + sector are inferred automatically from the slug for imported pitches
(`lib/classify.ts`). To override, edit `scripts/pitches.overrides.json` or call
`pnpm cc prospect <name> --location ... --industry ...`.
