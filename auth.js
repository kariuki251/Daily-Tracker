
document.addEventListener("DOMContentLoaded", () => {
    const SUPABASE_URL =
        "https://hwzpvaaziyumsvmhqnbv.supabase.co";

    const SUPABASE_PUBLISHABLE_KEY =
        "sb_publishable_m6xSstZ1ViYvbPAVXZISSw_16Frtdzt";

    const KEYS = {
        routines: "dailyTrackRoutines",
        history: "dailyTrackHistory",
        goals: "dailyTrackGoals"
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

    if (!window.supabase || !authScreen || !authForm) {
        document.body.classList.add("auth-required");

        if (message) {
            message.textContent =
                "Authentication could not load. Check your connection.";
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

    document.body.classList.add("auth-required");

    function showMessage(text) {
        if (message) message.textContent = text;
    }

    function setMode(nextMode) {
        mode = nextMode;

        const signingUp = mode === "signup";

        loginTab.classList.toggle("active", !signingUp);
        signupTab.classList.toggle("active", signingUp);

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
            routines: Array.isArray(routines) ? routines : [],
            history:
                history &&
                typeof history === "object" &&
                !Array.isArray(history)
                    ? history
                    : {},
            goals: Array.isArray(goals) ? goals : []
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

    function hasLocalData(data) {
        return (
            data.routines.length > 0 ||
            Object.keys(data.history).length > 0 ||
            data.goals.length > 0
        );
    }

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

        if (error) throw error;
    }

    async function syncNow() {
        const userId = activeUserId;

        if (!userId) return;

        const snapshot = readLocalData();

        syncQueue = syncQueue.then(async () => {
            if (activeUserId !== userId) return;

            await uploadData(userId, snapshot);
        });

        return syncQueue;
    }

    async function prepareUser(session) {
        if (!session) return;

        const userId = session.user.id;

        if (activeUserId === userId) return;

        if (preparingUserId === userId) return;

        preparingUserId = userId;

        try {
            const { data: cloudData, error } = await client
                .from("dailytrack_data")
                .select("user_id, routines, history, goals")
                .eq("user_id", userId)
                .maybeSingle();

            if (error) throw error;

            if (cloudData) {
                // An existing cloud record takes priority.
                writeLocalData({
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
                });
            } else {
                // First login: preserve existing local test data.
                const localData = readLocalData();

                await uploadData(userId, localData);
            }

            activeUserId = userId;
            window.dailyTrackUserId = userId;

            authScreen.setAttribute("hidden", "");
            document.body.classList.remove("auth-required");

            ready();
        } catch (error) {
            console.error("DailyTrack cloud loading failed:", error);

            showMessage(
                "Could not load cloud data. Check your connection and refresh the page."
            );

            preparingUserId = null;
        }
    }

    loginTab.addEventListener("click", () => setMode("login"));
    signupTab.addEventListener("click", () => setMode("signup"));

    authForm.addEventListener("submit", async event => {
        event.preventDefault();

        if (busy) return;

        const email = emailInput.value.trim();
        const password = passwordInput.value;

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
                const { data, error } = await client.auth.signUp({
                    email,
                    password
                });

                if (error) throw error;

                if (data.session) {
                    showMessage("Account created successfully.");
                } else {
                    showMessage(
                        "Account created. Check your email to confirm your account, then log in."
                    );
                }
            } else {
                const { error } = await client.auth.signInWithPassword({
                    email,
                    password
                });

                if (error) throw error;
            }
        } catch (error) {
            showMessage(error.message || "Authentication failed.");
        } finally {
            setBusy(false);
        }
    });

    forgotButton.addEventListener("click", async () => {
        const email = emailInput.value.trim();

        if (!email) {
            showMessage("Enter your email address first.");
            emailInput.focus();
            return;
        }

        try {
            const { error } = await client.auth.resetPasswordForEmail(
                email,
                { redirectTo: window.location.origin }
            );

            if (error) throw error;

            showMessage(
                "If the account exists, a password reset email will be sent."
            );
        } catch (error) {
            showMessage(
                error.message || "Could not request a reset email."
            );
        }
    });

    // Sync local changes to Supabase.
    window.addEventListener("dailytrack-save", () => {
        clearTimeout(syncTimer);

        syncTimer = setTimeout(async () => {
            try {
                await syncNow();
                console.log("DailyTrack cloud sync successful.");
            } catch (error) {
                console.error("Cloud sync failed:", error);

                showMessage(
                    "Saved on this device, but cloud sync failed. Check your connection."
                );
            }
        }, 500);
    });

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

            if (error) throw error;

        // The auth-state listener handles cleanup and reload.
        } catch (error) {
            console.error("Logout failed:", error);

            showMessage(
                "Could not sync or log out safely. Please try again."
            );

            logoutButton.disabled = false;
        }
    });

    document.body.appendChild(logoutButton);

    client.auth.onAuthStateChange((event, session) => {
        setTimeout(() => {
            if (session) {
                prepareUser(session);
                return;
            }

            const hadUser = activeUserId !== null;

            activeUserId = null;
            window.dailyTrackUserId = null;

            document.body.classList.add("auth-required");
            authScreen.removeAttribute("hidden");

            if (hadUser) {
                Object.values(KEYS).forEach(key => {
                    localStorage.removeItem(key);
                });

                window.location.reload();
            }
        }, 0);
    });

    client.auth.getSession().then(({ data, error }) => {
        if (error) {
            console.error("Session check failed:", error);
            showMessage("Could not check your login. Refresh and try again.");
            return;
        }

        if (data.session) {
            prepareUser(data.session);
        }
    });
});
