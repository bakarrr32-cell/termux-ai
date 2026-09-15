const ConversationManager = require("./ConversationManager");

const conversation = new ConversationManager();

conversation.memory.clear();

conversation.project.create(
  "hacker-web",
  "Membuat website ala hacker",
  [
    "Menentukan konsep",
    "Menyiapkan project",
    "Membuat interface",
    "Menambahkan fitur",
    "Testing"
  ]
);

conversation.addUserMessage("Buat website hacker");

conversation.addAssistantMessage(
  "Siap. Kita kerjakan tahap demi tahap."
);

conversation.addUserMessage(
  "Saya ingin tampilannya seperti terminal."
);

console.log("\n=== AI CONTEXT ===\n");

console.log(
  JSON.stringify(
    conversation.getContext(),
    null,
    2
  )
);
