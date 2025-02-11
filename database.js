// database.js
import sqlite3 from 'sqlite3';

const db = new sqlite3.Database(process.env.DB_PATH || './project_manager.db');

db.serialize(() => {
    // Tabla de usuarios
    db.run(`CREATE TABLE IF NOT EXISTS users (
    telegram_id TEXT PRIMARY KEY,
    username TEXT,
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
    // Tabla de sprints
    db.run(`CREATE TABLE IF NOT EXISTS sprints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    start_date TEXT,
    end_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
    // Tabla de tareas
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    status TEXT,
    assigned_to TEXT,
    sprint_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

function getCurrentSprint() {
    return new Promise((resolve, reject) => {
        let now = new Date();
        let day = now.getDay();
        let diff = now.getDate() - day + (day === 0 ? -6 : 1);
        let monday = new Date(now);
        monday.setDate(diff);
        monday.setHours(0, 0, 0, 0);
        let sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);

        let startDate = monday.toISOString();
        let endDate = sunday.toISOString();

        db.get(
            "SELECT * FROM sprints WHERE ? BETWEEN start_date AND end_date ORDER BY start_date DESC LIMIT 1",
            [now.toISOString()],
            (err, row) => {
                if (err) {
                    console.error("Error en getCurrentSprint:", err);
                    return reject(err);
                }
                if (row) {
                    resolve(row);
                } else {
                    const sprintName = `Sprint ${monday.toLocaleDateString()} - ${sunday.toLocaleDateString()}`;
                    db.run(
                        "INSERT INTO sprints (name, start_date, end_date) VALUES (?, ?, ?)",
                        [sprintName, startDate, endDate],
                        function (err) {
                            if (err) return reject(err);
                            db.get("SELECT * FROM sprints WHERE id = ?", [this.lastID], (err, newSprint) => {
                                if (err) return reject(err);
                                resolve(newSprint);
                            });
                        }
                    );
                }
            }
        );
    });
}

function insertTask(title, description, user, sprintId) {
    return new Promise((resolve, reject) => {
        db.run(
            "INSERT INTO tasks (title, description, status, assigned_to, sprint_id) VALUES (?, ?, ?, ?, ?)",
            [title, description || "", 'pendiente', user.username, sprintId],
            function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, title, description: description || "" });
                }
            }
        );
    });
}

export { db, getCurrentSprint, insertTask };
