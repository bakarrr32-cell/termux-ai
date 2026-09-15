
const ProjectScanner = require("./ProjectScanner");
const ProjectState = require("./ProjectState");

class ProjectIntelligence {
  constructor(root = process.cwd()) {
    this.scanner = new ProjectScanner(root);
    this.state = new ProjectState();
  }

  inspect() {
    const scan = this.scanner.scan();

    return {
      projectState: this.state.getSummary(),
      project: {
        name: scan.package
          ? scan.package.name
          : null,

        version: scan.package
          ? scan.package.version
          : null,

        description: scan.package
          ? scan.package.description
          : null
      },

      files: {
        total: scan.files.total,
        entryPoints: scan.files.entries,
        importantFiles: scan.files.important,
        javascriptFiles: scan.files.source.javascriptFiles
      },

      git: scan.git,

      errors: scan.errors
    };
  }

  buildPromptContext() {
    const data = this.inspect();

    return [
      "PROJECT INTELLIGENCE — KONDISI PROJECT SEBENARNYA:",
      "",
      JSON.stringify(data, null, 2),
      "",
      "Gunakan data ini sebagai informasi keadaan project saat ini.",
      "Jangan mengarang file, dependency, git status, error, atau progress.",
      "Project State menunjukkan progress yang tersimpan.",
      "Scanner menunjukkan kondisi filesystem saat scan.",
      "Jika keduanya berbeda, jelaskan perbedaannya dan jangan mengarang."
    ].join("\n");
  }
}

module.exports = ProjectIntelligence;
