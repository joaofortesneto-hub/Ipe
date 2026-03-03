import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";

const db = new Database("ipe_seguranca.db");
db.pragma('foreign_keys = ON');

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS receivers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    bank TEXT,
    agency TEXT,
    beneficiary_name TEXT,
    cpf TEXT,
    pix_key TEXT
  );

  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT,
    shift TEXT,
    daily_rate REAL DEFAULT 0,
    hours_per_day REAL DEFAULT 8,
    meal_allowance REAL DEFAULT 0,
    receiver_id INTEGER,
    FOREIGN KEY (receiver_id) REFERENCES receivers(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    UNIQUE(staff_id, date),
    FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Staff API Routes
  app.get("/api/staff", (req, res) => {
    const rows = db.prepare(`
      SELECT staff.*, receivers.name as receiver_name 
      FROM staff 
      LEFT JOIN receivers ON staff.receiver_id = receivers.id
    `).all();
    res.json(rows);
  });

  app.post("/api/staff", (req, res) => {
    const { name, role, shift, daily_rate, hours_per_day, meal_allowance, receiver_id } = req.body;
    const info = db.prepare(`
      INSERT INTO staff (name, role, shift, daily_rate, hours_per_day, meal_allowance, receiver_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(name, role, shift, daily_rate, hours_per_day, meal_allowance, receiver_id);
    res.json({ id: info.lastInsertRowid });
  });

  app.put("/api/staff/:id", (req, res) => {
    const { id } = req.params;
    const { name, role, shift, daily_rate, hours_per_day, meal_allowance, receiver_id } = req.body;
    db.prepare(`
      UPDATE staff SET 
        name = ?, role = ?, shift = ?, daily_rate = ?, 
        hours_per_day = ?, meal_allowance = ?, receiver_id = ?
      WHERE id = ?
    `).run(name, role, shift, daily_rate, hours_per_day, meal_allowance, receiver_id, id);
    res.json({ success: true });
  });

  // Receiver API Routes
  app.get("/api/receivers", (req, res) => {
    const rows = db.prepare("SELECT * FROM receivers").all();
    res.json(rows);
  });

  app.post("/api/receivers", (req, res) => {
    const { name, bank, agency, beneficiary_name, cpf, pix_key } = req.body;
    const info = db.prepare(`
      INSERT INTO receivers (name, bank, agency, beneficiary_name, cpf, pix_key)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, bank, agency, beneficiary_name, cpf, pix_key);
    res.json({ id: info.lastInsertRowid });
  });

  app.put("/api/receivers/:id", (req, res) => {
    const { id } = req.params;
    const { name, bank, agency, beneficiary_name, cpf, pix_key } = req.body;
    db.prepare(`
      UPDATE receivers SET 
        name = ?, bank = ?, agency = ?, beneficiary_name = ?, cpf = ?, pix_key = ?
      WHERE id = ?
    `).run(name, bank, agency, beneficiary_name, cpf, pix_key, id);
    res.json({ success: true });
  });

  app.delete("/api/receivers/:id", (req, res) => {
    const { id } = req.params;
    try {
      // With ON DELETE SET NULL, we just need to delete the receiver
      const result = db.prepare("DELETE FROM receivers WHERE id = ?").run(id);
      res.json({ success: true, changes: result.changes });
    } catch (error) {
      console.error("Error deleting receiver:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to delete receiver" });
    }
  });

  app.delete("/api/staff/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM staff WHERE id = ?").run(id);
    res.json({ success: true });
  });

  app.get("/api/attendance", (req, res) => {
    const { month } = req.query; // Expecting YYYY-MM
    const rows = db.prepare("SELECT * FROM attendance WHERE date LIKE ?").all(`${month}%`);
    res.json(rows);
  });

  app.post("/api/attendance", (req, res) => {
    const { staff_id, date } = req.body;
    try {
      db.prepare("INSERT INTO attendance (staff_id, date) VALUES (?, ?)").run(staff_id, date);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: "Already marked or invalid" });
    }
  });

  app.delete("/api/attendance", (req, res) => {
    const { staff_id, date } = req.body;
    db.prepare("DELETE FROM attendance WHERE staff_id = ? AND date = ?").run(staff_id, date);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
