# Build Otiyot+ for Chrome Web Store (Windows PowerShell)
# Usage: .\scripts\build.ps1 [stable|beta]
param(
    [Parameter(Position = 0)]
    [ValidateSet('stable', 'beta')]
    [string]$Channel = 'stable'
)

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir    = Split-Path -Parent $ScriptDir
$SrcDir     = Join-Path $RootDir 'src'
$ManifestFile = Join-Path $RootDir "manifests\manifest.$Channel.json"
$ReleasesDir  = Join-Path $RootDir 'releases'

# Read version from manifest
$ManifestData = Get-Content $ManifestFile | ConvertFrom-Json
$Version = $ManifestData.version
$Output  = Join-Path $ReleasesDir "otiyot-plus-v$Version-$Channel.zip"

Write-Host "Building Otiyot+ $Channel v$Version..."

# Create temp directory
$TempDir = Join-Path $env:TEMP "otiyot-build-$(Get-Date -Format 'yyyyMMddHHmmss')"
New-Item -ItemType Directory -Path $TempDir | Out-Null

try {
    # Copy source files
    Copy-Item -Path "$SrcDir\*" -Destination $TempDir -Recurse -Force

    # Inject channel manifest
    Copy-Item -Path $ManifestFile -Destination (Join-Path $TempDir 'manifest.json') -Force

    # Patch popup badge for stable builds
    if ($Channel -eq 'stable') {
        $PopupPath = Join-Path $TempDir 'popup.html'
        (Get-Content $PopupPath -Raw) -replace 'Open Beta', 'Stable' |
            Set-Content $PopupPath -NoNewline
    }

    # Package
    if (-not (Test-Path $ReleasesDir)) {
        New-Item -ItemType Directory -Path $ReleasesDir | Out-Null
    }
    if (Test-Path $Output) { Remove-Item $Output }
    Compress-Archive -Path "$TempDir\*" -DestinationPath $Output

    Write-Host ""
    Write-Host "Done! Package ready for Chrome Web Store upload:"
    Write-Host "  $Output"
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  1. Go to https://chrome.google.com/webstore/devconsole"
    Write-Host "  2. Upload $Output"
    Write-Host "  3. Tag this release: git tag v$Version-$Channel && git push --tags"
} finally {
    Remove-Item -Recurse -Force $TempDir
}
