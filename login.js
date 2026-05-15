/* login.js — Wycoff Media Login Page */

const API = "https://billing-api.wycoffcomm.com";

document.addEventListener("DOMContentLoaded", () => {
    // Already logged in — go straight to billing
    if (localStorage.getItem("wycoff_user_token") || localStorage.getItem("wycoff_admin_token")) {
        window.location.href = "billing.html";
        return;
    }

    document.getElementById("login-form").addEventListener("submit", handleLogin);
});

async function handleLogin(e) {
    e.preventDefault();

    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;
    const errEl   = document.getElementById("login-error");
    const btn     = document.getElementById("login-btn");

    if (!username || !password) {
        errEl.textContent = "Please enter your username and password.";
        errEl.style.display = "block";
        return;
    }

    btn.disabled = true;
    btn.textContent = "Signing in...";
    errEl.style.display = "none";

    try {
        const res = await fetch(`${API}/api/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            errEl.textContent = data.detail || "Invalid username or password.";
            errEl.style.display = "block";
            btn.disabled = false;
            btn.textContent = "Sign In";
            return;
        }

        if (data.user_token) {
            localStorage.setItem("wycoff_user_token", data.user_token);
        }
        if (data.is_admin && data.admin_token) {
            localStorage.setItem("wycoff_admin_token", data.admin_token);
        }

        window.location.href = "billing.html";

    } catch (err) {
        errEl.textContent = "Connection error. Please try again.";
        errEl.style.display = "block";
        btn.disabled = false;
        btn.textContent = "Sign In";
    }
}
