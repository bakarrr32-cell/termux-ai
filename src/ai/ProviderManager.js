const fs = require("fs");
const path = require("path");

class ProviderManager {
  constructor(directory = "config/providers") {
    this.directory = path.resolve(directory);
  }

  list() {
    if (!fs.existsSync(this.directory)) {
      return [];
    }

    return fs.readdirSync(this.directory)
      .filter(file => file.endsWith(".json"))
      .map(file => file.replace(".json", ""));
  }

  load(name) {
    const file = path.join(this.directory, `${name}.json`);

    if (!fs.existsSync(file)) {
      throw new Error(`Provider "${name}" tidak ditemukan.`);
    }

    return JSON.parse(
      fs.readFileSync(file, "utf8")
    );
  }
}

module.exports = ProviderManager;
