param([Parameter(Mandatory=$true)][string]$BackupFile,[Parameter(Mandatory=$true)][string]$ConfirmRestore)
$ErrorActionPreference='Stop'
if($ConfirmRestore -ne 'RESTORE_STOCKFLOW'){throw 'Pass -ConfirmRestore RESTORE_STOCKFLOW to acknowledge that the target database will be replaced.'}
$resolved=(Resolve-Path -LiteralPath $BackupFile).Path
if(-not $resolved.EndsWith('.dump')){throw 'Backup file must end in .dump'}
if(-not $env:DATABASE_ADMIN_URL){throw 'DATABASE_ADMIN_URL is required'}
$project=Split-Path -Parent $PSScriptRoot
$pgRestore=Join-Path $project '.runtime\postgresql\pgsql\bin\pg_restore.exe'
if(-not(Test-Path -LiteralPath $pgRestore)){throw 'StockFlow PostgreSQL runtime is missing'}
& $pgRestore --exit-on-error --clean --if-exists --no-owner --dbname=$env:DATABASE_ADMIN_URL $resolved
if($LASTEXITCODE -ne 0){throw 'Restore failed'}
Write-Output "Restore completed from $resolved"
