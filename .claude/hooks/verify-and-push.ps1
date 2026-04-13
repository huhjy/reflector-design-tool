param(
    # Set when invoked from a Claude Code hook so stdin (hook JSON) is consumed.
    [switch] $FromHook
)

$ErrorActionPreference = 'Stop'

function Get-ProjectRoot {
    if ($env:CLAUDE_PROJECT_DIR -and (Test-Path $env:CLAUDE_PROJECT_DIR)) {
        return (Resolve-Path $env:CLAUDE_PROJECT_DIR).Path
    }
    return (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

if ($FromHook) {
    try {
        $null = [Console]::In.ReadToEnd()
    }
    catch {
        # ignore
    }
}

$root = Get-ProjectRoot
Set-Location $root

if ($env:CLAUDE_DISABLE_AUTO_PUSH -eq '1') {
    exit 0
}
if (Test-Path (Join-Path $root '.claude/disable-auto-push')) {
    exit 0
}

if (-not (Test-Path (Join-Path $root '.git'))) {
    exit 0
}

# Optional: run npm test when a test script exists
$pkgPath = Join-Path $root 'package.json'
if (Test-Path $pkgPath) {
    try {
        $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
        $hasTest = $pkg.scripts.PSObject.Properties.Name -contains 'test'
        if ($hasTest) {
            npm test
            if ($LASTEXITCODE -ne 0) {
                [Console]::Error.WriteLine('[verify-and-push] npm test failed; not committing or pushing.')
                exit 1
            }
        }
    }
    catch {
        [Console]::Error.WriteLine("[verify-and-push] Skipping npm test: $_")
    }
}

$dirty = git status --porcelain 2>$null
if ([string]::IsNullOrWhiteSpace($dirty)) {
    git rev-parse --abbrev-ref '@{u}' 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $ahead = git rev-list --count '@{u}..HEAD' 2>$null
        if ($ahead -and [int]$ahead -gt 0) {
            git push origin HEAD
        }
    }
    exit 0
}

git add -A
$still = git status --porcelain 2>$null
if ([string]::IsNullOrWhiteSpace($still)) {
    exit 0
}

$msg = "chore: sync after Claude Code ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))"
git commit -m $msg
if ($LASTEXITCODE -ne 0) {
    [Console]::Error.WriteLine('[verify-and-push] git commit failed or nothing to commit.')
    exit 1
}

git push origin HEAD
if ($LASTEXITCODE -ne 0) {
    [Console]::Error.WriteLine('[verify-and-push] git push failed.')
    exit 1
}

exit 0
