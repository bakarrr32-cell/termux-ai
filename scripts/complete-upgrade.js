const fs = require("fs");
const path = require("path");

const root = process.cwd();
const stateFile = path.join(root, "data/project-state.json");
const backupDir = path.join(root, "backups", `complete-upgrade-${new Date().toISOString().replace(/[:.]/g, "-")}`);

fs.mkdirSync(backupDir, { recursive: true });

if (fs.existsSync(stateFile)) {
  fs.copyFileSync(stateFile, path.join(backupDir, "project-state.json.before"));
}

let state = null;
try {
  state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
} catch (_) {
  state = null;
}

if (
  state &&
  state.name === "Termux AI Assistant" &&
  Array.isArray(state.steps) &&
  state.steps.length === 0
) {
  state.steps = [
    { id: 1, title: "Validasi integrasi Developer Agent dan baseline project", status: "completed" },
    { id: 2, title: "Optimasi context budget, memory reranking, dan project scan", status: "active" },
    { id: 3, title: "Satukan lifecycle conversation summary untuk chat normal dan streaming", status: "pending" },
    { id: 4, title: "Perkuat task state dan checkpoint Developer Agent", status: "pending" },
    { id: 5, title: "Uji end-to-end workflow developer: analisis → perubahan → test → verifikasi", status: "pending" }
  ];
  state.currentStep = 1;
  state.status = "active";
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  console.log("[PASS] Project State diisi dengan roadmap aktual.");
} else {
  console.log("[INFO] Project State tidak diubah karena sudah memiliki langkah atau project berbeda.");
}

console.log(`[PASS] Backup dibuat: ${backupDir}`);
