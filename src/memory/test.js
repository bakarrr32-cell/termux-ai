const MemoryManager = require("./MemoryManager");

const memory = new MemoryManager();

memory.clear();

memory.add("user", "Buat website hacker");
memory.add("assistant", "Siap. Kita kerjakan tahap demi tahap.");
memory.add("user", "Project-nya bernama hacker-web.");

console.log("\n=== MEMORY ===\n");

console.log(
  JSON.stringify(memory.getAll(), null, 2)
);

console.log("\n=== RECENT MEMORY ===\n");

console.log(
  JSON.stringify(memory.getRecent(2), null, 2)
);
