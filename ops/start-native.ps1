$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
$node='C:\Users\chesterman\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$caddy=Join-Path $project '.runtime\caddy\caddy.exe'
if(-not(Test-Path -LiteralPath $node)){throw 'StockFlow Node runtime is missing'}
if(-not(Test-Path -LiteralPath $caddy)){throw 'Caddy runtime is missing'}
& $node --env-file=(Join-Path $project '.env.production') (Join-Path $project 'scripts\validate-production-env.mjs')
& $node --env-file=(Join-Path $project '.env.production') (Join-Path $project 'scripts\configure-app-role.mjs')
& $node --env-file=(Join-Path $project '.env.production') (Join-Path $project 'scripts\migrate.mjs')
function Start-StockFlowProcess([string]$FileName,[string]$Arguments){
  $psi=[System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName=$FileName
  $psi.Arguments=$Arguments
  $psi.WorkingDirectory=$project
  $psi.UseShellExecute=$false
  $psi.CreateNoWindow=$true
  $psi.Environment.Clear()
  Get-ChildItem Env: | Group-Object {$_.Name.ToUpperInvariant()} | ForEach-Object {
    $entry=$_.Group[-1]
    $psi.Environment[$entry.Name]=$entry.Value
  }
  [void][System.Diagnostics.Process]::Start($psi)
}
Start-StockFlowProcess $node '--env-file=.env.production node_modules/vinext/dist/cli.js start --host 127.0.0.1 --port 3100'
Start-Sleep -Seconds 4
Start-StockFlowProcess $caddy 'run --config ops/Caddyfile.windows --adapter caddyfile'
Write-Output 'StockFlow native production processes started.'
