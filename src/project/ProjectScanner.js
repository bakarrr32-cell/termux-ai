
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

class ProjectScanner {
  constructor(root = process.cwd()) {
    this.root = path.resolve(root);

    this.ignored = new Set([
      ".git",
      "node_modules",
      ".cache",
      ".npm",
      ".next",
      "dist",
      "build",
      "coverage",
      "logs"
    ]);

    this.maxFiles = 500;
    this.maxFileSize = 128 * 1024;

    this.textExtensions = new Set([
      ".js",
      ".cjs",
      ".mjs",
      ".json",
      ".html",
      ".css",
      ".md",
      ".txt",
      ".env.example",
      ".yml",
      ".yaml",
      ".sh"
    ]);
  }

  safeRelative(file) {
    return path.relative(this.root, file).replace(/\\/g, "/");
  }

  isSensitiveFile(name) {
    const lower = String(name || "").toLowerCase();
    return lower === ".env" ||
      lower.startsWith(".env.") && !lower.endsWith(".example") ||
      /(^|[._-])(secret|secrets|credential|credentials|token|private)([._-]|$)/i.test(lower);
  }

  walk(dir = this.root, results = []) {
    if (results.length >= this.maxFiles) return results;

    let entries = [];

    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return results;
    }

    for (const entry of entries) {
      if (results.length >= this.maxFiles) break;

      if (this.ignored.has(entry.name)) continue;
      if (this.isSensitiveFile(entry.name)) continue;

      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        this.walk(full, results);
        continue;
      }

      if (!entry.isFile()) continue;

      let stat;

      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }

      results.push({
        path: this.safeRelative(full),
        size: stat.size,
        extension: path.extname(entry.name).toLowerCase()
      });
    }

    return results;
  }

  readPackage() {
    const file = path.join(this.root, "package.json");

    if (!fs.existsSync(file)) return null;

    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  }

  git(args) {
    try {
      return execFileSync(
        "git",
        args,
        {
          cwd: this.root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"]
        }
      ).trim();
    } catch {
      return null;
    }
  }

  getGitStatus() {
    const inside = this.git([
      "rev-parse",
      "--is-inside-work-tree"
    ]);

    if (inside !== "true") {
      return {
        available: false
      };
    }

    const branch = this.git([
      "branch",
      "--show-current"
    ]);

    const status = this.git([
      "status",
      "--short"
    ]);

    const commit = this.git([
      "log",
      "-1",
      "--oneline"
    ]);

    return {
      available: true,
      branch: branch || null,
      clean: !status,
      changedFiles: status
        ? status
            .split("\n")
            .filter(Boolean)
            .slice(0, 100)
        : [],
      lastCommit: commit || null
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
      .filter(file =>
        names.has(path.basename(file.path))
      )
      .map(file => file.path);
  }

  getImportantFiles(files) {
    const patterns = [
      /^package\.json$/,
      /^server\.js$/,
      /^README/i,
      /^src\/ai\//,
      /^src\/project\//,
      /^src\/memory\//,
      /^config\//
    ];

    return files
      .filter(file =>
        patterns.some(pattern => pattern.test(file.path))
      )
      .slice(0, 100)
      .map(file => file.path);
  }

  getSourceSummary(files) {
    const source = files.filter(file =>
      [".js", ".cjs", ".mjs"].includes(file.extension)
    );

    const totalBytes = source.reduce(
      (sum, file) => sum + file.size,
      0
    );

    return {
      javascriptFiles: source.length,
      javascriptBytes: totalBytes
    };
  }

  readSource(filePath) {
    const full = path.resolve(this.root, filePath);

    if (!full.startsWith(this.root + path.sep)) {
      return null;
    }

    if (!fs.existsSync(full)) return null;

    let stat;

    try {
      stat = fs.statSync(full);
    } catch {
      return null;
    }

    if (!stat.isFile() || stat.size > this.maxFileSize) {
      return null;
    }

    const extension = path.extname(full).toLowerCase();

    if (!this.textExtensions.has(extension)) {
      return null;
    }

    try {
      return fs.readFileSync(full, "utf8");
    } catch {
      return null;
    }
  }

  findErrors() {
    const files = [
      "logs",
      "logs/app.log",
      "logs/error.log"
    ];

    const results = [];

    for (const relative of files) {
      const full = path.join(this.root, relative);

      if (!fs.existsSync(full)) continue;

      try {
        const stat = fs.statSync(full);

        if (!stat.isFile() || stat.size > this.maxFileSize) {
          continue;
        }

        const text = fs.readFileSync(full, "utf8");
        const lines = text
          .split("\n")
          .filter(line =>
            /error|exception|failed|failure|fatal|uncaught/i.test(line)
          )
          .slice(-20);

        results.push({
          file: relative,
          errors: lines
        });
      } catch {}
    }

    return results;
  }

  scan() {
    const files = this.walk();
    const pkg = this.readPackage();

    return {
      scannedAt: new Date().toISOString(),
      root: this.root,
      package: pkg
        ? {
            name: pkg.name || null,
            version: pkg.version || null,
            description: pkg.description || null,
            scripts: pkg.scripts || {},
            dependencies: Object.keys(
              pkg.dependencies || {}
            ),
            devDependencies: Object.keys(
              pkg.devDependencies || {}
            )
          }
        : null,

      files: {
        total: files.length,
        entries: this.getEntryPoints(files),
        important: this.getImportantFiles(files),
        source: this.getSourceSummary(files),
        all: files
      },

      git: this.getGitStatus(),
      errors: this.findErrors()
    };
  }

  buildContext() {
    const data = this.scan();

    return {
      scannedAt: data.scannedAt,

      projectRoot: data.root,

      package: data.package,

      fileStructure: {
        totalFiles: data.files.total,
        entryPoints: data.files.entries,
        importantFiles: data.files.important,
        javascriptFiles: data.files.source.javascriptFiles
      },

      git: data.git,

      recentErrors: data.errors
    };
  }
}

module.exports = ProjectScanner;
