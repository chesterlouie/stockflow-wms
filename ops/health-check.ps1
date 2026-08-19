param([string]$Url='https://localhost/api/ready')
$ErrorActionPreference='Stop'
try{$response=Invoke-RestMethod -Uri $Url -TimeoutSec 10;if($response.status -ne 'ready'){throw "Unexpected status: $($response.status)"};Write-Output "Warevanta ready; database $($response.database); migration $($response.migration)"}catch{Write-Error "Warevanta health check failed: $($_.Exception.Message)";exit 1}
