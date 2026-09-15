const fs = require("fs");
const path = require("path");

class ProjectState {
  constructor(file = "data/project-state.json") {
    this.file = path.resolve(file);

    this.name = null;
    this.goal = null;
    this.steps = [];
    this.currentStep = 0;
    this.status = "idle";

    this.load();
  }

  load() {
    try {
      if (!fs.existsSync(this.file)) {
        return;
      }

      const data = JSON.parse(
        fs.readFileSync(this.file, "utf8")
      );

      this.name =
        typeof data.name === "string"
          ? data.name
          : null;

      this.goal =
        typeof data.goal === "string"
          ? data.goal
          : null;

      this.steps =
        Array.isArray(data.steps)
          ? data.steps
          : [];

      this.currentStep =
        Number.isInteger(data.currentStep)
          ? data.currentStep
          : 0;

      this.status =
        typeof data.status === "string"
          ? data.status
          : "idle";
    } catch (error) {
      console.log(
        "ProjectState > Gagal membaca state, menggunakan state baru."
      );
    }
  }

  save() {
    const directory = path.dirname(this.file);

    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, {
        recursive: true
      });
    }

    fs.writeFileSync(
      this.file,
      JSON.stringify(
        {
          name: this.name,
          goal: this.goal,
          steps: this.steps,
          currentStep: this.currentStep,
          status: this.status,
          updatedAt: new Date().toISOString()
        },
        null,
        2
      )
    );
  }

  create(name, goal, steps) {
    this.name = name;
    this.goal = goal;

    this.steps = steps.map((title, index) => ({
      id: index + 1,
      title,
      status: index === 0 ? "active" : "pending"
    }));

    this.currentStep = 0;
    this.status = "active";

    this.save();
  }

  completeCurrentStep() {
    if (!this.steps[this.currentStep]) {
      return;
    }

    this.steps[this.currentStep].status = "completed";

    if (this.currentStep < this.steps.length - 1) {
      this.currentStep++;

      this.steps[this.currentStep].status = "active";
    } else {
      this.status = "completed";
    }

    this.save();
  }

  getProgress() {
    if (!this.steps.length) {
      return 0;
    }

    const completed = this.steps.filter(
      step => step.status === "completed"
    ).length;

    return Math.round(
      (completed / this.steps.length) * 100
    );
  }

  getCurrentStep() {
    return this.steps[this.currentStep] || null;
  }

  getSummary() {
    return {
      name: this.name,
      goal: this.goal,
      status: this.status,
      progress: this.getProgress(),
      currentStep: this.getCurrentStep(),
      steps: this.steps
    };
  }

  clear() {
    this.name = null;
    this.goal = null;
    this.steps = [];
    this.currentStep = 0;
    this.status = "idle";

    this.save();
  }
}

module.exports = ProjectState;
