Write-Warning 'ops\stockflow.ps1 is retained for compatibility. Use ops\warevanta-wms.ps1.'
& (Join-Path $PSScriptRoot 'warevanta-wms.ps1') @args
exit $LASTEXITCODE
