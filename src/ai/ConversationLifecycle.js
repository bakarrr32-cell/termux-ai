class ConversationLifecycle {
  constructor(conversation, summarizer, options = {}) {
    this.conversation = conversation;
    this.summarizer = summarizer;
    this.minimumMessages = options.minimumMessages || 40;
    this.newMessagesRequired = options.newMessagesRequired || 20;
    this.running = false;
    this.pending = false;
  }

  recordAssistant(response) {
    this.conversation.addAssistantMessage(String(response || ""));
    this.scheduleSummary();
    return response;
  }

  scheduleSummary() {
    if (this.running) {
      this.pending = true;
      return;
    }

    this.running = true;
    Promise.resolve()
      .then(() => this.updateSummary())
      .catch(error => {
        console.error("AUTO SUMMARY ERROR:", error.message);
      })
      .finally(() => {
        this.running = false;
        if (this.pending) {
          this.pending = false;
          this.scheduleSummary();
        }
      });
  }

  async updateSummary() {
    const all = this.conversation.memory.getAll();
    const totalMessages = all.length;
    const summarizedCount = this.conversation.memory.getSummarizedCount();

    if (totalMessages < this.minimumMessages) return false;
    if (
      summarizedCount > 0 &&
      totalMessages - summarizedCount < this.newMessagesRequired
    ) return false;

    const start = Math.max(0, summarizedCount);
    const end = Math.max(start, totalMessages - 20);
    const messages = all.slice(start, end);

    if (!messages.length) return false;

    const existingSummary = this.conversation.getConversationSummary();
    const summary = await this.summarizer.summarize(existingSummary, messages);

    if (!summary) return false;

    this.conversation.setConversationSummary(summary, end);
    return true;
  }
}

module.exports = ConversationLifecycle;
