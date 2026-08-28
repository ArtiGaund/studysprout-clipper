const API_BASE = "http://localhost:3000";

document.addEventListener("DOMContentLoaded", async () => {
    const statusElem = document.getElementById("status");
    const loginBtn = document.getElementById("loginBtn");
    const logoutBtn = document.getElementById("logoutBtn");

    // const { authToken } = await chrome.storage.local.get("authToken");

    // if(authToken){
    //     statusElem.textContent = "Logged in";
    //     logoutBtn.style.display = "block";
    // }else{
    //     statusElem.textContent = "Not logged in";
    //     loginBtn.style.display = "block";
    // }
    try {
        const res = await fetch(`${API_BASE}/api/inbox`, {
            method: "GET",
            credentials: "include",
        });

        if(res.status !== 401 && res.ok){
            statusElem.textContent = "Logged in";
            logoutBtn.style.display = "block";
            loginBtn.style.display = "none";
        }else{
            statusElem.textContent = "Not logged in";
            logoutBtn.style.display = "none";
            loginBtn.style.display = "block";
        }
    } catch (error) {
        statusElem.textContent = "Not logged in";
        logoutBtn.style.display = "none";
        loginBtn.style.display = "block";
    }

    loginBtn.addEventListener("click", () => {
        chrome.tabs.create({ url: `${API_BASE}/login?extension=true`});
    });

    logoutBtn.addEventListener("click", async () => {
        // await chrome.storage.local.remove("authToken");
        // statusElem.textContent = "Not logged in";
        // logoutBtn.style.display = "none";
        // loginBtn.style.display = "block";

        // Direct user to logout on the app side
        chrome.tabs.create({ url: `${API_BASE}/api/auth/singout`});
    });
});