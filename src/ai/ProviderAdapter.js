class ProviderAdapter {
  constructor(config) {
    this.config = config;
  }

  get endpoint() {
    return `${this.config.baseURL.replace(/\/$/, "")}/chat/completions`;
  }

  buildBody(messages, options = {}) {
    const body = {
      model: this.config.model,
      messages
    };

    if (options.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    if (options.maxTokens !== undefined) {
      body.max_tokens = options.maxTokens;
    }

    return body;
  }

  async send(messages, options = {}) {
    const apiKey = process.env[this.config.apiKeyEnv];

    if (!apiKey) {
      throw new Error(
        `API key belum tersedia. Set environment variable ${this.config.apiKeyEnv}.`
      );
    }

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(
        this.buildBody(messages, options)
      )
    });

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(
        `Response provider bukan JSON:\n${text.slice(0, 500)}`
      );
    }

    if (!response.ok) {
      const message =
        data?.error?.message ||
        data?.message ||
        `HTTP ${response.status}`;

      throw new Error(`Provider error: ${message}`);
    }

    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error(
        "Format response tidak dikenali: choices[0].message.content tidak ditemukan."
      );
    }

    return content;
  }

  async sendStream(messages, options = {}, onToken) {
    const apiKey = process.env[this.config.apiKeyEnv];

    if (!apiKey) {
      throw new Error(
        `API key belum tersedia. Set environment variable ${this.config.apiKeyEnv}.`
      );
    }

    const body = this.buildBody(messages, options);
    body.stream = true;

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          `Provider error HTTP ${response.status}: ${text.slice(0, 500)}`
        );
      }

      throw new Error(
        data?.error?.message ||
        data?.message ||
        `Provider error HTTP ${response.status}`
      );
    }

    if (!response.body) {
      throw new Error("Provider tidak mengembalikan response body.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, {
        stream: true
      });

      const lines = buffer.split("\n");

      buffer = lines.pop() || "";

      for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line || !line.startsWith("data:")) {
          continue;
        }

        const payload = line.slice(5).trim();

        if (payload === "[DONE]") {
          continue;
        }

        let data;

        try {
          data = JSON.parse(payload);
        } catch {
          continue;
        }

        const content =
          data?.choices?.[0]?.delta?.content;

        if (content) {
          await onToken(content);
        }
      }
    }

    if (buffer.trim().startsWith("data:")) {
      const payload = buffer.trim().slice(5).trim();

      if (payload && payload !== "[DONE]") {
        try {
          const data = JSON.parse(payload);

          const content =
            data?.choices?.[0]?.delta?.content;

          if (content) {
            await onToken(content);
          }
        } catch {
          // Abaikan chunk terakhir yang tidak lengkap.
        }
      }
    }
  }
}

module.exports = ProviderAdapter;
