const ProjectPlanner = require("./ProjectPlanner");
const AIPlanner = require("./AIPlanner");

class ProjectController {
  constructor(projectState, engine) {
    this.project = projectState;
    this.planner = new ProjectPlanner();
    this.aiPlanner = new AIPlanner(engine);
  }

  async createProject(name, goal) {
    const plan = await this.aiPlanner.createPlan(goal);

    this.project.create(
      plan.name || name,
      plan.goal || goal,
      plan.steps
    );

    return this.project.getSummary();
  }

  completeStep() {
    this.project.completeCurrentStep();

    return this.project.getSummary();
  }

  getStatus() {
    return this.project.getSummary();
  }
}

module.exports = ProjectController;
