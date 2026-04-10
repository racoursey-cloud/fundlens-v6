# FundLens v6 — Deployment Checklist

Personal reference for Robert. NOT uploaded to GitHub.

---

## Pre-Deploy

- [ ] All Session 11 files uploaded to GitHub
- [ ] Railway build passes (check deploy logs)
- [x] Delete `client/src/pages/BriefsPlaceholder.tsx` from repo (done — Session 26 cleanup)
- [x] Delete `client/src/pages/PipelinePlaceholder.tsx` from repo (done — Session 26 cleanup)
- [x] Delete `v6_holdings_schema.sql` from repo (done — Session 26 cleanup)
- [x] Delete `v6_full_schema.sql` from repo (done — Session 26 cleanup)

---

## Connect fundlens.app Domain (Railway)

1. [ ] In Railway dashboard → Settings → Domains → Add Custom Domain
2. [ ] Enter `fundlens.app`
3. [ ] Copy the CNAME or A record Railway provides
4. [ ] Go to domain registrar → DNS settings
5. [ ] Add CNAME record: `fundlens.app` → Railway's provided address
6. [ ] Wait for DNS propagation (5–30 minutes)
7. [ ] Verify SSL certificate is active (Railway auto-provisions via Let's Encrypt)

---

## Upgrade Supabase to Pro

1. [ ] Go to Supabase dashboard → Organization → Billing
2. [ ] Upgrade to Pro plan ($25/mo)
3. [ ] Verify RLS policies are still active after upgrade
4. [ ] Test magic link auth still works after upgrade

---

## Post-Deploy Validation

- [ ] Visit fundlens.app — login page loads
- [ ] Send magic link — email arrives via Resend
- [ ] Complete setup wizard — fund selection, weights, risk tolerance
- [ ] Portfolio page — fund table loads with scores
- [ ] Click a fund — FundDetail sidebar opens
- [ ] Adjust weight sliders — scores rescore in real-time
- [ ] Pipeline page — click "Run Pipeline Now" — status updates
- [ ] Briefs page — click "Generate Brief" — brief appears after generation
- [ ] Test on mobile (iPhone Safari) — bottom tab bar appears, pages scroll correctly
- [ ] Test on tablet (iPad) — collapsed icon sidebar shows, pages render properly

---

## Environment Variables (Railway)

Verify all 11 are set:

1. `SUPABASE_URL`
2. `SUPABASE_SERVICE_ROLE_KEY`
3. `SUPABASE_JWT_SECRET`
4. `VITE_SUPABASE_URL`
5. `VITE_SUPABASE_ANON_KEY`
6. `FMP_API_KEY`
7. `TINNGO_KEY`
8. `FRED_API_KEY`
9. `ANTHROPIC_API_KEY`
10. `RESEND_API_KEY`
11. `IS_PRODUCTION=true`

(PORT is auto-set by Railway)
