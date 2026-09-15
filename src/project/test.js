const ProjectState = require("./ProjectState");

const project = new ProjectState();

project.create(
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

console.log(JSON.stringify(project.getSummary(), null, 2));

console.log("\n--- Menyelesaikan tahap pertama ---\n");

project.completeCurrentStep();

console.log(JSON.stringify(project.getSummary(), null, 2));
