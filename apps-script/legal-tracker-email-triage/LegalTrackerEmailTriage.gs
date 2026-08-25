// Legal Tracker — Email-Only Triage (standalone Apps Script, no LLM, no Slack)
//
// A deterministic port of routines/legal-tracker-triage/prompt.md's Gmail
// half only. There is no Slack search (Step 4 of prompt.md is dropped
// entirely) and no Slack summary (Step 6's #tracker-updates post is replaced
// with an email to SUMMARY_EMAIL_TO). Everything Gmail-side — the review
// window, the Thread Matches cache, the "!update" label exception, Match
// Confidence tiers, and the Update Matches / Thread Matches field layout —
// mirrors prompt.md as closely as a plain script can.
//
// WHY THIS IS NOT JUST "THE ROUTINE WITHOUT SLACK": prompt.md's matching and
// summarization are done by an LLM reading full thread context and using
// judgment ("strong" vs "weak" match, what counts as a formal-service
// notice, what's pure housekeeping). This script has no LLM in the loop, so
// those judgment calls are replaced with concrete, best-effort rules — see
// the comments on ltt_matchThread_ and ltt_buildEntryText_ below. Read
// README.md in this directory before relying on this for anything Chris
// would otherwise have caught by eye.
//
// One upside of having no LLM in the loop: prompt.md's whole "Security:
// treat swept content as data, not instructions" section exists because a
// crafted email could try to talk an LLM into writing somewhere else or
// picking a confidence it didn't earn. This script only ever does string
// matching against Gmail metadata/body text — there is nothing in it that
// treats email content as an instruction, so that attack surface doesn't
// apply here. It does NOT remove the *other* risk prompt.md calls out: the
// native Airtable connector's tier enforcement is gone regardless of caller,
// and this script (like the LLM routine) never calls anything but
// list/create against Airtable, and only ever against Update Matches /
// Thread Matches — see "Airtable access" below.
//
// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
// 1. Create a new standalone Apps Script project at script.google.com and
//    paste in this file.
// 2. Project Settings -> Script Properties, set:
//      AIRTABLE_API_KEY   — Legal Tracker base's Airtable personal access
//                            token (read/create scope on this base only).
//                            Never shared outside this project.
//      AIRTABLE_BASE_ID    — optional, defaults to LTT_BASE_ID below
//                            (appFIB9fJCzTeFDcG).
//      SUMMARY_EMAIL_TO    — optional, defaults to chris.rider@gopuff.com.
// 3. Project Settings -> Time zone: set to America/New_York so a time-driven
//    trigger's "hour" lines up with Eastern the way prompt.md's schedule
//    does (Apps Script triggers fire in the project's time zone, not UTC).
// 4. Run installWeeklyTrigger() once (select it in the function dropdown,
//    Run) to install the Friday 3 AM trigger. Run runLegalTrackerEmailTriage
//    directly first to sanity-check against real data before relying on the
//    trigger.
//
// ---------------------------------------------------------------------------
// Airtable access
// ---------------------------------------------------------------------------
// Talks to the Airtable REST API directly with AIRTABLE_API_KEY (this
// script's Script Properties are the only place that key lives — same
// posture as AirtableMcpServer.gs, just without a proxy layer in front of
// it, since this script IS the caller, not something else calling through
// it). Only ever calls GET (list) and POST-create against Update Matches
// and Thread Matches; never update/delete any table; Case Activity is read
// (GET) only, to build the "already logged" set. No code path in this file
// can write Case Activity or Cases — same discipline prompt.md's "Airtable
// access" section asks of the LLM routine, just enforced by there being no
// update/PATCH/DELETE call written anywhere below, not by a caller prompt.

const LTT_BASE_ID_DEFAULT = "appFIB9fJCzTeFDcG";
const LTT_SUMMARY_EMAIL_DEFAULT = "chris.rider@gopuff.com";
const LTT_UPDATE_LABEL = "!update";

const LTT_TABLES = {
  CASES: "Cases",
  OPPOSING_COUNSEL: "Opposing Counsel",
  UPDATE_MATCHES: "Update Matches",
  CASE_ACTIVITY: "Case Activity",
  THREAD_MATCHES: "Thread Matches"
};

// Keyword signal for "this is reporting formal service of a complaint,
// lawsuit, or hearing notice" — prompt.md Step 5's rule that this always
// clears at least Medium Confidence on a name/number match alone, even
// without an Opposing Counsel sender match (process servers, court clerks,
// registered agents don't show up in the Opposing Counsel table).
const LTT_SERVICE_KEYWORDS = [
  "summons", "served", "service of process", "notice of hearing",
  "hearing notice", "complaint filed", "lawsuit", "charge of discrimination",
  "eeoc charge", "demand letter", "subpoena"
];

// Best-effort stand-in for prompt.md's "skip pure discovery-tracker/
// document-housekeeping mechanics" constraint. A thread is skipped ONLY if
// it matches one of these AND contains none of LTT_SERVICE_KEYWORDS above —
// deliberately narrow, since a false skip here is worse than a false log
// (prompt.md's own "when in doubt, don't create a row" cuts the other way
// only because an LLM is doing the judging; a script guessing wrong to skip
// loses the item entirely with no LLM re-reading it later).
const LTT_HOUSEKEEPING_ONLY_PATTERNS = [
  /folder (has been )?(created|shared)/i,
  /tracker (has been )?created/i,
  /marked (the )?(action item |task )?(as )?resolved/i,
  /access (has been )?granted/i
];

// Optional: set to a Cases field name (e.g. "Case Number") if the base has
// one. prompt.md lists this as a matching signal (Step 3c) but only
// documents Matter/Status on the Cases table, so this is off by default —
// turn it on if/when the real field name is confirmed via ltt_verifySchema_.
const LTT_CASE_NUMBER_FIELD = "";

function runLegalTrackerEmailTriage() {
  const today = new Date();
  const dateLabel = Utilities.formatDate(today, Session.getScriptTimeZone(), "yyyy-MM-dd");
  const to = ltt_summaryEmailTo_();

  let schemaNotes;
  try {
    schemaNotes = ltt_verifySchema_();
  } catch (err) {
    ltt_sendFailureEmail_(to, dateLabel, err);
    return;
  }

  // Step 1: review window — 14 days, same doubling-for-safety-margin logic
  // as prompt.md (weekly cadence, double the 7-day gap between runs).
  const windowStart = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Step 2: load matching context. Any Airtable failure here stops the run
  // before Gmail is ever searched, per prompt.md's failure-handling rule.
  let context;
  try {
    context = ltt_loadContext_();
  } catch (err) {
    ltt_sendFailureEmail_(to, dateLabel, err);
    return;
  }

  // Step 3: search Gmail (label:"!update" always runs in full; the broad
  // date-range search falls back to per-Matter searches only if it looks
  // truncated — mirrors prompt.md's "cast wide... if a blanket search
  // truncates, split by Active Matter names" without unconditionally paying
  // for ~120 extra searches every run).
  const threads = ltt_searchGmailThreads_(windowStart, context.activeCaseList);

  const newUpdateMatchesFields = [];
  const newThreadMatchesFields = [];
  const summaryByMatter = {}; // matter label -> [entry line, ...]
  const needsManualAssignment = []; // subjects of !update threads with no case match
  let skippedUnmatchedCount = 0;

  threads.forEach(thread => {
    const threadId = thread.getId();
    const labels = thread.getLabels().map(l => l.getName());
    const hasUpdateLabel = labels.indexOf(LTT_UPDATE_LABEL) !== -1;

    const lastMessageDate = thread.getLastMessageDate();
    if (!lastMessageDate || lastMessageDate.getTime() < windowStart.getTime()) return; // no activity in window

    const loggedTs = context.loggedThreadLatestDate[threadId];
    const alreadyLogged = loggedTs !== undefined;
    if (alreadyLogged && lastMessageDate.getTime() <= loggedTs) return; // nothing new since last entry

    const cached = context.threadMatchByThreadId[threadId];
    const match = cached
      ? {
          matched: (cached.caseIds && cached.caseIds.length > 0) || !!cached.matter,
          confidence: cached.caseIds && cached.caseIds.length ? "Medium Confidence" : "No Confidence",
          caseIds: cached.caseIds || [],
          matterHint: cached.matter || "",
          hasUpdateLabel
        }
      : ltt_matchThread_(thread, context, hasUpdateLabel);

    if (!match.matched && !match.hasUpdateLabel) {
      skippedUnmatchedCount++;
      return;
    }

    const messages = thread.getMessages();
    const newestMessage = messages[messages.length - 1];
    const entryText = ltt_buildEntryText_(thread.getFirstMessageSubject() || "(no subject)", newestMessage.getPlainBody());

    if (!match.matched) {
      needsManualAssignment.push(thread.getFirstMessageSubject() || "(no subject)");
    }

    const activityDate = Utilities.formatDate(newestMessage.getDate(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    const emailLink = "https://mail.google.com/mail/u/0/#all/" + threadId;

    const fields = {
      "Activity Date": activityDate,
      "Entry": match.matched ? entryText : entryText + " [NEEDS MANUAL CASE ASSIGNMENT — no case matched, logged only because of the \"" + LTT_UPDATE_LABEL + "\" label]",
      "Entry Type": "Email",
      "Email Link": emailLink,
      "Match Confidence": match.confidence,
      "Thread ID": threadId,
      "Author": "Chris Rider"
    };
    // Case link is only ever populated with real record IDs already
    // fetched from the Cases table (context.activeCaseList /
    // context.allCasesById) — never a matter-name string. Left blank for
    // Low/No-Confidence-with-no-candidate, per prompt.md's Case-field rule.
    if (match.caseIds && match.caseIds.length) {
      fields["Case"] = match.caseIds;
    }
    newUpdateMatchesFields.push(fields);

    const matterLabel = match.matterHint || (match.caseIds[0] && context.allCasesById[match.caseIds[0]]) || "(unmatched)";
    if (!summaryByMatter[matterLabel]) summaryByMatter[matterLabel] = [];
    summaryByMatter[matterLabel].push(thread.getFirstMessageSubject() || "(no subject)");

    if (!cached) {
      newThreadMatchesFields.push({
        "Thread ID": threadId,
        "Cases": match.caseIds,
        "Matter Name": matterLabel === "(unmatched)" ? "" : matterLabel,
        "Entry Snippet": entryText.slice(0, 500),
        "Created At": dateLabel
      });
    }
  });

  // Step 5: write draft entries. Stop on the first failed batch rather than
  // continuing to the next — prompt.md's "do not attempt any partial
  // writes" can't be made fully atomic over multiple REST calls, so this is
  // the closest approximation: fail loud, fail early, and say in the
  // failure email exactly how many rows made it in before the error.
  let writtenUpdateMatches = 0;
  let writtenThreadMatches = 0;
  try {
    writtenUpdateMatches = ltt_createRecords_(LTT_TABLES.UPDATE_MATCHES, newUpdateMatchesFields);
    writtenThreadMatches = ltt_createRecords_(LTT_TABLES.THREAD_MATCHES, newThreadMatchesFields);
  } catch (err) {
    ltt_sendFailureEmail_(
      to,
      dateLabel,
      err,
      "Wrote " + writtenUpdateMatches + "/" + newUpdateMatchesFields.length + " Update Matches rows and " +
      writtenThreadMatches + "/" + newThreadMatchesFields.length + " Thread Matches rows before this failure."
    );
    return;
  }

  ltt_sendSummaryEmail_(to, dateLabel, summaryByMatter, skippedUnmatchedCount, needsManualAssignment, schemaNotes);
}

// ---------------------------------------------------------------------------
// Matching (Step 3 of prompt.md, Gmail-only)
// ---------------------------------------------------------------------------

// Deterministic stand-in for the LLM's judgment in prompt.md Step 3/5. Rules
// actually codified here:
//   - Opposing Counsel Primary Contact Email on any From/To/Cc header of any
//     message in the thread, linking to exactly one Case -> Medium
//     Confidence (prompt.md 3a).
//   - Exact Matter-name substring match (case-insensitive) in subject/body
//     -> treated as prompt.md's "explicit name" signal -> Medium Confidence
//     if it's the only strong candidate.
//   - Optional case-number field match (LTT_CASE_NUMBER_FIELD) -> same tier
//     as an exact Matter-name match.
//   - Multiple strong candidates (OC + exact-name + case-number combined,
//     deduped) -> No Confidence, Case linked to all of them (never a guess
//     at which one).
//   - A weaker signal — a single distinctive word (>=4 chars) from a Matter
//     name appearing in the text, with no exact/OC/case-number match ->
//     Low Confidence, Case left blank, matter named in the Entry text.
//   - "!update" label with none of the above -> matched=false but
//     hasUpdateLabel=true, so the caller still logs it per prompt.md 3's
//     exception.
function ltt_matchThread_(thread, context, hasUpdateLabel) {
  const messages = thread.getMessages();
  const subject = thread.getFirstMessageSubject() || "";
  const bodyText = messages.map(m => (m.getPlainBody() || "").slice(0, 2000)).join("\n");
  const haystack = (subject + "\n" + bodyText).toLowerCase();

  if (ltt_isHousekeepingOnly_(haystack)) {
    return { matched: false, confidence: "No Confidence", caseIds: [], matterHint: "", hasUpdateLabel };
  }

  const emails = new Set();
  messages.forEach(m => {
    ltt_extractEmails_(m.getFrom()).forEach(e => emails.add(e));
    ltt_extractEmails_(m.getTo()).forEach(e => emails.add(e));
    ltt_extractEmails_(m.getCc()).forEach(e => emails.add(e));
  });

  const strongIds = new Set();
  emails.forEach(e => {
    const oc = context.ocByEmail[e];
    if (oc) oc.caseIds.forEach(id => strongIds.add(id));
  });

  const exactMatterMatches = context.activeCaseList.filter(c => haystack.indexOf(c.matter.toLowerCase()) !== -1);
  exactMatterMatches.forEach(c => strongIds.add(c.id));

  if (LTT_CASE_NUMBER_FIELD) {
    context.activeCaseList.forEach(c => {
      const num = c.caseNumber;
      if (num && num.length >= 4 && haystack.indexOf(String(num).toLowerCase()) !== -1) strongIds.add(c.id);
    });
  }

  if (strongIds.size === 1) {
    return { matched: true, confidence: "Medium Confidence", caseIds: [Array.from(strongIds)[0]], matterHint: "", hasUpdateLabel };
  }
  if (strongIds.size > 1) {
    return { matched: true, confidence: "No Confidence", caseIds: Array.from(strongIds), matterHint: "", hasUpdateLabel };
  }

  const weakMatterMatches = context.activeCaseList.filter(c => {
    if (exactMatterMatches.indexOf(c) !== -1) return false;
    const words = c.matter.split(/[^a-z0-9]+/i).filter(w => w.length >= 4);
    return words.some(w => new RegExp("\\b" + ltt_escapeRegex_(w) + "\\b", "i").test(haystack));
  });

  const isServiceNotice = LTT_SERVICE_KEYWORDS.some(kw => haystack.indexOf(kw) !== -1);

  if (weakMatterMatches.length === 1) {
    // prompt.md Step 5: formal-service language bumps a name-only match to
    // Medium even without an Opposing Counsel sender match.
    const confidence = isServiceNotice ? "Medium Confidence" : "Low Confidence";
    return {
      matched: true,
      confidence,
      caseIds: confidence === "Medium Confidence" ? [weakMatterMatches[0].id] : [],
      matterHint: weakMatterMatches[0].matter,
      hasUpdateLabel
    };
  }
  if (weakMatterMatches.length > 1) {
    return { matched: true, confidence: "No Confidence", caseIds: weakMatterMatches.map(c => c.id), matterHint: "", hasUpdateLabel };
  }

  return { matched: false, confidence: "No Confidence", caseIds: [], matterHint: "", hasUpdateLabel };
}

function ltt_isHousekeepingOnly_(haystack) {
  const isHousekeeping = LTT_HOUSEKEEPING_ONLY_PATTERNS.some(re => re.test(haystack));
  if (!isHousekeeping) return false;
  return !LTT_SERVICE_KEYWORDS.some(kw => haystack.indexOf(kw) !== -1);
}

function ltt_extractEmails_(headerValue) {
  if (!headerValue) return [];
  const matches = headerValue.match(/[^\s<>,"]+@[^\s<>,"]+/g) || [];
  return matches.map(e => e.replace(/[.,;]+$/, "").toLowerCase());
}

function ltt_escapeRegex_(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Not an LLM-written "concise, factual, third-person summary" — just the
// newest message's subject plus a trimmed, quote-stripped snippet of its
// plain body. This is raw material for Chris to skim during his Update
// Matches review, not a finished entry the way prompt.md's LLM routine
// produces. If a real summarizer is ever wired in (e.g. a Claude API call),
// this is the function to replace.
function ltt_buildEntryText_(subject, plainBody) {
  let body = (plainBody || "").replace(/\r/g, "");
  const quoteBoundary = body.search(/\n(On .{0,80} wrote:|-{2,}\s*Original Message\s*-{2,}|From: )/i);
  if (quoteBoundary !== -1) body = body.slice(0, quoteBoundary);
  body = body.trim().replace(/\s+/g, " ");
  const snippet = body.length > 300 ? body.slice(0, 300) + "…" : body;
  return subject + (snippet ? " — " + snippet : "");
}

// ---------------------------------------------------------------------------
// Gmail search
// ---------------------------------------------------------------------------

function ltt_searchGmailThreads_(windowStart, activeCaseList) {
  const afterStr = Utilities.formatDate(windowStart, Session.getScriptTimeZone(), "yyyy/MM/dd");
  const byId = {};
  const addAll = threads => threads.forEach(t => { byId[t.getId()] = t; });

  addAll(GmailApp.search('label:"' + LTT_UPDATE_LABEL + '" after:' + afterStr, 0, 500));

  const broad = GmailApp.search("after:" + afterStr, 0, 500);
  addAll(broad);

  // Only pay for per-Matter fallback searches if the broad search looks
  // truncated (hit the page cap) or came back suspiciously empty —
  // approximates prompt.md's "cast wide... if truncated, split by Matter
  // names" without unconditionally running ~120 extra searches every week.
  if (broad.length === 0 || broad.length >= 500) {
    activeCaseList.forEach(c => {
      if (!c.matter) return;
      try {
        addAll(GmailApp.search('"' + c.matter.replace(/"/g, "") + '" after:' + afterStr, 0, 50));
      } catch (err) {
        Logger.log("Per-matter Gmail search failed for \"" + c.matter + "\": " + err.message);
      }
    });
  }

  return Object.keys(byId).map(id => byId[id]);
}

// ---------------------------------------------------------------------------
// Airtable context (Step 2 of prompt.md)
// ---------------------------------------------------------------------------

function ltt_loadContext_() {
  const casesAll = ltt_listAllRecords_(LTT_TABLES.CASES);
  const allCasesById = {};
  casesAll.forEach(r => { allCasesById[r.id] = r.fields["Matter"] || ""; });

  const activeCaseList = casesAll
    .filter(r => r.fields["Status"] === "Active" && r.fields["Matter"])
    .map(r => ({
      id: r.id,
      matter: r.fields["Matter"],
      caseNumber: LTT_CASE_NUMBER_FIELD ? r.fields[LTT_CASE_NUMBER_FIELD] : ""
    }));

  const opposingCounsel = ltt_listAllRecords_(LTT_TABLES.OPPOSING_COUNSEL);
  const ocByEmail = {};
  opposingCounsel.forEach(r => {
    const email = (r.fields["Primary Contact Email"] || "").trim().toLowerCase();
    if (!email) return;
    ocByEmail[email] = { caseIds: r.fields["Cases"] || [] };
  });

  const threadMatchByThreadId = {};
  ltt_listAllRecords_(LTT_TABLES.THREAD_MATCHES).forEach(r => {
    const tid = r.fields["Thread ID"];
    if (tid) threadMatchByThreadId[tid] = { caseIds: r.fields["Cases"] || [], matter: r.fields["Matter Name"] || "" };
  });

  const loggedThreadLatestDate = {};
  const ingest = records => {
    records.forEach(r => {
      let tid = r.fields["Thread ID"];
      if (!tid && r.fields["Email Link"]) tid = ltt_threadIdFromEmailLink_(r.fields["Email Link"]);
      if (!tid) return;
      const ts = r.fields["Activity Date"] ? new Date(r.fields["Activity Date"]).getTime() : 0;
      if (!(tid in loggedThreadLatestDate) || ts > loggedThreadLatestDate[tid]) loggedThreadLatestDate[tid] = ts;
    });
  };
  ingest(ltt_listAllRecords_(LTT_TABLES.UPDATE_MATCHES));
  ingest(ltt_listAllRecords_(LTT_TABLES.CASE_ACTIVITY));

  return { activeCaseList, allCasesById, ocByEmail, threadMatchByThreadId, loggedThreadLatestDate };
}

function ltt_threadIdFromEmailLink_(link) {
  const m = /#all\/([^/?]+)/.exec(link || "");
  return m ? m[1] : "";
}

// Checks the tables/fields this script actually writes against the live
// schema before doing anything else — mirrors prompt.md's "Chris renames
// fields periodically, build a live map rather than assuming names below
// are still correct" instruction. A missing WRITE-side field aborts the run
// (a create call would just fail later anyway, and failing before Gmail is
// searched matches prompt.md's failure-handling rule); a missing read-side
// field is noted and the run continues since it only weakens matching, and
// doesn't risk any incorrect write.
function ltt_verifySchema_() {
  const baseId = ltt_baseId_();
  const url = "https://api.airtable.com/v0/meta/bases/" + baseId + "/tables";
  const json = JSON.parse(ltt_fetch_(url, "get"));
  const byName = {};
  (json.tables || []).forEach(t => { byName[t.name] = t.fields.map(f => f.name); });

  const required = {
    "Cases": ["Matter", "Status"],
    "Opposing Counsel": ["Primary Contact Email", "Cases"],
    "Update Matches": ["Case", "Activity Date", "Entry", "Entry Type", "Email Link", "Match Confidence", "Thread ID", "Author"],
    "Case Activity": ["Activity Date"],
    "Thread Matches": ["Thread ID", "Cases", "Matter Name", "Entry Snippet", "Created At"]
  };

  const missing = [];
  Object.keys(required).forEach(table => {
    if (!byName[table]) { missing.push('table "' + table + '" not found'); return; }
    required[table].forEach(field => {
      if (byName[table].indexOf(field) === -1) missing.push('"' + table + '"."' + field + '" not found');
    });
  });

  const writeCritical = missing.filter(m => m.indexOf('"Update Matches"') !== -1 || m.indexOf('"Thread Matches"') !== -1 || m.indexOf("table \"") !== -1);
  if (writeCritical.length) {
    throw new Error("Airtable schema check failed — " + writeCritical.join("; ") + ". Update this script's field names before it writes anything.");
  }
  return missing; // non-critical mismatches, surfaced in the summary email
}

// ---------------------------------------------------------------------------
// Airtable REST helpers
// ---------------------------------------------------------------------------

function ltt_baseId_() {
  return PropertiesService.getScriptProperties().getProperty("AIRTABLE_BASE_ID") || LTT_BASE_ID_DEFAULT;
}

function ltt_summaryEmailTo_() {
  return PropertiesService.getScriptProperties().getProperty("SUMMARY_EMAIL_TO") || LTT_SUMMARY_EMAIL_DEFAULT;
}

function ltt_fetch_(url, method, payload) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("AIRTABLE_API_KEY");
  if (!apiKey) throw new Error("AIRTABLE_API_KEY not set in Script Properties.");

  const options = { method, headers: { Authorization: "Bearer " + apiKey }, muteHttpExceptions: true };
  if (payload) {
    options.contentType = "application/json";
    options.payload = JSON.stringify(payload);
  }
  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code >= 300) throw new Error("Airtable " + method.toUpperCase() + " " + url + " failed: " + code + " " + text);
  return text;
}

function ltt_listAllRecords_(table) {
  const baseId = ltt_baseId_();
  let records = [];
  let offset;
  do {
    const params = ["pageSize=100"];
    if (offset) params.push("offset=" + encodeURIComponent(offset));
    const url = "https://api.airtable.com/v0/" + baseId + "/" + encodeURIComponent(table) + "?" + params.join("&");
    const json = JSON.parse(ltt_fetch_(url, "get"));
    records = records.concat(json.records);
    offset = json.offset;
  } while (offset);
  return records;
}

// Airtable's create endpoint accepts at most 10 records per call. Batches
// are not atomic across each other — see the "do not attempt any partial
// writes" comment at the runLegalTrackerEmailTriage_ call site for how that
// limitation is surfaced on failure.
function ltt_createRecords_(table, fieldsArray) {
  if (!fieldsArray.length) return 0;
  const baseId = ltt_baseId_();
  const url = "https://api.airtable.com/v0/" + baseId + "/" + encodeURIComponent(table);
  let written = 0;
  for (let i = 0; i < fieldsArray.length; i += 10) {
    const batch = fieldsArray.slice(i, i + 10).map(fields => ({ fields }));
    ltt_fetch_(url, "post", { records: batch });
    written += batch.length;
  }
  return written;
}

// ---------------------------------------------------------------------------
// Email output (replaces prompt.md Step 6's Slack post)
// ---------------------------------------------------------------------------

function ltt_sendSummaryEmail_(to, dateLabel, summaryByMatter, skippedUnmatchedCount, needsManualAssignment, schemaNotes) {
  const matters = Object.keys(summaryByMatter).sort();
  const totalEntries = matters.reduce((sum, m) => sum + summaryByMatter[m].length, 0);

  let body = "Weekly Case Activity Triage — " + dateLabel + "\n\n";
  if (totalEntries === 0) {
    body += "No new case-related activity found. Update Matches unchanged.\n";
  } else {
    body += totalEntries + " new draft entr" + (totalEntries === 1 ? "y" : "ies") + " added:\n\n";
    matters.forEach(matter => {
      body += matter + " (" + summaryByMatter[matter].length + "):\n";
      summaryByMatter[matter].forEach(subject => { body += "  - " + subject + "\n"; });
      body += "\n";
    });
  }
  if (skippedUnmatchedCount > 0) {
    body += "Reviewed but not matched to any case: " + skippedUnmatchedCount + "\n\n";
  }
  if (needsManualAssignment.length) {
    body += 'Needs manual case assignment ("' + LTT_UPDATE_LABEL + '" label, no case identified):\n';
    needsManualAssignment.forEach(subject => { body += "  - " + subject + "\n"; });
    body += "\n";
  }
  if (schemaNotes && schemaNotes.length) {
    body += "Non-critical schema mismatches noticed this run (matching may be degraded, nothing was written incorrectly):\n";
    schemaNotes.forEach(note => { body += "  - " + note + "\n"; });
  }

  GmailApp.sendEmail(to, "Weekly Case Activity Triage — " + dateLabel, body);
}

function ltt_sendFailureEmail_(to, dateLabel, err, extra) {
  let body = "The Legal Tracker email triage run failed and stopped before completing.\n\n";
  body += "Error: " + err.message + "\n";
  if (err.stack) body += "\n" + err.stack + "\n";
  if (extra) body += "\n" + extra + "\n";
  GmailApp.sendEmail(to, "Legal Tracker Email Triage FAILED — " + dateLabel, body);
}

// ---------------------------------------------------------------------------
// Trigger setup
// ---------------------------------------------------------------------------

// Run once, manually, after confirming Script Properties are set and the
// project time zone is America/New_York. Matches prompt.md's schedule.yaml
// (Fridays, 3 AM Eastern) for the same reason that routine gives: well
// ahead of daily-brief (8 AM) with no overlap risk.
function installWeeklyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "runLegalTrackerEmailTriage")
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("runLegalTrackerEmailTriage")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(3)
    .create();
}
