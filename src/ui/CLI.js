const readline = require("readline");

class CLI {
  constructor(assistant) {
    this.assistant = assistant;

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "Kamu > "
    });
  }

  progressBar(progress, size = 10) {
    const filled = Math.round((progress / 100) * size);

    return (
      "█".repeat(filled) +
      "░".repeat(size - filled)
    );
  }

  showHeader() {
    const project = this.assistant.getProject();
    const name = project.name || "belum ada";
    const progress = project.progress || 0;

    console.log(`
┌────────────────────────────────────┐
│        TERMUX AI ASSISTANT         │
│                                    │
│  Engine  : OpenAI Compatible       │
│  Status  : READY                   │
│                                    │
│  Project : ${String(name).padEnd(20)}│
│  Progress: ${this.progressBar(progress)} ${String(progress).padStart(3)}% │
└────────────────────────────────────┘
`);
  }

  async start() {
    // Header hanya ditampilkan sekali saat aplikasi dimulai
    this.showHeader();

    console.log("AI > Siap. Apa yang ingin kita kerjakan?\n");

    this.rl.prompt();

    this.rl.on("line", async (input) => {
      const message = input.trim();

      if (!message) {
        this.rl.prompt();
        return;
      }

      if (message.toLowerCase() === "exit") {
        console.log("\nAI > Sampai jumpa. 👋");
        this.rl.close();
        return;
      }

      try {
        process.stdout.write("\nAI > Sedang berpikir...");

        const response = await this.assistant.ask(message);

        readline.moveCursor(process.stdout, -1000, 0);
        readline.clearLine(process.stdout, 0);

        console.log(`AI > ${response}\n`);
      } catch (error) {
        console.log(`AI > ⚠️ ${error.message}\n`);
      }

      this.rl.prompt();
    });
  }
}

module.exports = CLI;
