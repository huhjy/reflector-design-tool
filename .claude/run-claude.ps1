# Run Claude Code from the repo root, then verify/commit/push when the process exits.
# Usage (from repo root): pwsh .claude/run-claude.ps1
# Pass-through:           pwsh .claude/run-claude.ps1 -- your claude args

param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $ClaudeArgs
)

$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $PSCommandPath
$root = (Resolve-Path (Join-Path $here '..')).Path
$hook = Join-Path $here 'hooks/verify-and-push.ps1'

Push-Location $root
try {
    if ($ClaudeArgs -and $ClaudeArgs.Count -gt 0) {
        & claude @ClaudeArgs
    }
    else {
        & claude
    }
}
finally {
    Pop-Location
    & $hook
}
