# Postmortem: API Gateway 503 Service Unavailable
**Date:** June 10, 2024
**Severity:** P1
**Duration:** 31 minutes (09:14 UTC – 09:45 UTC)
**Author:** Infrastructure Team

---

## Summary
The public API returned 503 errors to all clients for 31 minutes after a Kubernetes deployment caused all pods to enter `CrashLoopBackOff` state simultaneously. The crash was triggered by a missing environment variable that was accidentally removed from the Kubernetes secret during a configuration update.

---

## Timeline

| Time (UTC) | Event |
|---|---|
| 09:10 | Infrastructure engineer updates Kubernetes secrets for new OAuth config |
| 09:14 | New deployment rolls out, pods begin crashing |
| 09:14 | 100% of API pods enter CrashLoopBackOff |
| 09:16 | PagerDuty alert fires: "API health check failing" |
| 09:19 | On-call engineer joins incident bridge |
| 09:24 | Engineer runs `kubectl logs` and finds "DATABASE_URL is not defined" error |
| 09:27 | Root cause confirmed: DATABASE_URL removed from secret |
| 09:31 | Secret patched with correct DATABASE_URL value |
| 09:38 | Pods restart successfully and pass health checks |
| 09:45 | Traffic fully restored, 503s stop |

---

## Root Cause
During a manual update to the `app-secrets` Kubernetes secret to add new OAuth credentials, the engineer used `kubectl create secret` with `--dry-run=false` which **replaced** the entire secret instead of patching it. This deleted the existing `DATABASE_URL` key that the application depended on.

**Incorrect command used:**
```bash
kubectl create secret generic app-secrets \
  --from-literal=OAUTH_CLIENT_ID=abc123 \
  --from-literal=OAUTH_SECRET=xyz789 \
  -n production
# This REPLACED the entire secret, deleting DATABASE_URL
```

**Correct command (patch/update):**
```bash
kubectl patch secret app-secrets -n production \
  --type=merge \
  -p '{"stringData": {"OAUTH_CLIENT_ID": "abc123", "OAUTH_SECRET": "xyz789"}}'
# This ADDS new keys without removing existing ones
```

---

## Impact
- **Users affected:** All API consumers (~28,000 active users)
- **Requests failed:** ~210,000 requests returned 503
- **Revenue impact:** Estimated $9,800 in lost transactions
- **SLA breach:** Yes

---

## What Went Well
- PagerDuty alert fired within 2 minutes
- The `kubectl logs --previous` command quickly revealed the exact error
- Recovery was straightforward once root cause was found

## What Went Wrong
- No change management process for Kubernetes secret updates
- No automated validation that required environment variables exist before deploying
- Manual infrastructure changes made without peer review
- No staging environment smoke test that verifies all env vars are present

---

## Action Items

| Action | Owner | Due Date |
|---|---|---|
| Write a script to validate required secrets before deployment | Platform Team | 2024-06-17 |
| Add pre-deploy hook: check all required env vars are set | Backend Team | 2024-06-21 |
| Require PR review for all Kubernetes secret changes | Infra Team | 2024-06-14 |
| Add integration test: app fails fast with clear error on missing DATABASE_URL | QA Team | 2024-06-24 |
| Document `kubectl patch` vs `kubectl create` difference in team wiki | Infra Team | 2024-06-12 |

---

## Lessons Learned
`kubectl create secret` replaces the entire secret — it does not add to it. Always use `kubectl patch` to update individual keys. Additionally, applications should fail fast with clear error messages when required environment variables are missing, so the root cause is immediately visible in logs.
