[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [string]$TunnelName,
  [Parameter(Mandatory)]
  [string]$ConfigPath,
  [Parameter(Mandatory)]
  [string]$LogDirectory
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  throw 'cloudflared is not installed or is not available on PATH.'
}
if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
  throw "Cloudflared config does not exist: $ConfigPath"
}

New-Item -ItemType Directory -Force -Path $LogDirectory | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$log = Join-Path $LogDirectory "cloudflared-$timestamp.log"

& cloudflared.exe --config $ConfigPath tunnel run $TunnelName *>> $log
exit $LASTEXITCODE
