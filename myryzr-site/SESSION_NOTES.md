# RYZR Agent Dashboard — Session Notes

## What Was Built

A Meta social media management agent at **myryzr.com** with:

- **Marketing landing page** — `myryzr.com` (restored from original design)
- **Private agent dashboard** — `myryzr.com/dashboard` (Supabase auth)
- **Serverless functions** on Netlify:
  - `/api/meta-sync` — fetches FB + IG posts with insights
  - `/api/meta-boost` — creates Meta ad campaign to boost a post
  - `/api/meta-webhook` — receives FB comments and IG DMs
  - `agent-loop` — scheduled 3x/day (8am, 12pm, 6pm UTC), auto-boosts top post

---

## Key Config

| Setting | Value |
|---|---|
| Netlify Site ID | `13465276-caed-4f1b-8446-d30da1d7213c` |
| Supabase Project | `fuyzcssdryngvxmmjkvn` |
| Supabase URL | `https://fuyzcssdryngvxmmjkvn.supabase.co` |
| FB Page ID | `1123814624155695` |
| IG Account ID | `17841422825954736` |
| Meta App ID | `2738783623145877` |
| Meta Ad Account ID | `2954620084886474` |
| Daily Ad Cap | `500` cents = $5.00 |
| Webhook Verify Token | `ryzr_webhook_verify` |
| Webhook URL | `https://www.myryzr.com/api/meta-webhook` |
| Dashboard Login | `sendtojoshperry@gmail.com` (Supabase auth) |

---

## Netlify Environment Variables Required

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
META_USER_TOKEN          ← long-lived Graph API token
META_PAGE_ID             = 1123814624155695
META_IG_ACCOUNT_ID       = 17841422825954736
META_APP_ID              = 2738783623145877
META_AD_ACCOUNT_ID       = 2954620084886474
META_DAILY_AD_BUDGET     = 500
META_WEBHOOK_VERIFY_TOKEN = ryzr_webhook_verify
ANTHROPIC_API_KEY
```

---

## GitHub Repo

- **Repo**: `joshbradik-blip/ryzr-privacy`
- **Branch**: `claude/serene-rubin-5dvthb`
- **Site files**: `myryzr-site/` folder

### Clone & Deploy (from any computer)

```powershell
git clone -b claude/serene-rubin-5dvthb https://github.com/joshbradik-blip/ryzr-privacy.git ryzr-deploy
cd ryzr-deploy\myryzr-site

# Copy athlete images to assets\ folder (from RYZR app.zip → design_handoff_ryzr_site\assets\)
mkdir assets
Copy-Item "path\to\athlete-male.png" assets\
Copy-Item "path\to\athlete-female.png" assets\

# Deploy
$env:NETLIFY_AUTH_TOKEN="<your-netlify-token>"
npx netlify deploy --prod --site=13465276-caed-4f1b-8446-d30da1d7213c --dir=.
```

---

## File Structure

```
myryzr-site/
├── index.html                          ← RYZR marketing landing page
├── ryzr-tokens.css                     ← design tokens
├── netlify.toml                        ← build + redirect config
├── package.json
├── assets/
│   ├── athlete-male.png                ← hero image (NOT in git, too large)
│   └── athlete-female.png              ← form coach image (NOT in git, too large)
├── dashboard/
│   ├── index.html                      ← login page (Supabase auth)
│   └── app.html                        ← agent dashboard SPA
├── netlify/functions/
│   ├── meta-sync.mts                   ← syncs FB + IG posts
│   ├── meta-boost.mts                  ← creates Meta ad boost
│   ├── meta-webhook.mts                ← receives comments/DMs
│   └── agent-loop.mts                  ← scheduled auto-boost
├── privacy-policy.html
├── terms-of-service.html
└── delete-request.html
```

---

## Supabase Tables

- `agent_post_snapshots` — FB + IG post metrics, boost status
- `agent_actions` — log of all sync/analyze/boost actions
- `agent_comments_queue` — incoming comments and DMs
- `agent_digests` — (reserved for future weekly digests)

---

## Meta App Setup

- **App**: Caluculated Mercy Campaign (ID: `2738783623145877`) — Development mode
- **Webhook**: configured under Instagram product, verified ✅
- **Instagram account**: `my_ryzr` added as tester, token generated
- **Redirect URI**: `https://www.myryzr.com/dashboard/app.html`
- ⚠️ App must be switched to **Live** mode for webhooks to fire in production

---

## Known Issues / To-Do

- [ ] Flip Meta app from **Development → Live** mode
- [ ] Add `META_AD_ACCOUNT_ID = 2954620084886474` to Netlify env vars
- [ ] Add payment method at business.facebook.com → Settings → Billing & Payments
- [ ] Revoke old Netlify PAT `nfp_ms2aPEyFdRdvEPGZhHHVvEdDaMZCXXTu8ed0`
- [ ] `athlete-male.png` and `athlete-female.png` must be manually copied to `assets/` before each deploy (too large for GitHub)
- [ ] Meta token (`META_USER_TOKEN`) will eventually expire — regenerate in Graph API Explorer when it does
- [ ] `/api/meta-reply` endpoint not yet implemented (reply button in dashboard is a stub)
