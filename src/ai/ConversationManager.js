const MemoryManager = require("../memory/MemoryManager");
const ProjectState = require("../project/ProjectState");

class ConversationManager {
  constructor(
    memory = new MemoryManager("data/conversation.json")
  ) {
    this.memory = memory;
    this.project = new ProjectState();
  }

  addUserMessage(content) {
    this.memory.add("user", content);
  }

  addAssistantMessage(content) {
    this.memory.add("assistant", content);
  }

  getHistory(limit = 20) {
    return this.memory.getRecent(limit);
  }

  getContext(limit = 20) {
    return this.getHistory(limit).map(message => ({
      role: message.role,
      content: message.content
    }));
  }

  getConversationSummary() {
    return this.memory.getSummary();
  }

  setConversationSummary(summary, summarizedCount) {
    this.memory.setSummary(summary, summarizedCount);
  }

  getLongTermContext(recentLimit = 20) {
    const summary = this.getConversationSummary();
    const recent = this.getContext(recentLimit);

    const context = [];

    if (summary) {
      context.push({
        role: "system",
        content: [
          "RINGKASAN PERCAKAPAN SEBELUMNYA:",
          "",
          summary,
          "",
          "Gunakan ringkasan ini sebagai konteks percakapan lama."
        ].join("\n")
      });
    }

    context.push(...recent);

    return context;
  }

  getExportData() {
    const rawMessages = this.memory.getAll();
    const messages = (Array.isArray(rawMessages) ? rawMessages : []).map(message => {
      const exported = {
        role: message && message.role ? String(message.role) : '',
        content: message && message.content != null ? String(message.content) : ''
      };

      if (message && message.timestamp) {
        exported.timestamp = String(message.timestamp);
      }

      return exported;
    });

    return {
      format: 'termux-ai-conversation',
      version: 1,
      exportedAt: new Date().toISOString(),
      project: this.getProjectContext(),
      summary: this.getConversationSummary() || '',
      messages
    };
  }

  getProjectContext() {
    return this.project.getSummary();
  }

  getFullContext(limit = 20) {
    return {
      conversation: this.getLongTermContext(limit),
      project: this.getProjectContext()
    };
  }

  clear() {
    this.memory.clear();

    this.project.clear();
  }
}

module.exports = ConversationManager;
