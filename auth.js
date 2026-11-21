
document.addEventListener("DOMContentLoaded", () => {
    const SUPABASE_URL =
        "https://hwzpvaaziyumsvmhqnbv.supabase.co";

    const SUPABASE_PUBLISHABLE_KEY =
        "sb_publishable_m6xSstZ1ViYvbPAVXZISSw_16Frtdzt";

    const KEYS = {
        routines: "dailyTrackRoutines",
        history: "dailyTrackHistory",
        goals: "dailyTrackGoals",
        owner: "dailyTrackOwnerId"
    };

    const authScreen = document.getElementById("authScreen");
    const authForm = document.getElementById("authForm");
    const emailInput = document.getElementById("authEmail");
    const passwordInput = document.getElementById("authPassword");
    const submitButton = document.getElementById("authSubmit");
    const message = document.getElementById("authMessage");
    const loginTab = document.getElementById("loginTab");
    const signupTab = document.getElementById("signupTab");
    const forgotButton = document.getElementById("forgotPassword");

    let resolveReady;

    window.dailyTrackReady = new Promise(resolve => {
        resolveReady = resolve;
    });

    function ready() {
        if (resolveReady) {
            resolveReady();
            resolveReady = null;
        }
    }

    document.body.classList.add("auth-required");

    if (
        !window.supabase ||
        !authScreen ||
        !authForm ||
        !emailInput ||
        !passwordInput ||
        !submitButton ||
        !loginTab ||
        !signupTab ||
        !forgotButton
    ) {
        if (message) {
            message.textContent =
                "Authentication could not load. Check your connection and page setup.";
        }

        ready();
        return;
    }

    const client = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );

    window.dailyTrackSupabase = client;

    let mode = "login";
    let busy = false;
    let activeUserId = null;
    let preparingUserId = null;
    let syncTimer = null;
    let syncQueue = Promise.resolve();
    let trialCountdownTimer = null;

    function showMessage(text) {
        if (message) {
            message.textContent = text;
        }
    }

    // --------------------------------------------------
    // ACCESS STATUS AND FREE TRIAL
    // --------------------------------------------------

    function renderAccessStatus(access) {
        if (!document.getElementById("dailyTrackAccessStyles")) {
            const style = document.createElement("style");

            style.id = "dailyTrackAccessStyles";

            style.textContent = `
                .dt-access-banner {
                    padding: 14px 18px;
                    margin-bottom: 22px;
                    border-radius: 12px;
                    background: #eff6ff;
                    color: #1e40af;
                    font-size: 14px;
                    font-weight: 600;
                }

                .dt-access-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 9999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                    background: rgba(15, 23, 42, 0.92);
                }

                .dt-access-card {
                    width: 100%;
                    max-width: 460px;
                    padding: 32px 24px;
                    border-radius: 18px;
                    background: #fff;
                    color: #111827;
                    text-align: center;
                }

                .dt-access-card h2 {
                    margin-bottom: 14px;
                }

                .dt-access-card p {
                    margin-bottom: 18px;
                    line-height: 1.6;
                    color: #4b5563;
                }

                .dt-access-card button {
                    padding: 12px 18px;
                    margin: 5px;
                    border: 0;
                    border-radius: 9px;
                    background: #2563eb;
                    color: #fff;
                    cursor: pointer;
                }

                .dt-access-card button.secondary {
                    background: #e5e7eb;
                    color: #111827;
                }

                .dt-access-card button:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
            `;

            document.head.appendChild(style);
        }

        if (trialCountdownTimer) {
            clearInterval(trialCountdownTimer);
            trialCountdownTimer = null;
        }

        const main = document.querySelector(".main");

        if (!main) {
            throw new Error("DailyTrack dashboard was not found.");
        }

        let banner = document.getElementById(
            "dailyTrackAccessBanner"
        );

        if (!banner) {
            banner = document.createElement("div");
            banner.id = "dailyTrackAccessBanner";
            banner.className = "dt-access-banner";

            main.prepend(banner);
        }

        const oldOverlay = document.getElementById(
            "dailyTrackExpiredOverlay"
        );

        if (oldOverlay) {
            oldOverlay.remove();
        }

        const app = document.querySelector(".app");

        if (access.lifetime_access) {
            if (app) {
                app.inert = false;
            }

            banner.textContent =
                "✓ DailyTrack Lifetime Access";

            return;
        }

        const endTime = new Date(
            access.trial_ends_at
        ).getTime();

        if (!Number.isFinite(endTime)) {
            throw new Error("Your trial end date is invalid.");
        }

        function showExpiredScreen() {
            if (
                document.getElementById(
                    "dailyTrackExpiredOverlay"
                )
            ) {
                return;
            }

            if (app) {
                app.inert = true;
            }

            const overlay = document.createElement("div");

            overlay.id = "dailyTrackExpiredOverlay";
            overlay.className = "dt-access-overlay";

            overlay.innerHTML = `
                <div class="dt-access-card">
                    <h2>Your free trial has ended</h2>

                    <p>
                        Keep using DailyTrack with a one-time
                        payment of <strong>KSh 699</strong>
                        for lifetime access.
                        No recurring subscription.
                    </p>

                    <p>
                        Your saved routines, history, and goals
                        remain in your account.
                    </p>

                    <button
                        type="button"
                        id="dtUpgradeButton"
                        disabled
                    >
                        Payment setup coming next
                    </button>

                    <br>

                    <button
                        type="button"
                        class="secondary"
                        id="dtExpiredLogout"
                    >
                        Log Out
                    </button>
                </div>
            `;

            document.body.appendChild(overlay);

            document
                .getElementById("dtExpiredLogout")
                .addEventListener("click", async event => {
                    const button = event.currentTarget;

                    button.disabled = true;

                    try {
                        await syncNow();

                        const { error } =
                            await client.auth.signOut();

                        if (error) {
                            throw error;
                        }
                    } catch (error) {
                        console.error("Logout failed:", error);

                        button.disabled = false;

                        alert(
                            "Could not log out. Please try again."
                        );
                    }
                });
        }

        function updateCountdown() {
            const remaining = endTime - Date.now();

            if (remaining <= 0) {
                banner.textContent =
                    "Your 7-day free trial has expired.";

                if (trialCountdownTimer) {
                    clearInterval(trialCountdownTimer);
                    trialCountdownTimer = null;
                }

                showExpiredScreen();

                return;
            }

            const days = Math.floor(
                remaining / 86400000
            );

            const hours = Math.floor(
                (remaining % 86400000) / 3600000
            );

            const minutes = Math.floor(
                (remaining % 3600000) / 60000
            );

            banner.textContent =
                `🎉 Free trial: ${days} days, ` +
                `${hours} hours, ${minutes} minutes remaining.`;
        }

        if (app && endTime > Date.now()) {
            app.inert = false;
        }

        updateCountdown();

        if (endTime > Date.now()) {
            trialCountdownTimer = setInterval(
                updateCountdown,
                60000
            );
        }
    }

    // --------------------------------------------------
    // LOGIN AND SIGNUP INTERFACE
    // --------------------------------------------------

    function setMode(nextMode) {
        mode = nextMode;

        const signingUp = mode === "signup";

        loginTab.classList.toggle(
            "active",
            !signingUp
        );

        signupTab.classList.toggle(
            "active",
            signingUp
        );

        submitButton.textContent = signingUp
            ? "Create Account"
            : "Log In";

        passwordInput.autocomplete = signingUp
            ? "new-password"
            : "current-password";

        showMessage("");
    }

    function setBusy(value) {
        busy = value;

        submitButton.disabled = value;
        loginTab.disabled = value;
        signupTab.disabled = value;
        forgotButton.disabled = value;

        submitButton.textContent = value
            ? "Please wait..."
            : mode === "signup"
                ? "Create Account"
                : "Log In";
    }

    // --------------------------------------------------
    // LOCAL DATA MANAGEMENT
    // --------------------------------------------------

    function readLocalData() {
        function read(key, fallback) {
            try {
                const value = JSON.parse(
                    localStorage.getItem(key) || "null"
                );

                return value ?? fallback;
            } catch {
                return fallback;
            }
        }

        const routines = read(KEYS.routines, []);
        const history = read(KEYS.history, {});
        const goals = read(KEYS.goals, []);

        return {
            routines: Array.isArray(routines)
                ? routines
                : [],

            history:
                history &&
                typeof history === "object" &&
                !Array.isArray(history)
                    ? history
                    : {},

            goals: Array.isArray(goals)
                ? goals
                : []
        };
    }

    function writeLocalData(data) {
        localStorage.setItem(
            KEYS.routines,
            JSON.stringify(data.routines)
        );

        localStorage.setItem(
            KEYS.history,
            JSON.stringify(data.history)
        );

        localStorage.setItem(
            KEYS.goals,
            JSON.stringify(data.goals)
        );
    }

    function clearLocalData() {
        localStorage.removeItem(KEYS.routines);
        localStorage.removeItem(KEYS.history);
        localStorage.removeItem(KEYS.goals);
        localStorage.removeItem(KEYS.owner);
    }

    // --------------------------------------------------
    // SUPABASE CLOUD STORAGE
    // --------------------------------------------------

    async function uploadData(userId, data) {
        const { error } = await client
            .from("dailytrack_data")
            .upsert({
                user_id: userId,
                routines: data.routines,
                history: data.history,
                goals: data.goals,
                updated_at: new Date().toISOString()
            }, {
                onConflict: "user_id"
            });

        if (error) {
            throw error;
        }
    }

    async function syncNow() {
        const userId = activeUserId;

        if (!userId) {
            return;
        }

        const snapshot = readLocalData();

        syncQueue = syncQueue.then(async () => {
            // Never upload one account's data into another account.
            if (activeUserId !== userId) {
                return;
            }

            await uploadData(userId, snapshot);
        });

        return syncQueue;
    }

    // --------------------------------------------------
    // LOAD THE LOGGED-IN USER'S DATA
    // --------------------------------------------------

    async function prepareUser(session) {
        if (!session) {
            return;
        }

        const userId = session.user.id;

        if (activeUserId === userId) {
            return;
        }

        if (preparingUserId === userId) {
            return;
        }

        preparingUserId = userId;

        try {
            // Get this account's access status.
            const { data: accessData, error: accessError } =
                await client
                    .from("dailytrack_access")
                    .select("trial_ends_at, lifetime_access")
                    .eq("user_id", userId)
                    .maybeSingle();

            if (accessError) {
                throw accessError;
            }

            if (!accessData) {
                throw new Error(
                    "Your trial record was not found in Supabase."
                );
            }

            renderAccessStatus(accessData);

            // Retrieve this user's cloud data.
            const { data: cloudData, error } = await client
                .from("dailytrack_data")
                .select("user_id, routines, history, goals")
                .eq("user_id", userId)
                .maybeSingle();

            if (error) {
                throw error;
            }

            if (cloudData) {
                // Existing cloud data always takes priority.
                const userData = {
                    routines: Array.isArray(cloudData.routines)
                        ? cloudData.routines
                        : [],

                    history:
                        cloudData.history &&
                        typeof cloudData.history === "object" &&
                        !Array.isArray(cloudData.history)
                            ? cloudData.history
                            : {},

                    goals: Array.isArray(cloudData.goals)
                        ? cloudData.goals
                        : []
                };

                writeLocalData(userData);

                localStorage.setItem(
                    KEYS.owner,
                    userId
                );

            } else {
                // No cloud record exists for this account.
                const previousOwner = localStorage.getItem(
                    KEYS.owner
                );

                let initialData;

                if (previousOwner === userId) {
                    // This browser data belongs to this same user.
                    initialData = readLocalData();
                } else {
                    // New or unrecognized account:
                    // Start with completely empty personal data.
                    initialData = {
                        routines: [],
                        history: {},
                        goals: []
                    };
                }

                writeLocalData(initialData);

                localStorage.setItem(
                    KEYS.owner,
                    userId
                );

                // Create this user's first cloud record.
                await uploadData(userId, initialData);
            }

            // Only activate the user after data has loaded.
            activeUserId = userId;
            window.dailyTrackUserId = userId;

            authScreen.setAttribute("hidden", "");

            document.body.classList.remove(
                "auth-required"
            );

            ready();

            // Notify the app that the account's data is ready.
            window.dispatchEvent(
                new CustomEvent("dailytrack-user-ready")
            );

        } catch (error) {
            console.error(
                "DailyTrack cloud loading failed:",
                error
            );

            showMessage(
                "Could not load cloud data. Check your connection and refresh the page."
            );

            preparingUserId = null;
        }
    }

    // --------------------------------------------------
    // AUTHENTICATION EVENTS
    // --------------------------------------------------

    loginTab.addEventListener("click", () => {
        setMode("login");
    });

    signupTab.addEventListener("click", () => {
        setMode("signup");
    });

    authForm.addEventListener("submit", async event => {
        event.preventDefault();

        if (busy) {
            return;
        }

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email) {
            showMessage("Enter your email address.");
            return;
        }

        if (password.length < 8) {
            showMessage(
                "Your password must be at least 8 characters."
            );
            return;
        }

        setBusy(true);
        showMessage("");

        try {
            if (mode === "signup") {
                const { data, error } =
                    await client.auth.signUp({
                        email,
                        password
                    });

                if (error) {
                    throw error;
                }

                if (data.session) {
                    showMessage(
                        "Account created successfully."
                    );
                } else {
                    showMessage(
                        "Account created. Check your email to confirm your account, then log in."
                    );
                }

            } else {
                const { error } =
                    await client.auth.signInWithPassword({
                        email,
                        password
                    });

                if (error) {
                    throw error;
                }
            }

        } catch (error) {
            showMessage(
                error.message || "Authentication failed."
            );

        } finally {
            setBusy(false);
        }
    });

    // --------------------------------------------------
    // FORGOT PASSWORD
    // --------------------------------------------------

    forgotButton.addEventListener("click", async () => {
        const email = emailInput.value.trim();

        if (!email) {
            showMessage(
                "Enter your email address first."
            );

            emailInput.focus();

            return;
        }

        try {
            const { error } =
                await client.auth.resetPasswordForEmail(
                    email,
                    {
                        redirectTo: window.location.origin
                    }
                );

            if (error) {
                throw error;
            }

            showMessage(
                "If the account exists, a password reset email will be sent."
            );

        } catch (error) {
            showMessage(
                error.message ||
                "Could not request a reset email."
            );
        }
    });

    // --------------------------------------------------
    // AUTOMATIC CLOUD SYNC
    // --------------------------------------------------

    window.addEventListener("dailytrack-save", () => {
        clearTimeout(syncTimer);

        syncTimer = setTimeout(async () => {
            try {
                await syncNow();

                console.log(
                    "DailyTrack cloud sync successful."
                );

            } catch (error) {
                console.error(
                    "Cloud sync failed:",
                    error
                );

                showMessage(
                    "Saved on this device, but cloud sync failed. Check your connection."
                );
            }
        }, 500);
    });

    // --------------------------------------------------
    // LOGOUT BUTTON
    // --------------------------------------------------

    const logoutButton = document.createElement("button");

    logoutButton.type = "button";
    logoutButton.id = "logoutButton";
    logoutButton.textContent = "Log Out";

    logoutButton.style.cssText =
        "position:fixed;right:16px;bottom:16px;z-index:1000;" +
        "padding:10px 14px;border:0;border-radius:8px;" +
        "background:#2563eb;color:#fff;cursor:pointer;";

    logoutButton.addEventListener("click", async () => {
        logoutButton.disabled = true;

        clearTimeout(syncTimer);

        try {
            await syncNow();

            const { error } = await client.auth.signOut();

            if (error) {
                throw error;
            }

        } catch (error) {
            console.error("Logout failed:", error);

            showMessage(
                "Could not sync or log out safely. Please try again."
            );

            logoutButton.disabled = false;
        }
    });

    document.body.appendChild(logoutButton);

    // --------------------------------------------------
    // AUTH STATE CHANGES
    // --------------------------------------------------

    client.auth.onAuthStateChange((event, session) => {
        setTimeout(() => {
            if (session) {
                prepareUser(session);
                return;
            }

            const hadUser = activeUserId !== null;

            activeUserId = null;
            preparingUserId = null;

            window.dailyTrackUserId = null;

            document.body.classList.add(
                "auth-required"
            );

            authScreen.removeAttribute("hidden");

            if (trialCountdownTimer) {
                clearInterval(trialCountdownTimer);
                trialCountdownTimer = null;
            }

            if (hadUser) {
                clearLocalData();

                window.location.reload();
            }

        }, 0);
    });

    // --------------------------------------------------
    // CHECK EXISTING LOGIN SESSION
    // --------------------------------------------------

    client.auth.getSession().then(({ data, error }) => {
        if (error) {
            console.error(
                "Session check failed:",
                error
            );

            showMessage(
                "Could not check your login. Refresh and try again."
            );

            return;
        }

        if (data.session) {
            prepareUser(data.session);
        }

    }).catch(error => {
        console.error(
            "Could not retrieve Supabase session:",
            error
        );

        showMessage(
            "Could not check your login. Refresh and try again."
        );
    });
});
