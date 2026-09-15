require("dotenv").config();
const Assistant = require("./src/ai/Assistant");
const CLI = require("./src/ui/CLI");

const assistant = new Assistant();
const cli = new CLI(assistant);

cli.start();
