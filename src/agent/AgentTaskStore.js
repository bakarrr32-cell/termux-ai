const fs = require("fs");
const path = require("path");

class AgentTaskStore {
  constructor(file = "data/agent-task.json") {
    this.file = path.resolve(file);
  }

  empty() {
    return {
      status: "idle",
      mode: null,
      objective: "",
      plan: [],
      phase: "idle",
      createdAt: null,
      updatedAt: null,
      lastResult: null,
      blockers: [],
      targetFiles: [],
      tests: [],
      evidence: [],
      verification: null
    };
  }

  load() {
    try {
      if (!fs.existsSync(this.file)) return this.empty();
      const data = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return { ...this.empty(), ...data };
    } catch (error) {
      return this.empty();
    }
  }

  save(task) {
    const directory = path.dirname(this.file);
    if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
    const next = {
      ...this.empty(),
      ...task,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(this.file, JSON.stringify(next, null, 2));
    return next;
  }

  start(objective, mode = "explanation") {
    const now = new Date().toISOString();
    return this.save({
      status: "active",
      mode,
      objective: String(objective || ""),
      plan: [],
      phase: "analysis",
      createdAt: now,
      lastResult: null,
      blockers: [],
      targetFiles: [],
      tests: [],
      evidence: [],
      verification: null
    });
  }

  update(patch = {}) {
    return this.save({ ...this.load(), ...patch });
  }

  setPlan(plan) {
    return this.update({
      plan: Array.isArray(plan) ? plan.map(String) : [],
      phase: "planned"
    });
  }

  addEvidence(evidence) {
    const task = this.load();
    const list = Array.isArray(task.evidence) ? task.evidence : [];
    return this.update({ evidence: [...list, String(evidence || "")].filter(Boolean).slice(-20) });
  }

  setVerification(result) {
    return this.update({
      verification: result || null,
      phase: "verified"
    });
  }

  complete(result = null) {
    return this.update({ status: "completed", phase: "completed", lastResult: result });
  }

  fail(error) {
    return this.update({
      status: "blocked",
      phase: "blocked",
      blockers: [String(error || "Unknown error")]
    });
  }

  clear() {
    return this.save(this.empty());
  }

  get() {
    return this.load();
  }
}

module.exports = AgentTaskStore;
