const fs = require("fs");
const path = require("path");

class MemoryManager {
  constructor(file = "data/memory.json") {
    this.file = path.resolve(file);

    this.summaryFile = path.join(
      path.dirname(this.file),
      `${path.basename(this.file, path.extname(this.file))}-summary.json`
    );

    this.memory = this.load();

    const summaryData = this.loadSummary();

    this.summary = summaryData.summary;
    this.summarizedCount = summaryData.summarizedCount;
  }

  load() {
    try {
      if (!fs.existsSync(this.file)) {
        return [];
      }

      const data = JSON.parse(
        fs.readFileSync(this.file, "utf8")
      );

      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.log(
        "Memory > Gagal membaca memory, membuat memory baru."
      );

      return [];
    }
  }

  loadSummary() {
    try {
      if (!fs.existsSync(this.summaryFile)) {
        return {
          summary: "",
          summarizedCount: 0
        };
      }

      const data = JSON.parse(
        fs.readFileSync(this.summaryFile, "utf8")
      );

      // Kompatibel dengan format summary lama.
      if (typeof data === "string") {
        return {
          summary: data,
          summarizedCount: 0
        };
      }

      return {
        summary:
          typeof data.summary === "string"
            ? data.summary
            : "",
        summarizedCount:
          Number.isInteger(data.summarizedCount)
            ? data.summarizedCount
            : 0
      };
    } catch (error) {
      console.log(
        "Memory > Gagal membaca summary, menggunakan summary kosong."
      );

      return {
        summary: "",
        summarizedCount: 0
      };
    }
  }

  save() {
    const directory = path.dirname(this.file);

    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    fs.writeFileSync(
      this.file,
      JSON.stringify(this.memory, null, 2)
    );
  }

  saveSummary(summary, summarizedCount = this.summarizedCount) {
    const directory = path.dirname(this.summaryFile);

    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    this.summary = String(summary || "");
    this.summarizedCount = Math.max(
      0,
      Number(summarizedCount) || 0
    );

    fs.writeFileSync(
      this.summaryFile,
      JSON.stringify(
        {
          summary: this.summary,
          summarizedCount: this.summarizedCount,
          updatedAt: new Date().toISOString()
        },
        null,
        2
      )
    );
  }

  add(role, content) {
    this.memory.push({
      role,
      content,
      timestamp: new Date().toISOString()
    });

    this.save();
  }

  getAll() {
    return this.memory;
  }

  getRecent(limit = 10) {
    return this.memory.slice(-limit);
  }

  getSummary() {
    return this.summary;
  }

  getSummarizedCount() {
    return this.summarizedCount;
  }

  setSummary(summary, summarizedCount = this.summarizedCount) {
    this.saveSummary(summary, summarizedCount);
  }

  clear() {
    this.memory = [];
    this.summary = "";
    this.summarizedCount = 0;

    this.save();
    this.saveSummary("", 0);
  }
}

module.exports = MemoryManager;
