# Windows deployment templates

These are templates only. They do not install cloudflared or SQL Server, alter DNS, create firewall rules, register tasks, start services, or run backups unless you execute them manually.

## Architecture

Cloudflare Tunnel exposes only `api.adminafrodrygoods.shop` and forwards it to `http://127.0.0.1:5000`, where the NestJS API listens. SQL Server remains on the laptop and is never an ingress target. Do not create a tunnel, port-forward, or public firewall rule for TCP 1433.

## Prerequisites

- SQL Server is installed and you know its Windows service name (for example, `MSSQL$SQLEXPRESS`).
- Node.js and npm are installed, dependencies have been installed in `swag_api`, and its `.env` is present locally.
- cloudflared is installed and a named tunnel plus hostname have been created in Cloudflare.
- `sqlcmd` is installed for backups.
- Choose a runtime directory and a backup directory outside this Git repository, for example `C:\SWAG-Runtime` and `D:\SWAG-Backups`.

## Cloudflare Tunnel

Copy `cloudflared/config.yml.example` to `%USERPROFILE%\.cloudflared\config.yml`, replace the placeholders locally, and keep the tunnel credentials JSON outside Git. The template has one API ingress rule and a `404` catch-all; it does not expose MSSQL or Modal.

## Startup and recovery

First preview Task Scheduler changes without registering anything:

```powershell
.\Register-SwagStartup.ps1 -SqlServiceName 'MSSQL$SQLEXPRESS' -ApiProjectPath 'C:\Users\Kenneth\swag-admin-api\swag_api' -TunnelName 'YOUR_TUNNEL_NAME' -CloudflaredConfigPath 'C:\Users\Kenneth\.cloudflared\config.yml' -RuntimeDirectory 'C:\SWAG-Runtime' -WhatIf
```

After reviewing the preview, run the same command without `-WhatIf`. The tasks start at Windows boot and Task Scheduler retries a process that exits unexpectedly up to three times with a one-minute interval. Logs go beneath `C:\SWAG-Runtime\logs`, outside Git.

## Database backups

Preview a dated backup command without writing a backup:

```powershell
.\Backup-SwagDatabase.ps1 -SqlServerInstance '.\SQLEXPRESS' -DatabaseName 'SWAG_db' -BackupDirectory 'D:\SWAG-Backups' -WhatIf
```

Run without `-WhatIf` only after confirming SQL Server service permissions. Schedule this script separately with Windows Task Scheduler at your chosen frequency; keep the output folder outside the repository.
