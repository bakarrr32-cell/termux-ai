const ProjectState = require("../src/project/ProjectState");

const state = new ProjectState();
const project = state.getSummary();

if (!project.name) {
  throw new Error("Project State kosong; Step 2 tidak boleh ditandai selesai.");
}

const steps = Array.isArray(project.steps) ? project.steps.map(step => ({ ...step })) : [];
const current = steps.find(step => step.id === 2);

if (!current) {
  throw new Error("Step 2 tidak ditemukan di Project State.");
}

current.status = "completed";
const next = steps.find(step => step.status === "pending");
if (next) next.status = "active";

state.steps = steps;
state.currentStep = next ? steps.indexOf(next) : 1;
state.save();

console.log("[PASS] Step 2 ditandai completed setelah regression test.");
console.log("[NEXT]", next ? `Step ${next.id}: ${next.title}` : "Semua step selesai.");
