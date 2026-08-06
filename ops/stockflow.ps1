param(
  [ValidateSet('start','stop','restart','status')]
  [string]$Action='start'
)
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
$node='C:\Users\chesterman\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$pgBin=Join-Path $project '.runtime\postgresql\pgsql\bin'
$pgData=Join-Path $project '.runtime\pgdata'
$pgLog=Join-Path $project '.runtime\native-postgresql.log'
$caddy=Join-Path $project '.runtime\caddy\caddy.exe'
$envFile=Join-Path $project '.env.production'

function Get-PortProcessId([int]$Port){
  $line=netstat -ano -p tcp | Select-String (":$Port\s+.*LISTENING\s+(\d+)\s*$") | Select-Object -First 1
  if($line -and $line.Matches.Count){return [int]$line.Matches[0].Groups[1].Value}
  return $null
}
function Start-CleanProcess([string]$FileName,[string]$Arguments){
  $psi=[System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName=$FileName
  $psi.Arguments=$Arguments
  $psi.WorkingDirectory=$project
  $psi.UseShellExecute=$false
  $psi.CreateNoWindow=$true
  $psi.Environment.Clear()
  [Environment]::GetEnvironmentVariables().GetEnumerator() | Group-Object {$_.Key.ToString().ToUpperInvariant()} | ForEach-Object {
    $entry=$_.Group[-1]
    $psi.Environment[$entry.Key.ToString()]=$entry.Value.ToString()
  }
  [void][System.Diagnostics.Process]::Start($psi)
}
function Wait-ForPort([int]$Port,[int]$Seconds=20){
  $deadline=(Get-Date).AddSeconds($Seconds)
  do{if(Get-PortProcessId $Port){return};Start-Sleep -Milliseconds 500}while((Get-Date)-lt$deadline)
  throw "Service did not begin listening on port $Port within $Seconds seconds."
}
function Show-Status {
  $database=if(Get-PortProcessId 5432){'running'}else{'stopped'}
  $application=if(Get-PortProcessId 3100){'running'}else{'stopped'}
  $https=if(Get-PortProcessId 443){'running'}else{'stopped'}
  Write-Output "Database:    $database"
  Write-Output "Application: $application"
  Write-Output "HTTPS:       $https"
  if($database -eq 'running' -and $application -eq 'running' -and $https -eq 'running'){
    try{$ready=Invoke-RestMethod -Uri 'http://127.0.0.1:3100/api/ready' -TimeoutSec 10;Write-Output "Health:      $($ready.status) (database $($ready.database), migration $($ready.migration))"}catch{Write-Output "Health:      failed - $($_.Exception.Message)"}
  }
}
function Start-StockFlow {
  foreach($required in @($node,(Join-Path $pgBin 'pg_ctl.exe'),$pgData,$caddy,$envFile)){if(-not(Test-Path -LiteralPath $required)){throw "Required StockFlow component is missing: $required"}}
  Get-Content -LiteralPath $envFile | ForEach-Object {
    if($_ -match '^\s*([^#=]+)=(.*)$'){
      [Environment]::SetEnvironmentVariable($matches[1].Trim(),$matches[2].Trim(),'Process')
    }
  }
  if(-not(Get-PortProcessId 5432)){
    Write-Output 'Starting database...'
    & (Join-Path $pgBin 'pg_ctl.exe') start -D $pgData -l $pgLog -w
    if($LASTEXITCODE -ne 0){throw 'PostgreSQL failed to start.'}
    Wait-ForPort 5432
  }else{Write-Output 'Database is already running.'}
  & $node --env-file=$envFile (Join-Path $project 'scripts\validate-production-env.mjs')
  if($LASTEXITCODE -ne 0){throw 'Production settings validation failed.'}
  & $node --env-file=$envFile (Join-Path $project 'scripts\configure-app-role.mjs')
  if($LASTEXITCODE -ne 0){throw 'Database application role configuration failed.'}
  & $node --env-file=$envFile (Join-Path $project 'scripts\migrate.mjs')
  if($LASTEXITCODE -ne 0){throw 'Database migration failed.'}
  if(-not(Get-PortProcessId 3100)){
    Write-Output 'Starting StockFlow application...'
    Start-CleanProcess $node '--env-file=.env.production node_modules/vinext/dist/cli.js start --hostname 127.0.0.1 --port 3100'
    Wait-ForPort 3100
  }else{Write-Output 'Application is already running.'}
  if(-not(Get-PortProcessId 443)){
    Write-Output 'Starting secure HTTPS gateway...'
    Start-CleanProcess $caddy 'run --config ops/Caddyfile.windows --adapter caddyfile'
    Wait-ForPort 443
  }else{Write-Output 'HTTPS gateway is already running.'}
  $ready=Invoke-RestMethod -Uri 'http://127.0.0.1:3100/api/ready' -TimeoutSec 15
  if($ready.status -ne 'ready'){throw "Unexpected readiness status: $($ready.status)"}
  Write-Output "StockFlow is ready at https://localhost (migration $($ready.migration))."
}
function Stop-PortService([int]$Port,[string]$ExpectedName){
  $processId=Get-PortProcessId $Port
  if(-not $processId){return}
  $process=Get-Process -Id $processId -ErrorAction Stop
  if($process.ProcessName -ne $ExpectedName){throw "Port $Port belongs to unexpected process $($process.ProcessName); it was not stopped."}
  Stop-Process -Id $processId -Force
}
function Stop-StockFlow {
  Write-Output 'Stopping HTTPS gateway and application...'
  Stop-PortService 443 'caddy'
  Stop-PortService 3100 'node'
  if(Get-PortProcessId 5432){
    Write-Output 'Stopping database safely...'
    & (Join-Path $pgBin 'pg_ctl.exe') stop -D $pgData -m fast -w
    if($LASTEXITCODE -ne 0){throw 'PostgreSQL failed to stop cleanly.'}
  }
  Write-Output 'StockFlow services are stopped.'
}

Set-Location $project
switch($Action){
  'start'{Start-StockFlow}
  'stop'{Stop-StockFlow}
  'restart'{Stop-StockFlow;Start-StockFlow}
  'status'{Show-Status}
}
