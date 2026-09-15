const fs = require("fs");
const path = require("path");
const cp = require("child_process");

class DeepProjectIntelligence {
  constructor(root = process.cwd()) {
    this.root = path.resolve(root);

    this.ignoredDirs = new Set([
      ".git",
      "node_modules",
      ".cache",
      ".npm",
      ".next",
      "dist",
      "build",
      "coverage",
      "logs",
      "backups"
    ]);

    this.secretNames = new Set([
      ".env",
      ".env.local",
      ".env.production",
      ".env.development",
      ".env.test",
      "credentials.json",
      "secrets.json"
    ]);

    this.sourceExtensions = new Set([
      ".js",
      ".mjs",
      ".cjs",
      ".ts",
      ".tsx",
      ".jsx",
      ".json",
      ".html",
      ".css"
    ]);

    this.maxFiles = 250;
    this.maxFileSize = 100 * 1024;
    this.maxSourceFiles = 35;
    this.maxSourceChars = 12000;
  }

  isSecret(file) {
    const name = path.basename(file).toLowerCase();

    if (this.secretNames.has(name)) {
      return true;
    }

    return (
      name.startsWith(".env.") ||
      name.includes("credential") ||
      name.includes("secret")
    );
  }

  isIgnored(relative) {
    const parts = relative.split(path.sep);

    return parts.some(part =>
      this.ignoredDirs.has(part)
    );
  }

  walk(dir = this.root, result = []) {
    if (result.length >= this.maxFiles) {
      return result;
    }

    let entries = [];

    try {
      entries = fs.readdirSync(dir, {
        withFileTypes: true
      });
    } catch {
      return result;
    }

    for (const entry of entries) {
      if (result.length >= this.maxFiles) break;

      const full = path.join(dir, entry.name);
      const relative = path.relative(
        this.root,
        full
      );

      if (
        !relative ||
        this.isIgnored(relative)
      ) {
        continue;
      }

      if (entry.isDirectory()) {
        this.walk(full, result);
        continue;
      }

      if (!entry.isFile()) continue;
      if (this.isSecret(relative)) continue;

      const ext =
        path.extname(entry.name).toLowerCase();

      if (
        ext !== ".json" &&
        !this.sourceExtensions.has(ext)
      ) {
        continue;
      }

      try {
        const stat = fs.statSync(full);

        if (stat.size <= this.maxFileSize) {
          result.push({
            path: relative,
            size: stat.size,
            extension: ext
          });
        }
      } catch {}
    }

    return result;
  }

  readText(file) {
    if (this.isSecret(file)) return null;

    const full = path.resolve(
      this.root,
      file
    );

    if (!full.startsWith(this.root + path.sep)) {
      return null;
    }

    try {
      const stat = fs.statSync(full);

      if (
        !stat.isFile() ||
        stat.size > this.maxFileSize
      ) {
        return null;
      }

      return fs.readFileSync(
        full,
        "utf8"
      );
    } catch {
      return null;
    }
  }

  readPackage() {
    const file = path.join(
      this.root,
      "package.json"
    );

    try {
      return JSON.parse(
        fs.readFileSync(file, "utf8")
      );
    } catch {
      return null;
    }
  }

  getDependencies() {
    const pkg = this.readPackage();

    if (!pkg) {
      return {
        dependencies: [],
        devDependencies: []
      };
    }

    return {
      dependencies: Object.keys(
        pkg.dependencies || {}
      ),
      devDependencies: Object.keys(
        pkg.devDependencies || {}
      )
    };
  }

  getEntryPoints(files) {
    const names = new Set([
      "server.js",
      "index.js",
      "app.js",
      "main.js"
    ]);

    return files
      .filter(item => {
        const base =
          path.basename(item.path);

        return (
          names.has(base) ||
          item.path.startsWith("src/index.") ||
          item.path.startsWith("src/main.")
        );
      })
      .map(item => item.path);
  }

  analyzeImports(content) {
    if (!content) return [];

    const found = new Set();

    const patterns = [
      /require\(["']([^"']+)["']\)/g,
      /from\s+["']([^"']+)["']/g,
      /import\s+["']([^"']+)["']/g
    ];

    for (const regex of patterns) {
      let match;

      while ((match = regex.exec(content))) {
        found.add(match[1]);
      }
    }

    return [...found].slice(0, 50);
  }

  analyzeSource(file) {
    const content =
      this.readText(file.path);

    if (content === null) {
      return null;
    }

    const lines =
      content.split(/\r?\n/);

    const imports =
      this.analyzeImports(content);

    const functions =
      (
        content.match(
          /(?:async\s+)?function\s+[A-Za-z0-9_$]+|(?:async\s+)?[A-Za-z0-9_$]+\s*=\s*(?:async\s*)?\(/g
        ) || []
      ).length;

    const classes =
      (
        content.match(
          /\bclass\s+[A-Za-z0-9_$]+/g
        ) || []
      ).length;

    const errors =
      (
        content.match(
          /\b(?:TODO|FIXME|HACK|BUG|ERROR|throw new Error)\b/gi
        ) || []
      ).length;

    return {
      path: file.path,
      lines: lines.length,
      chars: content.length,
      imports,
      functions,
      classes,
      markers: errors,
      preview: content.slice(
        0,
        this.maxSourceChars
      )
    };
  }

  getSourceAnalysis(files) {
    const candidates = files
      .filter(item =>
        this.sourceExtensions.has(
          item.extension
        )
      )
      .filter(item =>
        !this.isSecret(item.path)
      );

    return candidates
      .slice(0, this.maxSourceFiles)
      .map(item =>
        this.analyzeSource(item)
      )
      .filter(Boolean);
  }

  getGit() {
    try {
      const inside =
        run(
          "git",
          ["rev-parse", "--is-inside-work-tree"]
        ).trim();

      if (inside !== "true") {
        return {
          available: false,
          reason: "not-a-repository"
        };
      }

      const status =
        run(
          "git",
          ["status", "--short"]
        ).trim();

      const branch =
        run(
          "git",
          ["branch", "--show-current"]
        ).trim();

      let diff = "";

      try {
        diff =
          run(
            "git",
            ["diff", "--stat"]
          ).trim();
      } catch {}

      return {
        available: true,
        branch,
        changedFiles: status
          ? status.split(/\r?\n/)
          : [],
        diffStat: diff
      };
    } catch {
      return {
        available: false,
        reason: "git-unavailable"
      };
    }
  }

  getLogs() {
    const candidates = [
      "logs/error.log",
      "logs/app.log",
      "logs/server.log"
    ];

    const results = [];

    for (const file of candidates) {
      const content =
        this.readText(file);

      if (!content) continue;

      const lines =
        content.split(/\r?\n/)
          .filter(Boolean);

      const suspicious =
        lines.filter(line =>
          /error|exception|failed|fatal|uncaught|syntaxerror/i.test(line)
        );

      results.push({
        file,
        totalLines: lines.length,
        suspiciousLines:
          suspicious.slice(-20)
      });
    }

    return results;
  }

  getImportantFiles(files) {
    const priority = [
      "package.json",
      "server.js",
      "index.js",
      "src/index.js",
      "src/ai/Assistant.js",
      "src/ai/AIEngine.js",
      "src/ai/ConversationManager.js",
      "src/ai/SystemPrompt.js",
      "src/memory/MemoryManager.js",
      "src/memory/MemoryRetriever.js",
      "src/memory/MemoryReranker.js",
      "src/project/ProjectState.js",
      "src/project/ProjectController.js",
      "src/project/ProjectScanner.js",
      "src/project/ProjectIntelligence.js",
      "src/project/DeepProjectIntelligence.js"
    ];

    const existing =
      new Set(
        files.map(item => item.path)
      );

    return priority.filter(
      file => existing.has(file)
    );
  }

  inspect() {
    const files =
      this.walk();

    const pkg =
      this.readPackage();

    const dependencies =
      this.getDependencies();

    const sourceAnalysis =
      this.getSourceAnalysis(files);

    const entryPoints =
      this.getEntryPoints(files);

    const git =
      this.getGit();

    const logs =
      this.getLogs();

    const importantFiles =
      this.getImportantFiles(files);

    return {
      scannedAt:
        new Date().toISOString(),

      root: this.root,

      project: pkg
        ? {
            name: pkg.name || null,
            version: pkg.version || null,
            description:
              pkg.description || null,
            main: pkg.main || null
          }
        : null,

      dependencies,

      files: {
        count: files.length,
        important: importantFiles,
        entries: entryPoints,
        all: files
      },

      architecture: {
        sourceFiles:
          sourceAnalysis.map(item => ({
            path: item.path,
            lines: item.lines,
            chars: item.chars,
            imports: item.imports,
            functions: item.functions,
            classes: item.classes,
            markers: item.markers
          })),

        totalSourceFiles:
          sourceAnalysis.length
      },

      sourceDetails:
        sourceAnalysis,

      git,

      logs
    };
  }

  buildPromptContext(projectState = null) {
    const data =
      this.inspect();

    return [
      "DEEP PROJECT UNDERSTANDING — KONDISI AKTUAL PROJECT:",
      "",
      JSON.stringify(
        {
          scannedAt: data.scannedAt,
          root: data.root,
          project: data.project,
          dependencies: data.dependencies,
          files: data.files,
          architecture: data.architecture,
          sourceDetails: data.sourceDetails,
          git: data.git,
          logs: data.logs
        },
        null,
        2
      ),
      "",
      "PROJECT STATE:",
      "",
      JSON.stringify(
        projectState || null,
        null,
        2
      ),
      "",
      "ATURAN:",
      "1. Data ini berasal dari scan project aktual.",
      "2. Jangan mengarang file, dependency, error, fungsi, atau hubungan antar-file.",
      "3. Jika source file tidak dibaca atau tidak tersedia, katakan demikian.",
      "4. Jangan pernah menganggap file .env atau secret sebagai sumber informasi.",
      "5. Bedakan filesystem, source analysis, Git, logs, Project State, dan conversation history.",
      "6. Project State adalah sumber kebenaran untuk progress project.",
      "7. Active Context dan Project State mengalahkan history lama.",
      "8. Git yang tidak tersedia bukan berarti project bermasalah.",
      "9. Marker TODO/FIXME/ERROR bukan otomatis berarti runtime error.",
      "10. Jika ada ketidakpastian, jelaskan batasannya."
    ].join("\n");
  }
}

module.exports = DeepProjectIntelligence;
