[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [string]$ProjectPath,
  [Parameter(Mandatory)]
  [string]$LogDirectory
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $ProjectPath -PathType Container)) {
  throw "ProjectPath does not exist: $ProjectPath"
}
if (-not (Test-Path -LiteralPath (Join-Path $ProjectPath 'package.json') -PathType Leaf)) {
  throw "ProjectPath must contain package.json: $ProjectPath"
}

New-Item -ItemType Directory -Force -Path $LogDirectory | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$log = Join-Path $LogDirectory "swag-api-$timestamp.log"

Push-Location $ProjectPath
try {
  & npm.cmd run start:prod *>> $log
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
