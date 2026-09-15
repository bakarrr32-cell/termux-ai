const crypto = require("crypto");

class RuntimeIntelligence {
  constructor() {
    this.startedAt = new Date().toISOString();

    this.stats = {
      chat: this.createOperationStats(),
      stream: this.createOperationStats()
    };

    this.events = [];
    this.maxEvents = 50;

    this.lastError = null;
    this.lastSuccess = null;
  }

  createOperationStats() {
    return {
      total: 0,
      success: 0,
      failed: 0,
      totalLatencyMs: 0,
      lastLatencyMs: null,
      minLatencyMs: null,
      maxLatencyMs: null
    };
  }

  createRequestId(operation) {
    return (
      operation +
      "-" +
      crypto.randomBytes(6).toString("hex")
    );
  }

  now() {
    return new Date().toISOString();
  }

  sanitizeError(error) {
    let message = String(
      error?.message ||
      error ||
      "Unknown error"
    );

    message = message
      .replace(
        /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
        "Bearer [REDACTED]"
      )
      .replace(
        /(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi,
        "$1=[REDACTED]"
      );

    return message.slice(0, 1000);
  }

  classifyError(error) {
    const message =
      this.sanitizeError(error).toLowerCase();

    if (
      message.includes("timeout") ||
      message.includes("timed out") ||
      message.includes("504")
    ) {
      return "timeout";
    }

    if (
      message.includes("401") ||
      message.includes("403") ||
      message.includes("api key") ||
      message.includes("authentication")
    ) {
      return "authentication";
    }

    if (
      message.includes("429") ||
      message.includes("rate limit")
    ) {
      return "rate_limit";
    }

    if (
      message.includes("500") ||
      message.includes("502") ||
      message.includes("503") ||
      message.includes("provider error")
    ) {
      return "provider";
    }

    if (
      message.includes("json") ||
      message.includes("parse") ||
      message.includes("format response")
    ) {
      return "parsing";
    }

    if (
      message.includes("stream") ||
      message.includes("response body")
    ) {
      return "stream";
    }

    return "application";
  }

  addEvent(event) {
    this.events.push({
      ...event,
      timestamp: this.now()
    });

    if (this.events.length > this.maxEvents) {
      this.events =
        this.events.slice(-this.maxEvents);
    }
  }

  start(operation = "chat") {
    const normalized =
      operation === "stream"
        ? "stream"
        : "chat";

    const started = Date.now();
    const requestId =
      this.createRequestId(normalized);

    this.stats[normalized].total++;

    this.addEvent({
      type: "request_started",
      operation: normalized,
      requestId
    });

    return {
      started,
      requestId,
      operation: normalized
    };
  }

  recordLatency(data, latency) {
    data.totalLatencyMs += latency;
    data.lastLatencyMs = latency;

    if (
      data.minLatencyMs === null ||
      latency < data.minLatencyMs
    ) {
      data.minLatencyMs = latency;
    }

    if (
      data.maxLatencyMs === null ||
      latency > data.maxLatencyMs
    ) {
      data.maxLatencyMs = latency;
    }
  }

  success(operation, request) {
    const normalized =
      operation === "stream"
        ? "stream"
        : "chat";

    const started =
      typeof request === "object"
        ? request.started
        : request;

    const requestId =
      typeof request === "object"
        ? request.requestId
        : null;

    const latency =
      Math.max(0, Date.now() - started);

    const data =
      this.stats[normalized];

    data.success++;

    this.recordLatency(
      data,
      latency
    );

    this.lastSuccess = {
      operation: normalized,
      requestId,
      timestamp: this.now(),
      latencyMs: latency
    };

    this.addEvent({
      type: "request_success",
      operation: normalized,
      requestId,
      latencyMs: latency
    });

    return latency;
  }

  failure(operation, request, error) {
    const normalized =
      operation === "stream"
        ? "stream"
        : "chat";

    const started =
      typeof request === "object"
        ? request.started
        : request;

    const requestId =
      typeof request === "object"
        ? request.requestId
        : null;

    const latency =
      Math.max(0, Date.now() - started);

    const message =
      this.sanitizeError(error);

    const classification =
      this.classifyError(error);

    const data =
      this.stats[normalized];

    data.failed++;

    this.recordLatency(
      data,
      latency
    );

    this.lastError = {
      operation: normalized,
      requestId,
      timestamp: this.now(),
      latencyMs: latency,
      classification,
      message
    };

    this.addEvent({
      type: "request_failed",
      operation: normalized,
      requestId,
      latencyMs: latency,
      classification,
      error: message
    });

    return latency;
  }

  getOperationStats(operation) {
    const data =
      this.stats[operation];

    if (!data) {
      return null;
    }

    const completed =
      data.success + data.failed;

    return {
      total: data.total,
      success: data.success,
      failed: data.failed,
      inFlight:
        Math.max(
          0,
          data.total - completed
        ),
      successRate:
        completed > 0
          ? Number(
              (
                (data.success /
                  completed) *
                100
              ).toFixed(2)
            )
          : null,
      averageLatencyMs:
        completed > 0
          ? Number(
              (
                data.totalLatencyMs /
                completed
              ).toFixed(3)
            )
          : null,
      minLatencyMs:
        data.minLatencyMs,
      maxLatencyMs:
        data.maxLatencyMs,
      lastLatencyMs:
        data.lastLatencyMs
    };
  }

  getRecentEvents(limit = 20) {
    const safeLimit =
      Math.max(
        1,
        Math.min(
          Number(limit) || 20,
          this.maxEvents
        )
      );

    return this.events.slice(-safeLimit);
  }

  getRecentCompletedEvents(limit = 20) {
    return this.events
      .filter(event =>
        event.type === "request_success" ||
        event.type === "request_failed"
      )
      .slice(-limit);
  }

  getErrorHistory(limit = 10) {
    return this.events
      .filter(
        event =>
          event.type === "request_failed"
      )
      .slice(-limit);
  }

  getPerformanceSummary() {
    const operations = [
      this.getOperationStats("chat"),
      this.getOperationStats("stream")
    ];

    const completed = operations.reduce(
      (sum, item) =>
        sum + item.success + item.failed,
      0
    );

    const totalLatency =
      this.stats.chat.totalLatencyMs +
      this.stats.stream.totalLatencyMs;

    return {
      completedRequests: completed,
      totalLatencyMs: totalLatency,
      averageLatencyMs:
        completed > 0
          ? Number(
              (
                totalLatency /
                completed
              ).toFixed(3)
            )
          : null,
      slowestRequestMs:
        Math.max(
          this.stats.chat.maxLatencyMs || 0,
          this.stats.stream.maxLatencyMs || 0
        ) || null,
      fastestRequestMs:
        completed > 0
          ? Math.min(
              this.stats.chat.minLatencyMs ??
                Infinity,
              this.stats.stream.minLatencyMs ??
                Infinity
            )
          : null
    };
  }

  getHealth() {
    const chat =
      this.getOperationStats("chat");

    const stream =
      this.getOperationStats("stream");

    const total =
      chat.total + stream.total;

    const success =
      chat.success + stream.success;

    const failed =
      chat.failed + stream.failed;

    const completed =
      success + failed;

    let status = "idle";

    if (failed > 0 && success === 0) {
      status = "degraded";
    } else if (failed > 0) {
      status = "warning";
    } else if (success > 0) {
      status = "healthy";
    }

    return {
      status,
      totalRequests: total,
      successfulRequests: success,
      failedRequests: failed,
      inFlight:
        Math.max(
          0,
          total - completed
        ),
      successRate:
        completed > 0
          ? Number(
              (
                (success /
                  completed) *
                100
              ).toFixed(2)
            )
          : null,
      chat,
      stream
    };
  }

  getSnapshot(engineInfo = null) {
    return {
      runtime: {
        startedAt: this.startedAt,
        now: this.now(),
        uptimeSeconds:
          Math.round(process.uptime())
      },

      process: {
        pid: process.pid,
        node: process.version,
        platform: process.platform,
        memory: {
          rss: process.memoryUsage().rss,
          heapUsed:
            process.memoryUsage().heapUsed,
          heapTotal:
            process.memoryUsage().heapTotal
        }
      },

      provider:
        engineInfo || null,

      health:
        this.getHealth(),

      performance:
        this.getPerformanceSummary(),

      lastSuccess:
        this.lastSuccess,

      lastError:
        this.lastError,

      recentEvents:
        this.getRecentEvents(20),

      recentCompletedRequests:
        this.getRecentCompletedEvents(20),

      recentErrors:
        this.getErrorHistory(10)
    };
  }

  buildPromptContext(engineInfo = null) {
    const snapshot =
      this.getSnapshot(engineInfo);

    return [
      "RUNTIME INTELLIGENCE — OBSERVASI RUNTIME AKTUAL:",
      "",
      JSON.stringify(
        snapshot,
        null,
        2
      ),
      "",
      "ATURAN RUNTIME:",
      "1. Data ini adalah telemetry runtime aktual dari proses assistant saat ini.",
      "2. Bedakan request chat dan stream.",
      "3. Total request harus konsisten dengan success + failed + inFlight.",
      "4. Gunakan requestId sebagai identitas request jika tersedia.",
      "5. Gunakan recentCompletedRequests untuk menganalisis request yang sudah selesai.",
      "6. Gunakan recentErrors untuk mengetahui error runtime yang benar-benar tercatat.",
      "7. Jangan menghapus atau mengabaikan historical lastError hanya karena request berikutnya berhasil.",
      "8. Error adalah bukti bahwa error tersebut terjadi pada runtime, bukan otomatis bukti source code adalah penyebabnya.",
      "9. Timeout, provider error, authentication, rate limit, parsing, dan stream error harus disebut sesuai classification yang tercatat.",
      "10. Jangan mengarang status server, provider, browser, endpoint, atau request yang tidak tercatat.",
      "11. Jangan menampilkan API key, bearer token, secret, password, atau credential.",
      "12. Jika status idle, artinya belum ada request yang tercatat sejak proses runtime ini dimulai.",
      "13. Bedakan runtime telemetry dari filesystem, source code, Project State, Active Context, dan conversation history.",
      "14. Jika user meminta data yang tidak tersedia, katakan bahwa data tersebut tidak tersedia.",
      "15. Jangan menyimpulkan bahwa server mati hanya karena runtime idle.",
      "16. Jangan menyimpulkan penyebab error hanya dari classification; gunakan pesan error dan bukti lain yang tersedia.",
      "17. Saat menjelaskan performa, gunakan angka telemetry aktual dan jangan membuat angka baru."
    ].join("\n");
  }
}

module.exports = RuntimeIntelligence;
