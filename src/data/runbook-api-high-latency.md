# Runbook: API High Latency / Slow Response Times

## Symptoms
- P95 or P99 latency exceeds SLA thresholds (e.g., > 2 seconds)
- Monitoring dashboards show increased response times
- Users reporting slow page loads or timeouts
- Alert fired: "API latency above 2s for 5 minutes"

## Severity: MEDIUM-HIGH — Investigate within 15 minutes

## Step-by-Step Resolution

### Step 1: Check current latency metrics
Review the monitoring dashboard (Grafana / Datadog) for:
- Which specific endpoints are slow
- When the latency spike started
- Whether it correlates with a recent deploy

### Step 2: Check application resource usage
On the API server:
```bash
top -bn1 | head -20
free -h
df -h
```
High CPU, low memory, or full disk can all cause latency.

### Step 3: Check for slow database queries
```sql
SELECT query, mean_exec_time, calls, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```
Any query with `mean_exec_time` > 500ms is a suspect.

### Step 4: Check downstream service health
Verify that external dependencies are healthy:
```bash
curl -w "@curl-format.txt" -o /dev/null -s https://internal-service/health
```
Check response times for: database, Redis cache, third-party APIs.

### Step 5: Check for N+1 query problems
Look in application logs for repeated identical queries within the same request cycle. This indicates a missing JOIN or eager loading.

### Step 6: Scale horizontally if load-related
If CPU across all instances is > 80%:
```bash
kubectl scale deployment api-server --replicas=6
```

### Step 7: Roll back if latency started after a deploy
```bash
kubectl rollout history deployment/api-server
kubectl rollout undo deployment/api-server
```

### Step 8: Enable response caching for heavy endpoints
Add a temporary cache header for read-heavy endpoints:
```bash
redis-cli SET "cache:endpoint:/api/products" "<cached_response>" EX 60
```

## Root Cause Checklist
- [ ] Recent code deploy introduced slow query
- [ ] Missing database index on frequently filtered column
- [ ] External API dependency degraded
- [ ] Traffic spike overwhelming current capacity
- [ ] Memory leak causing garbage collection pauses

## Prevention
- Set latency SLO alerts at P95 > 500ms
- Run load tests before major deploys
- Add database query explain plans to code review checklist
- Implement circuit breakers for external dependencies

## Escalation
If latency stays above 5 seconds for more than 10 minutes: declare P1 incident and page the on-call engineer.
