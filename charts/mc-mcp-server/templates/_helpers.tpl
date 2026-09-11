{{- define "mc-mcp-server.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "mc-mcp-server.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "mc-mcp-server.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "mc-mcp-server.labels" -}}
helm.sh/chart: {{ include "mc-mcp-server.chart" . }}
{{ include "mc-mcp-server.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "mc-mcp-server.selectorLabels" -}}
app.kubernetes.io/name: {{ include "mc-mcp-server.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "mc-mcp-server.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "mc-mcp-server.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "mc-mcp-server.image" -}}
{{- $tag := default .Chart.AppVersion .Values.image.tag -}}
{{- if not $tag -}}
{{- fail "image.tag is empty and Chart.appVersion is unset, so there is no image to run" -}}
{{- end -}}
{{- printf "%s/%s:%s" .Values.image.registry .Values.image.repository $tag -}}
{{- end -}}

{{- define "mc-mcp-server.authSecretName" -}}
{{- if .Values.auth.existingSecret -}}
{{- .Values.auth.existingSecret -}}
{{- else -}}
{{- printf "%s-auth" (include "mc-mcp-server.fullname" .) -}}
{{- end -}}
{{- end -}}

{{/*
The token the chart puts in the Secret it owns. Order: an explicit auth.token, then the value
already stored in that Secret, then a fresh random one.

Reading the Secret back is what keeps the generated token stable across upgrades. Without it a
new value would be rendered every time, the pod would restart, and every client that already
holds a token would start getting 401s.

The result is memoised on .Values because randAlphaNum answers differently on every call, and
the Secret and the Deployment's checksum annotation both have to see the same token. Whichever
template asks first decides the value for the whole render.

The lookup only works when Helm talks to a live cluster. Renderers that template first and apply
later -- `helm template`, ArgoCD, and anything built on them -- get an empty result and therefore
a brand new token on every render. Set auth.existingSecret there.
*/}}
{{- define "mc-mcp-server.authToken" -}}
{{- if not (hasKey .Values "resolvedAuthToken") -}}
{{- $token := .Values.auth.token -}}
{{- if not $token -}}
{{- $existing := (lookup "v1" "Secret" .Release.Namespace (include "mc-mcp-server.authSecretName" .)).data -}}
{{- if and $existing (hasKey $existing .Values.auth.secretKey) -}}
{{- $token = index $existing .Values.auth.secretKey | b64dec -}}
{{- else -}}
{{- $token = randAlphaNum 32 -}}
{{- end -}}
{{- end -}}
{{- $_ := set .Values "resolvedAuthToken" $token -}}
{{- end -}}
{{- .Values.resolvedAuthToken -}}
{{- end -}}

{{- define "mc-mcp-server.needsApiAccess" -}}
{{- if .Values.auth.serviceAccounts.enabled -}}true{{- end -}}
{{- end -}}

{{- define "mc-mcp-server.automountToken" -}}
{{- if include "mc-mcp-server.needsApiAccess" . -}}true{{- else -}}{{ .Values.serviceAccount.automountToken }}{{- end -}}
{{- end -}}

{{- define "mc-mcp-server.validate" -}}
{{- if gt (int .Values.replicaCount) 1 -}}
{{- fail "replicaCount must stay 1: bot sessions live in the pod's memory, so a second pod would not see them" -}}
{{- end -}}
{{- if and .Values.auth.enabled (not .Values.auth.existingSecret) (not .Values.auth.token) (not .Values.auth.generate) (not .Values.auth.serviceAccounts.enabled) -}}
{{- fail "auth.enabled is true but no credential is configured: set auth.generate, auth.existingSecret, auth.token, or auth.serviceAccounts.enabled" -}}
{{- end -}}
{{- if and .Values.ingress.enabled (not .Values.ingress.host) -}}
{{- fail "ingress.enabled is true but ingress.host is empty" -}}
{{- end -}}
{{- if and .Values.ingress.enabled (not .Values.auth.enabled) -}}
{{- fail "refusing to expose an unauthenticated endpoint through an Ingress: set auth.enabled" -}}
{{- end -}}
{{- $grace := int .Values.terminationGracePeriodSeconds -}}
{{- $needed := add (int .Values.shutdown.readinessGraceSeconds) (int .Values.shutdown.drainTimeoutSeconds) -}}
{{- if lt $grace $needed -}}
{{- fail (printf "terminationGracePeriodSeconds (%d) is shorter than shutdown.readinessGraceSeconds + shutdown.drainTimeoutSeconds (%d), so the kubelet would kill the pod mid-drain" $grace $needed) -}}
{{- end -}}
{{- if and .Values.networkPolicy.enabled (not .Values.networkPolicy.allowedNamespaces) -}}
{{- fail "networkPolicy.enabled is true but networkPolicy.allowedNamespaces is empty, which would block every caller" -}}
{{- end -}}
{{- end -}}
