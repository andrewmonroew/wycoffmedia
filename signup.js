/* signup.js — Wycoff Media Signup Form Logic */

const API = "https://billing-api.wycoffcomm.com";

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("signup-form");
    form.addEventListener("submit", handleSubmit);

    // Real-time validation
    document.getElementById("su-username").addEventListener("input", validateUsername);
    document.getElementById("su-email").addEventListener("blur", validateEmail);
    document.getElementById("su-name").addEventListener("blur", validateName);
});

// ── Validation ────────────────────────────────────────────────────────────────
function validateName() {
    const el = document.getElementById("su-name");
    const err = document.getElementById("err-name");
    const val = el.value.trim();
    if (!val) {
        setFieldError(el, err, "Full name is required.");
        return false;
    }
    clearFieldError(el, err);
    return true;
}

function validateEmail() {
    const el = document.getElementById("su-email");
    const err = document.getElementById("err-email");
    const val = el.value.trim();
    if (!val) {
        setFieldError(el, err, "Email is required.");
        return false;
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(val)) {
        setFieldError(el, err, "Please enter a valid email address.");
        return false;
    }
    clearFieldError(el, err);
    return true;
}

function validateUsername() {
    const el = document.getElementById("su-username");
    const err = document.getElementById("err-username");
    const val = el.value.trim();
    if (!val) {
        setFieldError(el, err, "Username is required.");
        return false;
    }
    if (val.length < 2 || val.length > 32) {
        setFieldError(el, err, "Username must be 2–32 characters.");
        return false;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(val)) {
        setFieldError(el, err, "Username can only contain letters, numbers, and underscores.");
        return false;
    }
    clearFieldError(el, err);
    return true;
}

function setFieldError(el, errEl, msg) {
    el.classList.add("invalid");
    el.classList.remove("valid");
    errEl.textContent = msg;
}

function clearFieldError(el, errEl) {
    el.classList.remove("invalid");
    el.classList.add("valid");
    errEl.textContent = "";
}

// ── Submit ────────────────────────────────────────────────────────────────────
async function handleSubmit(e) {
    e.preventDefault();

    // Validate all fields
    const nameOk = validateName();
    const emailOk = validateEmail();
    const usernameOk = validateUsername();

    if (!nameOk || !emailOk || !usernameOk) return;

    const btn = document.getElementById("signup-btn");
    const statusEl = document.getElementById("signup-status");

    btn.disabled = true;
    btn.textContent = "Submitting...";
    statusEl.style.display = "none";
    statusEl.className = "signup-status";

    const payload = {
        name: document.getElementById("su-name").value.trim(),
        email: document.getElementById("su-email").value.trim(),
        username: document.getElementById("su-username").value.trim(),
        discord_handle: document.getElementById("su-discord").value.trim() || null,
    };

    try {
        const res = await fetch(`${API}/api/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok) {
            statusEl.className = "signup-status success";
            statusEl.innerHTML = `
                <strong>Request received!</strong><br>
                ${data.message || "Your request has been submitted and is pending review."}
                <br><br>
                <small>You'll receive an email at <strong>${escHtml(payload.email)}</strong> once Andrew reviews your request.</small>
            `;
            statusEl.style.display = "block";
            document.getElementById("signup-form").querySelectorAll("input").forEach(i => i.disabled = true);
            btn.textContent = "Request Submitted";
        } else if (res.status === 409) {
            statusEl.className = "signup-status error";
            statusEl.textContent = data.detail || "This email or username is already registered.";
            statusEl.style.display = "block";
            btn.disabled = false;
            btn.textContent = "Submit Request";

            const detail = (data.detail || "").toLowerCase();
            if (detail.includes("email")) {
                const el = document.getElementById("su-email");
                const err = document.getElementById("err-email");
                setFieldError(el, err, "This email is already registered.");
            }
            if (detail.includes("username")) {
                const el = document.getElementById("su-username");
                const err = document.getElementById("err-username");
                setFieldError(el, err, "This username is already taken. Please choose another.");
            }
        } else if (res.status === 429) {
            statusEl.className = "signup-status error";
            statusEl.textContent = "Too many requests. Please wait a moment and try again.";
            statusEl.style.display = "block";
            btn.disabled = false;
            btn.textContent = "Submit Request";
        } else {
            throw new Error(data.detail || `Server error (${res.status})`);
        }
    } catch (err) {
        statusEl.className = "signup-status error";
        statusEl.textContent = `Something went wrong: ${err.message}. Please try again or contact Andrew directly.`;
        statusEl.style.display = "block";
        btn.disabled = false;
        btn.textContent = "Submit Request";
    }
}

function escHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
