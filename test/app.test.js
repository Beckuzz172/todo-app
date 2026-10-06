const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../server");
const { db, ready } = require("../database");

async function resetTestTasks() {
    await ready;

    const aliceResult = await db.execute({
        sql: "SELECT id FROM users WHERE username = ?",
        args: ["alice"]
    });

    const bobResult = await db.execute({
        sql: "SELECT id FROM users WHERE username = ?",
        args: ["bob"]
    });

    const aliceId = aliceResult.rows[0].id;
    const bobId = bobResult.rows[0].id;

    await db.execute("DELETE FROM tasks");

    await db.execute({
        sql: `
            INSERT INTO tasks (user_id, title, completed)
            VALUES (?, ?, ?)
        `,
        args: [aliceId, "Finish homework", 1]
    });

    await db.execute({
        sql: `
            INSERT INTO tasks (user_id, title, completed)
            VALUES (?, ?, ?)
        `,
        args: [aliceId, "Buy coffee", 0]
    });

    await db.execute({
        sql: `
            INSERT INTO tasks (user_id, title, completed)
            VALUES (?, ?, ?)
        `,
        args: [bobId, "Study for exam", 0]
    });
}

test("Alice can log in with the correct password", async () => {
    await resetTestTasks();

    const agent = request.agent(app);

    const response = await agent
        .post("/api/login")
        .send({
            username: "alice",
            password: "password123"
        });

    assert.equal(response.status, 200);
    assert.equal(response.body.username, "alice");
});

test("Login fails with an incorrect password", async () => {
    const response = await request(app)
        .post("/api/login")
        .send({
            username: "alice",
            password: "wrongpassword"
        });

    assert.equal(response.status, 401);
});

test("Task list cannot be accessed without login", async () => {
    const response = await request(app)
        .get("/api/tasks");

    assert.equal(response.status, 401);
});

test("Alice only sees her own tasks", async () => {
    await resetTestTasks();

    const agent = request.agent(app);

    await agent
        .post("/api/login")
        .send({
            username: "alice",
            password: "password123"
        });

    const response = await agent.get("/api/tasks");

    assert.equal(response.status, 200);

    const titles = response.body.map(task => task.title);

    assert.ok(titles.includes("Buy coffee"));
    assert.ok(titles.includes("Finish homework"));
    assert.ok(!titles.includes("Study for exam"));
});

test("Bob only sees his own tasks", async () => {
    await resetTestTasks();

    const agent = request.agent(app);

    await agent
        .post("/api/login")
        .send({
            username: "bob",
            password: "password456"
        });

    const response = await agent.get("/api/tasks");

    assert.equal(response.status, 200);

    const titles = response.body.map(task => task.title);

    assert.ok(titles.includes("Study for exam"));
    assert.ok(!titles.includes("Buy coffee"));
    assert.ok(!titles.includes("Finish homework"));
});

test("Empty tasks are rejected", async () => {
    const agent = request.agent(app);

    await agent
        .post("/api/login")
        .send({
            username: "alice",
            password: "password123"
        });

    const response = await agent
        .post("/api/tasks")
        .send({
            title: ""
        });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "Task cannot be empty");
});

test("Alice cannot delete Bob's task", async () => {
    await resetTestTasks();

    const bobTaskResult = await db.execute({
        sql: `
            SELECT id
            FROM tasks
            WHERE title = ?
        `,
        args: ["Study for exam"]
    });

    const bobTask = bobTaskResult.rows[0];

    assert.ok(bobTask);

    const agent = request.agent(app);

    await agent
        .post("/api/login")
        .send({
            username: "alice",
            password: "password123"
        });

    const response = await agent
        .delete(`/api/tasks/${bobTask.id}`);

    assert.equal(response.status, 404);

    const taskStillExistsResult = await db.execute({
        sql: `
            SELECT id
            FROM tasks
            WHERE id = ?
        `,
        args: [bobTask.id]
    });

    assert.ok(taskStillExistsResult.rows[0]);
});