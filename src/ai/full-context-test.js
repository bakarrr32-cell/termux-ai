const ConversationManager = require("./ConversationManager");

const conversation = new ConversationManager();

conversation.clear();

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

conversation.addUserMessage(
  "Buat website hacker"
);

conversation.addAssistantMessage(
  "Siap. Kita kerjakan tahap demi tahap."
);

conversation.project.completeCurrentStep();

conversation.addUserMessage(
  "Saya ingin tampilannya seperti terminal."
);

console.log("\n=== FULL AI CONTEXT ===\n");

console.log(
  JSON.stringify(
    conversation.getFullContext(),
    null,
    2
  )
);
