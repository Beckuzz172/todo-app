const { createClient } = require("@libsql/client");
const bcrypt = require("bcryptjs");

const db = createClient({
    url: process.env.TURSO_DATABASE_URL || "file:todo.db",
    authToken: process.env.TURSO_AUTH_TOKEN
});

async function initializeDatabase() {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            completed INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    const user1Password = bcrypt.hashSync("password123", 10);
    const user2Password = bcrypt.hashSync("password456", 10);

    await db.execute({
        sql: `
            INSERT OR IGNORE INTO users (username, password)
            VALUES (?, ?)
        `,
        args: ["alice", user1Password]
    });

    await db.execute({
        sql: `
            INSERT OR IGNORE INTO users (username, password)
            VALUES (?, ?)
        `,
        args: ["bob", user2Password]
    });
}

const ready = initializeDatabase();

module.exports = {
    db,
    ready
};