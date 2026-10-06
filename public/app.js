const loginScreen = document.getElementById("login-screen");
const todoScreen = document.getElementById("todo-screen");

const loginForm = document.getElementById("login-form");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const loginError = document.getElementById("login-error");

const currentUser = document.getElementById("current-user");
const logoutButton = document.getElementById("logout-button");

const taskForm = document.getElementById("task-form");
const taskInput = document.getElementById("task-input");
const taskList = document.getElementById("task-list");
const taskError = document.getElementById("task-error");


// -------------------------
// LOGIN
// -------------------------

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    loginError.textContent = "";

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    try {
        const response = await fetch("/api/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                username,
                password
            })
        });

        const data = await response.json();

        if (!response.ok) {
            loginError.textContent = data.error;
            return;
        }

        passwordInput.value = "";

        // Clear old user's tasks before showing the new user
        taskList.innerHTML = "";
        currentUser.textContent = "";

        showTodoScreen(data.username);
        await loadTasks();

    } catch (error) {
        loginError.textContent = "Could not connect to server.";
    }
});


// -------------------------
// CHECK IF ALREADY LOGGED IN
// -------------------------

async function checkLogin() {
    try {
        const response = await fetch("/api/me");

        if (!response.ok) {
            showLoginScreen();
            return;
        }

        const user = await response.json();

        // Clear old data before showing current user
        taskList.innerHTML = "";
        currentUser.textContent = "";

        showTodoScreen(user.username);
        await loadTasks();

    } catch (error) {
        showLoginScreen();
    }
}


// -------------------------
// LOGOUT
// -------------------------

logoutButton.addEventListener("click", async () => {
    await fetch("/api/logout", {
        method: "POST"
    });

    usernameInput.value = "";
    passwordInput.value = "";

    // Clear the previous user's data
    taskList.innerHTML = "";
    currentUser.textContent = "";
    taskInput.value = "";
    taskError.textContent = "";

    showLoginScreen();
});


// -------------------------
// LOAD TASKS
// -------------------------

async function loadTasks() {
    taskError.textContent = "";

    const response = await fetch("/api/tasks");

    if (response.status === 401) {
        showLoginScreen();
        return;
    }

    const tasks = await response.json();

    taskList.innerHTML = "";

    tasks.forEach((task) => {
        renderTask(task);
    });
}


// -------------------------
// ADD TASK
// -------------------------

taskForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    taskError.textContent = "";

    const title = taskInput.value.trim();

    const response = await fetch("/api/tasks", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            title
        })
    });

    const data = await response.json();

    if (!response.ok) {
        taskError.textContent = data.error;
        return;
    }

    taskInput.value = "";

    await loadTasks();
});


// -------------------------
// DRAW ONE TASK
// -------------------------

function renderTask(task) {
    const li = document.createElement("li");

    li.className = "task";

    if (task.completed) {
        li.classList.add("completed");
    }

    const title = document.createElement("span");

    title.className = "task-title";
    title.textContent = task.title;


    // COMPLETE BUTTON

    const completeButton = document.createElement("button");

    completeButton.className = "complete-button";

    completeButton.textContent =
        task.completed ? "Undo" : "Done";

    completeButton.addEventListener("click", async () => {

        await fetch(`/api/tasks/${task.id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                completed: !task.completed
            })
        });

        await loadTasks();
    });


    // DELETE BUTTON

    const deleteButton = document.createElement("button");

    deleteButton.className = "delete-button";
    deleteButton.textContent = "Delete";

    deleteButton.addEventListener("click", async () => {

        await fetch(`/api/tasks/${task.id}`, {
            method: "DELETE"
        });

        await loadTasks();
    });


    li.appendChild(title);
    li.appendChild(completeButton);
    li.appendChild(deleteButton);

    taskList.appendChild(li);
}


// -------------------------
// SCREEN HELPERS
// -------------------------

function showTodoScreen(username) {
    loginScreen.classList.add("hidden");
    todoScreen.classList.remove("hidden");

    currentUser.textContent = username;
}


function showLoginScreen() {
    todoScreen.classList.add("hidden");
    loginScreen.classList.remove("hidden");
}


// Run when the page first opens
checkLogin();