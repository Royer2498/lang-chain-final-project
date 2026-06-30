# Runbook: Kubernetes Pod CrashLoopBackOff

## Symptoms
- Pod status shows `CrashLoopBackOff`
- `kubectl get pods` shows repeated restarts (RESTARTS column > 3)
- Service is partially or fully degraded depending on replica count
- Alert fired: "Pod restart count exceeded threshold"

## Severity: HIGH — Act immediately

## Step-by-Step Resolution

### Step 1: Identify the crashing pod
```bash
kubectl get pods -n production
kubectl get pods -n production | grep CrashLoopBackOff
```

### Step 2: Read the pod logs (current and previous)
```bash
# Current container logs
kubectl logs <pod-name> -n production

# Previous container logs (before the crash)
kubectl logs <pod-name> -n production --previous
```
Look for: stack traces, OOMKilled messages, missing env vars, connection errors.

### Step 3: Describe the pod for events
```bash
kubectl describe pod <pod-name> -n production
```
Check the `Events` section at the bottom. Common issues:
- `OOMKilled` → Pod exceeded memory limit
- `Error: secret not found` → Missing Kubernetes secret
- `ImagePullBackOff` → Docker image can't be pulled

### Step 4: If OOMKilled — increase memory limit
Edit the deployment:
```bash
kubectl edit deployment <deployment-name> -n production
```
Increase `resources.limits.memory` from e.g. `256Mi` to `512Mi`.

### Step 5: If missing environment variable — check secrets
```bash
kubectl get secrets -n production
kubectl describe secret <secret-name> -n production
```
If the secret is missing, recreate it:
```bash
kubectl create secret generic app-secrets \
  --from-literal=DATABASE_URL=postgres://... \
  -n production
```

### Step 6: If bad deploy — roll back
```bash
kubectl rollout history deployment/<deployment-name> -n production
kubectl rollout undo deployment/<deployment-name> -n production
```

### Step 7: Force delete stuck pods
```bash
kubectl delete pod <pod-name> -n production --force --grace-period=0
```

### Step 8: Verify recovery
```bash
kubectl get pods -n production -w
```
Watch until all pods show `Running` status with 0 restarts.

## Root Cause Checklist
- [ ] Application code throws unhandled exception at startup
- [ ] Missing or incorrect environment variable / secret
- [ ] OOM — memory limit too low for workload
- [ ] Bad Docker image (failed build or missing dependency)
- [ ] Liveness probe too aggressive (killing healthy pods)

## Prevention
- Set both `requests` and `limits` for CPU/memory in all deployments
- Add startup health check with reasonable `initialDelaySeconds`
- Use `readinessProbe` to prevent traffic before app is ready
- Run `kubectl diff` before applying changes to catch config errors

## Escalation
If more than 50% of pods are crashing: declare P0 incident. Page on-call SRE and notify engineering leadership.
