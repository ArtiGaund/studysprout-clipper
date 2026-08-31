// --- Config ---
const API_BASE = "https://studysprouts.in";
const BLOCK_TYPES = [
    "heading1",
    "heading2",
    "heading3",
    "paragraph",
    "bullet_list",
    "numbered_list",
    "code",
    "quote",
];

const LABELS = {
    heading1: "Heading 1",
    heading2: "Heading 2",
    heading3: "Heading 3",
    paragraph: "Paragraph",
    bullet_list: "Bullet List",
    numbered_list: "Numbered List",
    code: "Code",
    quote: "Quote",
};

// --- State ---
let lastSelection = null; // {text, blockType, sourceUrl} from content.js

// --- Context menu setup ---
chrome.runtime.onInstalled.addListener(async (details) => {
    chrome.contextMenus.create({
        id: "studysprout-root",
        title: "Save to Studysprout",
        contexts: ["selection"],
    });

    for (const type of BLOCK_TYPES) {
        chrome.contextMenus.create({
            id: `studysprout-${type}`,
            parentId: "studysprout-root",
            title: LABELS[type],
            contexts: ["selection"],
        });
    }

    // Re-inject content.js into already-open matching tabs so they don't
    // need a manual refresh after every extension reload during dev.
    if (details.reason === "update" || details.reason === "install") {
        const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
        for (const tab of tabs) {
            if (!tab.id) continue;
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ["content.js"],
                });
            } catch (err) {
                // tab may be a chrome:// page or otherwise unscriptable - skip it
            }
        }
    }
});

// content.js tells us what it detected - highlight the submenu item
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "STUDYSPROUT_SELECTION") {
        lastSelection = message.payload;
        for (const type of BLOCK_TYPES) {
            chrome.contextMenus.update(`studysprout-${type}`, {
                title:
                    type === lastSelection.blockType
                        ? `${LABELS[type]} (detected)`
                        : LABELS[type],
            });
        }
    }
});

// User clicked a submenu item
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!info.menuItemId.startsWith("studysprout-")) return;
    if (info.menuItemId === "studysprout-root") return;

    const blockType = info.menuItemId.replace("studysprout-", "");
    const text = lastSelection?.text || info.selectionText;
    const sourceUrl = lastSelection?.sourceUrl || tab?.url;
    const sourceTitle = lastSelection?.sourceTitle;

    if (!text) return;

    await saveToInbox(text, blockType, tab?.id, sourceUrl, sourceTitle);
});

// --- Auth bridge ---
// studysprout.in's login-success page calls this to hand the session back to the extension
let loginSuccessInFlight = false;

chrome.runtime.onMessageExternal.addListener(async (message, _sender, sendResponse) => {
   if (message.type === "STUDYSPROUT_LOGIN_SUCCESS") {
       if (loginSuccessInFlight) {
           // A duplicate call arrived while we're already handling one - ignore it.
           sendResponse({ ok: true });
           return true;
       }
       loginSuccessInFlight = true;

       try {
           const { pendingCapture } = await chrome.storage.local.get("pendingCapture");
           if (pendingCapture) {
               await chrome.storage.local.remove("pendingCapture");
               await saveToInbox(
                   pendingCapture.text,
                   pendingCapture.blockType,
                   pendingCapture.originTabId,
                   pendingCapture.sourceUrl,
                   pendingCapture.sourceTitle,
               );

               if (pendingCapture.originTabId) {
                   try {
                       const originTab = await chrome.tabs.get(pendingCapture.originTabId);
                       await chrome.windows.update(originTab.windowId, { focused: true });
                       await chrome.tabs.update(pendingCapture.originTabId, { active: true });
                   } catch (error) {
                       // original tab was closed in the meantime - nothing to switch back to
                   }
               }
           }
       } finally {
           // Reset shortly after, so a genuinely NEW future login (different session) still works.
           setTimeout(() => { loginSuccessInFlight = false; }, 3000);
       }

       sendResponse({ ok: true });
       return true;
   }
});

// --- Save in studysprout inbox ---
async function saveToInbox(text, blockType, originTabId = null, sourceUrl = null, sourceTitle) {
    try {
        const result = await fetch(`${API_BASE}/api/inbox`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                type: blockType,
                content: text,
                sourceUrl,
                sourceTitle,
            }),
        });

        if (result.status === 401) {
            // Not logged in - save the attempt so we can retry after login, then open sign-in.
            await chrome.storage.local.set({
                pendingCapture: { text, blockType, originTabId, sourceUrl, sourceTitle },
            });
            chrome.tabs.create({
                url: `${API_BASE}/sign-in?extension=true`,
            });
            return;
        }

        if (!result.ok) {
            let message = `Save failed: ${result.status}`;
            try {
                const errBody = await result.json();
                if (errBody?.message) message = errBody.message;
            } catch (error) {
                // response wasn't JSON, fall back to status
            }
            throw new Error(message);
        }

        notifyTab(
            buildToastText("Saved to Studysprout", sourceUrl), 
            true, 
            originTabId,
            `${API_BASE}/dashboard/inbox`,
            "View in Inbox"
        );
    } catch (error) {
        console.error("Studysprout save failed: ", error);
        notifyTab(buildToastText("Failed to save - try again", sourceUrl), false, originTabId);
    }
}

function buildToastText(base, sourceUrl) {
    if (!sourceUrl) return base;
    try {
        return `${base} (from ${new URL(sourceUrl).hostname})`;
    } catch (error) {
        return base;
    }
}

function notifyTab(text, success, tabId = null, linkUrl = null, linkLabel = null) {
    const send = (id) => {
        chrome.tabs
            .sendMessage(id, { 
                type: "STUDYSPROUT_TOAST", 
                text, 
                success,
                linkUrl,
                linkLabel, 
            })
            .catch(() => {}); // target tab may have navigated away or closed
    };
    if (tabId) return send(tabId);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) send(tabs[0].id);
    });
}