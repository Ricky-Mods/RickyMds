/* =========================================
   RICKY MODs - ADMIN DASHBOARD
========================================= */

document.addEventListener("DOMContentLoaded", () => {
    const loginPanel = document.getElementById("login-panel");
    const dashboard = document.getElementById("dashboard");

    const loginForm = document.getElementById("login-form");
    const loginMessage = document.getElementById("login-message");

    const logoutButton = document.getElementById("logout");
    const appForm = document.getElementById("app-form");
    const formMessage = document.getElementById("form-message");
    const formTitle = document.getElementById("form-title");
    const saveButton = document.getElementById("save-button");
    const resetButton = document.getElementById("reset-form");

    const listingList = document.getElementById("listing-list");
    const refreshButton = document.getElementById("refresh");

    const passwordForm = document.getElementById("password-form");
    const passwordMessage = document.getElementById("password-message");

    const statTotal = document.getElementById("stat-total");
    const statPublished = document.getElementById("stat-published");
    const statDownloads = document.getElementById("stat-downloads");

    let editingId = null;

    const escapeHTML = value =>
        String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]);

    function showMessage(element, message, success = false) {
        if (!element) return;

        element.textContent = message;
        element.classList.toggle("success", success);
        element.classList.toggle("error", !success);
    }

    async function api(url, options = {}) {
        const response = await fetch(url, {
            credentials: "same-origin",
            ...options
        });

        const contentType = response.headers.get("content-type") || "";
        let data = {};

        if (contentType.includes("application/json")) {
            data = await response.json();
        }

        if (!response.ok) {
            throw new Error(data.error || `Request failed (${response.status})`);
        }

        return data;
    }

    function showDashboard() {
        loginPanel.classList.add("hidden");
        dashboard.classList.remove("hidden");
    }

    function showLogin() {
        dashboard.classList.add("hidden");
        loginPanel.classList.remove("hidden");
    }

    async function checkLogin() {
        try {
            await api("/api/admin/me");
            showDashboard();
            await loadDashboard();
        } catch {
            showLogin();
        }
    }

    // ADMIN LOGIN
    loginForm.addEventListener("submit", async event => {
        event.preventDefault();

        const button = loginForm.querySelector("button");
        button.disabled = true;
        button.textContent = "Signing in...";
        showMessage(loginMessage, "");

        const formData = new FormData(loginForm);

        try {
            await api("/api/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    username: formData.get("username"),
                    password: formData.get("password")
                })
            });

            loginForm.reset();
            showDashboard();
            await loadDashboard();

        } catch (error) {
            showMessage(loginMessage, error.message);
        } finally {
            button.disabled = false;
            button.textContent = "Sign In Securely";
        }
    });

    // ADMIN LOGOUT
    logoutButton.addEventListener("click", async () => {
        if (!confirm("Are you sure you want to sign out?")) return;

        try {
            await api("/api/logout", {
                method: "POST"
            });

            showLogin();
            showMessage(loginMessage, "You have signed out.", true);

        } catch (error) {
            alert(error.message);
        }
    });

    // LOAD DASHBOARD DATA
    async function loadDashboard() {
        await Promise.all([
            loadStats(),
            loadListings()
        ]);
    }

    async function loadStats() {
        try {
            const stats = await api("/api/admin/stats");

            statTotal.textContent = stats.total ?? 0;
            statPublished.textContent = stats.published ?? 0;
            statDownloads.textContent = stats.downloads ?? 0;

        } catch (error) {
            console.error("Statistics error:", error);
        }
    }

    // LOAD APPLICATION LISTINGS
    async function loadListings() {
        listingList.textContent = "Loading listings...";

        try {
            const apps = await api("/api/admin/apps");

            if (!apps.length) {
                listingList.textContent = "No applications have been added yet.";
                return;
            }

            listingList.innerHTML = apps.map(app => `
                <article class="listing-item">
                    <div class="listing-info">
                        <h3>${escapeHTML(app.title)}</h3>

                        <p>
                            ${escapeHTML(app.category)}
                            · Version ${escapeHTML(app.version || "N/A")}
                        </p>

                        <p>
                            ${escapeHTML(app.status)}
                            · ${Number(app.downloads || 0).toLocaleString()} downloads
                        </p>
                    </div>

                    <div class="listing-actions">
                        <button
                            type="button"
                            class="ghost edit-app"
                            data-id="${Number(app.id)}">
                            Edit
                        </button>

                        <button
                            type="button"
                            class="delete-app"
                            data-id="${Number(app.id)}">
                            Delete
                        </button>
                    </div>
                </article>
            `).join("");

            // Store listings for the edit buttons.
            window.rickyModsApps = apps;

        } catch (error) {
            listingList.textContent = error.message;
        }
    }

    // EDIT OR DELETE LISTINGS
    listingList.addEventListener("click", async event => {
        const editButton = event.target.closest(".edit-app");
        const deleteButton = event.target.closest(".delete-app");

        if (editButton) {
            const id = Number(editButton.dataset.id);
            const app = (window.rickyModsApps || []).find(item =>
                Number(item.id) === id
            );

            if (app) editListing(app);
        }

        if (deleteButton) {
            const id = Number(deleteButton.dataset.id);

            if (!confirm("Permanently delete this listing and its uploaded files?")) {
                return;
            }

            deleteButton.disabled = true;

            try {
                await api(`/api/admin/apps/${id}`, {
                    method: "DELETE"
                });

                showMessage(formMessage, "Listing deleted successfully.", true);
                await loadDashboard();

            } catch (error) {
                alert(error.message);
                deleteButton.disabled = false;
            }
        }
    });

    function editListing(app) {
        editingId = Number(app.id);

        appForm.elements.id.value = app.id;
        appForm.elements.title.value = app.title || "";
        appForm.elements.category.value = app.category || "Apps";
        appForm.elements.version.value = app.version || "";
        appForm.elements.size.value = app.size || "";
        appForm.elements.packageName.value = app.packageName || "";
        appForm.elements.description.value = app.description || "";
        appForm.elements.features.value = app.features || "";
        appForm.elements.status.value = app.status || "published";
        appForm.elements.featured.checked = Boolean(app.featured);

        // File inputs must be selected again only if replacing a file.
        appForm.elements.apk.value = "";
        appForm.elements.cover.value = "";

        formTitle.textContent = "Edit Listing";
        saveButton.textContent = "Save Changes";

        showMessage(
            formMessage,
            "Editing: " + app.title + ". Leave file inputs empty to keep existing files.",
            true
        );

        appForm.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }

    // RESET LISTING FORM
    function resetAppForm() {
        appForm.reset();
        appForm.elements.id.value = "";

        editingId = null;

        formTitle.textContent = "Add a New Listing";
        saveButton.textContent = "Publish Listing";

        showMessage(formMessage, "");
    }

    resetButton.addEventListener("click", resetAppForm);

    // CREATE OR UPDATE LISTING
    appForm.addEventListener("submit", async event => {
        event.preventDefault();

        const formData = new FormData(appForm);

        formData.set(
            "featured",
            appForm.elements.featured.checked ? "true" : "false"
        );

        const url = editingId
            ? `/api/admin/apps/${editingId}`
            : "/api/admin/apps";

        const method = editingId ? "PUT" : "POST";

        saveButton.disabled = true;
        saveButton.textContent = editingId ? "Saving..." : "Uploading...";

        showMessage(formMessage, "");

        try {
            await api(url, {
                method,
                body: formData
            });

            showMessage(
                formMessage,
                editingId
                    ? "Listing updated successfully."
                    : "New listing uploaded successfully.",
                true
            );

            resetAppForm();
            await loadDashboard();

        } catch (error) {
            showMessage(formMessage, error.message);
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = editingId
                ? "Save Changes"
                : "Publish Listing";
        }
    });

    // REFRESH LISTINGS
    refreshButton.addEventListener("click", loadDashboard);

    // CHANGE ADMIN PASSWORD
    passwordForm.addEventListener("submit", async event => {
        event.preventDefault();

        const formData = new FormData(passwordForm);
        const button = passwordForm.querySelector("button");

        const currentPassword = formData.get("currentPassword");
        const newPassword = formData.get("newPassword");

        if (String(newPassword).length < 12) {
            showMessage(
                passwordMessage,
                "Your new password must contain at least 12 characters."
            );
            return;
        }

        button.disabled = true;
        button.textContent = "Updating...";

        try {
            await api("/api/admin/change-password", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    currentPassword,
                    newPassword
                })
            });

            passwordForm.reset();

            showMessage(
                passwordMessage,
                "Admin password updated successfully.",
                true
            );

        } catch (error) {
            showMessage(passwordMessage, error.message);
        } finally {
            button.disabled = false;
            button.textContent = "Update Password";
        }
    });

    // INITIALISE
    checkLogin();
});
