const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const Database = require("better-sqlite3");

const app = express();
const PORT = Number(process.env.PORT || 3024);
const APP_NAME = process.env.APP_NAME || "DoseTrace";
const APP_PIN = process.env.APP_PIN || "1234";
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const DB_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DB_DIR, "dose-trace.db");

fs.mkdirSync(DB_DIR, { recursive: true });

const MEDICATION_SEED = [
  {
    id: "semaglutide-wegovy",
    name: "Wegovy",
    compound: "semaglutide",
    doseUnit: "mg",
    halfLifeHours: 168,
  },
  {
    id: "semaglutide-ozempic",
    name: "Ozempic",
    compound: "semaglutide",
    doseUnit: "mg",
    halfLifeHours: 168,
  },
  {
    id: "semaglutide-rybelsus",
    name: "Rybelsus",
    compound: "semaglutide",
    doseUnit: "mg",
    halfLifeHours: 168,
  },
  {
    id: "tirzepatide-mounjaro",
    name: "Mounjaro",
    compound: "tirzepatide",
    doseUnit: "mg",
    halfLifeHours: 120,
  },
  {
    id: "tirzepatide-zepbound",
    name: "Zepbound",
    compound: "tirzepatide",
    doseUnit: "mg",
    halfLifeHours: 120,
  },
  {
    id: "liraglutide-saxenda",
    name: "Saxenda",
    compound: "liraglutide",
    doseUnit: "mg",
    halfLifeHours: 13,
  },
  {
    id: "liraglutide-victoza",
    name: "Victoza",
    compound: "liraglutide",
    doseUnit: "mg",
    halfLifeHours: 13,
  },
  {
    id: "exenatide-byetta",
    name: "Byetta",
    compound: "exenatide",
    doseUnit: "mcg",
    halfLifeHours: 2.4,
  },
  {
    id: "exenatide-bydureon",
    name: "Bydureon",
    compound: "exenatide ER",
    doseUnit: "mg",
    halfLifeHours: 336,
  },
  {
    id: "dulaglutide-trulicity",
    name: "Trulicity",
    compound: "dulaglutide",
    doseUnit: "mg",
    halfLifeHours: 120,
  },
];

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    height_ft INTEGER NOT NULL DEFAULT 0,
    height_in INTEGER NOT NULL DEFAULT 0,
    height_cm REAL NOT NULL DEFAULT 0,
    weight_st INTEGER NOT NULL DEFAULT 0,
    weight_lb INTEGER NOT NULL DEFAULT 0,
    weight_kg REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS medications (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    compound TEXT NOT NULL,
    dose_unit TEXT NOT NULL,
    half_life_hours REAL NOT NULL,
    is_custom INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS doses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    medication_id TEXT NOT NULL,
    dose_amount REAL NOT NULL,
    dose_unit TEXT NOT NULL,
    taken_at TEXT NOT NULL,
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (medication_id) REFERENCES medications(id)
  );

  CREATE TABLE IF NOT EXISTS symptom_checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appetite_return INTEGER NOT NULL,
    cravings INTEGER NOT NULL,
    low_energy INTEGER NOT NULL,
    nausea INTEGER NOT NULL,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const getSetting = db.prepare("SELECT value FROM settings WHERE key = ?");
const setSetting = db.prepare(`
  INSERT INTO settings (key, value)
  VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

function seedApp() {
  if (!getSetting.get("appName")) {
    setSetting.run("appName", APP_NAME);
  }

  if (!getSetting.get("pinHash")) {
    const pinHash = bcrypt.hashSync(APP_PIN, 10);
    setSetting.run("pinHash", pinHash);
  }

  const insertMedication = db.prepare(`
    INSERT INTO medications (id, name, compound, dose_unit, half_life_hours, is_custom)
    VALUES (@id, @name, @compound, @doseUnit, @halfLifeHours, 0)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      compound = excluded.compound,
      dose_unit = excluded.dose_unit,
      half_life_hours = excluded.half_life_hours
  `);

  const seed = db.transaction(() => {
    for (const med of MEDICATION_SEED) {
      insertMedication.run(med);
    }
  });

  seed();

  db.prepare(`
    INSERT INTO profile (id, height_ft, height_in, height_cm, weight_st, weight_lb, weight_kg)
    VALUES (1, 0, 0, 0, 0, 0, 0)
    ON CONFLICT(id) DO NOTHING
  `).run();
}

seedApp();

app.use(express.json());
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 14,
    },
  }),
);
app.use(express.static(path.join(__dirname, "public")));

function sanitizeMedication(row) {
  return {
    id: row.id,
    name: row.name,
    compound: row.compound,
    doseUnit: row.dose_unit,
    halfLifeHours: row.half_life_hours,
    isCustom: Boolean(row.is_custom),
  };
}

function getProfile() {
  const row = db.prepare("SELECT * FROM profile WHERE id = 1").get();
  return {
    heightFt: row.height_ft,
    heightIn: row.height_in,
    heightCm: row.height_cm,
    weightSt: row.weight_st,
    weightLb: row.weight_lb,
    weightKg: row.weight_kg,
    bmi:
      row.height_cm > 0
        ? Number((row.weight_kg / Math.pow(row.height_cm / 100, 2)).toFixed(1))
        : null,
    updatedAt: row.updated_at,
  };
}

function getLatestCheckin() {
  const row = db
    .prepare(`
      SELECT *
      FROM symptom_checkins
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT 1
    `)
    .get();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    appetiteReturn: row.appetite_return,
    cravings: row.cravings,
    lowEnergy: row.low_energy,
    nausea: row.nausea,
    notes: row.notes || "",
    createdAt: row.created_at,
  };
}

function requireAuth(req, res, next) {
  if (!req.session.authenticated) {
    return res.status(401).json({ error: "PIN required" });
  }

  next();
}

app.get("/api/bootstrap", (req, res) => {
  res.json({
    appName: (getSetting.get("appName") || {}).value || APP_NAME,
    authenticated: Boolean(req.session.authenticated),
    hasDefaultPin: APP_PIN === "1234",
  });
});

app.post("/api/login", (req, res) => {
  const { pin } = req.body || {};
  const pinHash = (getSetting.get("pinHash") || {}).value;

  if (!pin || !pinHash || !bcrypt.compareSync(String(pin), pinHash)) {
    return res.status(401).json({ error: "Incorrect PIN" });
  }

  req.session.authenticated = true;
  res.json({ ok: true });
});

app.post("/api/logout", requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get("/api/app", requireAuth, (req, res) => {
  res.json({
    appName: (getSetting.get("appName") || {}).value || APP_NAME,
    profile: getProfile(),
    latestCheckin: getLatestCheckin(),
    medications: db
      .prepare("SELECT * FROM medications ORDER BY is_custom, name")
      .all()
      .map(sanitizeMedication),
    doses: db
      .prepare(`
        SELECT d.*, m.name AS medication_name
        FROM doses d
        JOIN medications m ON m.id = d.medication_id
        ORDER BY datetime(d.taken_at) DESC, d.id DESC
      `)
      .all()
      .map((row) => ({
        id: row.id,
        medicationId: row.medication_id,
        medicationName: row.medication_name,
        doseAmount: row.dose_amount,
        doseUnit: row.dose_unit,
        takenAt: row.taken_at,
        note: row.note || "",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
  });
});

app.post("/api/checkins", requireAuth, (req, res) => {
  const appetiteReturn = Number(req.body?.appetiteReturn);
  const cravings = Number(req.body?.cravings);
  const lowEnergy = Number(req.body?.lowEnergy);
  const nausea = Number(req.body?.nausea);
  const notes = String(req.body?.notes || "").trim();

  const ratings = [appetiteReturn, cravings, lowEnergy, nausea];
  if (
    ratings.some((value) => !Number.isInteger(value) || value < 1 || value > 5)
  ) {
    return res.status(400).json({ error: "Check-in ratings must be 1 to 5" });
  }

  const result = db
    .prepare(`
      INSERT INTO symptom_checkins (
        appetite_return,
        cravings,
        low_energy,
        nausea,
        notes
      )
      VALUES (?, ?, ?, ?, ?)
    `)
    .run(appetiteReturn, cravings, lowEnergy, nausea, notes);

  res.json({
    checkin: db
      .prepare("SELECT * FROM symptom_checkins WHERE id = ?")
      .get(result.lastInsertRowid),
  });
});

app.put("/api/profile", requireAuth, (req, res) => {
  const heightFt = Number(req.body?.heightFt);
  const heightIn = Number(req.body?.heightIn);
  const weightSt = Number(req.body?.weightSt);
  const weightLb = Number(req.body?.weightLb);

  if (
    !Number.isInteger(heightFt) ||
    !Number.isInteger(heightIn) ||
    !Number.isInteger(weightSt) ||
    !Number.isInteger(weightLb) ||
    heightFt < 0 ||
    heightFt > 9 ||
    heightIn < 0 ||
    heightIn > 11 ||
    weightSt < 0 ||
    weightSt > 99 ||
    weightLb < 0 ||
    weightLb > 13
  ) {
    return res.status(400).json({ error: "Invalid profile values" });
  }

  const totalInches = heightFt * 12 + heightIn;
  const heightCm = Number((totalInches * 2.54).toFixed(2));
  const totalPounds = weightSt * 14 + weightLb;
  const weightKg = Number((totalPounds * 0.45359237).toFixed(2));

  db.prepare(`
    UPDATE profile
    SET height_ft = ?,
        height_in = ?,
        height_cm = ?,
        weight_st = ?,
        weight_lb = ?,
        weight_kg = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).run(heightFt, heightIn, heightCm, weightSt, weightLb, weightKg);

  res.json({ profile: getProfile() });
});

app.post("/api/medications", requireAuth, (req, res) => {
  const name = String(req.body?.name || "").trim();
  const compound = String(req.body?.compound || "").trim();
  const doseUnit = String(req.body?.doseUnit || "").trim();
  const halfLifeHours = Number(req.body?.halfLifeHours);

  if (!name || !compound || !doseUnit || !(halfLifeHours > 0)) {
    return res.status(400).json({ error: "Invalid medication values" });
  }

  const id = `custom-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}-${Date.now()}`;

  db.prepare(`
    INSERT INTO medications (id, name, compound, dose_unit, half_life_hours, is_custom)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(id, name, compound, doseUnit, halfLifeHours);

  res.json({
    medication: sanitizeMedication(
      db.prepare("SELECT * FROM medications WHERE id = ?").get(id),
    ),
  });
});

function validateDosePayload(body) {
  const medicationId = String(body?.medicationId || "").trim();
  const doseAmount = Number(body?.doseAmount);
  const doseUnit = String(body?.doseUnit || "").trim();
  const takenAt = String(body?.takenAt || "").trim();
  const note = String(body?.note || "").trim();

  if (!medicationId || !(doseAmount > 0) || !doseUnit || !takenAt) {
    return { error: "Invalid dose values" };
  }

  const medication = db
    .prepare("SELECT * FROM medications WHERE id = ?")
    .get(medicationId);

  if (!medication) {
    return { error: "Medication not found" };
  }

  const timestamp = new Date(takenAt);
  if (Number.isNaN(timestamp.getTime())) {
    return { error: "Invalid dose timestamp" };
  }

  return {
    value: {
      medicationId,
      doseAmount,
      doseUnit,
      takenAt: timestamp.toISOString(),
      note,
    },
  };
}

app.post("/api/doses", requireAuth, (req, res) => {
  const parsed = validateDosePayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const { medicationId, doseAmount, doseUnit, takenAt, note } = parsed.value;
  const result = db.prepare(`
    INSERT INTO doses (medication_id, dose_amount, dose_unit, taken_at, note)
    VALUES (?, ?, ?, ?, ?)
  `).run(medicationId, doseAmount, doseUnit, takenAt, note);

  res.json({
    dose: db
      .prepare(`
        SELECT d.*, m.name AS medication_name
        FROM doses d
        JOIN medications m ON m.id = d.medication_id
        WHERE d.id = ?
      `)
      .get(result.lastInsertRowid),
  });
});

app.put("/api/doses/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Invalid dose id" });
  }

  const existing = db.prepare("SELECT id FROM doses WHERE id = ?").get(id);
  if (!existing) {
    return res.status(404).json({ error: "Dose not found" });
  }

  const parsed = validateDosePayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const { medicationId, doseAmount, doseUnit, takenAt, note } = parsed.value;
  db.prepare(`
    UPDATE doses
    SET medication_id = ?,
        dose_amount = ?,
        dose_unit = ?,
        taken_at = ?,
        note = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(medicationId, doseAmount, doseUnit, takenAt, note, id);

  res.json({ ok: true });
});

app.delete("/api/doses/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Invalid dose id" });
  }

  db.prepare("DELETE FROM doses WHERE id = ?").run(id);
  res.json({ ok: true });
});

app.put("/api/settings", requireAuth, (req, res) => {
  const appName = String(req.body?.appName || "").trim();
  const pin = String(req.body?.pin || "").trim();

  if (appName) {
    setSetting.run("appName", appName);
  }

  if (pin) {
    if (!/^\d{4,8}$/.test(pin)) {
      return res
        .status(400)
        .json({ error: "PIN must be 4 to 8 numeric digits" });
    }

    setSetting.run("pinHash", bcrypt.hashSync(pin, 10));
  }

  res.json({
    appName: (getSetting.get("appName") || {}).value || APP_NAME,
  });
});

app.listen(PORT, () => {
  console.log(`DoseTrace server running on http://localhost:${PORT}`);
});
