class IntentDetector {
  detect(message) {
    const text = message.toLowerCase().trim();

    if (
      text === "sudah" ||
      text === "selesai" ||
      text === "lanjut" ||
      text === "next"
    ) {
      return "complete_step";
    }

    if (
      text.startsWith("buat ") ||
      text.startsWith("bikin ") ||
      text.startsWith("bangun ")
    ) {
      return "create_project";
    }

    return "chat";
  }
}

module.exports = IntentDetector;
