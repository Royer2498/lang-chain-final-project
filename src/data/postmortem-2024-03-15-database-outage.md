# Postmortem: Database Connection Pool Exhaustion
**Date:** March 15, 2024
**Severity:** P1
**Duration:** 47 minutes (14:03 UTC – 14:50 UTC)
**Author:** Platform Engineering Team

---

## Summary
The production API became fully unavailable for 47 minutes due to database connection pool exhaustion. All 100 available PostgreSQL connections were consumed by idle connections that were never released, causing new requests to fail immediately with a timeout error.

---

## Timeline

| Time (UTC) | Event |
|---|---|
| 13:55 | Deploy v2.4.1 released to production |
| 14:03 | First 500 errors appear in logs |
| 14:07 | Alert fires: "Error rate above 5%" |
| 14:09 | On-call engineer paged |
| 14:15 | Engineer identifies "connection pool exhausted" in logs |
| 14:22 | Root cause identified: missing `connection.release()` in new code |
| 14:35 | Hotfix deployed, idle connections terminated |
| 14:50 | Service fully recovered, error rate back to 0% |

---

## Root Cause
A code change in v2.4.1 introduced a new database query inside an async function. The developer correctly acquired a connection from the pool but forgot to call `connection.release()` in the `finally` block. Under normal load, this consumed all 100 available connections within 8 minutes of the deploy.

**Problematic code:**
```javascript
async function getUserData(userId) {
  const connection = await pool.acquire();
  try {
    return await connection.query('SELECT * FROM users WHERE id = $1', [userId]);
  } catch (err) {
    throw err;
  }
  // BUG: connection.release() never called
}
```

**Fixed code:**
```javascript
async function getUserData(userId) {
  const connection = await pool.acquire();
  try {
    return await connection.query('SELECT * FROM users WHERE id = $1', [userId]);
  } finally {
    connection.release(); // Always release in finally block
  }
}
```

---

## Impact
- **Users affected:** ~12,000 active users
- **Requests failed:** ~85,000 API requests
- **Revenue impact:** Estimated $4,200 in lost transactions
- **SLA breach:** Yes — exceeded 99.9% monthly uptime commitment

---

## What Went Well
- Alert fired within 4 minutes of the issue starting
- On-call engineer identified root cause in under 15 minutes
- Hotfix was prepared and deployed within 13 minutes of identification
- Runbook for connection pool exhaustion was accurate and helpful

## What Went Wrong
- Code review did not catch the missing `connection.release()`
- No staging environment test covered connection pool behavior under load
- The deploy went out at peak traffic hours without a canary rollout

---

## Action Items

| Action | Owner | Due Date |
|---|---|---|
| Add ESLint rule to detect missing connection releases | Backend Team | 2024-03-22 |
| Add connection pool exhaustion test to CI pipeline | QA Team | 2024-03-29 |
| Enforce canary deployments for all production releases | Platform Team | 2024-04-05 |
| Set alert threshold at 70% connection usage (not 95%) | SRE Team | 2024-03-18 |

---

## Lessons Learned
Connection pool exhaustion is one of the fastest ways to take down a production API. Any code that acquires a database connection must release it in a `finally` block without exception. Code review must include a specific check for this pattern.
