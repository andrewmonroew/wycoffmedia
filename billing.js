/* billing.js — Wycoff Media Billing Page Logic */

const API = "https://billing-api.wycoffcomm.com";
const ADMIN_TOKEN_KEY = "wycoff_admin_token";

// ── State ────────────────────────────────────────────────────────────────────
let userToken = null;
let adminToken = null;
let currentUsername = null;

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    // Check URL for user token
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (urlToken) {
        userToken = urlToken;
        // Clean URL without token for privacy
        const clean = window.location.pathname;
        window.history.replaceState({}, "", clean);
    }

    // Check localStorage for admin token
    const storedAdmin = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (storedAdmin) {
        adminToken = storedAdmin;
    }

    // Set default month picker to prior month
    const picker = document.getElementById("admin-month-picker");
    if (picker) picker.value = getPriorMonth();

    render();
});

// ── Render orchestrator ───────────────────────────────────────────────────────
async function render() {
    await loadLiveStats();

    if (adminToken) {
        showAdminView();
    } else if (userToken) {
        await showUserView();
    } else {
        showPublicView();
    }
}

// ── Views ─────────────────────────────────────────────────────────────────────
function showPublicView() {
    show("token-banner");
    hide("user-banner");
    hide("history-section");
    hide("admin-invoices-section");
    hide("admin-signups-section");
    hide("admin-tokens-section");
    hide("admin-login-section");
    document.getElementById("admin-toggle-btn").textContent = "Admin Access";
}

async function showUserView() {
    hide("token-banner");
    hide("admin-invoices-section");
    hide("admin-signups-section");
    hide("admin-tokens-section");
    hide("admin-login-section");

    // Fetch user info
    try {
        const data = await api("/api/billing/me", { "X-User-Token": userToken });
        currentUsername = data.username;
        show("user-banner");
        document.getElementById("user-greeting").textContent =
            `Signed in as ${data.username}`;
        renderHistoryTable(data.invoices);
        show("history-section");
    } catch (e) {
        show("token-banner");
        showError("token-banner", "Invalid token. Please check and try again.");
    }
}

function showAdminView() {
    hide("token-banner");
    show("user-banner");
    document.getElementById("user-greeting").textContent = "Admin Mode";
    hide("history-section");
    show("admin-invoices-section");
    show("admin-signups-section");
    show("admin-tokens-section");
    hide("admin-login-section");
    document.getElementById("admin-toggle-btn").textContent = "Sign Out of Admin";
    loadAdminInvoices();
    loadSignups();
    loadTokens();
}

// ── Live Stats ────────────────────────────────────────────────────────────────
async function loadLiveStats() {
    const wrap = document.getElementById("live-table-wrap");
    try {
        const data = await api("/api/billing/live");
        const { month, users } = data;

        // Update hero chips
        document.getElementById("month-chip").textContent = formatMonth(month);
        const totalHours = users.reduce((s, u) => s + u.hours, 0);
        document.getElementById("total-chip").textContent =
            `${totalHours.toFixed(1)} hrs pool`;

        if (!users || users.length === 0) {
            wrap.innerHTML = `<div class="empty-row">No watch data yet for ${formatMonth(month)}.</div>`;
            return;
        }

        const showAmount = !!userToken || !!adminToken;
        wrap.innerHTML = renderLiveTable(users, showAmount);
    } catch (e) {
        wrap.innerHTML = `<div class="error-row">⚠ Could not load live data. API may be unreachable.<br><small>${e.message}</small></div>`;
    }
}

function renderLiveTable(users, showAmount) {
    const monthlyCost = 51.00;
    const amountCol = showAmount
        ? "<th>Amount Owed</th>"
        : "<th>Amount</th>";

    const rows = users.map(u => {
        const isMe = currentUsername && u.username === currentUsername;
        const rowClass = isMe ? "my-row" : "";
        const meTag = isMe ? " ⭐" : "";

        const amountCell = showAmount
            ? `<td style="color:#4ade80;font-weight:600;">$${((u.share_pct / 100) * monthlyCost).toFixed(2)}</td>`
            : `<td><span style="color:#64748b;font-size:12px;">Token required</span></td>`;

        return `
            <tr class="${rowClass}">
                <td>${escHtml(u.username)}${meTag}</td>
                <td>${u.hours.toFixed(1)} hrs</td>
                <td class="share-bar-cell">
                    <div class="share-bar-wrap">
                        <div class="share-bar-bg">
                            <div class="share-bar-fill" style="width:${u.share_pct}%"></div>
                        </div>
                        <span class="share-bar-pct">${u.share_pct.toFixed(1)}%</span>
                    </div>
                </td>
                ${amountCell}
            </tr>`;
    }).join("");

    return `
        <table class="billing-table">
            <thead>
                <tr>
                    <th>Username</th>
                    <th>Watch Hours</th>
                    <th>Share of Pool</th>
                    ${amountCol}
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>`;
}

// ── User Invoice History ───────────────────────────────────────────────────────
function renderHistoryTable(invoices) {
    const wrap = document.getElementById("history-table-wrap");
    if (!invoices || invoices.length === 0) {
        wrap.innerHTML = `<div class="empty-row">No invoices found yet. Check back after the 1st of next month.</div>`;
        return;
    }

    const rows = invoices.map(inv => {
        const now = new Date();
        const graceDate = new Date(`${inv.month}-16`);
        let badge;
        if (inv.paid) {
            badge = `<span class="badge badge-paid">✓ Paid</span>`;
        } else if (now > graceDate) {
            badge = `<span class="badge badge-overdue">🚨 Overdue</span>`;
        } else {
            badge = `<span class="badge badge-unpaid">⚠ Unpaid</span>`;
        }

        return `
            <tr>
                <td>${formatMonth(inv.month)}</td>
                <td>${inv.hours.toFixed(1)} hrs</td>
                <td>${inv.share_pct.toFixed(1)}%</td>
                <td style="color:#4ade80;font-weight:600;">$${inv.amount_owed.toFixed(2)}</td>
                <td>${badge}</td>
                <td>${inv.paid_date ? inv.paid_date.slice(0, 10) : "—"}</td>
            </tr>`;
    }).join("");

    wrap.innerHTML = `
        <table class="billing-table">
            <thead>
                <tr>
                    <th>Month</th>
                    <th>Hours</th>
                    <th>Share</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Paid Date</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>`;
}

// ── Admin: Invoices ───────────────────────────────────────────────────────────
async function loadAdminInvoices() {
    const month = document.getElementById("admin-month-picker").value || getPriorMonth();
    const wrap = document.getElementById("admin-invoices-wrap");
    wrap.innerHTML = `<div class="loading-row"><div class="spinner"></div> Loading invoices for ${formatMonth(month)}...</div>`;

    try {
        const data = await api(`/api/admin/invoices/${month}`, { "X-Admin-Token": adminToken });
        const invoices = data.invoices;

        if (!invoices || invoices.length === 0) {
            wrap.innerHTML = `<div class="empty-row">No invoices for ${formatMonth(month)}. Use "Generate Invoices" to create them.</div>`;
            return;
        }

        const rows = invoices.map(inv => {
            const badgeCls = inv.paid ? "badge-paid" : (inv.flagged ? "badge-overdue" : "badge-unpaid");
            const badgeText = inv.paid ? "✓ Paid" : (inv.flagged ? "🚨 Overdue" : "⚠ Unpaid");
            const payBtn = inv.paid ? "" :
                `<button class="btn-pay" onclick="markPaid('${escHtml(month)}','${escHtml(inv.username)}',this)">Mark Paid</button>`;

            return `
                <tr>
                    <td>${escHtml(inv.username)}</td>
                    <td>${inv.hours.toFixed(1)} hrs</td>
                    <td>${inv.share_pct.toFixed(1)}%</td>
                    <td style="color:#4ade80;font-weight:600;">$${inv.amount_owed.toFixed(2)}</td>
                    <td><span class="badge ${badgeCls}">${badgeText}</span></td>
                    <td>${inv.paid_date ? inv.paid_date.slice(0, 10) : "—"}</td>
                    <td>${payBtn}</td>
                </tr>`;
        }).join("");

        const total = invoices.reduce((s, i) => s + i.amount_owed, 0);
        const paid = invoices.filter(i => i.paid).reduce((s, i) => s + i.amount_owed, 0);

        wrap.innerHTML = `
            <table class="billing-table">
                <thead>
                    <tr>
                        <th>Username</th><th>Hours</th><th>Share</th>
                        <th>Amount</th><th>Status</th><th>Paid Date</th><th>Action</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
            <div style="padding:12px 16px;font-size:13px;color:#94a3b8;border-top:1px solid var(--border-color);">
                Total: <strong style="color:#fff;">$${total.toFixed(2)}</strong> &nbsp;|&nbsp;
                Collected: <strong style="color:#4ade80;">$${paid.toFixed(2)}</strong> &nbsp;|&nbsp;
                Outstanding: <strong style="color:#fb923c;">$${(total - paid).toFixed(2)}</strong>
            </div>`;
    } catch (e) {
        wrap.innerHTML = `<div class="error-row">Error loading invoices: ${e.message}</div>`;
    }
}

async function generateInvoices() {
    const month = document.getElementById("admin-month-picker").value || getPriorMonth();
    if (!confirm(`Generate invoices for ${formatMonth(month)}? This will overwrite existing invoice data for that month.`)) return;
    try {
        const data = await api(`/api/admin/generate-invoices/${month}`, { "X-Admin-Token": adminToken }, "POST");
        alert(`Generated invoices for ${data.generated.length} users: ${data.generated.join(", ")}`);
        loadAdminInvoices();
    } catch (e) {
        alert(`Error: ${e.message}`);
    }
}

async function markPaid(month, username, btn) {
    btn.disabled = true;
    btn.textContent = "Saving...";
    try {
        await api("/api/admin/pay", { "X-Admin-Token": adminToken }, "POST", { month, username });
        loadAdminInvoices();
    } catch (e) {
        btn.disabled = false;
        btn.textContent = "Mark Paid";
        alert(`Error: ${e.message}`);
    }
}

// ── Admin: Signups ────────────────────────────────────────────────────────────
async function loadSignups() {
    const wrap = document.getElementById("signups-wrap");
    wrap.innerHTML = `<div class="loading-row"><div class="spinner"></div> Loading signups...</div>`;
    try {
        const data = await api("/api/admin/signups", { "X-Admin-Token": adminToken });
        const signups = data.signups;

        if (!signups || signups.length === 0) {
            wrap.innerHTML = `<div class="empty-row">No pending signups.</div>`;
            return;
        }

        const rows = signups.map(s => `
            <tr>
                <td>${escHtml(s.name)}</td>
                <td>${escHtml(s.email)}</td>
                <td><code>${escHtml(s.username)}</code></td>
                <td>${escHtml(s.discord_handle || "—")}</td>
                <td>${s.created_at.slice(0, 10)}</td>
                <td>
                    <button class="btn-approve" onclick="approveSignup(${s.id},this)">✓ Approve</button>
                    <button class="btn-deny" onclick="denySignup(${s.id},this)">✗ Deny</button>
                </td>
            </tr>`).join("");

        wrap.innerHTML = `
            <table class="billing-table">
                <thead><tr>
                    <th>Name</th><th>Email</th><th>Username</th><th>Discord</th><th>Requested</th><th>Action</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    } catch (e) {
        wrap.innerHTML = `<div class="error-row">Error loading signups: ${e.message}</div>`;
    }
}

async function approveSignup(id, btn) {
    btn.disabled = true;
    btn.textContent = "Approving...";
    try {
        const data = await api(`/api/admin/approve/${id}`, { "X-Admin-Token": adminToken }, "POST");
        alert(`Approved! Jellyfin account created. Welcome email sent to ${data.username}.`);
        loadSignups();
    } catch (e) {
        btn.disabled = false;
        btn.textContent = "✓ Approve";
        alert(`Error: ${e.message}`);
    }
}

async function denySignup(id, btn) {
    if (!confirm("Deny this signup request?")) return;
    btn.disabled = true;
    try {
        await api(`/api/admin/deny/${id}`, { "X-Admin-Token": adminToken }, "POST");
        loadSignups();
    } catch (e) {
        btn.disabled = false;
        alert(`Error: ${e.message}`);
    }
}

// ── Admin: Tokens ─────────────────────────────────────────────────────────────
async function loadTokens() {
    const wrap = document.getElementById("tokens-wrap");
    try {
        const data = await api("/api/admin/tokens", { "X-Admin-Token": adminToken });
        const tokens = data.tokens;

        if (!tokens || tokens.length === 0) {
            wrap.innerHTML = `<div class="empty-row">No tokens found.</div>`;
            return;
        }

        const rows = tokens.map(t => {
            const billingLink = `https://media.wycoffcomm.com/billing.html?token=${t.token}`;
            return `
                <tr>
                    <td>${escHtml(t.username)}</td>
                    <td>${escHtml(t.email || "—")}</td>
                    <td><span class="token-code">${escHtml(t.token)}</span></td>
                    <td>
                        <button class="btn-pay" onclick="copyToClipboard('${billingLink}',this)">Copy Link</button>
                    </td>
                </tr>`;
        }).join("");

        wrap.innerHTML = `
            <table class="billing-table">
                <thead><tr><th>Username</th><th>Email</th><th>Token</th><th>Billing Link</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    } catch (e) {
        wrap.innerHTML = `<div class="error-row">Error loading tokens: ${e.message}</div>`;
    }
}

function copyToClipboard(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
        const orig = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(() => btn.textContent = orig, 2000);
    });
}

// ── Token management ──────────────────────────────────────────────────────────
function applyToken() {
    const input = document.getElementById("token-input");
    const val = input.value.trim();
    if (!val) return;
    userToken = val;
    render();
}

function clearToken() {
    if (adminToken) {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        adminToken = null;
    }
    userToken = null;
    currentUsername = null;
    render();
}

function toggleAdminLogin() {
    if (adminToken) {
        clearToken();
        return;
    }
    const sec = document.getElementById("admin-login-section");
    sec.style.display = sec.style.display === "none" ? "block" : "none";
}

async function applyAdminToken() {
    const input = document.getElementById("admin-token-input");
    const val = input.value.trim();
    if (!val) return;

    const errEl = document.getElementById("admin-login-error");
    errEl.style.display = "none";

    // Verify the token against the API
    try {
        await api("/api/admin/signups", { "X-Admin-Token": val });
        adminToken = val;
        localStorage.setItem(ADMIN_TOKEN_KEY, val);
        render();
    } catch (e) {
        errEl.textContent = "Invalid admin token.";
        errEl.style.display = "block";
    }
}

// ── API helper ────────────────────────────────────────────────────────────────
async function api(path, headers = {}, method = "GET", body = null) {
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

// ── Utilities ─────────────────────────────────────────────────────────────────
function formatMonth(m) {
    if (!m) return "—";
    const [year, month] = m.split("-");
    const d = new Date(Number(year), Number(month) - 1, 1);
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function getPriorMonth() {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function escHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function show(id) { const el = document.getElementById(id); if (el) el.style.display = ""; }
function hide(id) { const el = document.getElementById(id); if (el) el.style.display = "none"; }
function showError(containerId, msg) {
    const el = document.getElementById(containerId);
    if (el) el.insertAdjacentHTML("beforeend", `<div class="error-row">${msg}</div>`);
}
