const AgentTaskStore = require("./AgentTaskStore");

class DeveloperAgent {
  constructor(options = {}) {
    this.modes = [
      "planning",
      "implementation",
      "debugging",
      "testing",
      "review",
      "explanation",
      "status"
    ];
    this.taskStore = options.taskStore || new AgentTaskStore();
    this.inspectionCache = null;
    this.inspectionCacheAt = 0;
    this.inspectionCacheTtl = options.inspectionCacheTtl || 30000;
    this.deepInspectionCache = null;
    this.deepInspectionCacheAt = 0;
  }

  detectMode(message) {
    const text = String(message || "").toLowerCase();
    if (/error|bug|gagal|crash|exception|timeout|504|403|401|429|rusak|tidak jalan|macet/.test(text)) return "debugging";
    if (/test|testing|uji|cek|verifikasi|regression/.test(text)) return "testing";
    if (/review|audit|periksa|cek kode|analisis kode/.test(text)) return "review";
    if (/rencana|plan|arsitektur|desain|bagaimana membangun|bagaimana membuat/.test(text)) return "planning";
    if (/buat|bikin|bangun|implement|tambahkan|upgrade|ubah|perbaiki|pasang|integrasi/.test(text)) return "implementation";
    if (/status|progress|kondisi|sekarang|runtime|diagnostic|telemetry/.test(text)) return "status";
    return "explanation";
  }

  extractGoals(message) {
    const text = String(message || "").trim();
    const goals = [];
    if (/error|bug|gagal|crash|exception|timeout|macet/i.test(text)) goals.push("temukan penyebab berdasarkan bukti aktual sebelum menyarankan perubahan");
    if (/buat|bikin|bangun|implement|tambahkan|upgrade|ubah|perbaiki|pasang|integrasi/i.test(text)) goals.push("ubah project yang ada tanpa menghilangkan fitur stabil");
    if (/test|testing|uji|cek|verifikasi|regression/i.test(text)) goals.push("verifikasi perubahan dengan test yang dapat diulang");
    if (goals.length === 0) goals.push("jawab berdasarkan kondisi project aktual dan konteks percakapan yang relevan");
    return goals;
  }

  syncTask(message) {
    const text = String(message || "").trim();
    const mode = this.detectMode(text);
    const current = this.taskStore.get();
    const developerModes = ["planning", "implementation", "debugging", "testing", "review"];

    if (!text || !developerModes.includes(mode)) return current;

    if (current.status !== "active" || current.objective !== text || current.mode !== mode) {
      return this.taskStore.start(text, mode);
    }

    return current;
  }

  setPlan(plan) {
    return this.taskStore.setPlan(plan);
  }

  recordEvidence(evidence) {
    return this.taskStore.addEvidence(evidence);
  }

  verify(result) {
    return this.taskStore.setVerification(result);
  }

  completeTask(result = null) {
    return this.taskStore.complete(result);
  }

  invalidateCaches() {
    this.inspectionCache = null;
    this.inspectionCacheAt = 0;
    this.deepInspectionCache = null;
    this.deepInspectionCacheAt = 0;
  }

  shouldInspectDeep(message, includeProject = false) {
    const mode = this.detectMode(message);
    return includeProject || ["planning", "implementation", "debugging", "testing", "review", "status"].includes(mode);
  }

  getCachedInspection(factory, force = false) {
    const now = Date.now();
    if (!force && this.inspectionCache && now - this.inspectionCacheAt < this.inspectionCacheTtl) {
      return this.inspectionCache;
    }
    const result = typeof factory === "function" ? factory() : null;
    this.inspectionCache = result;
    this.inspectionCacheAt = now;
    return result;
  }

  getCachedDeepInspection(factory, force = false) {
    const now = Date.now();
    if (!force && this.deepInspectionCache && now - this.deepInspectionCacheAt < this.inspectionCacheTtl) {
      return this.deepInspectionCache;
    }
    const result = typeof factory === "function" ? factory() : null;
    this.deepInspectionCache = result;
    this.deepInspectionCacheAt = now;
    return result;
  }

  buildPromptContext(message, project, inspection) {
    const mode = this.detectMode(message);
    const goals = this.extractGoals(message);
    const task = this.taskStore.get();
    const data = { mode, goals, task, project: project || null, inspection: inspection || null };

    return [
      "DEVELOPER AGENT — TASK ORCHESTRATION:",
      "",
      JSON.stringify(data, null, 2),
      "",
      "ATURAN DEVELOPER AGENT:",
      "1. Project aktif adalah sumber kebenaran utama untuk kondisi saat ini.",
      "2. Periksa bukti filesystem, Project State, Active Context, dan telemetry sebelum membuat klaim teknis.",
      "3. Jangan mengarang file, dependency, command output, error, progress, atau hasil test.",
      "4. Untuk debugging, bedakan gejala, bukti, hipotesis, dan penyebab yang sudah terbukti.",
      "5. Untuk perubahan kode, pertahankan fitur stabil dan ubah hanya bagian yang diperlukan.",
      "6. Untuk implementasi besar, buat urutan kerja yang dapat diverifikasi dan jangan melompati validasi.",
      "7. Berikan command Termux yang siap copy-paste bila user perlu menjalankannya.",
      "8. Bila perlu mengubah file, berikan isi file lengkap atau patch yang aman dan jelas.",
      "9. Setelah perubahan, selalu sertakan cara test dan hasil yang diharapkan.",
      "10. Jangan mengklaim perubahan sudah dijalankan oleh user sebelum user memberikan outputnya.",
      "11. Jangan menjalankan command atau mengubah filesystem secara otomatis hanya karena user meminta rencana.",
      "12. Ikuti pola kerja: pahami → rencanakan → ubah → test → analisis hasil → lanjutkan.",
      "13. Jika bukti tidak cukup, katakan data belum tersedia daripada menebak.",
      "14. Untuk request sederhana, jangan membuat rencana berlebihan; jawab langsung dengan konteks yang relevan.",
      "15. Jika task state berstatus blocked, jelaskan blocker sebelum membuat langkah baru.",
      "16. Jangan menganggap target file sudah berubah hanya karena instruksi perubahan telah diberikan."
    ].join("\n");
  }
}

module.exports = DeveloperAgent;
