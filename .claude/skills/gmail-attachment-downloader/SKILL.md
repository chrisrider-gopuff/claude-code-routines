---
name: gmail-attachment-downloader
description: Download Gmail attachments to a Google Drive folder using the GmailAttachmentDownloader Apps Script. Use this skill whenever the user wants to save, grab, pull, download, or route email attachments to Drive -- e.g. "grab the attachments from those emails", "download the PDFs from counsel and put them in the Smith folder", "save the W9 from that email to the settlement folder", "pull any new docs from Gmail into Drive", "get the attachments from [sender]". Also trigger when the user asks Claude to browse or list Drive folders to find a destination. Always use this skill -- never try to interact with Gmail or Drive attachments through other means.
---

# Gmail Attachment Downloader

Downloads attachments from Gmail and saves them to a Google Drive folder by calling the GmailAttachmentDownloader Apps Script web app via PowerShell and Desktop Commander.

## Setup (one-time)

The PowerShell caller script is bundled at:
`C:\Users\ChrisRider\AppData\Roaming\Claude\local-agent-mode-sessions\skills-plugin\3cf28624-7531-452b-82e5-dd8966867b04\5228ea52-39a0-4328-b0d7-5bac77941940\skills\gmail-attachment-downloader\scripts\Invoke-GmailAttachments.ps1`

The passphrase is read automatically from `G:\My Drive\Automation\Phrase.txt` -- no other auth setup needed.

The Apps Script web app is already deployed and its URL is baked into the PowerShell script.

## Workflow

### Step 1 -- Understand what the user wants

Determine two things from the user's request:

**What emails** -- translate into a Gmail search query (same syntax as the Gmail search bar):
- "from opposing counsel" -> `from:@opposing-firm.com has:attachment`
- "unread emails with attachments" -> `has:attachment is:unread`
- "W9 from the Smith settlement" -> `has:attachment subject:W9 Smith`
- "attachments from last week" -> `has:attachment newer_than:7d`

**Where to put them** -- a Google Drive folder path or ID. If unclear, use the `listfolders` action to browse the Drive structure and confirm with the user before downloading.

If either is ambiguous, ask before proceeding.

### Step 2 -- Call via Desktop Commander

Use Desktop Commander's `start_process` or `execute_command` to run PowerShell.

The PowerShell script path (use this exactly):
`C:\Users\ChrisRider\AppData\Roaming\Claude\local-agent-mode-sessions\skills-plugin\3cf28624-7531-452b-82e5-dd8966867b04\5228ea52-39a0-4328-b0d7-5bac77941940\skills\gmail-attachment-downloader\scripts\Invoke-GmailAttachments.ps1`

**List folders** (browse Drive to find the right destination):
```
powershell -ExecutionPolicy Bypass -File "<script-path>" -Action listfolders -ListFolderPath "Litigation 2.0"
```

**Download attachments**:
```
powershell -ExecutionPolicy Bypass -File "<script-path>" -Action download -Query "has:attachment is:unread" -FolderPath "Litigation 2.0/Smith v Gopuff"
```

Available parameters for the `download` action:
- `-Query` -- Gmail search string (required)
- `-FolderPath` -- slash-separated Drive path, e.g. `"Litigation 2.0/Smith v Gopuff/Production"` (use this OR FolderId)
- `-FolderId` -- Google Drive folder ID (faster if you know it from a prior listfolders call)
- `-FilenameFilter` -- only grab files whose name contains this string, e.g. `".pdf"`
- `-MaxThreads` -- how many Gmail threads to scan (default 20, max 50)
- `-MarkAsRead` -- set `$true` to mark processed emails as read after saving
- `-SkipDuplicates` -- default `$true`; skips files already present in the destination

### Step 3 -- Read and present the result

The script returns JSON. Parse and summarize for the user:
- How many files were saved (`savedCount`)
- File names, email subjects, and Drive URLs from the `saved` array
- Any skipped duplicates or errors

If `success` is `false`, surface the `error` field and help troubleshoot (wrong passphrase, bad folder path, Drive permission issue, etc.).

### Step 4 -- Offer follow-up actions

After a successful download, offer to:
- Mark the emails as read (if not already done)
- Update the Airtable Legal Tracker or a Google Sheets discovery tracker if the files relate to a matter
- Re-run with a narrower or broader query if the result set looks off
