class MemoryReranker {
  constructor(engine) {
    this.engine = engine;
  }

  async rerank(query, memories, limit = 3) {
    if (
      !query ||
      !Array.isArray(memories) ||
      memories.length === 0
    ) {
      return [];
    }

    const candidates = memories.map((memory, index) => ({
      index,
      role: memory.role,
      content: memory.content
    }));

    const prompt = [
      "Kamu adalah MEMORY RE-RANKER untuk Termux AI Assistant.",
      "",
      "Tugas:",
      "Pilih memory lama yang paling membantu menjawab pertanyaan user.",
      "",
      "PERTANYAAN USER:",
      query,
      "",
      "KANDIDAT MEMORY:",
      JSON.stringify(candidates, null, 2),
      "",
      "ATURAN:",
      "1. Nilai berdasarkan makna dan konteks.",
      "2. Pilih memory yang benar-benar membantu menjawab pertanyaan.",
      "3. Jangan memilih user prompt lama jika ada assistant answer yang memuat jawabannya.",
      "4. Jangan menganggap memory sebagai kondisi project aktif.",
      "5. Active Context dan Project State selalu lebih berwenang daripada memory lama.",
      "6. Jangan menggunakan pengetahuan di luar kandidat.",
      "7. Jangan mengarang isi memory.",
      "8. Maksimal " + limit + " kandidat.",
      "9. Score harus angka 0 sampai 1.",
      "10. Hanya keluarkan JSON valid.",
      "",
      "FORMAT:",
      '[{"index":0,"score":0.95}]',
      "",
      "Jangan tambahkan markdown atau penjelasan."
    ].join("\n");

    try {
      const response = await this.engine.chat([
        {
          role: "system",
          content:
            "Kamu adalah memory re-ranker. Keluarkan JSON valid sesuai format."
        },
        {
          role: "user",
          content: prompt
        }
      ]);

      const text = String(response || "")
        .trim()
        .replace(/^\`\`\`json\s*/i, "")
        .replace(/^\`\`\`\s*/i, "")
        .replace(/\s*\`\`\`$/i, "")
        .trim();

      const parsed = JSON.parse(text);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter(item =>
          Number.isInteger(item.index) &&
          item.index >= 0 &&
          item.index < candidates.length &&
          Number.isFinite(item.score)
        )
        .map(item => ({
          ...memories[item.index],
          score: Math.max(
            0,
            Math.min(1, Number(item.score))
          )
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

    } catch (error) {
      console.error(
        "MemoryReranker > fallback:",
        error.message
      );

      return [];
    }
  }
}

module.exports = MemoryReranker;
