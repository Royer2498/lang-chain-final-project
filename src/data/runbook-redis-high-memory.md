# Runbook: Redis High Memory Usage

## Symptoms
- Redis memory usage is above 85% of `maxmemory`
- Alert fired: "Redis memory above threshold"
- Application logs show: "OOM command not allowed" or eviction warnings
- Cache hit rate dropping, increased database load

## Severity: HIGH — Act within 30 minutes

## Step-by-Step Resolution

### Step 1: Check current memory usage
```bash
redis-cli INFO memory | grep -E "used_memory_human|maxmemory_human|mem_fragmentation_ratio"
```
Also check eviction policy:
```bash
redis-cli CONFIG GET maxmemory-policy
```

### Step 2: Identify the largest keys
```bash
redis-cli --bigkeys
```
Or for a more detailed scan:
```bash
redis-cli --scan --pattern '*' | xargs redis-cli MEMORY USAGE | sort -n | tail -20
```

### Step 3: Check TTL on suspicious keys
```bash
redis-cli TTL <key_name>
```
If TTL returns -1, the key has no expiration and is a memory leak candidate.

### Step 4: Delete expired or stale keys
Delete keys matching a pattern (use carefully in production):
```bash
redis-cli --scan --pattern 'session:*' | xargs redis-cli DEL
```

### Step 5: Force eviction if memory is critical (>95%)
Temporarily lower maxmemory to trigger eviction of old keys:
```bash
redis-cli CONFIG SET maxmemory-policy allkeys-lru
redis-cli CONFIG SET maxmemory 512mb
```

### Step 6: Flush non-critical cache databases
If Redis has multiple databases and one is disposable cache:
```bash
redis-cli SELECT 1
redis-cli FLUSHDB
```

### Step 7: Scale Redis if needed
- Increase instance size in AWS ElastiCache / GCP Memorystore
- Add a Redis replica or cluster shard

## Root Cause Checklist
- [ ] Keys created without TTL (missing expiration)
- [ ] Large objects stored in Redis (should use object storage instead)
- [ ] Sudden user growth causing more session data
- [ ] Memory fragmentation (check `mem_fragmentation_ratio` > 1.5)

## Prevention
- Always set TTL when writing to Redis: `SET key value EX 3600`
- Monitor `used_memory` vs `maxmemory` — alert at 70%
- Review large keys weekly with `--bigkeys` scan
- Use `allkeys-lru` eviction policy for cache workloads

## Escalation
If Redis is unresponsive or memory exceeds 98%: page on-call infrastructure engineer immediately.
