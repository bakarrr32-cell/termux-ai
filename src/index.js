const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "Kamu > "
});

console.clear();

console.log(`
┌──────────────────────────────────┐
│        TERMUX AI ASSISTANT       │
│                                  │
│  Status : INITIALIZING...        │
│  Engine : LOCAL CORE              │
└──────────────────────────────────┘
`);

console.log("AI > Siap. Apa yang ingin kita kerjakan?\n");

rl.prompt();

rl.on("line", (input) => {
  const message = input.trim();

  if (!message) {
    rl.prompt();
    return;
  }

  if (message.toLowerCase() === "exit") {
    console.log("\nAI > Sampai jumpa. 👋");
    rl.close();
    return;
  }

  console.log(`\nAI > Saya menerima: "${message}"`);
  console.log("AI > Mesin percakapan dasar aktif. Kita lanjutkan tahap berikutnya.\n");

  rl.prompt();
});
