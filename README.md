# StudySprout Clipper 📎

> Capture text from any webpage — straight into your StudySprout Inbox, no tab-switching required.

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Yjs](https://img.shields.io/badge/Sync-Yjs%20CRDT-yellow)](https://github.com/yjs/yjs)

**Live app this powers:** [studysprouts.in](https://studysprouts.in/)
**Main repo:** [`studysprout`](https://github.com/ArtiGaund/studysprout) — the Next.js app, Inbox, and merge pipeline this extension talks to
**This repo:** `studysprout-clipper-extension`

---

## What This Extension Does

A Chrome (Manifest V3) extension that lets you capture content from **any webpage** without ever leaving it:

1. **Select text** on any site — an article, docs, a forum post, anything
2. **Right-click → "Save to Studysprout"** → pick a content type (or accept the auto-detected one)
3. The selection lands in your **StudySprout Inbox** — private, unfiled, waiting to be reviewed
4. Later, from the Inbox, merge it into a new or existing file — the content becomes a real, properly-typed block in that file, synced live to anyone else viewing it

It deliberately captures **specific, chosen pieces of content** — a heading, a paragraph, a quote — rather than saving whole pages the way a generic web clipper does. That keeps the Inbox a curated staging area instead of a pile of bookmarked pages.

---

## Why a Private, Global Inbox (Not Per-Workspace)

Capture happens **outside any workspace context** — you're reading a random article, not sitting inside StudySprout with a specific workspace open. So the Inbox is:

- **Private to the user**, even inside a public/shared workspace — nobody else sees what you've captured until you choose to file it
- **Global, not scoped to a workspace** — you decide *where* something belongs (which workspace → folder → file, or create new ones) at filing time, not at capture time

This means capturing is fast and frictionless — no decision required in the moment — while filing stays deliberate.

---

## Architecture

```
┌──────────────────────┐
│  Any webpage          │
│  (content.js)         │──── right-click, detect type ────►
└──────────────────────┘                                    │
                                                              ▼
                                              ┌───────────────────────────┐
                                              │  background.js            │
                                              │  (service worker)         │
                                              │  - context menu           │
                                              │  - auth bridge            │
                                              │  - pending-capture retry  │
                                              └─────────────┬─────────────┘
                                                             │ POST /api/inbox
                                                             │ (credentials: include)
                                                             ▼
                                              ┌───────────────────────────┐
                                              │  studysprout (Next.js)    │
                                              │  Inbox model + API        │
                                              └─────────────┬─────────────┘
                                                             │ on merge
                                                             ▼
                                              ┌───────────────────────────┐
                                              │  Realtime server           │
                                              │  live Yjs doc + broadcast  │
                                              │  + FileSyncWorker persist  │
                                              └───────────────────────────┘
```

The extension never writes directly to a file's content — merging goes through the **same realtime server and Yjs pipeline** that live collaborative editing uses, so a merged block is broadcast instantly to anyone viewing that file and persisted through the exact same worker that derives reading time, auto-summaries, and extracted terms for any other edit. This also makes concurrent merges — two people filing into the same file at once — safe, since they mutate the same in-memory document sequentially rather than racing independent database writes.

---

## Core Mechanisms

### 1. Type Detection

On right-click, `content.js` inspects the clicked element's tag and walks up to the nearest recognizable ancestor if the selection lands on an inline element (a `<span>` inside a `<p>`, for example):

```javascript
h1                  → heading1
h2, h3               → heading2
h4, h5, h6            → heading3
blockquote            → quote
li, ul, ol             → list
pre, code               → code
p (default fallback)     → paragraph
```

The detected type pre-selects the matching submenu item — the user can still override it before saving.

### 2. Auth Bridge (No Separate Login Flow)

The extension has no login UI of its own. Instead:

- A save attempt while logged out stashes the capture (`chrome.storage.local`) and opens `studysprouts.in/sign-in?extension=true`
- The user logs in normally — credentials, Google, or GitHub — all funneling through the same post-login landing page
- That page detects the `?extension=true` flag and sends `STUDYSPROUT_LOGIN_SUCCESS` to the extension via `chrome.runtime.sendMessage`
- The extension flushes the stashed capture automatically and switches focus back to the original tab — **no re-selecting text, no redoing the action**

### 3. Save Requests Ride the Browser's Existing Session

Rather than managing a separate token, `fetch()` calls to `/api/inbox` use `credentials: "include"`, piggybacking on the same NextAuth session cookie the main app already relies on. Simpler, and one fewer thing to keep in sync.

### 4. On-Page Toast Feedback

Success/failure is shown as a small toast injected directly into the page (not just the extension's toolbar badge, which is easy to miss). A successful save includes a **"View in Inbox"** link straight to the Inbox page.

---

## Tech Stack

- Vanilla JavaScript (Manifest V3 — no framework, no build step)
- `chrome.contextMenus`, `chrome.storage`, `chrome.tabs`, `chrome.runtime` APIs
- Communicates with the main app over plain `fetch`, and with `chrome.runtime.onMessageExternal` for the auth bridge

---

## Environment / Config

`background.js` has one constant to change between environments:

```javascript
const API_BASE = "http://localhost:3000"; // switch to https://studysprouts.in for production
```

---

## Getting Started (Local Dev)

```bash
git clone https://github.com/YOUR-USERNAME/studysprout-clipper-extension.git
cd studysprout-clipper-extension
```

No install step — it's plain JS/HTML/CSS, no `npm install`, no build.

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top right)
3. **Load unpacked** → select this folder
4. Select text on any page, right-click → **Save to Studysprout**

You'll also want the [main `studysprout` repo](https://github.com/ArtiGaund/studysprout) running locally (`npm run dev`, default `http://localhost:3000`) for saves to actually succeed.

---

## What I Learned Building This

- Bridging auth between a website and a browser extension without a second login system — using a URL flag + `chrome.runtime.sendMessage` from the web page into the extension, rather than reinventing session management
- Why merge-on-write into a live collaborative document needs to go through the *same* CRDT pipeline live edits use — an early version wrote straight to MongoDB and silently either overwrote existing content or got clobbered by the next live edit's autosave, since it never touched the actual in-memory Yjs document the realtime server treats as source of truth
- Debugging a data-loss bug traced to a missing environment variable causing a silent hydration failure — fixed by making that failure path abort loudly instead of falling through to an empty document
- Designing an inbox that's deliberately *not* scoped to a workspace, because capture happens outside any workspace context — and the UI/data model implications of that decision (global per-user inbox, workspace chosen only at filing time)
- Manifest V3's context menu API can't conditionally hide items based on live selection state — so guarding against empty selections has to happen at the click-handler level, not just the menu-render level

---

## Related

- **Main application**: [`studysprout`](https://github.com/ArtiGaund/studysprout) — Next.js app, Inbox, merge pipeline, editor
- **Realtime server**: [`studysprout-realtime-server`](https://github.com/ArtiGaund/studysprout-realtime-server) — Socket.io + Yjs collaboration backend the merge flow relies on
- **Live demo**: [studysprouts.in](https://studysprouts.in)

## License

MIT

## Contact

**Your Name** — [LinkedIn](https://linkedin.com/in/artigaund) · [Email](mailto:artigaund2210@gmail.com)