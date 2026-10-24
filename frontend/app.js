"use strict";

// ==================================================
// MediTrack Pro — Complete Frontend Application
// C backend + CSV persistence + Inventory Alerts
// ==================================================

const API_URL = "http://127.0.0.1:8000/api/medicines";

const LOW_STOCK_LIMIT = 20;
const EXPIRY_WARNING_DAYS = 10;

const DAILY_NOTIFICATION_KEY = "meditrack_daily_alert_date_v2";

// ==================================================
// 1. HTML ELEMENTS
// ==================================================

const $ = id => document.getElementById(id);

const addButton = $("add-medicine-btn");
const dialog = $("medicine-dialog");
const closeButton = $("close-dialog-btn");
const cancelButton = $("cancel-dialog-btn");
const form = $("medicine-form");

const nameInput = $("medicine-name");
const batchInput = $("batch-number");
const typeInput = $("medicine-type");
const quantityInput = $("quantity");
const expiryInput = $("expiry-date");
const formError = $("form-error");

const inventoryBody = $("inventory-body");
const searchInput = $("search-input");
const statusFilter = $("status-filter");
const emptyState = $("empty-state");
const recordCount = $("record-count");
const toast = $("toast");

// ==================================================
// 2. APPLICATION STATE
// ==================================================

let medicines = [];
let editingMedicineId = null;
let loading = false;
let toastTimer = null;

function showToast(message) {
    if (!toast) {
        console.log(message);
        return;
    }

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3500);
}

function showFormError(message) {
    if (!formError) {
        showToast(message);
        return;
    }

    formError.textContent = message;
    formError.hidden = false;
}

function clearFormError() {
    if (!formError) return;

    formError.textContent = "";
    formError.hidden = true;
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

// ==================================================
// 3. CONNECT TO THE C BACKEND
// ==================================================

async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        cache: "no-store",
        ...options,
        headers: {
            ...(options.body
                ? { "Content-Type": "application/json" }
                : {}),
            ...(options.headers || {})
        }
    });

    const text = await response.text();

    let result = {};

    if (text.trim()) {
        try {
            result = JSON.parse(text);
        } catch {
            throw new Error("Invalid response received from C backend.");
        }
    }

    if (!response.ok) {
        throw new Error(
            result.error ||
            result.message ||
            `Request failed: HTTP ${response.status}`
        );
    }

    return result;
}

// Support the field names returned by the C API.
function normalizeMedicine(item) {
    return {
        id: item.id,
        name: String(item.name ?? ""),
        batch: String(item.batch_number ?? item.batch ?? ""),
        type: String(item.type || "Other"),
        quantity: Number(item.quantity),
        expiry: String(item.expiry_date ?? item.expiry ?? "")
    };
}

// ==================================================
// 4. DATE AND MEDICINE STATUS
// ==================================================

function todayISO() {
    const date = new Date();

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

function daysUntilExpiry(expiryDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(expiryDate || ""))) {
        return NaN;
    }

    const [year, month, day] = expiryDate.split("-").map(Number);

    const expiry = new Date(Date.UTC(year, month - 1, day));

    // Reject invalid calendar dates.
    if (
        expiry.getUTCFullYear() !== year ||
        expiry.getUTCMonth() !== month - 1 ||
        expiry.getUTCDate() !== day
    ) {
        return NaN;
    }

    const now = new Date();

    const today = Date.UTC(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
    );

    return Math.round((expiry.getTime() - today) / 86400000);
}

function formatDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
        return value || "—";
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

function isLowStock(medicine) {
    return Number.isFinite(medicine.quantity) &&
        medicine.quantity >= 0 &&
        medicine.quantity <= LOW_STOCK_LIMIT;
}

function getStatus(medicine) {
    const days = daysUntilExpiry(medicine.expiry);

    if (!Number.isFinite(days)) {
        return "Unknown";
    }

    if (days < 0) {
        return "Expired";
    }

    if (days <= EXPIRY_WARNING_DAYS) {
        return "Expiring soon";
    }

    if (isLowStock(medicine)) {
        return "Low stock";
    }

    return "In stock";
}

// ==================================================
// 5. ALERT PANEL AND STYLING
// ==================================================

function installAlertStyles() {
    if ($("meditrack-alert-styles")) return;

    const style = document.createElement("style");
    style.id = "meditrack-alert-styles";

    style.textContent = `
        .mt-alert-panel {
            margin-bottom: 24px;
            padding: 20px;
            border: 1px solid #e4eaf2;
            border-radius: 15px;
            background: #fff;
            box-shadow: 0 5px 20px rgba(20,33,61,.05);
        }

        .mt-alert-heading {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 12px;
            margin-bottom: 15px;
        }

        .mt-alert-heading h2 {
            font-size: 18px;
            color: #14213d;
        }

        .mt-alert-heading p {
            margin-top: 5px;
            color: #8490a5;
            font-size: 12px;
        }

        .mt-alert-buttons {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        .mt-alert-buttons button {
            padding: 10px 12px;
            border: 1px solid #dce3ed;
            border-radius: 8px;
            color: #24324a;
            background: white;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
        }

        .mt-alert-buttons button:hover {
            background: #f4f7fb;
        }

        .mt-alert-list {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
        }

        .mt-alert-item {
            display: flex;
            align-items: flex-start;
            gap: 11px;
            padding: 13px;
            border: 1px solid #edf0f5;
            border-radius: 10px;
            background: #fbfcfe;
        }

        .mt-alert-icon {
            display: grid;
            place-items: center;
            flex: 0 0 32px;
            width: 32px;
            height: 32px;
            border-radius: 9px;
            background: #fff1df;
            color: #a65c13;
            font-weight: 800;
        }

        .mt-alert-item.low .mt-alert-icon {
            background: #fff4d6;
            color: #93620e;
        }

        .mt-alert-item.expired .mt-alert-icon {
            background: #ffe8eb;
            color: #be3348;
        }

        .mt-alert-item strong {
            display: block;
            color: #24324a;
            font-size: 12px;
            line-height: 1.5;
        }

        .mt-alert-item p {
            margin-top: 5px;
            color: #718096;
            font-size: 11px;
            line-height: 1.6;
        }

        .mt-alert-ok {
            padding: 14px;
            border-radius: 9px;
            color: #18794e;
            background: #e7f7ed;
            font-size: 12px;
        }

        .mt-alert-error {
            padding: 14px;
            border-radius: 9px;
            color: #a83240;
            background: #fff0f1;
            font-size: 12px;
        }

        .mt-alert-note {
            margin-top: 12px;
            color: #8490a5;
            font-size: 11px;
            line-height: 1.6;
        }

        .row-actions {
            display: flex;
            align-items: center;
            gap: 7px;
        }

        .edit-button {
            padding: 7px 10px;
            border: 1px solid #cbdaf0;
            border-radius: 7px;
            color: #315eaa;
            background: #f3f7ff;
            font-size: 11px;
            font-weight: 700;
            cursor: pointer;
        }

        .edit-button:hover {
            background: #e4edff;
        }

        .edit-button:disabled,
        .action-button:disabled {
            opacity: .6;
            cursor: wait;
        }

        @media(max-width:700px) {
            .mt-alert-list {
                grid-template-columns: 1fr;
            }

            .mt-alert-panel {
                padding: 15px;
            }
        }
    `;

    document.head.appendChild(style);
}

function createAlertPanel() {
    if ($("mt-alert-panel")) return;

    const panel = document.createElement("section");

    panel.id = "mt-alert-panel";
    panel.className = "mt-alert-panel";
    panel.setAttribute("aria-live", "polite");

    panel.innerHTML = `
        <div class="mt-alert-heading">
            <div>
                <h2>Stock & Expiry Alerts</h2>
                <p>Review low stock and medicines nearing expiry.</p>
            </div>

            <div class="mt-alert-buttons">
                <button type="button" id="mt-enable-notifications">
                    Enable pop-up alerts
                </button>

                <button type="button" id="mt-refresh-alerts">
                    Refresh
                </button>
            </div>
        </div>

        <div id="mt-alert-content">
            Checking inventory...
        </div>

        <p class="mt-alert-note">
            Expiry reminders begin 10 days before expiry.
            Low-stock warnings trigger at 20 base units or fewer.
            Keep this webpage open for automatic checks.
        </p>
    `;

    const topbar = document.querySelector(".topbar");

    if (topbar) {
        topbar.insertAdjacentElement("afterend", panel);
    } else {
        (document.querySelector(".main-content") || document.body)
            .prepend(panel);
    }

    $("mt-refresh-alerts").addEventListener("click", loadMedicines);
    $("mt-enable-notifications")
        .addEventListener("click", enableNotifications);
}

// ==================================================
// 6. COLLECT AND DISPLAY ALERTS
// ==================================================

function getAlerts() {
    const alerts = [];

    medicines.forEach(medicine => {
        const days = daysUntilExpiry(medicine.expiry);

        if (Number.isFinite(days) && days < 0) {
            alerts.push({
                kind: "expired",
                icon: "!",
                title: `${medicine.name} — expired`,
                detail:
                    `Batch ${medicine.batch} · ` +
                    `Expired ${Math.abs(days)} day(s) ago`
            });
        } else if (
            Number.isFinite(days) &&
            days <= EXPIRY_WARNING_DAYS
        ) {
            alerts.push({
                kind: "expiry",
                icon: "◷",
                title: `${medicine.name} — expiring soon`,
                detail:
                    `Batch ${medicine.batch} · ` +
                    `Expires ${formatDate(medicine.expiry)} · ` +
                    `${days} day(s) remaining`
            });
        }

        if (isLowStock(medicine)) {
            alerts.push({
                kind: "low",
                icon: "↓",
                title: `${medicine.name} — low stock`,
                detail:
                    `Batch ${medicine.batch} · ` +
                    `Only ${medicine.quantity} base units remaining`
            });
        }
    });

    const priority = {
        expired: 0,
        expiry: 1,
        low: 2
    };

    return alerts.sort(
        (a, b) => priority[a.kind] - priority[b.kind]
    );
}
function renderStats() {
    // Use the same array that supplies the medicine table.
    const total = medicines.length;

    // Update every matching element in case the HTML has duplicate IDs.
    document.querySelectorAll("#total-medicines").forEach((element) => {
        element.textContent = total.toLocaleString("en-IN");
    });

    document.querySelectorAll("#low-stock-count").forEach((element) => {
        element.textContent = String(
            medicines.filter(isLowStock).length
        );
    });

    document.querySelectorAll("#expiring-count").forEach((element) => {
        element.textContent = String(
            medicines.filter(isExpiringSoon).length
        );
    });

    document.querySelectorAll("#expired-count").forEach((element) => {
        element.textContent = String(
            medicines.filter(isExpired).length
        );
    });

    console.log("[MediTrack] Dashboard counters updated:", {
        totalMedicines: total,
        lowStock: medicines.filter(isLowStock).length,
        expiringSoon: medicines.filter(isExpiringSoon).length,
        expired: medicines.filter(isExpired).length
    });
}

function renderAlerts() {
    const content = $("mt-alert-content");

    if (!content) return;

    const alerts = getAlerts();

    if (!alerts.length) {
        content.innerHTML = `
            <div class="mt-alert-ok">
                ✓ No low-stock or expiry alerts right now.
            </div>
        `;
        return;
    }

    content.innerHTML = `
        <div class="mt-alert-list">
            ${alerts.slice(0, 20).map(alert => `
                <article class="mt-alert-item ${alert.kind}">
                    <span class="mt-alert-icon">
                        ${escapeHTML(alert.icon)}
                    </span>

                    <div>
                        <strong>${escapeHTML(alert.title)}</strong>
                        <p>${escapeHTML(alert.detail)}</p>
                    </div>
                </article>
            `).join("")}
        </div>

        ${alerts.length > 20
            ? `<p class="mt-alert-note">
                Showing 20 of ${alerts.length} alerts.
               </p>`
            : ""}
    `;
}

// ==================================================
// 7. BROWSER NOTIFICATIONS
// ==================================================

function sendDailyNotification(forceTest = false) {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const alerts = getAlerts();

    if (!forceTest && alerts.length === 0) return;

    let alreadySent = false;

    try {
        alreadySent =
            localStorage.getItem(DAILY_NOTIFICATION_KEY) === todayISO();
    } catch {
        // The app can operate without localStorage.
    }

    if (!forceTest && alreadySent) return;

    let body;

    if (forceTest) {
        body = alerts.length
            ? `Notifications enabled. ${alerts.length} inventory alert(s) need attention.`
            : "MediTrack browser notifications are working.";
    } else {
        const expired = alerts.filter(a => a.kind === "expired").length;
        const expiring = alerts.filter(a => a.kind === "expiry").length;
        const low = alerts.filter(a => a.kind === "low").length;

        const messages = [];

        if (expired) messages.push(`${expired} expired`);
        if (expiring) messages.push(`${expiring} expiring soon`);
        if (low) messages.push(`${low} low-stock`);

        body = messages.join(" · ");
    }

    try {
        const notification = new Notification(
            "MediTrack Pro — Daily Reminder",
            {
                body,
                tag: `meditrack-${todayISO()}`,
                renotify: false
            }
        );

        notification.onclick = () => {
            window.focus();
            notification.close();
        };

        // Mark the daily notification as sent after a real alert popup.
        if (!forceTest || alerts.length > 0) {
            try {
                localStorage.setItem(DAILY_NOTIFICATION_KEY, todayISO());
            } catch {
                // Notification still works if storage is unavailable.
            }
        }
    } catch (error) {
        console.error("Could not show notification:", error);
    }
}

async function enableNotifications() {
    if (!("Notification" in window)) {
        showToast(
            "This browser does not support desktop notifications."
        );
        return;
    }

    try {
        const permission = await Notification.requestPermission();

        const button = $("mt-enable-notifications");

        if (permission === "granted") {
            if (button) {
                button.textContent = "✓ Notifications enabled";
            }

            sendDailyNotification(true);
        } else {
            showToast(
                "Notifications were not enabled. " +
                "You can still see alerts on the dashboard."
            );
        }
    } catch (error) {
        console.error("Notification permission error:", error);

        showToast(
            "Could not enable browser notifications. " +
            "Check your browser settings."
        );
    }
}

// ==================================================
// 8. DASHBOARD SUMMARY CARDS
// ==================================================

function updateDashboard() {
    const low = medicines.filter(isLowStock).length;

    const expiring = medicines.filter(medicine => {
        const days = daysUntilExpiry(medicine.expiry);

        return Number.isFinite(days) &&
            days >= 0 &&
            days <= EXPIRY_WARNING_DAYS;
    }).length;

    const expired = medicines.filter(medicine => {
        const days = daysUntilExpiry(medicine.expiry);

        return Number.isFinite(days) && days < 0;
    }).length;

    if ($("total-count")) {
        $("total-count").textContent = medicines.length;
    }

    if ($("low-stock-count")) {
        $("low-stock-count").textContent = low;
    }

    if ($("expiring-count")) {
        $("expiring-count").textContent = expiring;
    }

    if ($("expired-count")) {
        $("expired-count").textContent = expired;
    }

    renderAlerts();
}

// ==================================================
// 9. INVENTORY TABLE
// ==================================================

function createCell(text, className = "") {
    const cell = document.createElement("td");

    if (className) {
        cell.className = className;
    }

    cell.textContent = String(text ?? "");

    return cell;
}

function renderInventory() {
    if (!inventoryBody) return;

    inventoryBody.replaceChildren();

    if (loading && medicines.length === 0) {
        if (emptyState) {
            emptyState.hidden = false;
            emptyState.textContent = "Loading inventory...";
        }

        if (recordCount) {
            recordCount.textContent = "Loading medicines...";
        }

        return;
    }

    const search = (searchInput?.value || "")
        .trim()
        .toLowerCase();

    const filter = (statusFilter?.value || "all")
        .toLowerCase();

    const filtered = medicines.filter(medicine => {
        const matchesSearch = [
            medicine.name,
            medicine.batch,
            medicine.type
        ].some(value =>
            String(value || "").toLowerCase().includes(search)
        );

        const status = getStatus(medicine).toLowerCase();

        const matchesFilter =
            filter === "all" ||
            (filter === "low stock"
                ? isLowStock(medicine)
                : status === filter);

        return matchesSearch && matchesFilter;
    });

    filtered.sort((a, b) =>
        String(a.expiry).localeCompare(String(b.expiry)) ||
        a.name.localeCompare(b.name)
    );

    filtered.forEach(medicine => {
        const row = document.createElement("tr");

        row.dataset.id = String(medicine.id);

        // Medicine name and type
        const nameCell = document.createElement("td");

        const name = document.createElement("div");
        name.className = "medicine-name";
        name.textContent = medicine.name;

        const type = document.createElement("div");
        type.className = "medicine-type";
        type.textContent = medicine.type;

        nameCell.append(name, type);
        row.appendChild(nameCell);

        // Batch, quantity and expiry
        row.appendChild(createCell(medicine.batch));

        row.appendChild(
            createCell(`${medicine.quantity} base units`)
        );

        row.appendChild(
            createCell(formatDate(medicine.expiry))
        );

        // Status
        const status = getStatus(medicine);

        const statusCell = document.createElement("td");
        const badge = document.createElement("span");

        badge.className = "badge";

        if (status === "In stock") {
            badge.classList.add("safe");
        } else if (status === "Low stock") {
            badge.classList.add("warning");
        } else if (status === "Expiring soon") {
            badge.classList.add("danger");
        } else {
            badge.classList.add("expired");
        }

        badge.textContent = status;

        statusCell.appendChild(badge);
        row.appendChild(statusCell);

        // Edit and Delete buttons
        const actionCell = document.createElement("td");

        const actions = document.createElement("div");
        actions.className = "row-actions";

        const editButton = document.createElement("button");

        editButton.type = "button";
        editButton.className = "edit-button";
        editButton.textContent = "Edit";

        editButton.addEventListener("click", () => {
            openEditMedicine(medicine);
        });

        const deleteButton = document.createElement("button");

        deleteButton.type = "button";
        deleteButton.className = "action-button";
        deleteButton.textContent = "Delete";

        deleteButton.addEventListener("click", () => {
            deleteMedicine(medicine, deleteButton);
        });

        actions.append(editButton, deleteButton);
        actionCell.appendChild(actions);
        row.appendChild(actionCell);

        inventoryBody.appendChild(row);
    });

    if (emptyState) {
        emptyState.hidden = filtered.length !== 0;

        if (filtered.length === 0) {
            emptyState.textContent = medicines.length === 0
                ? "No medicines found. Add your first medicine."
                : "No medicines match your search or filter.";
        }
    }

    if (recordCount) {
        recordCount.textContent =
            `Showing ${filtered.length} of ${medicines.length} batches`;
    }

    updateDashboard();
}

// ==================================================
// 10. LOAD INVENTORY FROM THE C BACKEND
// ==================================================

async function loadMedicines() {
    loading = true;
    renderInventory();

    try {
        const data = await apiRequest(API_URL);

        const records = Array.isArray(data)
            ? data
            : data.medicines || data.data;

        if (!Array.isArray(records)) {
            throw new Error("Unexpected inventory response format.");
        }

        medicines = records.map(normalizeMedicine);

        renderInventory();

        sendDailyNotification();
        return true;

    } catch (error) {
        console.error("Could not load inventory:", error);

        if (inventoryBody) {
            inventoryBody.replaceChildren();

            const row = document.createElement("tr");
            const cell = document.createElement("td");

            cell.colSpan = 6;
            cell.textContent =
                "Could not connect to the C backend. " +
                "Check that the server is running.";

            row.appendChild(cell);
            inventoryBody.appendChild(row);
        }

        if (emptyState) {
            emptyState.hidden = true;
        }

        if (recordCount) {
            recordCount.textContent = "Backend connection failed";
        }

        const alertContent = $("mt-alert-content");

        if (alertContent) {
            alertContent.innerHTML = `
                <div class="mt-alert-error">
                    Could not load medicine data. Confirm that the C
                    backend is running at http://127.0.0.1:8000.
                </div>
            `;
        }

        return false;

    } finally {
        loading = false;
        renderInventory();
    }
}

// ==================================================
// 11. ADD OR EDIT MEDICINE FORM
// ==================================================

function resetFormForAdd() {
    editingMedicineId = null;

    form.reset();
    clearFormError();

    $("dialog-title").textContent = "Add new medicine";

    const submit = form.querySelector('[type="submit"]');

    if (submit) {
        submit.textContent = "Save medicine";
    }
}

function openEditMedicine(medicine) {
    editingMedicineId = String(medicine.id);

    form.reset();
    clearFormError();

    nameInput.value = medicine.name;
    batchInput.value = medicine.batch;

    // This type is persisted by the updated C backend.
    typeInput.value = medicine.type || "Other";

    quantityInput.value = String(medicine.quantity);
    expiryInput.value = medicine.expiry;

    $("dialog-title").textContent = "Edit medicine / Update stock";

    const submit = form.querySelector('[type="submit"]');

    if (submit) {
        submit.textContent = "Save changes";
    }

    dialog.showModal();
}

function validCalendarDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const [year, month, day] = value.split("-").map(Number);

    const date = new Date(year, month - 1, day);

    return date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day;
}

if (addButton) {
    addButton.addEventListener("click", () => {
        resetFormForAdd();
        dialog.showModal();
    });
}

function closeDialog() {
    if (dialog?.open) {
        dialog.close();
    }
}

if (closeButton) {
    closeButton.addEventListener("click", closeDialog);
}

if (cancelButton) {
    cancelButton.addEventListener("click", closeDialog);
}

if (dialog) {
    dialog.addEventListener("click", event => {
        if (event.target === dialog) {
            closeDialog();
        }
    });
}

if (form) {
    form.addEventListener("submit", async event => {
        event.preventDefault();

        clearFormError();

        const name = nameInput.value.trim();
        const batch = batchInput.value.trim();
        const type = typeInput.value || "Other";

        const rawQuantity = quantityInput.value.trim();
        const quantity = Number(rawQuantity);

        const expiry = expiryInput.value;

        if (!name || !batch || !expiry) {
            showFormError("Please complete all required fields.");
            return;
        }

        if (
            !rawQuantity ||
            !Number.isSafeInteger(quantity) ||
            quantity < 0 ||
            quantity > 1000000000
        ) {
            showFormError(
                "Enter a whole-number quantity in base units."
            );
            return;
        }

        if (!validCalendarDate(expiry)) {
            showFormError("Please enter a valid expiry date.");
            return;
        }

        // Exclude the currently edited record from duplicate checks.
        const duplicateBatch = medicines.some(medicine =>
            String(medicine.id) !== String(editingMedicineId) &&
            medicine.batch.toLowerCase() === batch.toLowerCase()
        );

        if (duplicateBatch) {
            showFormError(
                "That batch number already exists. Use a unique batch number."
            );
            return;
        }

        const editing = editingMedicineId !== null;
        const recordId = editingMedicineId;

        const submit = form.querySelector('[type="submit"]');

        if (submit) {
            submit.disabled = true;
            submit.textContent = editing ? "Saving..." : "Adding...";
        }

        try {
            const payload = {
                name,
                batch_number: batch,
                type,
                quantity,
                expiry_date: expiry
            };

            const result = await apiRequest(
                editing
                    ? `${API_URL}/${encodeURIComponent(recordId)}`
                    : API_URL,
                {
                    method: editing ? "PUT" : "POST",
                    body: JSON.stringify(payload)
                }
            );

            const savedId = editing ? recordId : result.id;

            if (savedId === undefined || savedId === null) {
                throw new Error("The backend did not return a medicine ID.");
            }

            const loaded = await loadMedicines();

            if (!loaded) {
                throw new Error(
                    "The save was submitted, but the inventory couldn't reload."
                );
            }

            const saved = medicines.find(
                medicine => String(medicine.id) === String(savedId)
            );

            if (!saved) {
                throw new Error(
                    "Couldn't verify the saved record in the inventory."
                );
            }

            if (
                saved.name !== name ||
                saved.batch !== batch ||
                saved.quantity !== quantity ||
                saved.expiry !== expiry
            ) {
                throw new Error(
                    "The updated fields could not be verified. " +
                    "Check the inventory before retrying."
                );
            }

            closeDialog();
            resetFormForAdd();

            showToast(
                editing
                    ? `${name} updated and saved successfully.`
                    : `${name} added successfully.`
            );

        } catch (error) {
            console.error("Could not save medicine:", error);

            showFormError(
                error.message || "Could not save medicine."
            );

        } finally {
            if (submit) {
                submit.disabled = false;
                submit.textContent =
                    editingMedicineId !== null
                        ? "Save changes"
                        : "Save medicine";
            }
        }
    });
}

// ==================================================
// 12. DELETE MEDICINE
// ==================================================

async function deleteMedicine(medicine, button) {
    const confirmed = window.confirm(
        `Delete "${medicine.name}" (batch ${medicine.batch})?\n\n` +
        "This will permanently remove this record from the CSV file."
    );

    if (!confirmed) return;

    button.disabled = true;
    button.textContent = "Deleting...";

    try {
        await apiRequest(
            `${API_URL}/${encodeURIComponent(medicine.id)}`,
            { method: "DELETE" }
        );

        await loadMedicines();

        showToast(`${medicine.name} deleted successfully.`);

    } catch (error) {
        console.error("Delete failed:", error);

        showToast(`Could not delete medicine: ${error.message}`);

        button.disabled = false;
        button.textContent = "Delete";
    }
}

// ==================================================
// 13. SEARCH AND FILTER
// ==================================================

if (searchInput) {
    searchInput.addEventListener("input", renderInventory);
}

if (statusFilter) {
    statusFilter.addEventListener("change", renderInventory);
}

// ==================================================
// 14. START THE APPLICATION
// ==================================================

installAlertStyles();
createAlertPanel();

loadMedicines();

// Refresh inventory and alerts every five minutes.
setInterval(() => {
    if (!document.hidden) {
        loadMedicines();
    }
}, 5 * 60 * 1000);

// Refresh when returning to the browser tab.
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
        loadMedicines();
    }
});
// MediTrack: independent medicine counter fix
(async function mediTrackCounterFix() {
    async function updateMedicineCounter() {
        try {
            const response = await fetch(
                "http://127.0.0.1:8000/api/medicines",
                { cache: "no-store" }
            );

            if (!response.ok) {
                throw new Error("Backend returned HTTP " + response.status);
            }

            const data = await response.json();

            if (!Array.isArray(data)) {
                throw new Error("Medicine API did not return an array.");
            }

            const counter = document.getElementById("total-medicines");

            if (!counter) {
                console.error(
                    "MediTrack: Cannot find element with id='total-medicines'."
                );
                return;
            }

            // Count all medicine batches returned by the backend.
            counter.textContent = data.length.toLocaleString("en-IN");

            console.log(
                "MediTrack total counter fixed:",
                data.length,
                "medicine batches"
            );
        } catch (error) {
            console.error("MediTrack counter error:", error);
        }
    }

    // Update now and keep checking while the page remains open.
    await updateMedicineCounter();
    setInterval(updateMedicineCounter, 10000);
})();
