# ============================================================
# Invoke-GmailAttachments.ps1
# PowerShell helper — called by Claude via Desktop Commander
# to interact with the GmailAttachmentDownloader Apps Script.
# ============================================================
# SETUP
#   1. Set $WebAppUrl to your deployed Apps Script Web App URL.
#   2. Save your passphrase (just the phrase, no extra whitespace)
#      to: G:\My Drive\Automation\Phrase.txt
#      The script reads it from there automatically.
#   3. Save this file somewhere Claude can reach via Desktop Commander.
# ============================================================

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("download","listfolders")]
    [string]$Action,

    # --- Auth ---
    [string]$WebAppUrl      = "https://script.google.com/macros/s/AKfycbwCByAvSmtCaquwIJ0fQ857HlCQjjT5G7jscZ0RApjK7h8bg-nlxPVs2kQEeCU9NOfU/exec",
    [string]$PassphrasePath = "G:\My Drive\Automation\Phrase.txt",

    # --- Download params (used when Action = "download") ---
    # Gmail search query — same syntax as the Gmail search bar
    [string]$Query           = "has:attachment is:unread",
    # Destination: either a Drive folder ID *or* a slash-separated path
    [string]$FolderId        = "",
    [string]$FolderPath      = "",
    # Max Gmail threads to scan (capped at 50 in the script)
    [int]   $MaxThreads      = 20,
    # Only grab attachments whose filename contains this string (e.g. ".pdf")
    [string]$FilenameFilter  = "",
    # Mark processed messages as read after saving
    [bool]  $MarkAsRead      = $false,
    # Skip files that already exist in the destination folder
    [bool]  $SkipDuplicates  = $true,

    # --- ListFolders params (used when Action = "listfolders") ---
    # Leave blank to list My Drive root; or pass FolderId / FolderPath
    [string]$ListFolderId    = "",
    [string]$ListFolderPath  = ""
)

# ── load passphrase from file ─────────────────────────────────

if (-not (Test-Path $PassphrasePath)) {
    Write-Error "Passphrase file not found: $PassphrasePath"
    exit 1
}
$Passphrase = (Get-Content $PassphrasePath -Raw).Trim()
if ([string]::IsNullOrEmpty($Passphrase)) {
    Write-Error "Passphrase file is empty: $PassphrasePath"
    exit 1
}

# ── build request body ────────────────────────────────────────

$body = @{
    passphrase = $Passphrase
    action     = $Action
}

switch ($Action) {
    "download" {
        $body.query           = $Query
        $body.maxThreads      = $MaxThreads
        $body.markAsRead      = $MarkAsRead
        $body.skipDuplicates  = $SkipDuplicates

        if ($FolderId)       { $body.folderId       = $FolderId }
        if ($FolderPath)     { $body.folderPath      = $FolderPath }
        if ($FilenameFilter) { $body.filenameFilter  = $FilenameFilter }
    }
    "listfolders" {
        if ($ListFolderId)   { $body.folderId        = $ListFolderId }
        if ($ListFolderPath) { $body.folderPath       = $ListFolderPath }
    }
}

# ── call the web app ──────────────────────────────────────────

try {
    $response = Invoke-RestMethod `
        -Uri         $WebAppUrl `
        -Method      Post `
        -Body        (ConvertTo-Json $body -Depth 5) `
        -ContentType "application/json" `
        -ErrorAction Stop

    # Pretty-print the result so Claude can parse it cleanly
    $response | ConvertTo-Json -Depth 10

} catch {
    Write-Error "HTTP call failed: $_"
    exit 1
}
