const state = {
  appName: "DoseTrace",
  profile: null,
  medications: [],
  doses: [],
  selectedMedicationId: "",
  editingDoseId: null,
  chartRangeDays: 30,
};

const els = {
  appTitle: document.getElementById("app-title"),
  heroActions: document.getElementById("hero-actions"),
  loginView: document.getElementById("login-view"),
  appView: document.getElementById("app-view"),
  loginForm: document.getElementById("login-form"),
  pinInput: document.getElementById("pin-input"),
  loginError: document.getElementById("login-error"),
  profileForm: document.getElementById("profile-form"),
  profileStats: document.getElementById("profile-stats"),
  medicationSelect: document.getElementById("medication-select"),
  medicationMeta: document.getElementById("medication-meta"),
  customMedForm: document.getElementById("custom-med-form"),
  doseForm: document.getElementById("dose-form"),
  doseFormMode: document.getElementById("dose-form-mode"),
  cancelEdit: document.getElementById("cancel-edit"),
  historyList: document.getElementById("history-list"),
  chart: document.getElementById("level-chart"),
  chartSummary: document.getElementById("chart-summary"),
  rangeTabs: document.getElementById("range-tabs"),
  settingsForm: document.getElementById("settings-form"),
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Request failed");
  }

  return response.json();
}

function setAuthenticated(authenticated) {
  els.loginView.classList.toggle("hidden", authenticated);
  els.appView.classList.toggle("hidden", !authenticated);
  renderHeroActions(authenticated);
}

function renderHeroActions(authenticated) {
  els.heroActions.innerHTML = "";
  if (!authenticated) return;

  const button = document.createElement("button");
  button.className = "secondary";
  button.type = "button";
  button.textContent = "Lock";
  button.addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    setAuthenticated(false);
  });
  els.heroActions.appendChild(button);
}

function formatDateTime(value) {
  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function toLocalDateTimeParts(iso) {
  const date = new Date(iso);
  const pad = (value) => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
  };
}

function combineLocalDateTime(date, time) {
  return new Date(`${date}T${time}`).toISOString();
}

function getMedicationById(id) {
  return state.medications.find((med) => med.id === id);
}

function renderProfile() {
  if (!state.profile) return;

  const { heightFt, heightIn, weightSt, weightLb, heightCm, weightKg, bmi } =
    state.profile;
  els.profileForm.heightFt.value = heightFt;
  els.profileForm.heightIn.value = heightIn;
  els.profileForm.weightSt.value = weightSt;
  els.profileForm.weightLb.value = weightLb;

  els.profileStats.innerHTML = `
    <span><strong>${heightCm || 0} cm</strong> stored</span>
    <span><strong>${weightKg || 0} kg</strong> stored</span>
    <span><strong>${bmi ?? "--"}</strong> BMI</span>
  `;
}

function renderMedications() {
  const options = state.medications
    .map(
      (med) =>
        `<option value="${med.id}">${med.name} (${med.compound}, ${med.doseUnit})</option>`,
    )
    .join("");

  els.medicationSelect.innerHTML = options;
  els.doseForm.medicationId.innerHTML = options;

  if (!state.selectedMedicationId && state.medications[0]) {
    state.selectedMedicationId = state.medications[0].id;
  }

  if (state.selectedMedicationId) {
    els.medicationSelect.value = state.selectedMedicationId;
    els.doseForm.medicationId.value = state.selectedMedicationId;
  }

  syncMedicationMeta();
}

function syncMedicationMeta() {
  const selectedId = els.medicationSelect.value || state.selectedMedicationId;
  const med = getMedicationById(selectedId);
  if (!med) return;

  state.selectedMedicationId = med.id;
  els.medicationMeta.textContent = `${med.compound} • ${med.doseUnit} • half-life ${med.halfLifeHours}h`;

  if (!state.editingDoseId) {
    els.doseForm.medicationId.value = med.id;
    els.doseForm.doseUnit.value = med.doseUnit;
  }
}

function resetDoseForm() {
  state.editingDoseId = null;
  els.doseForm.reset();
  els.cancelEdit.classList.add("hidden");
  els.doseFormMode.textContent = "New dose";
  els.doseForm.doseId.value = "";
  const med = getMedicationById(state.selectedMedicationId) || state.medications[0];
  if (med) {
    els.doseForm.medicationId.value = med.id;
    els.doseForm.doseUnit.value = med.doseUnit;
  }

  const now = new Date();
  const { date, time } = toLocalDateTimeParts(now.toISOString());
  els.doseForm.takenDate.value = date;
  els.doseForm.takenTime.value = time;
}

function renderHistory() {
  if (!state.doses.length) {
    els.historyList.innerHTML = `<p class="muted">No doses logged yet.</p>`;
    return;
  }

  els.historyList.innerHTML = state.doses
    .map(
      (dose) => `
        <article class="history-item">
          <div>
            <h3>${dose.medicationName} • ${dose.doseAmount} ${dose.doseUnit}</h3>
            <p>${formatDateTime(dose.takenAt)}</p>
            <p class="muted">${dose.note || "No note"}</p>
          </div>
          <div class="history-actions">
            <button type="button" class="text-button" data-edit-dose="${dose.id}">Edit</button>
            <button type="button" class="text-button danger" data-delete-dose="${dose.id}">Delete</button>
          </div>
        </article>
      `,
    )
    .join("");
}

function estimateLevelAt(pointDate, doses, medicationsById) {
  return doses.reduce((total, dose) => {
    const med = medicationsById.get(dose.medicationId);
    if (!med) return total;

    const elapsedHours = (pointDate.getTime() - new Date(dose.takenAt).getTime()) / 36e5;
    if (elapsedHours < 0) return total;

    const remaining =
      dose.doseAmount * Math.pow(0.5, elapsedHours / med.halfLifeHours);

    return total + remaining;
  }, 0);
}

function buildSeries() {
  const medicationsById = new Map(state.medications.map((med) => [med.id, med]));
  const now = new Date();
  const backDays = state.chartRangeDays;
  const forwardDays = Math.max(14, Math.round(backDays / 2));
  const stepHours = backDays > 30 ? 12 : 6;
  const start = new Date(now.getTime() - backDays * 24 * 36e5);
  const end = new Date(now.getTime() + forwardDays * 24 * 36e5);
  const points = [];

  for (let time = start.getTime(); time <= end.getTime(); time += stepHours * 36e5) {
    const date = new Date(time);
    points.push({
      date,
      level: estimateLevelAt(date, state.doses, medicationsById),
    });
  }

  return points;
}

function renderChart() {
  const ctx = els.chart.getContext("2d");
  const width = els.chart.width;
  const height = els.chart.height;
  ctx.clearRect(0, 0, width, height);

  const points = buildSeries();
  const maxLevel = Math.max(1, ...points.map((point) => point.level));
  const minX = points[0]?.date.getTime() || Date.now();
  const maxX = points[points.length - 1]?.date.getTime() || Date.now();
  const padding = { top: 26, right: 24, bottom: 34, left: 56 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  ctx.fillStyle = "#fffdf8";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(21,94,99,0.12)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (plotHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  const projectX = (time) =>
    padding.left + ((time - minX) / Math.max(1, maxX - minX)) * plotWidth;
  const projectY = (level) =>
    padding.top + plotHeight - (level / maxLevel) * plotHeight;

  ctx.beginPath();
  points.forEach((point, index) => {
    const x = projectX(point.date.getTime());
    const y = projectY(point.level);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#155e63";
  ctx.stroke();

  ctx.lineTo(projectX(points[points.length - 1].date.getTime()), padding.top + plotHeight);
  ctx.lineTo(projectX(points[0].date.getTime()), padding.top + plotHeight);
  ctx.closePath();
  ctx.fillStyle = "rgba(21,94,99,0.12)";
  ctx.fill();

  ctx.fillStyle = "#675b4b";
  ctx.font = '14px Georgia, "Times New Roman", serif';
  ctx.fillText(`${maxLevel.toFixed(2)}`, 10, padding.top + 6);
  ctx.fillText("0", 34, padding.top + plotHeight + 4);

  const tickTimes = [0, 0.33, 0.66, 1].map((ratio) => minX + (maxX - minX) * ratio);
  tickTimes.forEach((time) => {
    const x = projectX(time);
    ctx.beginPath();
    ctx.moveTo(x, padding.top + plotHeight);
    ctx.lineTo(x, padding.top + plotHeight + 8);
    ctx.strokeStyle = "rgba(103,91,75,0.4)";
    ctx.stroke();
    const label = new Date(time).toLocaleDateString([], { month: "short", day: "numeric" });
    ctx.fillText(label, x - 20, height - 8);
  });

  state.doses.forEach((dose) => {
    const time = new Date(dose.takenAt).getTime();
    if (time < minX || time > maxX) return;
    const x = projectX(time);
    const level = estimateLevelAt(new Date(dose.takenAt), state.doses, new Map(state.medications.map((med) => [med.id, med])));
    const y = projectY(level);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#c69140";
    ctx.fill();
  });

  const latestDose = state.doses[0];
  const currentLevel = estimateLevelAt(new Date(), state.doses, new Map(state.medications.map((med) => [med.id, med])));
  els.chartSummary.textContent = latestDose
    ? `Current estimated level: ${currentLevel.toFixed(2)} ${latestDose.doseUnit}. Last logged dose: ${latestDose.medicationName} on ${formatDateTime(latestDose.takenAt)}.`
    : "Log a dose to start the trend graph.";
}

function renderSettings() {
  els.settingsForm.appName.value = state.appName;
}

function render() {
  els.appTitle.textContent = state.appName;
  document.title = state.appName;
  renderProfile();
  renderMedications();
  renderHistory();
  renderChart();
  renderSettings();
  resetDoseForm();
}

async function refreshApp() {
  const payload = await api("/api/app");
  state.appName = payload.appName;
  state.profile = payload.profile;
  state.medications = payload.medications;
  state.doses = payload.doses;
  render();
}

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.loginError.textContent = "";

  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ pin: els.pinInput.value }),
    });
    setAuthenticated(true);
    await refreshApp();
    els.pinInput.value = "";
  } catch (error) {
    els.loginError.textContent = error.message;
  }
});

els.profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await api("/api/profile", {
    method: "PUT",
    body: JSON.stringify({
      heightFt: Number(els.profileForm.heightFt.value),
      heightIn: Number(els.profileForm.heightIn.value),
      weightSt: Number(els.profileForm.weightSt.value),
      weightLb: Number(els.profileForm.weightLb.value),
    }),
  });
  await refreshApp();
});

els.medicationSelect.addEventListener("change", () => {
  state.selectedMedicationId = els.medicationSelect.value;
  syncMedicationMeta();
});

els.customMedForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(els.customMedForm);
  const name = String(form.get("name") || "").trim();
  const compound = String(form.get("compound") || "").trim();
  const doseUnit = String(form.get("doseUnit") || "").trim();
  const halfLifeHours = Number(form.get("halfLifeHours"));

  if (!name) return;

  await api("/api/medications", {
    method: "POST",
    body: JSON.stringify({ name, compound, doseUnit, halfLifeHours }),
  });

  els.customMedForm.reset();
  await refreshApp();
});

els.doseForm.medicationId.addEventListener("change", () => {
  const med = getMedicationById(els.doseForm.medicationId.value);
  if (med && !state.editingDoseId) {
    els.doseForm.doseUnit.value = med.doseUnit;
  }
});

els.doseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    medicationId: els.doseForm.medicationId.value,
    doseAmount: Number(els.doseForm.doseAmount.value),
    doseUnit: els.doseForm.doseUnit.value.trim(),
    takenAt: combineLocalDateTime(
      els.doseForm.takenDate.value,
      els.doseForm.takenTime.value,
    ),
    note: els.doseForm.note.value.trim(),
  };

  const doseId = els.doseForm.doseId.value;
  const path = doseId ? `/api/doses/${doseId}` : "/api/doses";
  const method = doseId ? "PUT" : "POST";

  await api(path, {
    method,
    body: JSON.stringify(payload),
  });

  await refreshApp();
});

els.cancelEdit.addEventListener("click", () => {
  resetDoseForm();
});

els.historyList.addEventListener("click", async (event) => {
  const editId = event.target.getAttribute("data-edit-dose");
  const deleteId = event.target.getAttribute("data-delete-dose");

  if (editId) {
    const dose = state.doses.find((entry) => String(entry.id) === editId);
    if (!dose) return;

    state.editingDoseId = dose.id;
    els.doseFormMode.textContent = "Editing dose";
    els.cancelEdit.classList.remove("hidden");
    els.doseForm.doseId.value = String(dose.id);
    els.doseForm.medicationId.value = dose.medicationId;
    els.doseForm.doseAmount.value = String(dose.doseAmount);
    els.doseForm.doseUnit.value = dose.doseUnit;
    els.doseForm.note.value = dose.note || "";
    const { date, time } = toLocalDateTimeParts(dose.takenAt);
    els.doseForm.takenDate.value = date;
    els.doseForm.takenTime.value = time;
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  if (deleteId && window.confirm("Delete this dose entry?")) {
    await api(`/api/doses/${deleteId}`, { method: "DELETE" });
    await refreshApp();
  }
});

els.rangeTabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-range]");
  if (!button) return;
  state.chartRangeDays = Number(button.dataset.range);
  [...els.rangeTabs.querySelectorAll("button")].forEach((tab) =>
    tab.classList.toggle("active", tab === button),
  );
  renderChart();
});

els.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await api("/api/settings", {
    method: "PUT",
    body: JSON.stringify({
      appName: els.settingsForm.appName.value.trim(),
      pin: els.settingsForm.pin.value.trim(),
    }),
  });

  els.settingsForm.pin.value = "";
  await refreshApp();
});

async function bootstrap() {
  const payload = await api("/api/bootstrap");
  state.appName = payload.appName;
  els.appTitle.textContent = state.appName;
  document.title = state.appName;
  setAuthenticated(payload.authenticated);

  if (payload.authenticated) {
    await refreshApp();
  }
}

bootstrap().catch((error) => {
  els.loginError.textContent = error.message;
});
