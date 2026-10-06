const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const db = new Database("todo.db");

// Create users table
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
    )
`);

// Create tasks table
db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        completed INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
`);

// Create two demo users if they do not already exist
const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (username, password)
    VALUES (?, ?)
`);

const user1Password = bcrypt.hashSync("password123", 10);
const user2Password = bcrypt.hashSync("password456", 10);

insertUser.run("alice", user1Password);
insertUser.run("bob", user2Password);

module.exports = db;