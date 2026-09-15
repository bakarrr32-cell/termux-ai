const Assistant = require("./Assistant");
const MockProviderAdapter = require("./MockProviderAdapter");

async function main() {
  const assistant = new Assistant();

  assistant.engine.provider = new MockProviderAdapter();

  assistant.conversation.clear();

  const response = await assistant.ask(
    "Buat website hacker"
  );

  console.log("\n=== AI RESPONSE ===\n");
  console.log(response);

  console.log("\n=== SAVED CONTEXT ===\n");
  console.log(
    JSON.stringify(
      assistant.getConversation(),
      null,
      2
    )
  );
}

main().catch(error => {
  console.error("ERROR:", error.message);
});
