param([string]$Destination)
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
$pgBin=Join-Path $project '.runtime\postgresql\pgsql\bin'
$envFile=Join-Path $project '.env.production'
if(-not(Test-Path -LiteralPath $envFile)){throw '.env.production is missing'}
if(-not $Destination){$Destination=Join-Path $project 'backups'}
New-Item -ItemType Directory -Force -Path $Destination | Out-Null

$settings=@{}
Get-Content -LiteralPath $envFile | ForEach-Object {
  if($_ -match '^\s*([^#=]+)=(.*)$'){$settings[$matches[1].Trim()]=$matches[2].Trim()}
}
$databaseUrl=$settings['DATABASE_ADMIN_URL']
if(-not $databaseUrl){throw 'DATABASE_ADMIN_URL is missing'}
$retention=14
if($settings['BACKUP_RETENTION_DAYS']){$retention=[int]$settings['BACKUP_RETENTION_DAYS']}
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$dump=Join-Path $Destination "stockflow-$stamp.dump"
$manifest="$dump.sha256"

& (Join-Path $pgBin 'pg_dump.exe') --format=custom --no-owner --file=$dump --dbname=$databaseUrl
if($LASTEXITCODE -ne 0){throw 'Database backup failed'}
& (Join-Path $pgBin 'pg_restore.exe') --list $dump | Out-Null
if($LASTEXITCODE -ne 0){throw 'Backup verification failed'}
$hash=(Get-FileHash -Algorithm SHA256 -LiteralPath $dump).Hash.ToLowerInvariant()
Set-Content -LiteralPath $manifest -Value "$hash  $([IO.Path]::GetFileName($dump))"
Get-ChildItem -LiteralPath $Destination -Filter 'stockflow-*.dump*' | Where-Object LastWriteTime -LT (Get-Date).AddDays(-$retention) | Remove-Item -Force
Write-Output "Verified backup created: $dump"
