# mc-mcp-server chart

Runs the Mineflayer MCP server in Kubernetes.

## Install

```bash
helm upgrade -i mc-mcp-server oci://junhyung.cloud/library/charts/mc-mcp-server \
  --version <tag> \
  --namespace mcp --create-namespace \
  --set auth.existingSecret=mc-mcp-server-auth
```

The chart version and the image tag are the same value, so leaving `image.tag` unset runs the image that belongs to that chart version.

For clients outside the cluster, enable the Ingress:

```bash
helm upgrade -i mc-mcp-server oci://junhyung.cloud/library/charts/mc-mcp-server \
  --version <tag> --namespace mcp \
  --set auth.existingSecret=mc-mcp-server-auth \
  --set ingress.enabled=true \
  --set ingress.className=traefik \
  --set ingress.host=mc-mcp-server.example.com
```

## Values

| Key | Default | Meaning |
| --- | --- | --- |
| `replicaCount` | `1` | Anything above 1 fails to render; see the constraints below |
| `image.registry` | `junhyung.cloud/library` | Registry and project |
| `image.repository` | `mc-mcp-server` | Repository name |
| `image.tag` | `""` | Empty falls back to `Chart.appVersion` |
| `image.pullPolicy` | `IfNotPresent` | |
| `imagePullSecrets` | `[{name: junhyung-cloud}]` | Attached to the ServiceAccount |
| `serviceAccount.create` | `true` | |
| `serviceAccount.name` | `""` | Empty derives one from the release name |
| `serviceAccount.automountToken` | `false` | Raised automatically when service account auth is on |
| `auth.enabled` | `true` | Check `Authorization: Bearer` |
| `auth.existingSecret` | `""` | When set, the chart creates no Secret |
| `auth.secretKey` | `token` | Key inside that Secret |
| `auth.token` | `""` | Plaintext token, for convenience only |
| `auth.serviceAccounts.enabled` | `false` | Accept Kubernetes service account tokens via TokenReview |
| `auth.serviceAccounts.allowed` | `[]` | `namespace:name` entries; empty admits any authenticated one |
| `mcp.path` | `/mcp` | Path the MCP endpoint is served at |
| `mcp.logLevel` | `info` | `debug` / `info` / `warn` / `error` |
| `minecraft.version` | `""` | Pin a protocol version; empty follows the server |
| `minecraft.usernamePrefix` | `mcp` | Prefix for generated bot usernames |
| `bots.max` | `8` | How many bots may be connected at once |
| `bots.idleTimeoutSeconds` | `1800` | Idle seconds before a bot leaves; `0` disables it |
| `service.type` | `ClusterIP` | |
| `service.port` | `80` | |
| `service.annotations` | `{}` | Where tailnet exposure and the like go |
| `ingress.enabled` | `false` | Requires `ingress.host` and `auth.enabled` |
| `ingress.className` / `host` | `""` / `""` | |
| `ingress.path` / `pathType` | `/` / `Prefix` | |
| `ingress.annotations` / `tls` | `{}` / `[]` | |
| `networkPolicy.enabled` | `false` | Requires `allowedNamespaces` |
| `networkPolicy.allowedNamespaces` | `[]` | Only these namespaces may reach the MCP port |
| `probes.startup` / `readiness` / `liveness` | see below | Replaceable whole |
| `metrics.serviceMonitor.enabled` | `false` | Scrape with the Prometheus Operator |
| `metrics.serviceMonitor.interval` / `scrapeTimeout` | `30s` / `10s` | |
| `metrics.serviceMonitor.labels` | `{}` | Labels the Prometheus instance selects on |
| `shutdown.readinessGraceSeconds` | `5` | Keep serving after SIGTERM so endpoints drop this pod |
| `shutdown.drainTimeoutSeconds` | `30` | How long to wait for in-flight tool calls |
| `terminationGracePeriodSeconds` | `45` | Shorter than the sum of those two fails to render |
| `resources` | `requests: 100m/256Mi`, `limits: 512Mi` | |
| `podSecurityContext` | `runAsNonRoot`, uid 1000, `RuntimeDefault` | |
| `securityContext` | `readOnlyRootFilesystem`, `drop: [ALL]` | |
| `extraEnv` | `[]` | Overrides what the chart set |
| `extraArgs` | `[]` | CLI flags the chart does not model |
| `nodeSelector` / `tolerations` / `affinity` | `{}` / `[]` / `{}` | |
| `podAnnotations` / `podLabels` | `{}` / `{}` | |

Startup probes `/healthz` every 2s up to 30 times, readiness probes `/readyz` every 10s, liveness probes `/healthz` every 30s. Ready with no bots connected: restarting the pod over a failed join would hide the reason.

## Authentication

Two credentials, each enabled on its own; with both on, either gets in.

A **shared secret token** comes from `auth.existingSecret` or `auth.token`, and is what clients outside the cluster use.

**Service account tokens** are enabled with `auth.serviceAccounts.enabled`. An in-cluster agent sends the token already mounted in its pod and it is verified with a TokenReview, so no secret has to be distributed, and the caller shows up as `namespace:name` in the `owner` field of `join-server`. Filling in `allowed` refuses any other service account even when it authenticates.

```bash
helm upgrade -i mc-mcp-server oci://junhyung.cloud/library/charts/mc-mcp-server \
  --version <tag> --namespace mcp \
  --set auth.serviceAccounts.enabled=true \
  --set 'auth.serviceAccounts.allowed={agents:claude}'
```

Only then does a ClusterRoleBinding to `system:auth-delegator` appear; TokenReview is a cluster-scoped API and cannot be granted per namespace. Results are cached for 60 seconds, so a revoked token keeps working for up to a minute.

With `auth.enabled` on and neither credential configured, the chart refuses to render.

## Constraints

**`replicaCount` cannot exceed 1.** Bot state lives in the pod's memory, so a second pod would not see the bot that `join-server` created on the first.

Sticky sessions, the usual answer in other MCP charts, do not help. What they pin is one client's MCP session; what has to stay put here is the bot. A bot exists only on the pod that joined it, and any agent may address it by name, so pinning the caller still lands on the wrong pod. The MCP layer itself is stateless per request.

**The chart never generates the token.** A value that changes every render leaves ArgoCD permanently OutOfSync.

**`enableServiceLinks: false`.** Another Service in the same namespace would otherwise inject environment variables over the configuration.

## Verify a release

```bash
helm test mc-mcp-server --namespace mcp
```

Runs a pod from the same image, reaches the Service, and checks the handshake down to `join-server` appearing in `tools/list`.

## Metrics

`/metrics` is served without a token: no bot name or chat text appears in it, so in-cluster exposure is enough.

| Name | Kind | Meaning |
| --- | --- | --- |
| `mcmcp_bots{state}` | gauge | Bots this process holds |
| `mcmcp_tool_calls_total{tool,outcome}` | counter | Tool calls and how they ended |
| `mcmcp_tool_call_duration_seconds{tool}` | histogram | How long tool calls take |
| `mcmcp_bot_joins_total{outcome}` | counter | Join attempts and whether the bot spawned |
| `mcmcp_bot_disconnects_total{reason}` | counter | Why a bot left the registry |
| `mcmcp_bot_kicks_total` | counter | Times the server kicked a bot |
| `mcmcp_build_info{version,instance}` | gauge | Always 1 |

## Not exposed

Present in peer MCP charts, deliberately absent here.

- **autoscaling, PodDisruptionBudget, topologySpreadConstraints**: meaningless at one replica.
- **httpRoute (Gateway API)**: the clusters this targets route through Ingress.
- **In-pod TLS**: terminated at the Ingress.
- **Broad RBAC**: the only Kubernetes API call is the TokenReview, and its binding appears only when that is enabled.
- **Service discovery**: built and removed. A server address is a fixed string the caller already knows, and it was the only reason the pod mounted a token and planted Roles in other namespaces. `ping-server` reports whether a server is up and what version it speaks, with no permissions at all.
