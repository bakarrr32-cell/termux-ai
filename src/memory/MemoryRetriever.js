const fs = require("fs");
const path = require("path");

class MemoryRetriever {
  constructor(
    file = "data/conversation.json",
    activeContextFile = "data/active-context.json"
  ) {
    this.file = path.resolve(file);
    this.activeContextFile = path.resolve(activeContextFile);

    this.stopWords = new Set([
      "yang", "dan", "atau", "untuk", "dengan",
      "dari", "dalam", "ini", "itu", "kita",
      "kami", "saya", "kamu", "apa", "bagaimana",
      "kenapa", "mana", "pada", "adalah", "akan",
      "bisa", "banyak", "lebih", "agar", "tetap",
      "sudah", "belum", "jadi", "juga", "sekarang",
      "tentang", "sebuah", "sebagai", "dapat",
      "ingin", "mau", "tolong", "buat", "buatkan",
      "cara", "bekerja", "jelaskan", "jelaskanlah"
    ]);

    this.conceptGroups = [
      ["memory", "memori", "ingatan", "mengingat", "diingat"],
      ["context", "konteks", "percakapan", "conversation", "history", "riwayat"],
      ["project", "proyek"],
      ["error", "gagal", "masalah", "bug", "kendala", "problem"],
      ["solusi", "perbaikan", "fix", "memperbaiki"],
      ["streaming", "stream", "sse"],
      ["server", "backend", "api"],
      ["frontend", "ui", "website", "browser"],
      ["termux", "linux"],
      ["assistant", "ai", "artificial", "kecerdasan"]
    ];

    this.intentGroups = [
      {
        name: "active-project",
        words: [
          "aktif", "sekarang", "saat", "current",
          "sekarang", "project", "proyek"
        ]
      },
      {
        name: "old-project",
        words: [
          "lama", "dulu", "dahulu", "sebelumnya",
          "old", "history", "riwayat"
        ]
      },
      {
        name: "memory",
        words: [
          "memory", "memori", "ingat", "ingatan",
          "mengingat", "lupa", "context", "konteks"
        ]
      },
      {
        name: "technical",
        words: [
          "error", "bug", "gagal", "fix", "perbaiki",
          "solusi", "kode", "server", "api",
          "stream", "streaming", "sse", "ui", "frontend"
        ]
      }
    ];
  }

  load() {
    try {
      if (!fs.existsSync(this.file)) return [];

      const raw = fs.readFileSync(this.file, "utf8");
      const data = JSON.parse(raw);

      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error(
        "MemoryRetriever > Gagal membaca conversation:",
        error.message
      );

      return [];
    }
  }

  loadActiveContext() {
    try {
      if (!fs.existsSync(this.activeContextFile)) return null;

      const raw = fs.readFileSync(this.activeContextFile, "utf8");
      return JSON.parse(raw);
    } catch (error) {
      console.error(
        "MemoryRetriever > Gagal membaca active context:",
        error.message
      );

      return null;
    }
  }

  tokenize(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_-]+/gu, " ")
      .split(/\s+/)
      .filter(Boolean)
      .filter(word => !this.stopWords.has(word));
  }

  getConceptGroup(word) {
    for (const group of this.conceptGroups) {
      if (group.includes(word)) return group;
    }

    return null;
  }

  getIntentGroups(words) {
    return this.intentGroups.filter(group =>
      words.some(word => group.words.includes(word))
    );
  }

  conceptMatches(queryWords, contentWords) {
    let matches = 0;

    for (const queryWord of queryWords) {
      const group = this.getConceptGroup(queryWord);

      if (!group) continue;

      const found = contentWords.some(contentWord =>
        group.includes(contentWord)
      );

      if (found) matches++;
    }

    return matches;
  }

  getActiveKeywords() {
    const active = this.loadActiveContext();

    if (!active) return [];

    const parts = [];

    if (active.project) {
      parts.push(active.project.name);
      parts.push(active.project.goal);
      parts.push(active.project.environment);
      parts.push(active.project.focus);

      if (Array.isArray(active.project.technology)) {
        parts.push(active.project.technology.join(" "));
      }
    }

    return this.tokenize(parts.join(" "));
  }

  hasExplicitOldProjectIntent(queryWords) {
    const oldWords = [
      "lama",
      "dulu",
      "dahulu",
      "sebelumnya",
      "old",
      "history",
      "riwayat"
    ];

    return queryWords.some(word => oldWords.includes(word));
  }

  hasExplicitActiveIntent(queryWords) {
    const activeWords = [
      "aktif",
      "sekarang",
      "current"
    ];

    return queryWords.some(word => activeWords.includes(word));
  }

  score(query, content, index, totalMessages, role) {
    const queryWords = this.tokenize(query);
    const contentWords = this.tokenize(content);

    if (!queryWords.length || !contentWords.length) return 0;

    const normalizedQuery = String(query)
      .toLowerCase()
      .replace(/\\s+/g, " ")
      .trim();

    const normalizedContent = String(content)
      .toLowerCase()
      .replace(/\\s+/g, " ")
      .trim();

    const contentSet = new Set(contentWords);

    let score = 0;

    // Lexical relevance.
    for (const word of queryWords) {
      if (contentSet.has(word)) {
        score += 3;
      }
    }

    // Concept relevance.
    score += this.conceptMatches(queryWords, contentWords) * 2;

    // Exact phrase is strong evidence.
    if (
      normalizedQuery &&
      normalizedContent.includes(normalizedQuery)
    ) {
      score += 12;
    }

    // Active-context relevance.
    const activeKeywords = this.getActiveKeywords();

    let activeMatches = 0;

    for (const word of queryWords) {
      if (activeKeywords.includes(word)) {
        activeMatches++;
      }
    }

    score += Math.min(activeMatches * 2, 10);

    // Small recency bonus only.
    if (totalMessages > 1) {
      const recency = index / (totalMessages - 1);
      score += recency * 1.5;
    }

    // Detect query intent.
    const oldProjectIntent = this.hasExplicitOldProjectIntent(queryWords);
    const activeProjectIntent = this.hasExplicitActiveIntent(queryWords);

    const lowerContent = normalizedContent;

    const looksLikeOldProject =
      /project nebula|project lama|project sebelumnya|project terdahulu/i
        .test(lowerContent);

    const looksLikeActiveProject =
      /termux ai assistant|project aktif|konteks aktif|project kita sekarang/i
        .test(lowerContent);

    const isTechnicalQuery =
      queryWords.some(word =>
        [
          "error",
          "bug",
          "gagal",
          "fix",
          "perbaiki",
          "solusi",
          "kode",
          "server",
          "api",
          "stream",
          "streaming",
          "sse",
          "ui",
          "frontend",
          "backend"
        ].includes(word)
      );

    const isContextQuery =
      queryWords.some(word =>
        [
          "context",
          "konteks",
          "conversation",
          "percakapan",
          "memory",
          "memori",
          "history",
          "riwayat"
        ].includes(word)
      );

    // Historical project intent.
    if (oldProjectIntent) {
      if (looksLikeOldProject) score += 18;
      if (looksLikeActiveProject) score -= 8;
    }

    // Active project intent.
    if (activeProjectIntent) {
      if (looksLikeActiveProject) score += 20;
      if (looksLikeOldProject) score -= 12;
    }

    // Normal technical/context questions should favor current project.
    if (!oldProjectIntent && !activeProjectIntent) {
      if (looksLikeActiveProject) score += 5;
    }

    // Technical memories should receive a bonus for technical queries.
    if (isTechnicalQuery) {
      if (
        /sse|stream|streaming|api|server|backend|frontend|ui|kode|error|bug/i
          .test(lowerContent)
      ) {
        score += 8;
      }
    }

    // Context/memory memories should receive a bonus for context queries.
    if (isContextQuery) {
      if (
        /context|konteks|conversation|percakapan|memory|memori|history|riwayat/i
          .test(lowerContent)
      ) {
        score += 6;
      }
    }

    // Assistant answers are generally more useful than user prompts.
    if (role === "assistant") {
      score += 5;
    }

    if (role === "user") {
      score -= 4;
    }

    // Strongly suppress memories that are just old questions.
    if (role === "user") {
      const questionStarts = [
        "apa ",
        "bagaimana ",
        "kenapa ",
        "mengapa ",
        "kapan ",
        "dimana ",
        "di mana ",
        "siapa ",
        "apakah ",
        "jelaskan ",
        "tolong jelaskan",
        "bisa jelaskan",
        "bisakah "
      ];

      const looksLikeQuestion =
        questionStarts.some(pattern =>
          lowerContent.startsWith(pattern)
        ) ||
        lowerContent.endsWith("?");

      if (looksLikeQuestion) {
        score -= 12;
      }
    }

    // Information-bearing answer indicators.
    if (role === "assistant") {
      const answerIndicators = [
        "adalah ",
        "merupakan ",
        "yaitu ",
        "berikut ",
        "caranya ",
        "solusinya ",
        "penyebabnya ",
        "project aktif kita",
        "project aktif kita sekarang",
        "nama project kamu",
        "nama project adalah",
        "dalam aplikasi",
        "arsitektur",
        "cara kerja",
        "bekerja seperti",
        "gunakan ",
        "jalankan ",
        "kode "
      ];

      if (
        answerIndicators.some(indicator =>
          lowerContent.includes(indicator)
        )
      ) {
        score += 5;
      }
    }

    // Historical memory echoes are less useful than original answers.
    const memoryEchoPatterns = [
      "yang saya ingat:",
      "yang saya ingat dari percakapan ini:",
      "nama kamu:",
      "saya ingat:",
      "yang saya ingat adalah"
    ];

    if (
      memoryEchoPatterns.some(pattern =>
        lowerContent.startsWith(pattern)
      )
    ) {
      score -= 10;
    }

    return Math.max(0, score);
  }

  search(query, limit = 5) {
    const messages = this.load();

    if (!query || !messages.length) return [];

    const results = messages
      .map((message, index) => ({
        ...message,
        index,
        score: this.score(
          query,
          message.content,
          index,
          messages.length,
          message.role
        )
      }))
      .filter(message => message.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        return b.index - a.index;
      })
      .slice(0, limit);

    return results.map(message => ({
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      score: Number(message.score.toFixed(3))
    }));
  }
}

module.exports = MemoryRetriever;
