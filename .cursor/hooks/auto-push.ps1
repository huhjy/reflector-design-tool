# Runs on Cursor agent `stop`. Pushes when the run completed successfully, the
# working tree is clean, and this branch is ahead of its upstream.
# Opt out: set env CURSOR_DISABLE_AUTO_PUSH=1 or touch .cursor/disable-auto-push

$ErrorActionPreference = 'Stop'

function Write-HookOutput {
    param([string]$Json = '{}')
    [Console]::Out.Write($Json.TrimEnd())
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\\..')).Path

try {
    $raw = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($raw)) {
        Write-HookOutput
        exit 0
    }
    $j = $raw | ConvertFrom-Json
    if ($j.status -ne 'completed') {
        Write-HookOutput
        exit 0
    }
}
catch {
    Write-HookOutput
    exit 0
}

if ($env:CURSOR_DISABLE_AUTO_PUSH -eq '1') {
    Write-HookOutput
    exit 0
}
if (Test-Path (Join-Path $repoRoot '.cursor/disable-auto-push')) {
    Write-HookOutput
    exit 0
}

Set-Location $repoRoot

if (-not (Test-Path (Join-Path $repoRoot '.git'))) {
    Write-HookOutput
    exit 0
}

$dirty = git status --porcelain 2>$null
if (-not [string]::IsNullOrWhiteSpace($dirty)) {
    Write-HookOutput
    exit 0
}

git rev-parse --abbrev-ref '@{u}' 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-HookOutput
    exit 0
}

$ahead = git rev-list --count '@{u}..HEAD' 2>$null
if (-not $ahead -or [int]$ahead -le 0) {
    Write-HookOutput
    exit 0
}

$pushOut = git push origin HEAD 2>&1
if ($LASTEXITCODE -ne 0) {
    [Console]::Error.WriteLine("[auto-push] git push failed: $pushOut")
}

Write-HookOutput
exit 0
