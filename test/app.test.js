const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../server");
const db = require("../database");


// LOGIN TEST
test("Alice can log in with the correct password", async () => {
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


// WRONG PASSWORD TEST
test("Login fails with an incorrect password", async () => {
    const response = await request(app)
        .post("/api/login")
        .send({
            username: "alice",
            password: "wrongpassword"
        });

    assert.equal(response.status, 401);
});


// USER MUST BE LOGGED IN
test("Task list cannot be accessed without login", async () => {
    const response = await request(app)
        .get("/api/tasks");

    assert.equal(response.status, 401);
});


// ALICE ONLY SEES ALICE'S TASKS
test("Alice only sees her own tasks", async () => {
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


// BOB ONLY SEES BOB'S TASKS
test("Bob only sees his own tasks", async () => {
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


// EMPTY TASK TEST
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


// USER CANNOT DELETE ANOTHER USER'S TASK
test("Alice cannot delete Bob's task", async () => {
    const bobTask = db
        .prepare(
            `SELECT id
             FROM tasks
             WHERE title = ?`
        )
        .get("Study for exam");

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

    // Make sure Bob's task still exists
    const taskStillExists = db
        .prepare(
            `SELECT id
             FROM tasks
             WHERE id = ?`
        )
        .get(bobTask.id);

    assert.ok(taskStillExists);
});