const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const path = require("path");
const db = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;

// Read JSON sent from the browser
app.use(express.json());

// Login session
app.use(
    session({
        secret: process.env.SESSION_SECRET || "development-secret-change-me",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            maxAge: 1000 * 60 * 60
        }
    })
);

// Serve our frontend
app.use(express.static(path.join(__dirname, "public")));

// Protect routes that require login
function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            error: "You must log in first"
        });
    }

    next();
}

// LOGIN
app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            error: "Username and password are required"
        });
    }

    const user = db
        .prepare("SELECT * FROM users WHERE username = ?")
        .get(username);

    if (!user) {
        return res.status(401).json({
            error: "Invalid username or password"
        });
    }

    const passwordMatches = await bcrypt.compare(
        password,
        user.password
    );

    if (!passwordMatches) {
        return res.status(401).json({
            error: "Invalid username or password"
        });
    }

    req.session.userId = user.id;
    req.session.username = user.username;

    res.json({
        message: "Login successful",
        username: user.username
    });
});

// CHECK CURRENT USER
app.get("/api/me", (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            error: "Not logged in"
        });
    }

    res.json({
        id: req.session.userId,
        username: req.session.username
    });
});

// LOGOUT
app.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
        res.json({
            message: "Logged out"
        });
    });
});

// GET ONLY THE LOGGED-IN USER'S TASKS
app.get("/api/tasks", requireLogin, (req, res) => {
    const tasks = db
        .prepare(
            `SELECT id, title, completed
             FROM tasks
             WHERE user_id = ?
             ORDER BY id DESC`
        )
        .all(req.session.userId);

    res.json(tasks);
});

// ADD TASK
app.post("/api/tasks", requireLogin, (req, res) => {
    const title = String(req.body.title || "").trim();

    if (!title) {
        return res.status(400).json({
            error: "Task cannot be empty"
        });
    }

    const result = db
        .prepare(
            `INSERT INTO tasks (user_id, title, completed)
             VALUES (?, ?, 0)`
        )
        .run(req.session.userId, title);

    const task = db
        .prepare(
            `SELECT id, title, completed
             FROM tasks
             WHERE id = ? AND user_id = ?`
        )
        .get(result.lastInsertRowid, req.session.userId);

    res.status(201).json(task);
});

// COMPLETE / UNCOMPLETE TASK
app.patch("/api/tasks/:id", requireLogin, (req, res) => {
    const taskId = Number(req.params.id);
    const completed = req.body.completed ? 1 : 0;

    const result = db
        .prepare(
            `UPDATE tasks
             SET completed = ?
             WHERE id = ? AND user_id = ?`
        )
        .run(completed, taskId, req.session.userId);

    if (result.changes === 0) {
        return res.status(404).json({
            error: "Task not found"
        });
    }

    const task = db
        .prepare(
            `SELECT id, title, completed
             FROM tasks
             WHERE id = ? AND user_id = ?`
        )
        .get(taskId, req.session.userId);

    res.json(task);
});

// DELETE TASK
app.delete("/api/tasks/:id", requireLogin, (req, res) => {
    const taskId = Number(req.params.id);

    const result = db
        .prepare(
            `DELETE FROM tasks
             WHERE id = ? AND user_id = ?`
        )
        .run(taskId, req.session.userId);

    if (result.changes === 0) {
        return res.status(404).json({
            error: "Task not found"
        });
    }

    res.json({
        message: "Task deleted"
    });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
}

module.exports = app;