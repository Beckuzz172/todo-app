const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const path = require("path");
const { db, ready } = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET =
    process.env.SESSION_SECRET || "development-secret-change-me";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Read JWT from cookie
function getCurrentUser(req) {
    const cookieHeader = req.headers.cookie || "";

    const cookies = Object.fromEntries(
        cookieHeader
            .split(";")
            .map(cookie => cookie.trim())
            .filter(Boolean)
            .map(cookie => {
                const index = cookie.indexOf("=");

                if (index === -1) {
                    return [cookie, ""];
                }

                return [
                    cookie.slice(0, index),
                    decodeURIComponent(cookie.slice(index + 1))
                ];
            })
    );

    const token = cookies.auth_token;

    if (!token) {
        return null;
    }

    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

// Protect routes that require login
function requireLogin(req, res, next) {
    const user = getCurrentUser(req);

    if (!user) {
        return res.status(401).json({
            error: "You must log in first"
        });
    }

    req.user = user;
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

        const token = jwt.sign(
            {
                userId: Number(user.id),
                username: String(user.username)
            },
            JWT_SECRET,
            {
                expiresIn: "1h"
            }
        );

        res.cookie("auth_token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 1000 * 60 * 60
        });

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
    const user = getCurrentUser(req);

    if (!user) {
        return res.status(401).json({
            error: "Not logged in"
        });
    }

    res.json({
        id: user.userId,
        username: user.username
    });
});

// LOGOUT
app.post("/api/logout", (req, res) => {
    res.clearCookie("auth_token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax"
    });

    res.json({
        message: "Logged out"
    });
});

// GET ONLY LOGGED-IN USER'S TASKS
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
            args: [req.user.userId]
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
            args: [req.user.userId, title]
        });

        const taskResult = await db.execute({
            sql: `
                SELECT id, title, completed
                FROM tasks
                WHERE id = ? AND user_id = ?
            `,
            args: [result.lastInsertRowid, req.user.userId]
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
            args: [completed, taskId, req.user.userId]
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
            args: [taskId, req.user.userId]
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
            args: [taskId, req.user.userId]
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
        .catch(error => {
            console.error("Database initialization failed:", error);
            process.exit(1);
        });
}

module.exports = app;