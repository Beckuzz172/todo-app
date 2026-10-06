const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const path = require("path");
const { db, ready } = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use(
    session({
        secret: process.env.SESSION_SECRET || "development-secret-change-me",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 1000 * 60 * 60
        }
    })
);

app.use(express.static(path.join(__dirname, "public")));

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
    try {
        await ready;

        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                error: "Username and password are required"
            });
        }

        const result = await db.execute({
            sql: "SELECT * FROM users WHERE username = ?",
            args: [username]
        });

        const user = result.rows[0];

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

        req.session.userId = Number(user.id);
        req.session.username = String(user.username);

        res.json({
            message: "Login successful",
            username: user.username
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
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

// GET TASKS
app.get("/api/tasks", requireLogin, async (req, res) => {
    try {
        await ready;

        const result = await db.execute({
            sql: `
                SELECT id, title, completed
                FROM tasks
                WHERE user_id = ?
                ORDER BY id DESC
            `,
            args: [req.session.userId]
        });

        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
});

// ADD TASK
app.post("/api/tasks", requireLogin, async (req, res) => {
    try {
        await ready;

        const title = String(req.body.title || "").trim();

        if (!title) {
            return res.status(400).json({
                error: "Task cannot be empty"
            });
        }

        const result = await db.execute({
            sql: `
                INSERT INTO tasks (user_id, title, completed)
                VALUES (?, ?, 0)
            `,
            args: [req.session.userId, title]
        });

        const taskResult = await db.execute({
            sql: `
                SELECT id, title, completed
                FROM tasks
                WHERE id = ? AND user_id = ?
            `,
            args: [result.lastInsertRowid, req.session.userId]
        });

        res.status(201).json(taskResult.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
});

// COMPLETE / UNCOMPLETE TASK
app.patch("/api/tasks/:id", requireLogin, async (req, res) => {
    try {
        await ready;

        const taskId = Number(req.params.id);
        const completed = req.body.completed ? 1 : 0;

        const result = await db.execute({
            sql: `
                UPDATE tasks
                SET completed = ?
                WHERE id = ? AND user_id = ?
            `,
            args: [completed, taskId, req.session.userId]
        });

        if (result.rowsAffected === 0) {
            return res.status(404).json({
                error: "Task not found"
            });
        }

        const taskResult = await db.execute({
            sql: `
                SELECT id, title, completed
                FROM tasks
                WHERE id = ? AND user_id = ?
            `,
            args: [taskId, req.session.userId]
        });

        res.json(taskResult.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
});

// DELETE TASK
app.delete("/api/tasks/:id", requireLogin, async (req, res) => {
    try {
        await ready;

        const taskId = Number(req.params.id);

        const result = await db.execute({
            sql: `
                DELETE FROM tasks
                WHERE id = ? AND user_id = ?
            `,
            args: [taskId, req.session.userId]
        });

        if (result.rowsAffected === 0) {
            return res.status(404).json({
                error: "Task not found"
            });
        }

        res.json({
            message: "Task deleted"
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
});

if (require.main === module) {
    ready
        .then(() => {
            app.listen(PORT, () => {
                console.log(`Server running at http://localhost:${PORT}`);
            });
        })
        .catch((error) => {
            console.error("Database initialization failed:", error);
            process.exit(1);
        });
}

module.exports = app;