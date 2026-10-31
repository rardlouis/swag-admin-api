[CmdletBinding(SupportsShouldProcess)]
param(
  [Parameter(Mandatory)]
  [string]$SqlServerInstance,
  [Parameter(Mandatory)]
  [string]$DatabaseName,
  [Parameter(Mandatory)]
  [string]$BackupDirectory
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command sqlcmd -ErrorAction SilentlyContinue)) {
  throw 'sqlcmd is not installed or is not available on PATH.'
}
if ($DatabaseName -notmatch '^[A-Za-z0-9_]+$') {
  throw 'DatabaseName may contain only letters, numbers, and underscores.'
}

New-Item -ItemType Directory -Force -Path $BackupDirectory | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = Join-Path $BackupDirectory "$DatabaseName-$timestamp.bak"
$escapedBackupPath = $backupPath.Replace("'", "''")
$sql = "BACKUP DATABASE [$DatabaseName] TO DISK = N'$escapedBackupPath' WITH COPY_ONLY, COMPRESSION, CHECKSUM, STATS = 10;"

if ($PSCmdlet.ShouldProcess($backupPath, "Back up SQL Server database $DatabaseName")) {
  & sqlcmd -S $SqlServerInstance -E -b -Q $sql
  if ($LASTEXITCODE -ne 0) { throw "sqlcmd failed with exit code $LASTEXITCODE" }
  Write-Output "Backup created: $backupPath"
}
