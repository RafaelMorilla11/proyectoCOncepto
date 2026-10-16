const USERS_KEY = "proyecto-concepto-users";
const OPINIONS_KEY = "proyecto-concepto-opinions";
const SESSION_KEY = "proyecto-concepto-session";
const PASSWORD_ITERATIONS = 310000;

function readList(key) {
    try {
        const value = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(value) ? value : [];
    } catch {
        return [];
    }
}

function saveList(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function createId() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function currentUser() {
    const userId = sessionStorage.getItem(SESSION_KEY);
    return readList(USERS_KEY).find((user) => user.id === userId) || null;
}

function setNotice(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle("is-error", isError);
    element.hidden = !message;
}

function bytesToBase64(bytes) {
    return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: PASSWORD_ITERATIONS, hash: "SHA-256" }, key, 256);
    return { salt: bytesToBase64(salt), hash: bytesToBase64(hash), iterations: PASSWORD_ITERATIONS };
}

async function verifyPassword(password, stored) {
    const salt = Uint8Array.from(atob(stored.salt), (character) => character.charCodeAt(0));
    const result = await hashPassword(password, salt);
    return result.hash === stored.hash;
}

function readImage(file) {
    if (!file) return Promise.resolve("");
    if (!file.type.startsWith("image/")) return Promise.reject(new Error("El archivo debe ser una imagen."));
    if (file.size > 2 * 1024 * 1024) return Promise.reject(new Error("La imagen debe pesar menos de 2 MB."));
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener("load", () => resolve(String(reader.result)));
        reader.addEventListener("error", () => reject(new Error("No se pudo leer la imagen.")));
        reader.readAsDataURL(file);
    });
}

function formatDate(value) {
    return new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function initProfile() {
    const notice = document.querySelector("#profile-notice");
    const authPanel = document.querySelector("#auth-panel");
    const profileView = document.querySelector("#profile-view");
    const registerForm = document.querySelector("#register-form");
    const loginForm = document.querySelector("#login-form");
    const editForm = document.querySelector("#edit-profile-form");
    const passwordForm = document.querySelector("#change-password-form");
    let selectedAvatar = "";

    function switchAuthMode(mode) {
        registerForm.hidden = mode !== "register";
        loginForm.hidden = mode !== "login";
        document.querySelectorAll("[data-auth-mode]").forEach((button) => {
            const active = button.dataset.authMode === mode;
            button.setAttribute("aria-pressed", String(active));
        });
        setNotice(notice, "");
    }

    function render() {
        const user = currentUser();
        authPanel.hidden = Boolean(user);
        profileView.hidden = !user;
        if (!user) return;

        document.querySelector("#profile-name").textContent = user.name;
        document.querySelector("#profile-nickname").textContent = `@${user.nickname}`;
        document.querySelector("#profile-email").textContent = user.email;
        document.querySelector("#profile-contributions").textContent = user.contributions || "Todavía no agregó aportes.";
        const avatar = document.querySelector("#profile-avatar");
        const initials = document.querySelector("#profile-initials");
        avatar.hidden = !user.avatar;
        initials.hidden = Boolean(user.avatar);
        avatar.src = user.avatar || "";
        initials.textContent = user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
        editForm.elements.name.value = user.name;
        editForm.elements.nickname.value = user.nickname;
        editForm.elements.email.value = user.email;
        editForm.elements.contributions.value = user.contributions || "";
    }

    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
        button.addEventListener("click", () => switchAuthMode(button.dataset.authMode));
    });

    document.querySelectorAll("[data-toggle-password]").forEach((button) => {
        button.addEventListener("click", () => {
            const input = document.getElementById(button.dataset.togglePassword);
            input.type = input.type === "password" ? "text" : "password";
            button.textContent = input.type === "password" ? "Mostrar" : "Ocultar";
            button.setAttribute("aria-pressed", String(input.type === "text"));
        });
    });

    document.querySelector("#register-avatar").addEventListener("change", async (event) => {
        try {
            selectedAvatar = await readImage(event.target.files[0]);
            setNotice(notice, "Foto lista para guardar.");
        } catch (error) {
            selectedAvatar = "";
            setNotice(notice, error.message, true);
        }
    });

    registerForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const email = String(data.get("email")).trim().toLowerCase();
        const users = readList(USERS_KEY);
        if (users.some((user) => user.email === email)) {
            setNotice(notice, "Ya existe una cuenta con ese correo.", true);
            return;
        }
        if (String(data.get("password")).length < 8) {
            setNotice(notice, "La contraseña debe tener al menos 8 caracteres.", true);
            return;
        }
        try {
            const password = await hashPassword(String(data.get("password")));
            const user = {
                id: createId(),
                name: String(data.get("name")).trim(),
                nickname: String(data.get("nickname")).trim(),
                email,
                contributions: String(data.get("contributions")).trim(),
                avatar: selectedAvatar,
                password
            };
            users.push(user);
            saveList(USERS_KEY, users);
            sessionStorage.setItem(SESSION_KEY, user.id);
            form.reset();
            selectedAvatar = "";
            setNotice(notice, "Perfil creado.");
            render();
        } catch {
            setNotice(notice, "No se pudo crear el perfil en este navegador.", true);
        }
    });

    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const email = String(data.get("email")).trim().toLowerCase();
        const user = readList(USERS_KEY).find((entry) => entry.email === email);
        if (!user || !(await verifyPassword(String(data.get("password")), user.password))) {
            setNotice(notice, "Correo o contraseña incorrectos.", true);
            return;
        }
        sessionStorage.setItem(SESSION_KEY, user.id);
        form.reset();
        render();
        setNotice(notice, `Sesión iniciada como @${user.nickname}.`);
    });

    document.querySelector("#edit-profile-button").addEventListener("click", () => {
        editForm.hidden = !editForm.hidden;
    });

    document.querySelector("#change-password-button").addEventListener("click", () => {
        passwordForm.hidden = !passwordForm.hidden;
    });

    document.querySelector("#edit-avatar").addEventListener("change", async (event) => {
        try {
            selectedAvatar = await readImage(event.target.files[0]);
            setNotice(notice, "Foto lista para guardar.");
        } catch (error) {
            selectedAvatar = "";
            setNotice(notice, error.message, true);
        }
    });

    editForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const users = readList(USERS_KEY);
        const user = users.find((entry) => entry.id === sessionStorage.getItem(SESSION_KEY));
        if (!user) return;
        const data = new FormData(editForm);
        const email = String(data.get("email")).trim().toLowerCase();
        if (users.some((entry) => entry.id !== user.id && entry.email === email)) {
            setNotice(notice, "Ese correo ya está asociado a otro perfil.", true);
            return;
        }
        try {
            user.name = String(data.get("name")).trim();
            user.nickname = String(data.get("nickname")).trim();
            user.email = email;
            user.contributions = String(data.get("contributions")).trim();
            if (selectedAvatar) user.avatar = selectedAvatar;
            saveList(USERS_KEY, users);
            selectedAvatar = "";
            editForm.reset();
            editForm.hidden = true;
            render();
            setNotice(notice, "Perfil actualizado.");
        } catch {
            setNotice(notice, "No se pudieron guardar los cambios.", true);
        }
    });

    passwordForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const user = currentUser();
        const data = new FormData(passwordForm);
        if (!user || !(await verifyPassword(String(data.get("currentPassword")), user.password))) {
            setNotice(notice, "La contraseña actual no es correcta.", true);
            return;
        }
        const newPassword = String(data.get("newPassword"));
        if (newPassword.length < 8) {
            setNotice(notice, "La nueva contraseña debe tener al menos 8 caracteres.", true);
            return;
        }
        if (newPassword !== String(data.get("confirmPassword"))) {
            setNotice(notice, "Las nuevas contraseñas no coinciden.", true);
            return;
        }
        user.password = await hashPassword(newPassword);
        const users = readList(USERS_KEY);
        saveList(USERS_KEY, users.map((entry) => entry.id === user.id ? user : entry));
        passwordForm.reset();
        passwordForm.hidden = true;
        setNotice(notice, "Contraseña actualizada.");
    });

    document.querySelector("#logout-button").addEventListener("click", () => {
        sessionStorage.removeItem(SESSION_KEY);
        editForm.hidden = true;
        passwordForm.hidden = true;
        render();
        setNotice(notice, "Se cerró la sesión.");
    });

    window.addEventListener("storage", render);
    switchAuthMode("register");
    render();
}

function initOpinions() {
    const notice = document.querySelector("#opinions-notice");
    const form = document.querySelector("#opinion-form");
    const list = document.querySelector("#opinion-list");
    const search = document.querySelector("#opinion-search");
    const typeFilter = document.querySelector("#type-filter");
    const loginPrompt = document.querySelector("#opinions-login-prompt");
    const count = document.querySelector("#opinions-count");

    function makeElement(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function render() {
        const user = currentUser();
        loginPrompt.hidden = Boolean(user);
        form.hidden = !user;
        const query = search.value.trim().toLocaleLowerCase("es");
        const selectedType = typeFilter.value;
        const opinions = readList(OPINIONS_KEY).sort((first, second) => new Date(second.date) - new Date(first.date));
        const filtered = opinions.filter((opinion) => {
            const matchesType = selectedType === "all" || opinion.type === selectedType;
            const searchable = `${opinion.title} ${opinion.medium} ${opinion.text} ${opinion.author}`.toLocaleLowerCase("es");
            return matchesType && searchable.includes(query);
        });
        count.textContent = `${filtered.length} ${filtered.length === 1 ? "publicación" : "publicaciones"}`;
        list.replaceChildren();

        if (!filtered.length) {
            list.append(makeElement("p", "empty-state", opinions.length ? "No hay publicaciones que coincidan con la búsqueda." : "Todavía no hay publicaciones. Sé el primero en compartir una."));
            return;
        }

        filtered.forEach((opinion) => {
            const article = makeElement("article", "opinion-entry");
            const top = makeElement("div", "opinion-entry-top");
            const target = makeElement("div", "opinion-target");
            target.append(makeElement("span", "opinion-kind", opinion.type === "suggestion" ? "Sugerencia" : "Opinión"));
            target.append(makeElement("h2", "", opinion.title));
            target.append(makeElement("p", "opinion-medium", opinion.medium));
            top.append(target, makeElement("time", "opinion-date", formatDate(opinion.date)));
            article.append(top, makeElement("p", "opinion-text", opinion.text));
            article.append(makeElement("p", "opinion-author", `Por @${opinion.author}`));

            const actions = makeElement("div", "opinion-actions");
            const likes = Array.isArray(opinion.likes) ? opinion.likes : [];
            const likeButton = makeElement("button", "button button-quiet", `${likes.length} · Me gusta`);
            likeButton.type = "button";
            likeButton.setAttribute("aria-pressed", String(Boolean(user && likes.includes(user.id))));
            likeButton.addEventListener("click", () => {
                if (!user) {
                    setNotice(notice, "Inicia sesión desde Perfil para indicar que te gusta.", true);
                    return;
                }
                updateOpinion(opinion.id, (entry) => {
                    entry.likes = Array.isArray(entry.likes) ? entry.likes : [];
                    entry.likes = entry.likes.includes(user.id) ? entry.likes.filter((id) => id !== user.id) : [...entry.likes, user.id];
                });
                render();
            });
            actions.append(likeButton);
            article.append(actions);

            const comments = makeElement("div", "comment-list");
            (Array.isArray(opinion.comments) ? opinion.comments : []).forEach((comment) => {
                const commentRow = makeElement("p", "comment-row");
                commentRow.append(makeElement("strong", "", `@${comment.author} `), document.createTextNode(comment.text));
                comments.append(commentRow);
            });
            article.append(comments);

            const commentForm = makeElement("form", "comment-form");
            const commentInput = makeElement("input", "text-input");
            commentInput.type = "text";
            commentInput.name = "comment";
            commentInput.placeholder = user ? "Escribe un comentario" : "Inicia sesión para comentar";
            commentInput.setAttribute("aria-label", "Escribe un comentario");
            commentInput.required = true;
            commentInput.maxLength = 500;
            commentInput.disabled = !user;
            const commentButton = makeElement("button", "button button-secondary", "Comentar");
            commentButton.type = "submit";
            commentButton.disabled = !user;
            commentForm.append(commentInput, commentButton);
            commentForm.addEventListener("submit", (event) => {
                event.preventDefault();
                const activeUser = currentUser();
                if (!activeUser) return;
                const comment = commentInput.value.trim();
                if (!comment) return;
                updateOpinion(opinion.id, (entry) => {
                    entry.comments = Array.isArray(entry.comments) ? entry.comments : [];
                    entry.comments.push({ id: createId(), author: activeUser.nickname, text: comment, date: new Date().toISOString() });
                });
                render();
            });
            article.append(commentForm);
            list.append(article);
        });
    }

    function updateOpinion(id, change) {
        const opinions = readList(OPINIONS_KEY);
        const opinion = opinions.find((entry) => entry.id === id);
        if (!opinion) return;
        change(opinion);
        saveList(OPINIONS_KEY, opinions);
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const user = currentUser();
        if (!user) {
            setNotice(notice, "Inicia sesión desde Perfil para publicar.", true);
            render();
            return;
        }
        const data = new FormData(form);
        const opinions = readList(OPINIONS_KEY);
        opinions.push({
            id: createId(),
            type: String(data.get("type")),
            title: String(data.get("title")).trim(),
            medium: String(data.get("medium")),
            text: String(data.get("text")).trim(),
            author: user.nickname,
            authorId: user.id,
            date: new Date().toISOString(),
            likes: [],
            comments: []
        });
        saveList(OPINIONS_KEY, opinions);
        form.reset();
        setNotice(notice, "Publicación agregada.");
        render();
    });

    search.addEventListener("input", render);
    typeFilter.addEventListener("change", render);
    window.addEventListener("storage", render);
    render();
}

if (!window.crypto?.subtle) {
    const notice = document.querySelector("[data-security-notice]");
    if (notice) setNotice(notice, "Este navegador no permite proteger contraseñas aquí. Abre el sitio desde localhost o HTTPS.", true);
} else if (document.body.dataset.page === "profile") {
    initProfile();
} else if (document.body.dataset.page === "opinions") {
    initOpinions();
}
