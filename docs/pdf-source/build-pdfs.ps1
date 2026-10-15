# Renders the HTML sources in this folder to PDF with headless Chrome.
# Usage:  powershell -ExecutionPolicy Bypass -File docs\pdf-source\build-pdfs.ps1 [business|technical|status|payments|payments-en]
# feature-status.html is generated: run `node docs\pdf-source\build-feature-status.cjs` first.
param([string]$Only = '')

$ErrorActionPreference = 'Stop'
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$docs = Split-Path -Parent $here
$profileDir = Join-Path $env:TEMP 'xo-pdf-chrome-profile'

$targets = @(
  @{ Key = 'business';  Src = 'business.html';  Out = 'XO-Platform-Business-and-Delivery-Blueprint.pdf' },
  @{ Key = 'technical'; Src = 'technical.html'; Out = 'XO-Platform-Technical-Documentation.pdf' },
  @{ Key = 'status';    Src = 'feature-status.html'; Out = 'XO-Platform-Feature-Status-and-Delivery-Plan.pdf' },
  @{ Key = 'payments';  Src = 'payment-integration.html'; Out = 'XO-Platform-Payment-Integration-Guide.pdf' },
  @{ Key = 'payments-en'; Src = 'payment-integration.en.html'; Out = 'XO-Platform-Payment-Integration-Guide-EN.pdf' }
)

foreach ($t in $targets) {
  if ($Only -and $Only -ne $t.Key) { continue }
  $src = Join-Path $here $t.Src
  if (-not (Test-Path $src)) { Write-Host "skip $($t.Src) (missing)"; continue }
  # Chrome's --print-to-pdf does not cope with spaces in the output path, so render to TEMP first.
  $tmp = Join-Path $env:TEMP ("xo-" + $t.Key + ".pdf")
  if (Test-Path $tmp) { Remove-Item $tmp -Force }
  $url = 'file:///' + ($src -replace '\\', '/' -replace ' ', '%20')
  $chromeArgs = @('--headless=new', '--disable-gpu', '--no-pdf-header-footer',
    "--user-data-dir=`"$profileDir`"", '--virtual-time-budget=15000',
    "--print-to-pdf=`"$tmp`"", "`"$url`"")
  Start-Process -FilePath $chrome -ArgumentList $chromeArgs -Wait -WindowStyle Hidden
  if (-not (Test-Path $tmp)) { throw "Chrome produced no PDF for $($t.Src)" }
  Copy-Item $tmp (Join-Path $docs $t.Out) -Force
  Write-Host ("built " + $t.Out + "  (" + [math]::Round((Get-Item $tmp).Length / 1KB) + " KB)")
}
