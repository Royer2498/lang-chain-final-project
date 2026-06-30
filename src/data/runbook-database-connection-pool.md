# Runbook: Database Connection Pool Exhaustion

## Symptoms
- Application logs show: "connection pool exhausted" or "too many connections"
- Database connections count is at or near the maximum limit
- New requests fail with connection timeout errors
- API endpoints return 500 or 503 errors

## Severity: HIGH — Immediate action required

## Step-by-Step Resolution

### Step 1: Confirm the issue
Run the following query on the database to check active connections:
```sql
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';
SELECT count(*) FROM pg_stat_activity WHERE state = 'idle';
```
If active + idle connections exceed 80% of `max_connections`, proceed to step 2.

### Step 2: Identify the source
```sql
SELECT client_addr, count(*), state
FROM pg_stat_activity
GROUP BY client_addr, state
ORDER BY count DESC;
```
Identify which application server or service is holding the most connections.

### Step 3: Kill idle connections older than 10 minutes
```sql
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
  AND query_start < NOW() - INTERVAL '10 minutes';
```

### Step 4: Restart the connection pool manager
If using PgBouncer:
```bash
sudo systemctl restart pgbouncer
```
If using application-level pooling (e.g., Sequelize, TypeORM), restart the affected service:
```bash
pm2 restart api-server
```

### Step 5: Scale up connections if needed
Temporarily increase `max_connections` in `postgresql.conf` and reload:
```bash
sudo -u postgres psql -c "ALTER SYSTEM SET max_connections = 200;"
sudo systemctl reload postgresql
```

### Step 6: Notify the team
- Post in #incidents Slack channel
- Tag the database owner
- Open a P1 incident ticket

## Root Cause Checklist
- [ ] Connection leak in application code (missing `connection.release()`)
- [ ] Long-running queries blocking connections
- [ ] Sudden traffic spike not matched by pool size
- [ ] Misconfigured pool size in environment variables

## Prevention
- Set `pool.max` to no more than `max_connections / num_app_instances`
- Add connection timeout of 30 seconds in pool config
- Set up alert when connections exceed 70% of max
- Review all DB queries for missing connection releases

## Escalation
If not resolved within 15 minutes: page the on-call DBA via PagerDuty.
