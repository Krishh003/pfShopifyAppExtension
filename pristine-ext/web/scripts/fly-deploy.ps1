<#
.SYNOPSIS
    Deploy the Pristine Forests backend to Fly.io.

.DESCRIPTION
    Reads secrets from pristine-ext/web/.env at runtime, pushes them to Fly.io
    via flyctl secrets, and runs flyctl deploy. Run from any directory; the
    script resolves paths relative to itself.

    Prerequisites (run these once):
        # Install flyctl
        iwr https://fly.io/install.ps1 -useb | iex

        # Authenticate (opens browser)
        flyctl auth signup    # first time, or `flyctl auth login`

        # Create the app (run from pristine-ext/web). Choose region "bom" or "sin".
        flyctl launch --no-deploy --copy-config --name pristine-preorder-backend

    Usage:
        powershell -ExecutionPolicy Bypass -File pristine-ext\web\scripts\fly-deploy.ps1
#>

[CmdletBinding()]
param(
    [string] $AppName = "pristine-preorder-backend",
    [switch] $SkipSecrets,
    [switch] $SkipDeploy
)

$ErrorActionPreference = "Stop"

$WebDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$EnvFile = Join-Path $WebDir ".env"

if (-not (Test-Path $EnvFile)) {
    throw ".env not found at $EnvFile"
}

if (-not (Get-Command flyctl -ErrorAction SilentlyContinue)) {
    throw "flyctl not on PATH. Install: iwr https://fly.io/install.ps1 -useb | iex"
}

# Whitelist of env keys that should be sent as Fly secrets.
$SecretKeys = @(
    "SHOPIFY_API_KEY",
    "SHOPIFY_API_SECRET",
    "SHOPIFY_ACCESS_TOKEN",
    "SHOP_DOMAIN",
    "API_VERSION",
    "WEBHOOK_SECRET",
    "PREORDER_CART_CONFIG"
)

$Secrets = @{}
foreach ($line in Get-Content $EnvFile) {
    if ($line -match "^\s*#") { continue }
    if ($line -match "^\s*$") { continue }
    if ($line -notmatch "^\s*([^=]+?)\s*=\s*(.*)$") { continue }
    $key = $Matches[1]
    $value = $Matches[2]
    if ($SecretKeys -contains $key) {
        $Secrets[$key] = $value
    }
}

Write-Host ("Found {0} secrets to upload." -f $Secrets.Count)

if (-not $SkipSecrets) {
    $secretArgs = @()
    foreach ($pair in $Secrets.GetEnumerator()) {
        # Quote value so PowerShell preserves it; flyctl parses key=value pairs.
        $secretArgs += ("{0}={1}" -f $pair.Key, $pair.Value)
    }

    Push-Location $WebDir
    try {
        Write-Host "Uploading secrets via flyctl..."
        & flyctl secrets set --app $AppName --stage @secretArgs
        if ($LASTEXITCODE -ne 0) { throw "flyctl secrets set failed (exit $LASTEXITCODE)" }
    } finally {
        Pop-Location
    }
}

if (-not $SkipDeploy) {
    Push-Location $WebDir
    try {
        Write-Host "Deploying..."
        & flyctl deploy --app $AppName --remote-only
        if ($LASTEXITCODE -ne 0) { throw "flyctl deploy failed (exit $LASTEXITCODE)" }

        Write-Host "Fetching public hostname..."
        & flyctl status --app $AppName
    } finally {
        Pop-Location
    }
}

Write-Host "Done. Update header-group.json scriptSrc to https://$AppName.fly.dev/preorder-cart.js?v=<version>"
