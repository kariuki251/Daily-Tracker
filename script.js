
document.addEventListener("DOMContentLoaded", async () => {
    await window.dailyTrackReady;

    const $ = (selector, parent = document) =>
        parent.querySelector(selector);

    const $$ = (selector, parent = document) =>
        [...parent.querySelectorAll(selector)];

    const addRoutineBtn = $("#addRoutineBtn");
    const closeModalBtn = $("#closeModal");
    const modal = $("#modal");
    const routineForm = $("#routineForm");
    const routineName = $("#routineName");
    const routineTime = $("#routineTime");
    const routineList = $("#routineList");

    const STORAGE = {
        routines: "dailyTrackRoutines",
        history: "dailyTrackHistory",
        goals: "dailyTrackGoals"
    };

    function load(key, fallback) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || "null");
            return value ?? fallback;
        } catch {
            return fallback;
        }
    }

    function save(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));

            if (window.dailyTrackUserId) {
                window.dispatchEvent(new Event("dailytrack-save"));
            }
        } catch (error) {
            console.error("DailyTrack could not save data:", error);
        }
    }

    let routines = load(STORAGE.routines, []);
    let history = load(STORAGE.history, {});
    let goals = load(STORAGE.goals, []);

    if (!Array.isArray(routines)) routines = [];
    if (!history || typeof history !== "object" || Array.isArray(history)) {
        history = {};
    }
    if (!Array.isArray(goals)) goals = [];

    function dateKey(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }

    function dateFromKey(key) {
        const [year, month, day] = key.split("-").map(Number);
        return new Date(year, month - 1, day);
    }

    // Older routines without a date are assigned today's date once.
    // Existing routines with dates are left untouched.
    let migratedRoutines = false;

    routines = routines.map(routine => {
        if (
            typeof routine.date === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(routine.date)
        ) {
            return routine;
        }

        migratedRoutines = true;

        return {
            ...routine,
            date: dateKey(new Date())
        };
    });

    if (migratedRoutines) {
        save(STORAGE.routines, routines);
    }

    let selectedDate = dateKey(new Date());

    let displayedMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
    );

    let activePage = "Dashboard";
    let pageView = null;

    function routinesForDate(key) {
        return routines.filter(routine => routine.date === key);
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

    function formatTime(time) {
        if (!time) return "No time set";

        const [hours, minutes] = time.split(":");
        const date = new Date();

        date.setHours(Number(hours), Number(minutes), 0, 0);

        return date.toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit"
        });
    }

    function formatDate(date) {
        return date.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric"
        });
    }

    function isCompleted(routine, key = dateKey(new Date())) {
        const day = history[key];

        if (Array.isArray(day)) {
            return day.some(id => String(id) === String(routine.id));
        }

        if (
            day &&
            typeof day === "object" &&
            Object.prototype.hasOwnProperty.call(day, routine.id)
        ) {
            return Boolean(day[routine.id]);
        }

        // Compatibility with the original completion property.
        return routine.date === key && routine.completed === true;
    }

    function setCompletion(routine, key, completed) {
        // A routine can only be completed on its own date.
        if (routine.date !== key) return;

        if (!Array.isArray(history[key])) {
            const previous = history[key];

            history[key] = previous && typeof previous === "object"
                ? Object.keys(previous).filter(id => previous[id])
                : [];
        }

        history[key] = history[key].filter(
            id => String(id) !== String(routine.id)
        );

        if (completed) {
            history[key].push(routine.id);
        }

        routine.completed = completed;

        save(STORAGE.history, history);
        save(STORAGE.routines, routines);
    }

    function completionCount(key) {
        return routinesForDate(key).filter(
            routine => isCompleted(routine, key)
        ).length;
    }

    function weeklyStats() {
        const today = new Date();

        const days = Array.from({ length: 7 }, (_, index) => {
            const date = new Date(today);
            date.setDate(today.getDate() - (6 - index));

            const key = dateKey(date);
            const total = routinesForDate(key).length;
            const completed = completionCount(key);

            return {
                date,
                key,
                label: date.toLocaleDateString(undefined, {
                    weekday: "short"
                }),
                completed,
                total,
                rate: total
                    ? Math.round(completed / total * 100)
                    : 0
            };
        });

        const possible = days.reduce(
            (sum, day) => sum + day.total,
            0
        );

        const done = days.reduce(
            (sum, day) => sum + day.completed,
            0
        );

        return {
            days,
            rate: possible
                ? Math.round(done / possible * 100)
                : 0
        };
    }

    // ---------------- MODAL ----------------

    function openModal() {
        modal.style.display = "flex";
        modal.classList.add("active");
        routineName.focus();
    }

    function closeModal() {
        modal.style.display = "none";
        modal.classList.remove("active");
        routineForm.reset();
    }

    addRoutineBtn.addEventListener("click", openModal);
    closeModalBtn.addEventListener("click", closeModal);

    modal.addEventListener("click", event => {
        if (event.target === modal) closeModal();
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeModal();
    });

    routineForm.addEventListener("submit", event => {
        event.preventDefault();

        const name = routineName.value.trim();

        if (!name) {
            routineName.focus();
            return;
        }

        const today = dateKey(new Date());

        routines.push({
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            name,
            time: routineTime.value,
            completed: false,
            date: today
        });

        save(STORAGE.routines, routines);

        renderRoutines();
        closeModal();
        refreshPage();
    });

    // ---------------- DASHBOARD ----------------

    function updateDashboard() {
        const today = dateKey(new Date());
        const todayRoutines = routinesForDate(today);

        const total = todayRoutines.length;
        const completed = completionCount(today);

        const percentage = total
            ? Math.round(completed / total * 100)
            : 0;

        if ($("#progressPercentage")) {
            $("#progressPercentage").textContent = `${percentage}%`;
        }

        if ($("#progressBar")) {
            $("#progressBar").style.width = `${percentage}%`;
        }

        if ($("#completedCount")) {
            $("#completedCount").textContent = `${completed} completed`;
        }

        if ($("#totalCount")) {
            $("#totalCount").textContent =
                `${total} ${total === 1 ? "routine" : "routines"}`;
        }

        if ($("#statCompleted")) {
            $("#statCompleted").textContent = completed;
        }

        if ($("#progressMessage")) {
            $("#progressMessage").textContent = total === 0
                ? "Let's make today count."
                : percentage === 100
                    ? "Amazing! All routines completed!"
                    : percentage >= 50
                        ? "Great progress! Keep going."
                        : "One step at a time. You've got this!";
        }

        const weekly = weeklyStats();

        if ($("#statWeeklyGoal")) {
            $("#statWeeklyGoal").textContent = `${weekly.rate}%`;
        }

        if ($("#statStreak")) {
            let streak = 0;
            const date = new Date();

            while (streak < 3660) {
                const key = dateKey(date);
                const dayTotal = routinesForDate(key).length;

                // A day without routines does not count as a completed day.
                if (dayTotal === 0 || completionCount(key) !== dayTotal) {
                    break;
                }

                streak++;
                date.setDate(date.getDate() - 1);
            }

            $("#statStreak").textContent = `${streak} days`;
        }
    }

    function renderRoutines() {
        routineList.replaceChildren();

        const today = dateKey(new Date());
        const todayRoutines = routinesForDate(today);

        if (todayRoutines.length === 0) {
            const empty = document.createElement("p");

            empty.textContent =
                "No routines for today. Click + Add Routine to get started.";

            empty.style.padding = "20px";
            empty.style.color = "#777";

            routineList.appendChild(empty);
        }

        todayRoutines.forEach(routine => {
            const completed = isCompleted(routine, today);

            const card = document.createElement("div");
            card.className = "routine-card";

            if (completed) card.classList.add("completed");

            const details = document.createElement("div");
            details.style.flex = "1";
            details.style.minWidth = "0";

            const name = document.createElement("strong");
            name.textContent = routine.name;
            name.style.display = "block";
            name.style.overflowWrap = "anywhere";

            if (completed) {
                name.style.textDecoration = "line-through";
            }

            const time = document.createElement("small");
            time.textContent = formatTime(routine.time);
            time.style.display = "block";
            time.style.marginTop = "5px";
            time.style.color = "#777";

            details.append(name, time);

            const actions = document.createElement("div");
            actions.style.display = "flex";
            actions.style.gap = "8px";
            actions.style.flexWrap = "wrap";

            const completeBtn = document.createElement("button");
            completeBtn.type = "button";
            completeBtn.textContent = completed ? "Undo" : "Complete";

            completeBtn.addEventListener("click", () => {
                setCompletion(
                    routine,
                    routine.date,
                    !isCompleted(routine, routine.date)
                );

                renderRoutines();
                refreshPage();
            });

            const deleteBtn = document.createElement("button");
            deleteBtn.type = "button";
            deleteBtn.textContent = "Delete";

            deleteBtn.addEventListener("click", () => {
                routines = routines.filter(
                    item => String(item.id) !== String(routine.id)
                );

                Object.keys(history).forEach(key => {
                    if (Array.isArray(history[key])) {
                        history[key] = history[key].filter(
                            id => String(id) !== String(routine.id)
                        );
                    } else if (
                        history[key] &&
                        typeof history[key] === "object"
                    ) {
                        delete history[key][routine.id];
                    }
                });

                save(STORAGE.routines, routines);
                save(STORAGE.history, history);

                renderRoutines();
                refreshPage();
            });

            actions.append(completeBtn, deleteBtn);
            card.append(details, actions);
            routineList.appendChild(card);
        });

        updateDashboard();
    }

    // ---------------- PAGE NAVIGATION ----------------

    function ensurePageView() {
        if (pageView) return pageView;

        pageView = document.createElement("section");
        pageView.id = "pageView";
        pageView.style.display = "none";

        const main = $(".main");
        const topbar = $(".topbar");

        if (main && topbar) {
            topbar.insertAdjacentElement("afterend", pageView);
        } else if (main) {
            main.prepend(pageView);
        }

        return pageView;
    }

    function showPage(page) {
        activePage = page;

        $$(".nav-item").forEach(item => {
            item.classList.toggle(
                "active",
                item.textContent.trim().toLowerCase().includes(page.toLowerCase())
            );
        });

        const dashboard = page === "Dashboard";
        const routinesPage = page === "Routines";

        [".progress-section", ".stats-grid", ".routine-section", ".motivation"]
            .forEach(selector => {
                const section = $(selector);
                if (!section) return;

                section.style.display =
                    dashboard ||
                    (routinesPage && selector === ".routine-section")
                        ? ""
                        : "none";
            });

        const view = ensurePageView();

        view.style.display =
            ["Calendar", "Analytics", "Goals"].includes(page)
                ? "block"
                : "none";

        if (page === "Calendar" || page === "Analytics" || page === "Goals") {
            renderPage(page);
        }

        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    $$(".nav-item").forEach(item => {
        item.addEventListener("click", event => {
            event.preventDefault();

            const text = item.textContent.trim().toLowerCase();

            const page = [
                "dashboard",
                "routines",
                "calendar",
                "analytics",
                "goals"
            ].find(name => text.includes(name));

            if (page) {
                showPage(page[0].toUpperCase() + page.slice(1));
            }
        });
    });

    function refreshPage() {
        updateDashboard();

        if (["Calendar", "Analytics", "Goals"].includes(activePage)) {
            renderPage(activePage);
        }
    }

    function renderPage(page = activePage) {
        const view = ensurePageView();

        if (page === "Calendar") renderCalendar(view);
        if (page === "Analytics") renderAnalytics(view);
        if (page === "Goals") renderGoals(view);
    }

    // ---------------- CALENDAR ----------------

    function renderCalendar(view) {
        const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

        const first = new Date(
            displayedMonth.getFullYear(),
            displayedMonth.getMonth(),
            1
        );

        const start = new Date(
            first.getFullYear(),
            first.getMonth(),
            1 - first.getDay()
        );

        let cells = weekdays.map(day =>
            `<div class="dt-weekday">${day}</div>`
        ).join("");

        for (let i = 0; i < 42; i++) {
            const date = new Date(start);
            date.setDate(start.getDate() + i);

            const key = dateKey(date);
            const dayRoutines = routinesForDate(key);
            const done = completionCount(key);

            const classes = [
                "dt-day",
                date.getMonth() !== displayedMonth.getMonth() ? "outside" : "",
                key === dateKey(new Date()) ? "today" : "",
                key === selectedDate ? "selected" : "",
                dayRoutines.length ? "has-routines" : "",
                done ? "has-completions" : ""
            ].filter(Boolean).join(" ");

            cells += `
                <button type="button" class="${classes}" data-date="${key}">
                    <span class="dt-day-number">${date.getDate()}</span>
                    ${dayRoutines.length ? '<span class="dt-day-dot"></span>' : ""}
                </button>`;
        }

        const selectedRoutines = routinesForDate(selectedDate);

        const details = selectedRoutines.length
            ? selectedRoutines.map(routine => {
                const done = isCompleted(routine, selectedDate);

                return `
                    <div class="dt-routine-line">
                        <div>
                            <strong>${escapeHTML(routine.name)}</strong>
                            <div class="dt-muted">
                                ${escapeHTML(formatTime(routine.time))}
                            </div>
                        </div>
                        <span class="${done ? "dt-status" : "dt-muted"}">
                            ${done ? "✓ Completed" : "Not completed"}
                        </span>
                    </div>`;
            }).join("")
            : '<p class="dt-empty">No routines were added on this date.</p>';

        view.innerHTML = `
            <div class="dt-page-heading">
                <h1>Calendar</h1>
                <p>Review your routines and daily progress.</p>
            </div>

            <div class="dt-page-card">
                <div class="dt-calendar-toolbar">
                    <button class="dt-button secondary" data-month="-1">‹</button>
                    <h2>${displayedMonth.toLocaleDateString(undefined, {
                        month: "long",
                        year: "numeric"
                    })}</h2>
                    <button class="dt-button secondary" data-month="1">›</button>
                </div>

                <div class="dt-calendar-grid">${cells}</div>

                <div class="dt-day-detail">
                    <h2>${escapeHTML(formatDate(dateFromKey(selectedDate)))}</h2>
                    <p>
                        ${completionCount(selectedDate)} of
                        ${selectedRoutines.length} routines completed
                    </p>
                    ${details}
                </div>
            </div>`;

        view.querySelectorAll("[data-date]").forEach(button => {
            button.addEventListener("click", () => {
                selectedDate = button.dataset.date;
                renderCalendar(view);
            });
        });

        view.querySelectorAll("[data-month]").forEach(button => {
            button.addEventListener("click", () => {
                displayedMonth.setMonth(
                    displayedMonth.getMonth() + Number(button.dataset.month)
                );

                renderCalendar(view);
            });
        });
    }

    // ---------------- ANALYTICS ----------------

    function renderAnalytics(view) {
        const { days, rate } = weeklyStats();

        const today = dateKey(new Date());
        const todayTotal = routinesForDate(today).length;

        const todayRate = todayTotal
            ? Math.round(completionCount(today) / todayTotal * 100)
            : 0;

        const weeklyTotal = days.reduce(
            (sum, day) => sum + day.total,
            0
        );

        const bars = days.map(day => `
            <div class="dt-chart-column">
                <span class="dt-chart-label">${day.rate}%</span>
                <div class="dt-chart-track">
                    <div class="dt-chart-bar" style="height:${day.rate}%"></div>
                </div>
                <span class="dt-chart-label">${day.label}</span>
            </div>
        `).join("");

        const breakdown = [...days].reverse().map(day => `
            <div class="dt-analytics-line">
                <span>
                    ${escapeHTML(day.date.toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "short",
                        day: "numeric"
                    }))}
                </span>
                <strong>${day.completed}/${day.total} · ${day.rate}%</strong>
            </div>
        `).join("");

        view.innerHTML = `
            <div class="dt-page-heading">
                <h1>Analytics</h1>
                <p>See your consistency and celebrate your progress.</p>
            </div>

            <div class="dt-page-stats">
                <div class="dt-page-stat">
                    <span>Today's completion</span>
                    <strong>${todayRate}%</strong>
                </div>
                <div class="dt-page-stat">
                    <span>7-day completion</span>
                    <strong>${rate}%</strong>
                </div>
                <div class="dt-page-stat">
                    <span>Tasks this week</span>
                    <strong>${weeklyTotal}</strong>
                </div>
            </div>

            <div class="dt-page-card">
                <h2>Weekly consistency</h2>
                <p class="dt-muted">
                    Percentage of routines completed each day.
                </p>
                <div class="dt-chart">${bars}</div>
            </div>

            <div class="dt-page-card">
                <h2>Daily breakdown</h2>
                ${breakdown}
            </div>`;
    }

    // ---------------- GOALS ----------------

    function renderGoals(view) {
        const completedGoals = goals.filter(goal => goal.completed).length;

        const items = goals.length
            ? goals.map(goal => {
                const progress = goal.completed
                    ? 100
                    : Math.max(0, Math.min(100, Number(goal.progress) || 0));

                return `
                    <div class="dt-goal-line">
                        <div class="dt-goal-main">
                            <h3>${escapeHTML(goal.title)}</h3>
                            <p class="dt-muted">
                                ${goal.deadline
                                    ? `Target date: ${escapeHTML(goal.deadline)}`
                                    : "No target date"}
                            </p>
                            <div class="dt-progress-track">
                                <div class="dt-progress-fill"
                                    style="width:${progress}%"></div>
                            </div>
                            <p class="dt-muted">
                                ${goal.completed
                                    ? "Completed"
                                    : `${progress}% complete`}
                            </p>
                        </div>

                        <div class="dt-goal-actions">
                            ${goal.completed ? "" : `
                                <button class="dt-button secondary"
                                    data-action="progress"
                                    data-id="${escapeHTML(goal.id)}">+10%</button>
                                <button class="dt-button"
                                    data-action="complete"
                                    data-id="${escapeHTML(goal.id)}">Finish</button>
                            `}
                            <button class="dt-button danger"
                                data-action="delete"
                                data-id="${escapeHTML(goal.id)}">Delete</button>
                        </div>
                    </div>`;
            }).join("")
            : '<p class="dt-empty">No goals yet. Create your first goal above.</p>';

        view.innerHTML = `
            <div class="dt-page-heading">
                <h1>Goals</h1>
                <p>Turn your plans into progress, one step at a time.</p>
            </div>

            <div class="dt-page-stats">
                <div class="dt-page-stat">
                    <span>Total goals</span>
                    <strong>${goals.length}</strong>
                </div>
                <div class="dt-page-stat">
                    <span>Completed</span>
                    <strong>${completedGoals}</strong>
                </div>
                <div class="dt-page-stat">
                    <span>In progress</span>
                    <strong>${goals.length - completedGoals}</strong>
                </div>
            </div>

            <div class="dt-page-card">
                <h2>Create a goal</h2>
                <form id="dtGoalForm" class="dt-form">
                    <label for="dtGoalTitle">Goal name</label>
                    <input class="dt-input" id="dtGoalTitle" maxlength="120"
                        placeholder="e.g. Read 12 books" required>

                    <label for="dtGoalDeadline">Target date (optional)</label>
                    <input class="dt-input" id="dtGoalDeadline" type="date"
                        min="${dateKey(new Date())}">

                    <button class="dt-button" type="submit">+ Add goal</button>
                </form>
            </div>

            <div class="dt-page-card">
                <h2>Your goals</h2>
                ${items}
            </div>`;

        $("#dtGoalForm", view).addEventListener("submit", event => {
            event.preventDefault();

            const title = $("#dtGoalTitle", view).value.trim();
            const deadline = $("#dtGoalDeadline", view).value;

            if (!title) return;

            goals.push({
                id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                title,
                deadline,
                progress: 0,
                completed: false
            });

            save(STORAGE.goals, goals);
            renderGoals(view);
        });

        view.querySelectorAll("[data-action]").forEach(button => {
            button.addEventListener("click", () => {
                const id = button.dataset.id;
                const action = button.dataset.action;

                if (action === "delete") {
                    goals = goals.filter(
                        goal => String(goal.id) !== String(id)
                    );
                } else {
                    goals = goals.map(goal => {
                        if (String(goal.id) !== String(id)) return goal;

                        if (action === "complete") {
                            return {
                                ...goal,
                                progress: 100,
                                completed: true
                            };
                        }

                        const progress = Math.min(
                            100,
                            (Number(goal.progress) || 0) + 10
                        );

                        return {
                            ...goal,
                            progress,
                            completed: progress === 100
                        };
                    });
                }

                save(STORAGE.goals, goals);
                renderGoals(view);
            });
        });
    }

    // ---------------- START APP ----------------

    const currentDate = $("#currentDate");

    if (currentDate) {
        currentDate.textContent = formatDate(new Date());
    }

    window.addEventListener("focus", refreshPage);

    renderRoutines();
    closeModal();
});


/* ========================================
   DAILYTRACK DATA BACKUP
======================================== */

(() => {
    const KEYS = [
        "dailyTrackRoutines",
        "dailyTrackHistory",
        "dailyTrackGoals"
    ];

    const exportBtn = document.getElementById("exportBackupBtn");
    const importBtn = document.getElementById("importBackupBtn");
    const fileInput = document.getElementById("backupFileInput");
    const message = document.getElementById("backupMessage");

    if (!exportBtn || !importBtn || !fileInput || !message) {
        return;
    }

    function showMessage(text) {
        message.textContent = text;
    }

    function readStoredData() {
        const data = {};

        for (const key of KEYS) {
            const raw = localStorage.getItem(key);

            if (raw === null) {
                data[key] = null;
                continue;
            }

            data[key] = JSON.parse(raw);
        }

        return data;
    }

    exportBtn.addEventListener("click", () => {
        try {
            const backup = {
                app: "DailyTrack",
                version: 1,
                exportedAt: new Date().toISOString(),
                data: readStoredData()
            };

            const blob = new Blob(
                [JSON.stringify(backup, null, 2)],
                { type: "application/json" }
            );

            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download =
                `dailytrack-backup-${new Date()
                    .toISOString()
                    .slice(0, 10)}.json`;

            document.body.appendChild(link);
            link.click();
            link.remove();

            setTimeout(() => URL.revokeObjectURL(url), 1000);

            showMessage("Backup exported successfully.");
        } catch (error) {
            console.error("Backup export failed:", error);
            showMessage(
                "Could not export your data. Check browser storage."
            );
        }
    });

    importBtn.addEventListener("click", () => {
        fileInput.click();
    });

    fileInput.addEventListener("change", async () => {
        const file = fileInput.files[0];

        if (!file) return;

        try {
            if (file.size > 5 * 1024 * 1024) {
                throw new Error("The backup file is too large.");
            }

            const backup = JSON.parse(await file.text());

            if (
                backup.app !== "DailyTrack" ||
                backup.version !== 1 ||
                !backup.data ||
                typeof backup.data !== "object" ||
                Array.isArray(backup.data)
            ) {
                throw new Error("This is not a valid DailyTrack backup.");
            }

            const data = backup.data;

            for (const key of KEYS) {
                if (
                    data[key] !== null &&
                    data[key] !== undefined &&
                    !(
                        Array.isArray(data[key]) ||
                        (
                            typeof data[key] === "object" &&
                            data[key] !== null
                        )
                    )
                ) {
                    throw new Error("The backup contains invalid data.");
                }
            }

            if (
                !Array.isArray(data.dailyTrackRoutines) &&
                data.dailyTrackRoutines !== null &&
                data.dailyTrackRoutines !== undefined
            ) {
                throw new Error("The routines data is invalid.");
            }

            if (
                !Array.isArray(data.dailyTrackGoals) &&
                data.dailyTrackGoals !== null &&
                data.dailyTrackGoals !== undefined
            ) {
                throw new Error("The goals data is invalid.");
            }

            const confirmed = confirm(
                "Importing this backup will replace your current " +
                "routines, history, and goals. Export a backup of " +
                "your current data first if you want to keep it. Continue?"
            );

            if (!confirmed) return;

            const previous = {};

            for (const key of KEYS) {
                previous[key] = localStorage.getItem(key);
            }

            try {
                for (const key of KEYS) {
                    if (
                        data[key] === null ||
                        data[key] === undefined
                    ) {
                        localStorage.removeItem(key);
                    } else {
                        localStorage.setItem(
                            key,
                            JSON.stringify(data[key])
                        );
                    }
                }
            } catch (error) {
                for (const key of KEYS) {
                    if (previous[key] === null) {
                        localStorage.removeItem(key);
                    } else {
                        localStorage.setItem(key, previous[key]);
                    }
                }

                throw error;
            }

            // Sync the imported backup to this logged-in user's cloud data.
            window.dispatchEvent(new Event("dailytrack-save"));

            if (window.dailyTrackSyncNow) {
                await window.dailyTrackSyncNow();
            }

            showMessage("Backup restored. Reloading DailyTrack...");

            setTimeout(() => location.reload(), 700);
        } catch (error) {
            console.error("Backup import failed:", error);

            showMessage(
                error.message || "Could not import this backup."
            );
        } finally {
            fileInput.value = "";
        }
    });
})();
