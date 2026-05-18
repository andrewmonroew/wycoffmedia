/* announcements.js */

const API = "https://billing-api.wycoffcomm.com";
let userToken = null;
let adminToken = null;
let isAdmin = false;

document.addEventListener("DOMContentLoaded", () => {
    userToken = localStorage.getItem("wycoff_user_token");
    adminToken = localStorage.getItem("wycoff_admin_token");

    if (!userToken && !adminToken) {
        window.location.href = "index.html";
        return;
    }

    isAdmin = !!adminToken;

    const banner = document.getElementById("user-banner");
    banner.style.display = "";
    document.getElementById("user-greeting").textContent = isAdmin
        ? "Admin Mode"
        : `Signed in as ${localStorage.getItem("wycoff_username") || "User"}`;

    if (isAdmin) {
        document.getElementById("compose-section").style.display = "";
    }

    loadAnnouncements();
});

async function loadAnnouncements() {
    const feed = document.getElementById("ann-feed");
    feed.innerHTML = `<div class="loading-row"><div class="spinner"></div> Loading...</div>`;
    try {
        const headers = adminToken
            ? { "X-Admin-Token": adminToken }
            : { "X-User-Token": userToken };
        const data = await apiReq("/api/announcements", headers);
        const anns = data.announcements;

        if (!anns || anns.length === 0) {
            feed.innerHTML = `<div class="ann-empty">No announcements yet. Check back soon.</div>`;
            return;
        }

        feed.innerHTML = anns.map(renderCard).join("");
    } catch (e) {
        feed.innerHTML = `<div class="error-row">Error loading announcements: ${escHtml(e.message)}</div>`;
    }
}

function renderCard(a) {
    const date = new Date(a.created_at).toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
    });
    const pinChip = a.pinned ? `<span class="ann-pin-chip">📌 Pinned</span>` : "";
    const emailNote = a.sent_email
        ? `<span class="ann-email-badge">✉ Emailed to users</span>`
        : `<span></span>`;
    const deleteBtn = isAdmin
        ? `<button class="btn-deny" style="font-size:12px;padding:4px 10px;" onclick="deleteAnnouncement(${a.id},this)">Delete</button>`
        : "";

    return `
        <div class="ann-card ${a.pinned ? "pinned" : ""}" id="ann-card-${a.id}">
            <div class="ann-card-header">
                <div class="ann-title">${escHtml(a.title)} ${pinChip}</div>
                <div class="ann-meta">${date}</div>
            </div>
            <div class="ann-body">${escHtml(a.body)}</div>
            <div class="ann-footer">
                ${emailNote}
                ${deleteBtn}
            </div>
        </div>`;
}

async function postAnnouncement() {
    const title = document.getElementById("ann-title").value.trim();
    const body = document.getElementById("ann-body").value.trim();
    const pinned = document.getElementById("ann-pin").checked;
    const sendEmail = document.getElementById("ann-email").checked;
    const statusEl = document.getElementById("ann-post-status");

    statusEl.style.display = "none";
    if (!title || !body) {
        statusEl.textContent = "Title and message are required.";
        statusEl.style.color = "#f87171";
        statusEl.style.display = "block";
        return;
    }

    const btn = document.querySelector('[onclick="postAnnouncement()"]');
    btn.disabled = true;
    btn.textContent = "Posting...";

    try {
        const data = await apiReq("/api/admin/announcements", { "X-Admin-Token": adminToken }, "POST", {
            title, body, pinned, send_email: sendEmail,
        });
        document.getElementById("ann-title").value = "";
        document.getElementById("ann-body").value = "";
        document.getElementById("ann-pin").checked = false;
        document.getElementById("ann-email").checked = false;
        statusEl.textContent = data.sent_email
            ? "Posted and emailed to all users with email addresses."
            : "Posted successfully.";
        statusEl.style.color = "#4ade80";
        statusEl.style.display = "block";
        setTimeout(() => { statusEl.style.display = "none"; }, 4000);
        loadAnnouncements();
    } catch (e) {
        statusEl.textContent = `Error: ${e.message}`;
        statusEl.style.color = "#f87171";
        statusEl.style.display = "block";
    } finally {
        btn.disabled = false;
        btn.textContent = "Post Announcement";
    }
}

async function deleteAnnouncement(id, btn) {
    if (!confirm("Delete this announcement? This cannot be undone.")) return;
    btn.disabled = true;
    btn.textContent = "...";
    try {
        await apiReq(`/api/admin/announcements/${id}`, { "X-Admin-Token": adminToken }, "DELETE");
        const card = document.getElementById(`ann-card-${id}`);
        if (card) card.remove();
        const feed = document.getElementById("ann-feed");
        if (!feed.querySelector(".ann-card")) {
            feed.innerHTML = `<div class="ann-empty">No announcements yet. Check back soon.</div>`;
        }
    } catch (e) {
        btn.disabled = false;
        btn.textContent = "Delete";
        alert(`Error: ${e.message}`);
    }
}

function signOut() {
    localStorage.removeItem("wycoff_user_token");
    localStorage.removeItem("wycoff_admin_token");
    localStorage.removeItem("wycoff_username");
    localStorage.removeItem("wycoff_must_change_pw");
    window.location.href = "index.html";
}

async function apiReq(path, headers = {}, method = "GET", body = null) {
    const opts = {
        method,
        headers: { "Content-Type": "application/json", ...headers },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API}${path}`, opts);
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json();
}

function escHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
