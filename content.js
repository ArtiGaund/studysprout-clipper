// Run on every page. Detect what type of element was right-clicked and sends the selected text 
// and detected type to the background script.

function detectType(element){
    if(!element || !element.tagName) return "paragraph";
    const tag = element.tagName.toLowerCase();

    // Headings: h1-h6 mapped down to editor's 3 heading levels
    if(tag === "h1") return "heading1";
    if(tag === "h2" || tag === "h3") return "heading2";
    if(tag === "h4" || tag === "h5" || tag === "h6") return "heading3";

    if(tag === "blockquote") return "quote";
    if(tag === "pre" || tag === "code") return "code";
    if(tag === "p") return "paragraph";

    if(tag === "ol") return "numbered_list";
    if(tag === "ul") return "bullet_list";

    // List item detection relative to parent
    if(tag === "li"){
        const parentTag = element.parentElement?.tagName.toLowerCase();
        return parentTag === "ol" ? "numbered_list" : "bullet_list";
    }
    // Fallback: selection might land on <span> or other inline element nested inside something
    // recoginzable - walk up to find it.
    const closest = element.closest(
        "h1,h2,h3,h4,h5,h6,blockquote,li,ul,ol,pre,code,p"
    );
    if(closest && closest !== element) return detectType(closest);

    return "paragraph"; //safest default when nothing matches.
}

document.addEventListener("contextmenu", async (e) => {
    const selection = window.getSelection()?.toString().trim();
    if(!selection) return; //right-click with no selection - ignore

    const blockType = detectType(e.target);

    // Guard against invalidated extension context
    if (!chrome.runtime?.id) return;
    
    chrome.runtime.sendMessage(
        {
            type: "STUDYSPROUT_SELECTION",
            payload: {
                text: selection,
                blockType,
                sourceUrl: window.location.href,
                sourceTitle: document.title,
            },
        },
        () => {
            // Accessing lastError swallows the unhandled promise rejection error
            if(chrome.runtime.lastError){
                // Background script is inactive/reloading; ignore safely
            }
        }
    )
});

chrome.runtime.onMessage.addListener((message) => {
    if(message.type === "STUDYSPROUT_TOAST"){
        showToast(message.text, message.success, message.linkUrl, message.linkLabel);
    }
});

function showToast(text, success, linkUrl, linkLabel){
    const element = document.createElement("div");
    element.style.cssText = `
        all: initial;
        position: fixed !important;
        bottom: 20px !important;
        right: 20px !important;
        z-index: 2147483647 !important;
        background: ${success ? "#22c55e" : "#ef4444"} !important;
        color: #ffffff !important;
        padding: 10px 16px !important;
        border-radius: 8px !important;
        font-family: system-ui, -apple-system, sans-serif !important;
        font-size: 13px !important;
        font-weight: 600 !important;
        line-height: 1.4 !important;
        box-shadow: 0 8px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.1) !important;
        opacity: 0 !important;
        transform: translateY(8px) !important;
        transition: opacity 0.25s ease, transform 0.25s ease !important;
        pointer-events: none !important;
        max-width: 320px !important;
    `;

    const textSpan = document.createElement("span");
    textSpan.textContent = text;
    element.appendChild(textSpan);

    if(success && linkUrl){
        const link = document.createElement("a");
        link.href = linkUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = linkLabel || "View in Inbox";
        link.style.cssText = `
            color: white;
            text-decoration: underline;
            font-weight: 600;
            white-space: nowrap;
            cursor: pointer;
            pointer-events: auto !important;
        `;
        element.appendChild(link);
    }

    document.body.appendChild(element);
    requestAnimationFrame(() => {
        element.style.opacity = "1";
        element.style.transform = "translateY(0)";
    });
    setTimeout(() => {
        element.style.opacity = "0";
        element.style.transform = "translateY(8px)";
        setTimeout(() => element.remove(), 250);
    }, 4000);
}