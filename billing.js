/* billing.js — Wycoff Media Billing Page Logic */

const API = "https://billing-api.wycoffcomm.com";
const ADMIN_TOKEN_KEY = "wycoff_admin_token";

// ── State ────────────────────────────────────────────────────────────────────
let userToken = null;
let adminToken = null;
let currentUsername = null;
let costConfig = { power: 0, maintenance: 0, other: 0, total: 0 };

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    // Check URL for user token (direct token links still work)
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (urlToken) {
        userToken = urlToken;
        localStorage.setItem("wycoff_user_token", urlToken);
        window.history.replaceState({}, "", window.location.pathname);
    } else {
        const storedUser = localStorage.getItem("wycoff_user_token");
        if (storedUser) userToken = storedUser;
    }

    // Check localStorage for admin token and stored username
    const storedAdmin = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (storedAdmin) adminToken = storedAdmin;
    currentUsername = localStorage.getItem("wycoff_username") || null;

    // Not logged in at all — send to login page
    if (!userToken && !adminToken) {
        window.location.href = "index.html";
        return;
    }

    // Set default month picker to prior month
    const picker = document.getElementById("admin-month-picker");
    if (picker) picker.value = getPriorMonth();

    // Live-update cost total as values change
    ["cost-power", "cost-maintenance", "cost-other"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("input", updateCostTotal);
    });

    render();
});

// ── Render orchestrator ───────────────────────────────────────────────────────
async function render() {
    // Fetch cost config early so breakdown is available for all views
    try {
        costConfig = await api("/api/billing/cost-config");
    } catch (_) {}
    await loadLiveStats();

    if (adminToken) {
        showAdminView();
    } else {
        await showUserView();
    }
}

// ── Views ─────────────────────────────────────────────────────────────────────
async function showUserView() {
    hide("token-banner");
    hide("admin-config-section");
    hide("admin-balances-section");
    hide("admin-invoices-section");
    hide("admin-signups-section");
    hide("admin-tokens-section");
    hide("admin-login-section");
    // Hide admin toggle for regular users — they don't need to see it
    const adminToggleRow = document.querySelector(".admin-link-row");
    if (adminToggleRow) adminToggleRow.style.display = "none";

    // Fetch user info
    try {
        const data = await api("/api/billing/me", { "X-User-Token": userToken });
        currentUsername = data.username;
        localStorage.setItem("wycoff_username", data.username);
        show("user-banner");
        document.getElementById("user-greeting").textContent =
            `Signed in as ${data.username}`;

        if (localStorage.getItem("wycoff_must_change_pw") === "1") {
            // Force password change — hide everything else, show only the change form
            show("must-change-banner");
            show("change-password-section");
            document.getElementById("change-password-section")
                .scrollIntoView({ behavior: "smooth", block: "center" });
            return;
        }

        // Populate email field
        const emailInput = document.getElementById("user-email-input");
        if (emailInput) emailInput.value = data.email || "";
        show("user-email-section");

        renderHistoryTable(data.invoices);
        show("history-section");
        show("change-password-section");
    } catch (e) {
        show("token-banner");
        showError("token-banner", "Invalid token. Please check and try again.");
    }
}

function showAdminView() {
    hide("token-banner");
    hide("user-email-section");
    show("user-banner");
    document.getElementById("user-greeting").textContent = "Admin Mode";
    hide("history-section");
    show("admin-config-section");
    show("admin-balances-section");
    show("admin-invoices-section");
    show("admin-signups-section");
    show("admin-tokens-section");
    hide("admin-login-section");
    document.getElementById("admin-toggle-btn").textContent = "Sign Out of Admin";
    loadConfig();
    loadBalances();
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
        wrap.innerHTML = renderLiveTable(users, showAmount, !!adminToken);
    } catch (e) {
        wrap.innerHTML = `<div class="error-row">⚠ Could not load live data. API may be unreachable.<br><small>${e.message}</small></div>`;
    }
}

function renderLiveTable(users, showAmount, isAdmin) {
    const monthlyCost = 51.00;
    const amountCol = showAmount ? "<th>Amount Owed</th>" : "<th>Amount</th>";

    const rows = users.map((u, i) => {
        const isMe = currentUsername && u.username === currentUsername;
        const rowClass = isMe ? "my-row" : "";

        // Admins see real names; regular users see "You" or "User N" for privacy
        const displayName = isAdmin
            ? escHtml(u.username) + (isMe ? " ⭐" : "")
            : (isMe ? "You ⭐" : `User ${i + 1}`);

        const amountCell = showAmount
            ? `<td style="color:#4ade80;font-weight:600;">$${((u.share_pct / 100) * monthlyCost).toFixed(2)}</td>`
            : `<td><span style="color:#64748b;font-size:12px;">Sign in to view</span></td>`;

        return `
            <tr class="${rowClass}">
                <td>${displayName}</td>
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

        const share = inv.share_pct / 100;
        const breakdown = costConfig.total > 0
            ? `<div class="inv-breakdown">
                ${costConfig.power > 0 ? `<span>Power $${(share * costConfig.power).toFixed(2)}</span>` : ""}
                ${costConfig.maintenance > 0 ? `<span>Maintenance $${(share * costConfig.maintenance).toFixed(2)}</span>` : ""}
                ${costConfig.other > 0 ? `<span>Other $${(share * costConfig.other).toFixed(2)}</span>` : ""}
               </div>`
            : "";

        return `
            <tr>
                <td>${formatMonth(inv.month)}</td>
                <td>${inv.hours.toFixed(1)} hrs</td>
                <td>${inv.share_pct.toFixed(1)}%</td>
                <td>
                    <span style="color:#4ade80;font-weight:600;">$${inv.amount_owed.toFixed(2)}</span>
                    ${breakdown}
                </td>
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

// ── Admin: Cost Config ────────────────────────────────────────────────────────
async function loadConfig() {
    try {
        const data = await api("/api/admin/config", { "X-Admin-Token": adminToken });
        document.getElementById("cost-power").value = data.power ?? 0;
        document.getElementById("cost-maintenance").value = data.maintenance ?? 0;
        document.getElementById("cost-other").value = data.other ?? 0;
        updateCostTotal();
    } catch (e) {
        // non-fatal — fields stay at defaults
    }
}

function updateCostTotal() {
    const power = parseFloat(document.getElementById("cost-power").value) || 0;
    const maint = parseFloat(document.getElementById("cost-maintenance").value) || 0;
    const other = parseFloat(document.getElementById("cost-other").value) || 0;
    document.getElementById("cost-total-display").textContent = `$${(power + maint + other).toFixed(2)}`;
}

async function saveConfig() {
    const power = parseFloat(document.getElementById("cost-power").value) || 0;
    const maintenance = parseFloat(document.getElementById("cost-maintenance").value) || 0;
    const other = parseFloat(document.getElementById("cost-other").value) || 0;
    try {
        const data = await api("/api/admin/config", { "X-Admin-Token": adminToken }, "POST", { power, maintenance, other });
        document.getElementById("cost-total-display").textContent = `$${data.total.toFixed(2)}`;
        const status = document.getElementById("config-save-status");
        status.style.display = "inline";
        setTimeout(() => status.style.display = "none", 2500);
    } catch (e) {
        alert(`Error saving config: ${e.message}`);
    }
}

// ── Admin: Balances ───────────────────────────────────────────────────────────
async function loadBalances() {
    const wrap = document.getElementById("balances-wrap");
    wrap.innerHTML = `<div class="loading-row"><div class="spinner"></div> Loading balances...</div>`;
    try {
        const data = await api("/api/admin/balances", { "X-Admin-Token": adminToken });
        const balances = data.balances;

        if (!balances || balances.length === 0) {
            wrap.innerHTML = `<div class="empty-row" style="color:#4ade80;">All caught up — no outstanding balances.</div>`;
            return;
        }

        const totalOwed = balances.reduce((s, b) => s + b.total_owed, 0);

        const rows = balances.map(b => {
            const months = b.unpaid_months;
            const urgency = months >= 2 ? "color:#ef4444;font-weight:700;" : "color:#fb923c;";
            const label = months === 1 ? "1 month" : `${months} months`;
            return `
                <tr>
                    <td>${escHtml(b.username)}</td>
                    <td style="${urgency}">$${b.total_owed.toFixed(2)}</td>
                    <td style="${urgency}">${label} overdue</td>
                    <td>${formatMonth(b.oldest_unpaid)}</td>
                    <td>${formatMonth(b.newest_unpaid)}</td>
                </tr>`;
        }).join("");

        wrap.innerHTML = `
            <table class="billing-table">
                <thead><tr>
                    <th>Username</th><th>Total Owed</th><th>Months Overdue</th>
                    <th>Oldest Unpaid</th><th>Most Recent</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <div style="padding:12px 16px;font-size:13px;color:#94a3b8;border-top:1px solid var(--border-color);">
                Total outstanding: <strong style="color:#ef4444;">$${totalOwed.toFixed(2)}</strong>
                across ${balances.length} user${balances.length !== 1 ? "s" : ""}
            </div>`;
    } catch (e) {
        wrap.innerHTML = `<div class="error-row">Error loading balances: ${e.message}</div>`;
    }
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
            const hasPass = t.password_hash
                ? `<span class="badge badge-paid">✓ Set</span>`
                : `<span class="badge badge-unpaid">Not set</span>`;
            const isDisabled = t.disabled === 1 || t.disabled === true;
            const statusBadge = isDisabled
                ? `<span class="badge badge-overdue">Disabled</span>`
                : `<span class="badge badge-paid">Active</span>`;
            const toggleBtn = isDisabled
                ? `<button class="btn-approve" onclick="toggleUserAccess('${escHtml(t.username)}', false, this)">Enable</button>`
                : `<button class="btn-deny" onclick="toggleUserAccess('${escHtml(t.username)}', true, this)">Disable</button>`;
            return `
                <tr>
                    <td>${escHtml(t.username)}</td>
                    <td>${escHtml(t.email || "—")}</td>
                    <td>${hasPass}</td>
                    <td>${statusBadge}</td>
                    <td style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                        <button class="btn-pay" onclick="setUserPassword('${escHtml(t.username)}')">Set PW</button>
                        ${toggleBtn}
                        <button class="btn-deny" style="margin-left:0;" onclick="deleteUser('${escHtml(t.username)}',this)">Delete</button>
                    </td>
                </tr>`;
        }).join("");

        wrap.innerHTML = `
            <table class="billing-table">
                <thead><tr><th>Username</th><th>Email</th><th>Password</th><th>Status</th><th>Actions</th></tr></thead>
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

async function resetAllPasswords() {
    if (!confirm('Reset EVERY user\'s password to "password" on both the billing site and Jellyfin? They\'ll all be forced to change it on next login.')) return;
    const btn = document.querySelector('[onclick="resetAllPasswords()"]');
    if (btn) { btn.disabled = true; btn.textContent = "Resetting..."; }
    try {
        const data = await api("/api/admin/reset-all-passwords", { "X-Admin-Token": adminToken }, "POST");
        const wrap = document.getElementById("initial-pw-wrap");
        wrap.innerHTML = `
            <div style="padding:14px 16px;font-size:13px;color:#4ade80;">
                ✓ Reset ${data.count} user${data.count !== 1 ? "s" : ""} to <code>password</code> on billing site and Jellyfin.
                Tell everyone: sign in at <strong>media.wycoffcomm.com</strong> with their username + <code>password</code> and set a new one.
            </div>`;
        wrap.style.display = "block";
        loadTokens();
    } catch (e) {
        alert(`Error: ${e.message}`);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "Reset All to Default"; }
    }
}

async function setInitialPasswords() {
    if (!confirm('Set billing password to "password" for all users who don\'t have one? They\'ll be forced to change it on first login.')) return;
    const btn = document.querySelector('[onclick="setInitialPasswords()"]');
    if (btn) { btn.disabled = true; btn.textContent = "Working..."; }

    try {
        const data = await api("/api/admin/set-initial-passwords", { "X-Admin-Token": adminToken }, "POST");
        const wrap = document.getElementById("initial-pw-wrap");

        if (data.count === 0) {
            wrap.innerHTML = `<div class="empty-row" style="color:#4ade80;">All users already have passwords set.</div>`;
        } else {
            const rows = data.users.map(u => `
                <tr>
                    <td>${escHtml(u.username)}</td>
                    <td>${escHtml(u.email || "—")}</td>
                </tr>`).join("");

            wrap.innerHTML = `
                <div style="padding:12px 16px 0;font-size:13px;color:#94a3b8;">
                    Password set to <code style="color:#4ade80;">password</code> for ${data.count} user${data.count !== 1 ? "s" : ""}.
                    They'll be prompted to change it when they first log in.
                    Tell them: sign in at <strong>media.wycoffcomm.com</strong> with username + <code>password</code>.
                </div>
                <table class="billing-table">
                    <thead><tr><th>Username</th><th>Email</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
                <div style="padding:8px 16px 12px;">
                    <button class="btn btn-sm btn-ghost" onclick="document.getElementById('initial-pw-wrap').style.display='none'">Dismiss</button>
                </div>`;
        }

        wrap.style.display = "block";
        loadTokens();
    } catch (e) {
        alert(`Error: ${e.message}`);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "Set Initial Passwords"; }
    }
}

async function syncJellyfinUsers() {
    const btn = document.querySelector('[onclick="syncJellyfinUsers()"]');
    if (btn) { btn.disabled = true; btn.textContent = "Syncing..."; }
    try {
        const data = await api("/api/admin/sync-users", { "X-Admin-Token": adminToken }, "POST");
        const msg = `Sync complete.\nAdded: ${data.added.length > 0 ? data.added.join(", ") : "none"}\nAlready existed: ${data.skipped.join(", ")}`;
        alert(msg);
        loadTokens();
    } catch (e) {
        alert(`Sync error: ${e.message}`);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "Sync from Jellyfin"; }
    }
}

async function toggleUserAccess(username, disable, btn) {
    const action = disable ? "disable" : "enable";
    if (!confirm(`${disable ? "Disable" : "Re-enable"} Jellyfin access for ${username}?`)) return;
    btn.disabled = true;
    btn.textContent = "...";
    try {
        await api(`/api/admin/${action}/${encodeURIComponent(username)}`, { "X-Admin-Token": adminToken }, "POST");
        loadTokens();
    } catch (e) {
        btn.disabled = false;
        btn.textContent = disable ? "Disable" : "Enable";
        alert(`Error: ${e.message}`);
    }
}

async function setUserPassword(username) {
    const password = prompt(`Set new password for ${username} (min 6 characters):`);
    if (!password) return;
    if (password.length < 6) {
        alert("Password must be at least 6 characters.");
        return;
    }
    try {
        await api("/api/admin/set-password", { "X-Admin-Token": adminToken }, "POST", { username, password });
        alert(`Password set for ${username}.`);
        loadTokens();
    } catch (e) {
        alert(`Error: ${e.message}`);
    }
}

// ── User email ────────────────────────────────────────────────────────────────
async function saveUserEmail() {
    const email = document.getElementById("user-email-input").value.trim();
    const statusEl = document.getElementById("user-email-status");
    statusEl.style.display = "none";

    if (!email || !email.includes("@")) {
        statusEl.textContent = "Please enter a valid email address.";
        statusEl.className = "pw-status pw-error";
        statusEl.style.display = "block";
        return;
    }

    const btn = document.querySelector('[onclick="saveUserEmail()"]');
    btn.disabled = true;
    btn.textContent = "Saving...";

    try {
        await api("/api/user/set-email", { "X-User-Token": userToken }, "POST", { email });
        statusEl.textContent = "Email saved. You'll receive billing notifications here.";
        statusEl.className = "pw-status pw-success";
        statusEl.style.display = "block";
        setTimeout(() => { statusEl.style.display = "none"; }, 4000);
    } catch (e) {
        statusEl.textContent = e.message;
        statusEl.className = "pw-status pw-error";
        statusEl.style.display = "block";
    } finally {
        btn.disabled = false;
        btn.textContent = "Save Email";
    }
}

// ── Admin: Delete user ─────────────────────────────────────────────────────────
async function deleteUser(username, btn) {
    if (!confirm(`Permanently delete ${username}? This removes them from the billing site, Jellyfin, and Jellyseerr. This cannot be undone.`)) return;
    btn.disabled = true;
    btn.textContent = "Deleting...";
    try {
        await api(`/api/admin/users/${encodeURIComponent(username)}`, { "X-Admin-Token": adminToken }, "DELETE");
        loadTokens();
    } catch (e) {
        btn.disabled = false;
        btn.textContent = "Delete";
        alert(`Error deleting ${username}: ${e.message}`);
    }
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
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem("wycoff_user_token");
    localStorage.removeItem("wycoff_username");
    adminToken = null;
    userToken = null;
    currentUsername = null;
    window.location.href = "index.html";
}

async function changePassword() {
    const current = document.getElementById("current-password-input").value;
    const newPw = document.getElementById("new-password-input").value;
    const statusEl = document.getElementById("change-password-status");

    statusEl.style.display = "none";

    if (!current || !newPw) {
        statusEl.textContent = "Please fill in both fields.";
        statusEl.className = "pw-status pw-error";
        statusEl.style.display = "block";
        return;
    }
    if (newPw.length < 6) {
        statusEl.textContent = "New password must be at least 6 characters.";
        statusEl.className = "pw-status pw-error";
        statusEl.style.display = "block";
        return;
    }

    const btn = document.getElementById("change-password-btn");
    btn.disabled = true;
    btn.textContent = "Saving...";

    try {
        await api("/api/user/change-password", { "X-User-Token": userToken }, "POST", {
            current_password: current,
            new_password: newPw,
        });
        document.getElementById("current-password-input").value = "";
        document.getElementById("new-password-input").value = "";
        localStorage.removeItem("wycoff_must_change_pw");
        statusEl.textContent = "Password changed. Your Jellyfin password has also been updated.";
        statusEl.className = "pw-status pw-success";
        statusEl.style.display = "block";
        // If they were forced here, now load the rest of the page
        hide("must-change-banner");
        show("history-section");
        render();
    } catch (e) {
        statusEl.textContent = e.message;
        statusEl.className = "pw-status pw-error";
        statusEl.style.display = "block";
    } finally {
        btn.disabled = false;
        btn.textContent = "Change Password";
    }
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
