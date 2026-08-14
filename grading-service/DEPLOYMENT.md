# grading-service — Azure deployment

Creates the Function App in both resource groups, matching how `telemetry-service` and
`tive-ingestion-function` are deployed today.

| | dev | prod |
|---|---|---|
| Resource group | `Mgscale` | `MgScale-Prod` |
| Function App | `mgscale-grading-dev` | `mgscale-grading-prod` |
| Storage (runtime + deployment) | `mgscaleblobstoragedev` | `mgscaleblobstorageprod` |
| Storage (embryo media, `ivf-media`) | `mgscalestoragedev` | `mgscalestorageprod` (created in §2.1) |
| Key Vault | `mgscale-keyvault-dev` | `mgscale-keyvault-prod` |
| App Insights | `mgscale-appinsights-dev` | `mgscale-appinsights-prod` |
| Deploy branch | `develop` | `master` |

Hosting matches the existing function apps: Flex Consumption (FC1), Linux, Python 3.11,
West Europe. Memory is raised to 4096 MB — the two `.pth` checkpoints are 137 MB on disk and
torch inference does not fit the 2048 MB the other apps use.

All resources below have been provisioned. The commands are kept as the record of how the
apps were built and to rebuild or mirror them into another subscription. No code has been
deployed yet — the first deploy happens when `grading-service/**` lands on `develop`.

```bash
SUBSCRIPTION=34ad4daa-8b1e-47c5-b00b-2ed490424e0a
az account set --subscription $SUBSCRIPTION
```

## 1. Dev — resource group `Mgscale`

### 1.1 Create the Function App

The deployment container must exist first — `az functionapp create` does not create it and
fails with `(ContainerNotFound) The specified container does not exist.`

```bash
az storage container create \
  --account-name mgscaleblobstoragedev \
  --name app-package-mgscale-grading-dev \
  --auth-mode login

az functionapp create \
  --name mgscale-grading-dev \
  --resource-group Mgscale \
  --flexconsumption-location westeurope \
  --runtime python \
  --runtime-version 3.11 \
  --instance-memory 4096 \
  --maximum-instance-count 40 \
  --storage-account mgscaleblobstoragedev \
  --deployment-storage-name mgscaleblobstoragedev \
  --deployment-storage-container-name app-package-mgscale-grading-dev \
  --deployment-storage-auth-type StorageAccountConnectionString \
  --deployment-storage-auth-value DEPLOYMENT_STORAGE_CONNECTION_STRING \
  --app-insights mgscale-appinsights-dev
```

`--flexconsumption-location` provisions its own FC1 plan. `--plan` is not valid for Flex
Consumption — this is how the existing `ASP-Mgscale-*` plans were created.

### 1.2 Grant the managed identity read access to Key Vault

App settings are Key Vault references, same as the telemetry app. `mgscale-keyvault-dev` uses
RBAC (not access policies), so the app's system-assigned identity needs
**Key Vault Secrets User**.

```bash
az functionapp identity assign -n mgscale-grading-dev -g Mgscale

PRINCIPAL_ID=$(az functionapp identity show -n mgscale-grading-dev -g Mgscale --query principalId -o tsv)
VAULT_ID=$(az keyvault show -n mgscale-keyvault-dev --query id -o tsv)

az role assignment create \
  --assignee-object-id "$PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" \
  --scope "$VAULT_ID"
```

### 1.3 App settings

```bash
KV=https://mgscale-keyvault-dev.vault.azure.net/secrets

az functionapp config appsettings set -n mgscale-grading-dev -g Mgscale --settings \
  DB_USER="@Microsoft.KeyVault(SecretUri=$KV/db-user/)" \
  DB_PASSWORD="@Microsoft.KeyVault(SecretUri=$KV/db-password/)" \
  DB_HOST="@Microsoft.KeyVault(SecretUri=$KV/db-host/)" \
  DB_PORT="@Microsoft.KeyVault(SecretUri=$KV/db-port/)" \
  DB_NAME="@Microsoft.KeyVault(SecretUri=$KV/db-name/)" \
  REDIS_HOST="@Microsoft.KeyVault(SecretUri=$KV/redis-host/)" \
  REDIS_PORT="@Microsoft.KeyVault(SecretUri=$KV/redis-port/)" \
  REDIS_PASSWORD="@Microsoft.KeyVault(SecretUri=$KV/redis-password/)" \
  REDIS_DB="@Microsoft.KeyVault(SecretUri=$KV/redis-db/)" \
  REDIS_SSL="@Microsoft.KeyVault(SecretUri=$KV/redis-ssl/)" \
  REDIS_SOCKET_CONNECT_TIMEOUT="@Microsoft.KeyVault(SecretUri=$KV/redis-socket-connect-timeout/)" \
  REDIS_SOCKET_TIMEOUT="@Microsoft.KeyVault(SecretUri=$KV/redis-socket-timeout/)" \
  AZURE_STORAGE_CONNECTION_STRING="@Microsoft.KeyVault(SecretUri=$KV/azure-storage-connection-string/)" \
  AZURE_STORAGE_BLOB_CONTAINER="@Microsoft.KeyVault(SecretUri=$KV/azure-storage-blob-container/)" \
  REDIS_USERNAME=default \
  SEG_MODEL_PATH=models/segment_model.pth \
  GRADING_MODEL_PATH=models/grading_model.pth
```

`REDIS_USERNAME` is set inline — there is no `redis-username` secret in either vault, and
`default` is the Redis 6 ACL user Azure Cache uses.

List the references that were set:

```bash
az functionapp config appsettings list -n mgscale-grading-dev -g Mgscale \
  --query "[?starts_with(value,'@Microsoft.KeyVault')].name" -o tsv
```

Whether each reference actually *resolves* cannot be checked ahead of a deploy — the
`configreferences` ARM endpoint returns `Not Found` on Flex Consumption apps (it 404s on the
existing telemetry apps too, so it is a platform gap, not a misconfiguration). An unresolved
reference surfaces at runtime as a missing-environment-variable error from `config.py`.

### 1.4 Keep an instance warm

`Analysis/__init__.py` returns `202` and finishes the job on a daemon thread. Flex Consumption
can scale an instance in once the HTTP response completes and kill that thread mid-job. An
always-ready instance makes this unlikely, but it is a mitigation and not a guarantee — the
real fix is moving the work onto a queue or Durable trigger.

```bash
az functionapp scale config always-ready set \
  -n mgscale-grading-dev -g Mgscale --settings http=1
```

## 2. Prod — resource group `MgScale-Prod`

```bash
az storage container create \
  --account-name mgscaleblobstorageprod \
  --name app-package-mgscale-grading-prod \
  --auth-mode login

az functionapp create \
  --name mgscale-grading-prod \
  --resource-group MgScale-Prod \
  --flexconsumption-location westeurope \
  --runtime python \
  --runtime-version 3.11 \
  --instance-memory 4096 \
  --maximum-instance-count 40 \
  --storage-account mgscaleblobstorageprod \
  --deployment-storage-name mgscaleblobstorageprod \
  --deployment-storage-container-name app-package-mgscale-grading-prod \
  --deployment-storage-auth-type StorageAccountConnectionString \
  --deployment-storage-auth-value DEPLOYMENT_STORAGE_CONNECTION_STRING \
  --app-insights mgscale-appinsights-prod

az functionapp identity assign -n mgscale-grading-prod -g MgScale-Prod

PRINCIPAL_ID=$(az functionapp identity show -n mgscale-grading-prod -g MgScale-Prod --query principalId -o tsv)
VAULT_ID=$(az keyvault show -n mgscale-keyvault-prod --query id -o tsv)

az role assignment create \
  --assignee-object-id "$PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" \
  --scope "$VAULT_ID"
```

### 2.1 Create the prod media storage account — do this before setting app settings

Embryo media storage exists only in dev (`mgscalestoragedev`, container `ivf-media`) because
embryo grading has so far been a dev-only prototype. Prod needs its own account before
segmentation output can be uploaded. `mgscalestorageprod` mirrors the dev account exactly:
StorageV2, Standard_LRS, West Europe, Hot, TLS 1.2 minimum, blob public access disabled,
shared key access enabled, cross-tenant replication disabled.

```bash
az storage account create \
  --name mgscalestorageprod \
  --resource-group MgScale-Prod \
  --location westeurope \
  --sku Standard_LRS \
  --kind StorageV2 \
  --access-tier Hot \
  --min-tls-version TLS1_2 \
  --https-only true \
  --allow-blob-public-access false \
  --allow-shared-key-access true \
  --allow-cross-tenant-replication false \
  --public-network-access Enabled \
  --tags storage=mgscale-storage-prod
```

Blob service settings — dev has 7-day soft delete on blobs and containers, plus a permissive
CORS rule. Match both:

```bash
az storage account blob-service-properties update \
  --account-name mgscalestorageprod \
  --resource-group MgScale-Prod \
  --enable-delete-retention true --delete-retention-days 7 \
  --enable-container-delete-retention true --container-delete-retention-days 7

`az storage cors` has no `--auth-mode login` — unlike the container commands it is account-key
only:

```bash
KEY=$(az storage account keys list -n mgscalestorageprod -g MgScale-Prod --query "[0].value" -o tsv)

az storage cors add \
  --account-name mgscalestorageprod --account-key "$KEY" \
  --services b \
  --methods GET PUT POST DELETE HEAD OPTIONS \
  --origins 'https://mgscale.mygrape.org' \
  --allowed-headers '*' --exposed-headers '*' \
  --max-age 3600
```

Deliberate divergence from dev: dev allows `--origins '*'`, which is fine for a prototype but
should not ship to prod. Prod is scoped to the real frontend origin `https://mgscale.mygrape.org`.
Add any additional origins (staging hostnames, a custom domain alias) to the same rule rather
than widening it back to `*`.

Create the container (private, same as dev — `publicAccess` is null there):

```bash
az storage container create \
  --account-name mgscalestorageprod \
  --name ivf-media \
  --auth-mode login
```

Store the connection string and container name in the prod vault, under the same secret names
the dev vault uses:

```bash
az keyvault secret set --vault-name mgscale-keyvault-prod \
  --name azure-storage-blob-container --value ivf-media

az keyvault secret set --vault-name mgscale-keyvault-prod \
  --name azure-storage-connection-string \
  --value "$(az storage account show-connection-string \
      -n mgscalestorageprod -g MgScale-Prod --query connectionString -o tsv)"
```

Note this is a *new* account, not the deployment storage — `mgscaleblobstorageprod` holds
function app packages and `azure-webjobs-*` containers and should not be reused for media.

### 2.2 App settings

Same block as dev with `KV=https://mgscale-keyvault-prod.vault.azure.net/secrets` and
`-n mgscale-grading-prod -g MgScale-Prod`, then:

```bash
az functionapp scale config always-ready set \
  -n mgscale-grading-prod -g MgScale-Prod --settings http=1
```

## 3. CI/CD

`.github/workflows/grading-service_mgscale-grading-dev.yml` (on `develop`) and
`grading-service_mgscale-grading-prod.yml` (on `master`) both call the shared
`reusable-azure-function-python.yml`, which deploys with `Azure/functions-action@v1` and
`remote-build: true`. Both trigger on pushes touching `grading-service/**` and support
`workflow_dispatch`. No new GitHub secrets — `AZURE_CREDENTIALS` already covers both resource
groups.

Because the build is remote, Oryx runs `pip install -r requirements.txt` on the Function App
itself. `requirements.txt` pins the CPU-only wheel index for torch; without it Oryx pulls the
CUDA build (~2.5 GB) and the deployment fails.

## 4. Verify

```bash
# Hosting config: python 3.11, instanceMemoryMB 4096, alwaysReady http=1
az functionapp show -n mgscale-grading-dev -g Mgscale --query "properties.functionAppConfig"

# The function must appear after a deploy. An empty list means the remote build failed,
# which the GitHub Actions job can still report as green.
az functionapp function list -n mgscale-grading-dev -g Mgscale -o table

curl -s -i -X POST "https://mgscale-grading-dev.azurewebsites.net/api/Analysis" \
  -H "Content-Type: application/json" -d '{}'   # expect 202 {"job_id": N}

az webapp log tail -n mgscale-grading-dev -g Mgscale
```

Prod media storage — confirm it came out matching dev:

```bash
az storage account show -n mgscalestorageprod -g MgScale-Prod \
  --query "{sku:sku.name,kind:kind,tier:accessTier,tls:minimumTlsVersion,publicBlob:allowBlobPublicAccess}"
az storage container list --account-name mgscalestorageprod --auth-mode login -o table

# CORS must list only https://mgscale.mygrape.org, not '*'
az storage cors list --account-name mgscalestorageprod --services b \
  --account-key "$(az storage account keys list -n mgscalestorageprod -g MgScale-Prod --query '[0].value' -o tsv)" -o json
```

A `202` only means the job was accepted. Confirm the `ml_jobs` row for that `job_id` reaches a
terminal status and the segmentation output blob landed in `ivf-media`.
