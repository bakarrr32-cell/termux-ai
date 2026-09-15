class ContextBudget {
  constructor(options = {}) {
    this.limits = {
      historyMessages: options.historyMessages || 20,
      memories: options.memories || 5,
      rerankedMemories: options.rerankedMemories || 3,
      maxMemoryChars: options.maxMemoryChars || 7000,
      maxHistoryChars: options.maxHistoryChars || 18000,
      maxProjectChars: options.maxProjectChars || 12000,
      maxTotalContextChars: options.maxTotalContextChars || 30000
    };
  }

  trimText(value, max) {
    const text = String(value || "");
    if (text.length <= max) return text;
    return text.slice(0, Math.max(0, max - 80)) + "\n...[context dipotong]...";
  }

  history(messages) {
    const source = Array.isArray(messages) ? messages : [];
    const recent = source.slice(-this.limits.historyMessages);
    let used = 0;
    const result = [];

    for (let i = recent.length - 1; i >= 0; i--) {
      const message = recent[i];
      const content = this.trimText(message.content, 4000);
      const size = content.length + 40;
      if (result.length > 0 && used + size > this.limits.maxHistoryChars) break;
      result.unshift({ role: message.role, content });
      used += size;
    }
    return result;
  }

  memories(memories) {
    return (Array.isArray(memories) ? memories : [])
      .slice(0, this.limits.memories)
      .map(memory => ({
        ...memory,
        content: this.trimText(memory.content, Math.floor(this.limits.maxMemoryChars / Math.max(1, this.limits.memories)))
      }));
  }

  project(value) {
    return this.trimText(JSON.stringify(value || null, null, 2), this.limits.maxProjectChars);
  }
  messages(messages, maxTotalChars = this.limits.maxTotalContextChars) {
    const source = Array.isArray(messages) ? messages : [];
    const normalized = source.map(message => ({
      role: message.role === "assistant" ? "assistant" : message.role === "user" ? "user" : "system",
      content: String(message.content || "")
    }));
    const result = [];
    let used = 0;
    const systems = normalized.filter(m => m.role === "system");
    const conversational = normalized.filter(m => m.role !== "system");
    for (const message of systems) {
      const content = this.trimText(message.content, Math.min(9000, maxTotalChars));
      const size = content.length + 40;
      if (used + size > maxTotalChars) break;
      result.push({ role: "system", content });
      used += size;
    }
    const remaining = Math.max(0, maxTotalChars - used);
    const recent = [];
    let recentUsed = 0;
    for (let i = conversational.length - 1; i >= 0; i--) {
      const message = conversational[i];
      const content = this.trimText(message.content, Math.min(5000, Math.max(0, remaining)));
      const size = content.length + 40;
      if (recent.length && recentUsed + size > remaining) break;
      if (!recent.length && size > remaining) {
        const maxContent = Math.max(0, remaining - 40);
        recent.unshift({ role: message.role, content: this.trimText(content, maxContent) });
        break;
      }
      recent.unshift({ role: message.role, content });
      recentUsed += size;
    }
    return result.concat(recent);
  }

  stats(messages) {
    const source = Array.isArray(messages) ? messages : [];
    const chars = source.reduce((sum, message) => sum + String(message.content || "").length + 40, 0);
    return {
      messages: source.length,
      chars,
      limit: this.limits.maxTotalContextChars,
      withinBudget: chars <= this.limits.maxTotalContextChars
    };
  }
}

module.exports = ContextBudget;
