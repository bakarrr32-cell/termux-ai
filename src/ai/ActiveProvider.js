const fs = require("fs");
const path = require("path");
const ProviderManager = require("./ProviderManager");

class ActiveProvider {
  constructor(
    activeFile = "config/active.json",
    providersDirectory = "config/providers"
  ) {
    this.activeFile = path.resolve(activeFile);
    this.manager = new ProviderManager(providersDirectory);
  }

  getActiveName() {
    if (!fs.existsSync(this.activeFile)) {
      throw new Error("config/active.json tidak ditemukan.");
    }

    const config = JSON.parse(
      fs.readFileSync(this.activeFile, "utf8")
    );

    if (!config.provider) {
      throw new Error("Provider aktif belum ditentukan.");
    }

    return config.provider;
  }

  getConfig() {
    const name = this.getActiveName();
    return this.manager.load(name);
  }
}

module.exports = ActiveProvider;
