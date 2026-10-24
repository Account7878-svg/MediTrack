"use strict";

// ============================================
// MediTrack Pro — Stock & Expiry Alert System
// ============================================

(() => {
    const API_URL = "http://127.0.0.1:8000/api/medicines";
    const LOW_STOCK_LIMIT = 20;
    const EXPIRY_WARNING_DAYS = 10;

    const DAILY_KEY = "meditrack_alerts_last_popup_date_v1";

    let currentAlerts = [];
    let refreshTimer;

    // ---------- Date helpers ----------

    function today() {
        const d = new Date();

        return [
            d.getFullYear(),
            String(d.getMonth() + 1).padStart(2, "0"),
            String(d.getDate()).padStart(2, "0")
        ].join("-");
    }

    function daysUntilExpiry(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
            return NaN;
        }

        const [year, month, day] = value.split("-").map(Number);
        const expiry = new Date(Date.UTC(year, month - 1, day));

        // Reject invalid dates such as 2026-02-31.
        if (
            expiry.getUTCFullYear() !== year ||
            expiry.getUTCMonth() !== month - 1 ||
            expiry.getUTCDate() !== day
        ) {
            return NaN;
        }

        const now = new Date();

        const currentDay = Date.UTC(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
        );

        return Math.round((expiry.getTime() - currentDay) / 86400000);
    }

    function formatDate(value) {
        const days = daysUntilExpiry(value);

        if (!Number.isFinite(days)) {
            return value || "Unknown date";
        }

        const [year, month, day] = value.split("-").map(Number);

        return new Date(year, month - 1, day).toLocaleDateString(
            "en-IN",
            {
                day: "2-digit",
                month: "short",
                year: "numeric"
            }
        );
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]);
    }

    // ---------- Add alert panel ----------

    function addStyles() {
        if (document.getElementById("mt-alert-styles")) return;

        const style = document.createElement("style");
        style.id = "mt-alert-styles";

        style.textContent = `
            #mt-alert-panel {
                margin: 0 0 24px;
                padding: 22px;
                background: #ffffff;
                border: 1px solid #e4eaf2;
                border-radius: 16px;
                box-shadow: 0 6px 22px rgba(20,33,61,.05);
            }

            #mt-alert-panel .mt-alert-heading {
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                gap: 12px;
                margin-bottom: 16px;
            }

            #mt-alert-panel h2 {
                color: #14213d;
                font-size: 19px;
            }

            #mt-alert-panel .mt-alert-subtitle {
                margin-top: 6px;
                color: #8490a5;
                font-size: 12px;
                line-height: 1.6;
            }

            #mt-alert-panel .mt-alert-actions {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
            }

            #mt-alert-panel button {
                padding: 10px 12px;
                border: 1px solid #dce3ed;
                border-radius: 9px;
                background: #fff;
                color: #24324a;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
            }

            #mt-alert-panel button:hover {
                background: #f4f7fb;
            }

            #mt-alert-panel .mt-alert-list {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px;
            }

            #mt-alert-panel .mt-alert-item {
                display: flex;
                align-items: flex-start;
                gap: 12px;
                padding: 14px;
                border: 1px solid #edf0f5;
                border-radius: 11px;
                background: #fbfcfe;
            }

            #mt-alert-panel .mt-alert-icon {
                display: grid;
                place-items: center;
                flex-shrink: 0;
                width: 36px;
                height: 36px;
                border-radius: 10px;
                font-weight: 800;
            }

            #mt-alert-panel .mt-expiry .mt-alert-icon {
                color: #a65c13;
                background: #fff1df;
            }

            #mt-alert-panel .mt-expired .mt-alert-icon {
                color: #be3348;
                background: #ffe8eb;
            }

            #mt-alert-panel .mt-low .mt-alert-icon {
                color: #93620e;
                background: #fff4d6;
            }

            #mt-alert-panel .mt-alert-item strong {
                color: #24324a;
                font-size: 13px;
                line-height: 1.5;
            }

            #mt-alert-panel .mt-alert-item p {
                margin-top: 5px;
                color: #718096;
                font-size: 12px;
                line-height: 1.6;
                overflow-wrap: anywhere;
            }

            #mt-alert-panel .mt-alert-ok {
                padding: 16px;
                color: #18794e;
                background: #e7f7ed;
                border-radius: 10px;
                font-size: 13px;
            }

            #mt-alert-panel .mt-alert-error {
                padding: 14px;
                color: #a83240;
                background: #fff0f1;
                border-radius: 10px;
                font-size: 13px;
            }

            #mt-alert-panel .mt-alert-footnote {
                margin-top: 14px;
                color: #8490a5;
                font-size: 11px;
                line-height: 1.6;
            }

            @media (max-width: 700px) {
                #mt-alert-panel {
                    padding: 16px;
                }

                #mt-alert-panel .mt-alert-list {
                    grid-template-columns: 1fr;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function createPanel() {
        let panel = document.getElementById("mt-alert-panel");

        if (panel) return panel;

        panel = document.createElement("section");
        panel.id = "mt-alert-panel";
        panel.setAttribute("aria-live", "polite");

        panel.innerHTML = `
            <div class="mt-alert-heading">
                <div>
                    <h2>Medicine Alerts</h2>
                    <p class="mt-alert-subtitle">
                        Stock levels and upcoming expiry dates
                    </p>
                </div>

                <div class="mt-alert-actions">
                    <button type="button" id="mt-enable-notifications">
                        Enable pop-up alerts
                    </button>
                    <button type="button" id="mt-refresh-alerts">
                        Refresh
                    </button>
                </div>
            </div>

            <div id="mt-alert-content">
                Checking your inventory...
            </div>

            <p class="mt-alert-footnote">
                Expiry reminders start 10 days before expiry.
                Low-stock alerts trigger at 20 base units or fewer.
                Keep this webpage open for automatic checks.
            </p>
        `;

        const topbar = document.querySelector(".topbar");

        if (topbar) {
            topbar.insertAdjacentElement("afterend", panel);
        } else {
            const main = document.querySelector(".main-content") || document.body;
            main.prepend(panel);
        }

        document.getElementById("mt-refresh-alerts")
            .addEventListener("click", refreshAlerts);

        document.getElementById("mt-enable-notifications")
            .addEventListener("click", enableNotifications);

        return panel;
    }

    // ---------- Find medicines needing attention ----------

    function collectAlerts(rawMedicines) {
        const alerts = [];

        for (const item of rawMedicines) {
            const name = item.name || "Unnamed medicine";
            const batch = item.batch_number ?? item.batch ?? "—";
            const quantity = Number(item.quantity);
            const expiry = item.expiry_date ?? item.expiry ?? "";
            const days = daysUntilExpiry(expiry);

            const medicine = {
                name,
                batch,
                quantity,
                expiry
            };

            if (Number.isFinite(days) && days < 0) {
                alerts.push({
                    kind: "expired",
                    icon: "!",
                    title: `${name} — expired`,
                    detail:
                        `Batch ${batch} · Expired ${Math.abs(days)} day(s) ago`
                });
            } else if (
                Number.isFinite(days) &&
                days <= EXPIRY_WARNING_DAYS
            ) {
                alerts.push({
                    kind: "expiry",
                    icon: "◷",
                    title: `${name} — expiring soon`,
                    detail:
                        `Batch ${batch} · Expires ${formatDate(expiry)} · ` +
                        `${days} day(s) remaining`
                });
            }

            if (
                Number.isFinite(quantity) &&
                quantity >= 0 &&
                quantity <= LOW_STOCK_LIMIT
            ) {
                alerts.push({
                    kind: "low",
                    icon: "↓",
                    title: `${name} — low stock`,
                    detail:
                        `Batch ${batch} · Only ${quantity} base units remaining`
                });
            }
        }

        // Show urgent expiry alerts first.
        const priority = { expired: 0, expiry: 1, low: 2 };

        return alerts.sort(
            (a, b) => priority[a.kind] - priority[b.kind]
        );
    }

    // ---------- Render dashboard alerts ----------

    function renderAlerts() {
        const content = document.getElementById("mt-alert-content");

        if (!content) return;

        if (currentAlerts.length === 0) {
            content.innerHTML = `
                <div class="mt-alert-ok">
                    ✓ No low-stock or expiry alerts right now.
                </div>
            `;
            return;
        }

        content.innerHTML = `
            <div class="mt-alert-list">
                ${currentAlerts.map(alert => `
                    <article class="mt-alert-item mt-${alert.kind}">
                        <div class="mt-alert-icon">
                            ${escapeHTML(alert.icon)}
                        </div>
                        <div>
                            <strong>${escapeHTML(alert.title)}</strong>
                            <p>${escapeHTML(alert.detail)}</p>
                        </div>
                    </article>
                `).join("")}
            </div>
        `;
    }

    // ---------- Daily browser pop-up ----------

    function sendDailyPopup(forceTest = false) {
        if (!("Notification" in window)) {
            return;
        }

        if (Notification.permission !== "granted") {
            return;
        }

        const date = today();

        if (!forceTest && currentAlerts.length === 0) {
            return;
        }

        if (!forceTest) {
            try {
                if (localStorage.getItem(DAILY_KEY) === date) {
                    return;
                }
            } catch {
                // Continue if storage is unavailable.
            }
        }

        let title;
        let body;

        if (forceTest) {
            title = "MediTrack Pro";
            body = currentAlerts.length
                ? `Notifications enabled. ${currentAlerts.length} inventory alert(s) need attention.`
                : "Browser notifications are enabled successfully.";
        } else {
            title = "MediTrack Pro — Daily Reminder";

            const expiryCount = currentAlerts.filter(
                alert => alert.kind === "expiry"
            ).length;

            const expiredCount = currentAlerts.filter(
                alert => alert.kind === "expired"
            ).length;

            const lowCount = currentAlerts.filter(
                alert => alert.kind === "low"
            ).length;

            body = [
                expiredCount && `${expiredCount} expired`,
                expiryCount && `${expiryCount} expiring soon`,
                lowCount && `${lowCount} low-stock`
            ].filter(Boolean).join(" · ");
        }

        try {
            const popup = new Notification(title, {
                body,
                tag: `meditrack-${date}`,
                renotify: false
            });

            popup.onclick = () => {
                window.focus();
                popup.close();
            };

            if (!forceTest) {
                try {
                    localStorage.setItem(DAILY_KEY, date);
                } catch {
                    // Alerts still work without saved notification state.
                }
            }
        } catch (error) {
            console.error("Browser notification error:", error);
        }
    }

    async function enableNotifications() {
        if (!("Notification" in window)) {
            alert(
                "This browser does not support desktop notifications. " +
                "You can still see alerts in the dashboard."
            );
            return;
        }

        try {
            const permission = await Notification.requestPermission();

            if (permission === "granted") {
                sendDailyPopup(true);
                sendDailyPopup(false);
            } else {
                alert(
                    "Notifications are blocked. Allow them in your browser's " +
                    "site settings for 127.0.0.1."
                );
            }
        } catch (error) {
            console.error("Notification permission error:", error);
        }
    }

    // ---------- Load live inventory from your C backend ----------

    async function refreshAlerts() {
        const content = document.getElementById("mt-alert-content");

        if (content && currentAlerts.length === 0) {
            content.textContent = "Checking your inventory...";
        }

        try {
            const response = await fetch(API_URL, {
                method: "GET",
                cache: "no-store"
            });

            if (!response.ok) {
                throw new Error(`Server returned HTTP ${response.status}`);
            }

            const data = await response.json();

            const records = Array.isArray(data)
                ? data
                : data.medicines || data.data || [];

            if (!Array.isArray(records)) {
                throw new Error("Unexpected inventory response format");
            }

            currentAlerts = collectAlerts(records);

            renderAlerts();

            // A desktop reminder is sent no more than once per day.
            sendDailyPopup(false);

            const button = document.getElementById(
                "mt-enable-notifications"
            );

            if (button && "Notification" in window) {
                button.textContent =
                    Notification.permission === "granted"
                        ? "✓ Notifications enabled"
                        : "Enable pop-up alerts";
            }

        } catch (error) {
            console.error("MediTrack alerts could not load:", error);

            if (content) {
                content.innerHTML = `
                    <div class="mt-alert-error">
                        Could not load inventory. Make sure the C backend
                        is running on port 8000, then click Refresh.
                        <br><br>
                        Details: ${escapeHTML(error.message)}
                    </div>
                `;
            }
        }
    }

    // ---------- Start the system when the webpage opens ----------

    function start() {
        addStyles();
        createPanel();
        refreshAlerts();

        // Recheck inventory while the webpage remains open.
        refreshTimer = setInterval(refreshAlerts, 5 * 60 * 1000);

        // Recheck when the user returns to the tab.
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) {
                refreshAlerts();
            }
        });

        window.addEventListener("beforeunload", () => {
            clearInterval(refreshTimer);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();