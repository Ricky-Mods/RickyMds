/* =========================================
   RICKY MODs - PUBLIC WEBSITE JAVASCRIPT
========================================= */

document.addEventListener("DOMContentLoaded", () => {
    const grid = document.getElementById("app-grid");
    const search = document.getElementById("search");
    const categories = document.getElementById("categories");
    const resultCount = document.getElementById("result-count");
    const modal = document.getElementById("detail-modal");
    const detailContent = document.getElementById("detail-content");
    const closeModal = document.getElementById("close-modal");
    const year = document.getElementById("year");

    let selectedCategory = "All";
    let searchTimer;

    if (year) year.textContent = new Date().getFullYear();

    const escapeHTML = (value = "") =>
        String(value).replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]);

    const showMessage = (message) => {
        if (grid) {
            grid.innerHTML = `<p class="muted">${escapeHTML(message)}</p>`;
        }
    };

    const formatSize = value => value
        ? escapeHTML(value)
        : "Size unavailable";

    const featuredSection = document.getElementById("featured-section");
    const featuredGrid = document.getElementById("featured-grid");

    function createAppCard(app, isFeatured = false) {
        const cover = app.cover
            ? `<img src="${escapeHTML(app.cover)}" alt="${escapeHTML(app.title)}" loading="lazy">`
            : `<div class="app-placeholder">${escapeHTML((app.title || "R").charAt(0).toUpperCase())}</div>`;

        return `
            <article class="app-card">
                <div class="app-cover">
                    ${cover}
                    ${isFeatured ? '<span class="featured-card-badge">★ Featured</span>' : ""}
                </div>
                <div class="app-info">
                    <span class="app-category">${escapeHTML(app.category)}</span>
                    <h3>${escapeHTML(app.title)}</h3>
                    <p>${escapeHTML(app.description || "Discover this application on RICKY MODs.")}</p>
                    <div class="app-meta">
                        <span>Version ${escapeHTML(app.version || "N/A")}</span>
                        <span>${formatSize(app.size)}</span>
                    </div>
                    <div class="app-actions">
                        <button class="details-btn" data-slug="${escapeHTML(app.slug)}">Details</button>
                        <a class="download-btn" href="/api/download/${encodeURIComponent(app.id)}">Download</a>
                    </div>
                    <small class="download-count">
                        ${Number(app.downloads || 0).toLocaleString()} downloads
                    </small>
                </div>
            </article>
        `;
    }

    function renderApps(apps) {
        if (!grid) return;

        if (!Array.isArray(apps) || apps.length === 0) {
            showMessage("No applications found. Try another search.");
            if (resultCount) resultCount.textContent = "0 applications found";
            return;
        }

        if (resultCount) {
            resultCount.textContent =
                `${apps.length} application${apps.length === 1 ? "" : "s"} found`;
        }

        grid.innerHTML = apps.map(app => createAppCard(app)).join("");
    }

    function renderFeatured(apps) {
        if (!featuredSection || !featuredGrid) return;

        const featured = Array.isArray(apps)
            ? apps.filter(app => app.featured)
            : [];

        featuredSection.hidden = featured.length === 0;

        if (featured.length > 0) {
            featuredGrid.innerHTML = featured
                .slice(0, 6)
                .map(app => createAppCard(app, true))
                .join("");
        } else {
            featuredGrid.innerHTML = "";
        }
    }

    async function loadApps() {
        if (!grid) return;

        grid.innerHTML = '<p class="muted">Loading applications...</p>';

        const params = new URLSearchParams();

        if (search && search.value.trim()) {
            params.set("q", search.value.trim());
        }

        if (selectedCategory !== "All") {
            params.set("category", selectedCategory);
        }

        try {
            const [catalogueResponse, featuredResponse] = await Promise.all([
                fetch(`/api/apps?${params.toString()}`, {
                    headers: { "Accept": "application/json" }
                }),
                fetch("/api/apps", {
                    headers: { "Accept": "application/json" }
                })
            ]);

            if (!catalogueResponse.ok || !featuredResponse.ok) {
                throw new Error("The applications could not be loaded.");
            }

            const [catalogueApps, allApps] = await Promise.all([
                catalogueResponse.json(),
                featuredResponse.json()
            ]);

            renderFeatured(allApps);
            renderApps(catalogueApps);
        } catch (error) {
            console.error("RICKY MODs loading error:", error);
            showMessage("Unable to load applications. Please refresh and try again.");
            if (featuredSection) featuredSection.hidden = true;
        }
    }

    async function openDetails(slug) {
        if (!modal || !detailContent) return;

        modal.classList.remove("hidden");
        detailContent.innerHTML = '<p>Loading application details...</p>';

        try {
            const response = await fetch(
                `/api/apps/${encodeURIComponent(slug)}`
            );

            if (!response.ok) {
                throw new Error("Application details unavailable.");
            }

            const app = await response.json();

            detailContent.innerHTML = `
                <div class="detail-view">
                    ${app.cover
                        ? `<img class="detail-cover" src="${escapeHTML(app.cover)}" alt="${escapeHTML(app.title)}">`
                        : ""}
                    <h2>${escapeHTML(app.title)}</h2>
                    <p>${escapeHTML(app.description || "No description available.")}</p>
                    <p><strong>Category:</strong> ${escapeHTML(app.category)}</p>
                    <p><strong>Version:</strong> ${escapeHTML(app.version || "N/A")}</p>
                    <p><strong>Size:</strong> ${formatSize(app.size)}</p>
                    <p><strong>Package:</strong> ${escapeHTML(app.packageName || "N/A")}</p>
                    <p><strong>Downloads:</strong> ${Number(app.downloads || 0).toLocaleString()}</p>
                    ${app.features
                        ? `<div class="detail-features"><h3>Features</h3><p>${escapeHTML(app.features).replace(/\n/g, "<br>")}</p></div>`
                        : ""}
                    <a class="download-btn detail-download" href="/api/download/${encodeURIComponent(app.id)}">
                        Download ${escapeHTML(app.title)}
                    </a>
                </div>
            `;
        } catch (error) {
            console.error(error);
            detailContent.innerHTML =
                "<p>Unable to load details. Please try again.</p>";
        }
    }

    if (search) {
        search.addEventListener("input", () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(loadApps, 300);
        });
    }

    if (categories) {
        categories.addEventListener("click", event => {
            const button = event.target.closest("[data-category]");
            if (!button) return;

            selectedCategory = button.dataset.category || "All";

            categories.querySelectorAll("[data-category]").forEach(item => {
                item.classList.toggle("active", item === button);
                item.setAttribute(
                    "aria-pressed",
                    item === button ? "true" : "false"
                );
            });

            loadApps();
        });
    }

    if (grid) {
        grid.addEventListener("click", event => {
            const button = event.target.closest("[data-slug]");
            if (button) openDetails(button.dataset.slug);
        });
    }

    if (closeModal) {
        closeModal.addEventListener("click", () => {
            modal?.classList.add("hidden");
        });
    }

    if (modal) {
        modal.addEventListener("click", event => {
            if (event.target === modal) {
                modal.classList.add("hidden");
            }
        });
    }

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            modal?.classList.add("hidden");
        }
    });

    loadApps();
});
