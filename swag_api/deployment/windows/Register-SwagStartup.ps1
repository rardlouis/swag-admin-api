[CmdletBinding(SupportsShouldProcess)]
param(
  [Parameter(Mandatory)]
  [string]$SqlServiceName,
  [Parameter(Mandatory)]
  [string]$ApiProjectPath,
  [Parameter(Mandatory)]
  [string]$TunnelName,
  [Parameter(Mandatory)]
  [string]$CloudflaredConfigPath,
  [Parameter(Mandatory)]
  [string]$RuntimeDirectory
)

$ErrorActionPreference = 'Stop'
$scriptDirectory = Split-Path -Parent $PSCommandPath
$apiScript = Join-Path $scriptDirectory 'Start-SwagApi.ps1'
$tunnelScript = Join-Path $scriptDirectory 'Start-Cloudflared.ps1'
foreach ($path in @($apiScript, $tunnelScript, $ApiProjectPath, $CloudflaredConfigPath)) {
  if (-not (Test-Path -LiteralPath $path)) { throw "Required path does not exist: $path" }
}
if (-not (Get-Service -Name $SqlServiceName -ErrorAction SilentlyContinue)) {
  throw "SQL Server service was not found: $SqlServiceName"
}

$logDirectory = Join-Path $RuntimeDirectory 'logs'
$workingDirectory = Split-Path -Parent $ApiProjectPath
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

$sqlAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -Command \"Start-Service -Name '$SqlServiceName'\""
$apiAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$apiScript`" -ProjectPath `"$ApiProjectPath`" -LogDirectory `"$logDirectory`""
$tunnelAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$tunnelScript`" -TunnelName `"$TunnelName`" -ConfigPath `"$CloudflaredConfigPath`" -LogDirectory `"$logDirectory`""

if ($PSCmdlet.ShouldProcess('Windows Task Scheduler', 'Register SWAG SQL Server startup task')) {
  Register-ScheduledTask -TaskName 'SWAG-SQL-Server' -Action $sqlAction -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
}
if ($PSCmdlet.ShouldProcess('Windows Task Scheduler', 'Register SWAG API startup task')) {
  Register-ScheduledTask -TaskName 'SWAG-Nest-API' -Action $apiAction -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
}
if ($PSCmdlet.ShouldProcess('Windows Task Scheduler', 'Register SWAG Cloudflared startup task')) {
  Register-ScheduledTask -TaskName 'SWAG-Cloudflared' -Action $tunnelAction -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
}

Write-Output 'Preview complete. Re-run without -WhatIf only after reviewing the task actions.'
