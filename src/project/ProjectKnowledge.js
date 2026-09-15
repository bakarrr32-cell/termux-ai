const fs = require("fs");
const path = require("path");

class ProjectKnowledge {
  constructor(file = "config/project.json") {
    this.file = path.resolve(file);
    this.data = this.load();
  }

  load() {
    if (!fs.existsSync(this.file)) {
      return {
        root: "~/termux-ai",
        stack: {
          runtime: "Node.js",
          language: "JavaScript",
          moduleSystem: "CommonJS"
        },
        ai: {
          provider: "neokens",
          baseURL: "https://api.v2.neokens.com/v1",
          model: "gpt-5.6-luna",
          apiKeyEnv: "NEOKENS_KEY"
        }
      };
    }

    try {
      return JSON.parse(
        fs.readFileSync(this.file, "utf8")
      );
    } catch {
      throw new Error("config/project.json tidak valid.");
    }
  }

  save() {
    const directory = path.dirname(this.file);

    fs.mkdirSync(directory, {
      recursive: true
    });

    fs.writeFileSync(
      this.file,
      JSON.stringify(this.data, null, 2)
    );
  }

  get() {
    return this.data;
  }

  update(changes) {
    this.data = {
      ...this.data,
      ...changes
    };

    this.save();
  }
}

module.exports = ProjectKnowledge;
