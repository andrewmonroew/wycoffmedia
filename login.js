/* login.js — Wycoff Media Login Page */

const API = "https://billing-api.wycoffcomm.com";

document.addEventListener("DOMContentLoaded", () => {
    // Already logged in — send to appropriate page
    if (localStorage.getItem("wycoff_admin_token")) {
        window.location.href = "billing.html";
        return;
    }
    if (localStorage.getItem("wycoff_user_token")) {
        window.location.href = "info.html";
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
        if (data.username) {
            localStorage.setItem("wycoff_username", data.username);
        }
        if (data.must_change_password) {
            localStorage.setItem("wycoff_must_change_pw", "1");
        } else {
            localStorage.removeItem("wycoff_must_change_pw");
        }

        window.location.href = data.is_admin ? "billing.html" : "info.html";

    } catch (err) {
        errEl.textContent = "Connection error. Please try again.";
        errEl.style.display = "block";
        btn.disabled = false;
        btn.textContent = "Sign In";
    }
}
