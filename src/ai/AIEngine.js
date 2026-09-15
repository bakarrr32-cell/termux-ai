const ActiveProvider = require("./ActiveProvider");
const ProviderAdapter = require("./ProviderAdapter");
const RuntimeIntelligence = require("../runtime/RuntimeIntelligence");

class AIEngine {
  constructor() {
    this.activeProvider = new ActiveProvider();

    const config = this.activeProvider.getConfig();

    this.config = config;
    this.provider = new ProviderAdapter(config);
    this.runtime = new RuntimeIntelligence();
  }

  async chat(messages, options = {}) {
    const request =
      this.runtime.start("chat");

    try {
      const resolvedMessages =
        typeof messages === "function"
          ? await messages(request)
          : messages;

      const response =
        await this.provider.send(
          resolvedMessages,
          options
        );

      this.runtime.success(
        "chat",
        request
      );

      return response;
    } catch (error) {
      this.runtime.failure(
        "chat",
        request,
        error
      );

      throw error;
    }
  }

  async chatStream(messages, options = {}, onToken) {
    const request =
      this.runtime.start("stream");

    try {
      const resolvedMessages =
        typeof messages === "function"
          ? await messages(request)
          : messages;

      const response =
        await this.provider.sendStream(
          resolvedMessages,
          options,
          onToken
        );

      this.runtime.success(
        "stream",
        request
      );

      return response;
    } catch (error) {
      this.runtime.failure(
        "stream",
        request,
        error
      );

      throw error;
    }
  }

  getRuntime() {
    return this.runtime.getSnapshot(
      this.getInfo()
    );
  }

  getRuntimeContext() {
    return this.runtime.buildPromptContext(
      this.getInfo()
    );
  }

  getInfo() {
    return {
      provider: this.activeProvider.getActiveName(),
      model: this.config.model,
      endpoint: this.provider.endpoint
    };
  }
}

module.exports = AIEngine;
