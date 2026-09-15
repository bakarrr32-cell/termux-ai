class AIPlanner {
  constructor(engine) {
    this.engine = engine;
  }

  async createPlan(goal) {
    const messages = [
      {
        role: "system",
        content: `
Kamu adalah project planner untuk TERMUX AI ASSISTANT.

Buat rencana teknis yang realistis untuk tujuan user.

Aturan:
- Buat 4 sampai 8 langkah.
- Setiap langkah harus konkret dan bisa dikerjakan.
- Urutkan dari setup sampai testing/finalisasi.
- Jangan membuat langkah terlalu umum.
- Jangan menjalankan command.
- Hanya kembalikan JSON valid.
- Format harus persis:

{
  "name": "nama-project",
  "goal": "tujuan",
  "steps": [
    "langkah 1",
    "langkah 2",
    "langkah 3"
  ]
}
`
      },
      {
        role: "user",
        content: goal
      }
    ];

    const response = await this.engine.chat(messages);

    return this.parse(response);
  }

  parse(response) {
    let text = response.trim();

    text = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let data;

    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error(
        "AI Planner menghasilkan JSON yang tidak valid."
      );
    }

    if (
      !data ||
      typeof data !== "object" ||
      !Array.isArray(data.steps) ||
      data.steps.length === 0
    ) {
      throw new Error(
        "AI Planner menghasilkan struktur project yang tidak valid."
      );
    }

    return {
      name: data.name || "project",
      goal: data.goal || "",
      steps: data.steps.map(step => String(step))
    };
  }
}

module.exports = AIPlanner;
