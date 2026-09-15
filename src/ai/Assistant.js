const ConversationManager = require("./ConversationManager");
const AIEngine = require("./AIEngine");
const ProjectController = require("../project/ProjectController");
const StepExecutor = require("../project/StepExecutor");
const IntentDetector = require("./IntentDetector");
const SYSTEM_PROMPT = require("./SystemPrompt");
const ConversationSummarizer = require("./ConversationSummarizer");
const MemoryRetriever = require("../memory/MemoryRetriever");
const MemoryReranker = require("../memory/MemoryReranker");
const ProjectIntelligence = require("../project/ProjectIntelligence");
const DeepProjectIntelligence = require("../project/DeepProjectIntelligence");
const DeveloperAgent = require("../agent/DeveloperAgent");
const ContextBudget = require("../agent/ContextBudget");
const ConversationLifecycle = require("./ConversationLifecycle");
const fs = require("fs");
const path = require("path");

class Assistant {
  constructor() {
    this.conversation = new ConversationManager();
    this.engine = new AIEngine();
    this.intent = new IntentDetector();
    this.summarizer = new ConversationSummarizer(this.engine);

    this.retriever = new MemoryRetriever();
    this.reranker = new MemoryReranker(this.engine);

    this.deepProjectIntelligence = new DeepProjectIntelligence();
    this.developerAgent = new DeveloperAgent();
    this.contextBudget = new ContextBudget();
    this.lifecycle = new ConversationLifecycle(this.conversation, this.summarizer);

this.projectIntelligence = new ProjectIntelligence();

    this.activeContextFile = path.resolve(
      "data/active-context.json"
    );

    this.projectController = new ProjectController(
      this.conversation.project,
      this.engine
    );

    this.stepExecutor = new StepExecutor(this.engine);
  }

  async buildMessages(includeProject = false) {
    const context = this.conversation.getLongTermContext();

    const userMessages = context.filter(
      message => message.role === "user"
    );

    const latestUserMessage =
      userMessages.length > 0
        ? userMessages[userMessages.length - 1].content
        : "";

    const candidateMemories =
      latestUserMessage
        ? this.retriever.search(
            latestUserMessage,
            this.contextBudget.limits.memories + 3
          )
        : [];

    let relevantMemories = this.contextBudget.memories(candidateMemories);
    const agentMode = this.developerAgent.detectMode(latestUserMessage);
    const shouldRerank =
      latestUserMessage &&
      candidateMemories.length > 1 &&
      agentMode !== "explanation";

    if (shouldRerank) {
      try {
        const reranked = await this.reranker.rerank(
          latestUserMessage,
          candidateMemories,
          this.contextBudget.limits.rerankedMemories
        );

        if (reranked.length > 0) {
          relevantMemories = this.contextBudget.memories(reranked);
        }
      } catch (error) {
        console.error(
          "Assistant > Memory reranker:",
          error.message
        );
      }
    }

    const messages = [
      {
        role: "system",
        content: SYSTEM_PROMPT
      }
    ];

    let runtimeContext = null;

    try {
      runtimeContext =
        this.engine.getRuntimeContext();
    } catch (error) {
      console.error(
        "Assistant > Runtime intelligence:",
        error.message
      );
    }

    if (runtimeContext) {
      messages.push({
        role: "system",
        content: runtimeContext
      });
    }

    let developerAgentContext = null;

    try {
      developerAgentContext =
        this.developerAgent.buildPromptContext(
          latestUserMessage,
          this.conversation.getProjectContext(),
          this.developerAgent.getCachedInspection(
            () => this.projectIntelligence.inspect()
          )
        );
    } catch (error) {
      console.error(
        "Assistant > Developer agent:",
        error.message
      );
    }

    if (developerAgentContext) {
      messages.push({
        role: "system",
        content: developerAgentContext
      });
    }

    let deepProjectContext = null;

    try {
      if (this.developerAgent.shouldInspectDeep(latestUserMessage, includeProject)) {
        deepProjectContext =
          this.deepProjectIntelligence.buildPromptContext(
            this.conversation.getProjectContext()
          );
      }
    } catch (error) {
      console.error(
        "Assistant > Deep project intelligence:",
        error.message
      );
    }

    if (deepProjectContext) {
      messages.push({
        role: "system",
        content: deepProjectContext
      });
    }

    let projectIntelligenceContext = null;

    try {
      projectIntelligenceContext =
        this.projectIntelligence.buildPromptContext();
    } catch (error) {
      console.error(
        "Assistant > Project intelligence:",
        error.message
      );
    }

    if (projectIntelligenceContext) {
      messages.push({
        role: "system",
        content: projectIntelligenceContext
      });
    }


    let activeContext = null;

    try {
      activeContext = JSON.parse(
        fs.readFileSync(
          this.activeContextFile,
          "utf8"
        )
      );
    } catch (error) {
      console.error(
        "ACTIVE CONTEXT ERROR:",
        error.message
      );
    }

    if (activeContext) {
      messages.push({
        role: "system",
        content: [
          "KONTEKS AKTIF — SUMBER KEBENARAN SAAT INI:",
          "",
          JSON.stringify(activeContext, null, 2),
          "",
          "INSTRUKSI:",
          "Gunakan konteks aktif ini sebagai sumber kebenaran untuk kondisi project saat ini.",
          "History lama hanya merupakan catatan sejarah.",
          "Jangan mengganti project aktif berdasarkan nama project, nama orang, teknologi, atau fakta dari history lama.",
          "Jangan mengambil contoh kode atau tutorial sebagai fakta tentang user.",
          "Jika history lama bertentangan dengan konteks aktif, konteks aktif harus diprioritaskan."
        ].join("\n")
      });
    }

    if (relevantMemories.length > 0) {
      messages.push({
        role: "system",
        content: [
          "MEMORY LAMA YANG RELEVAN:",
          "",
          ...relevantMemories.map(
            (memory, index) =>
              [
                `[MEMORY ${index + 1} | score=${memory.score}]`,
                `${memory.role.toUpperCase()}:`,
                memory.content
              ].join("\n")
          ),
          "",
          "Gunakan memory ini hanya sebagai konteks tambahan.",
          "Jangan menganggap memory lama sebagai kondisi project aktif.",
          "Jika bertentangan dengan Active Context atau Project State, prioritaskan konteks aktif."
        ].join("\n\n")
      });
    }

    if (includeProject) {
      const project = this.conversation.getProjectContext();

      messages.push({
        role: "system",
        content: `
KONTEKS PROJECT AKTIF:

${JSON.stringify(project, null, 2)}

Gunakan konteks ini karena user sedang membahas project.
Jangan menganggap langkah selesai tanpa bukti yang cukup.
`
      });
    }

    messages.push(...this.contextBudget.history(context));

    if (includeProject) {
      const project = this.conversation.getProjectContext();

      messages.push({
        role: "system",
        content: [
          "OTORITAS PROJECT AKTIF:",
          "",
          JSON.stringify(project, null, 2),
          "",
          "ATURAN PRIORITAS PROJECT:",
          "1. Informasi di atas adalah kondisi project aktif saat ini.",
          "2. Jika history lama menyebut nama atau teknologi project yang berbeda, anggap itu sebagai informasi historis, bukan project aktif.",
          "3. Jangan mengganti nama, tujuan, teknologi, status, progress, atau langkah project aktif berdasarkan history lama.",
          "4. Gunakan history lama hanya sebagai konteks tambahan.",
          "5. Jangan mengarang perubahan project yang tidak tercatat di project state."
        ].join("\n")
      });
    }

    return messages;
  }

  async ask(userMessage, options = {}) {
    const message = userMessage.trim();
    const intent = this.intent.detect(message);

    this.conversation.addUserMessage(message);
    this.developerAgent.syncTask(message);

    // =========================
    // CREATE PROJECT
    // =========================

    if (intent === "create_project") {
      const project = await this.projectController.createProject(
        "project",
        message
      );

      const step = project.currentStep;

      const response = [
        "Siap 😎 Kita kerjakan tahap demi tahap.",
        "",
        `[Project: ${project.name}]`,
        `[Progress: ${project.progress}%]`,
        "",
        "Rencana project:",
        ...project.steps.map(
          item => `${item.id}. ${item.title}`
        ),
        "",
        "🔥 Langkah pertama:",
        step.title,
        "",
        "Kalau sudah selesai, kirim hasilnya atau ketik `sudah`."
      ].join("\n");

      this.recordAssistantResponse(response);

      return response;
    }

    // =========================
    // COMPLETE PROJECT STEP
    // =========================

    if (intent === "complete_step") {
      const project = this.projectController.completeStep();
      this.developerAgent.invalidateCaches();
      this.developerAgent.recordEvidence("User confirmed the active project step with the completion intent.");

      if (!project.name) {
        const response =
          "Belum ada project aktif. Beri saya tujuan project terlebih dahulu. 😎";

        this.conversation.addAssistantMessage(response);

        return response;
      }

      if (project.status === "completed") {
        const response = [
          "🔥 Mantap! Semua langkah project sudah selesai.",
          "",
          `[Project: ${project.name}]`,
          `[Progress: 100%]`,
          "",
          "Project berhasil diselesaikan. 🎉"
        ].join("\n");

        this.conversation.addAssistantMessage(response);

        return response;
      }

      const step = project.currentStep;

      const instructions = await this.stepExecutor.generateStep(
        step,
        project
      );

      const response = [
        "Mantap 🔥 Langkah sebelumnya selesai.",
        "",
        `[Project: ${project.name}]`,
        `[Progress: ${project.progress}%]`,
        "",
        `➡️ Langkah ${step.id}: ${step.title}`,
        "",
        instructions
      ].join("\n");

      this.recordAssistantResponse(response);

      return response;
    }

    // =========================
    // NORMAL CHAT
    // =========================

    const lower = message.toLowerCase();

    const projectKeywords = [
      "project",
      "proyek",
      "lanjut",
      "langkah",
      "progress",
      "kode",
      "code",
      "error",
      "debug",
      "termux",
      "website",
      "backend",
      "frontend",
      "server",
      "file"
    ];

    const isProjectRelated = projectKeywords.some(
      keyword => lower.includes(keyword)
    );

    const response = await this.engine.chat(
      async () => {
        const messages = await this.buildMessages(isProjectRelated);
        const images = Array.isArray(options.images) ? options.images : [];
        if (images.length > 0) {
          for (let i = messages.length - 1; i >= 0; i -= 1) {
            if (messages[i].role === 'user') {
              const original = typeof messages[i].content === 'string' ? messages[i].content : '';
              messages[i] = {
                role: 'user',
                content: [
                  { type: 'text', text: original || 'Tolong analisis gambar ini.' },
                  ...images.map(image => ({ type: 'image_url', image_url: { url: image.dataUrl } }))
                ]
              };
              break;
            }
          }
        }
        return messages;
      }
    );

    this.recordAssistantResponse(response);

    return response;
  }

  recordAssistantResponse(response) {
    // Summary lifecycle is centralized in ConversationLifecycle.
    // Compatibility marker: this.updateConversationSummary().catch
    return this.lifecycle.recordAssistant(response);
  }

  async updateConversationSummary() {
    return this.lifecycle.updateSummary();
  }

  exportConversation() {
    return this.conversation.getExportData();
  }

  getAgentStatus() {
    return {
      task: this.developerAgent.taskStore.get(),
      modes: this.developerAgent.modes
    };
  }

  getProject() {
    return this.conversation.getProjectContext();
  }

  getConversation() {
    return this.conversation.getContext();
  }

  getContext() {
    return this.conversation.getFullContext();
  }
}

module.exports = Assistant;
