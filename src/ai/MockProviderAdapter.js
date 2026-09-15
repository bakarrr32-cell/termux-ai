class MockProviderAdapter {
  async send(messages) {
    const lastUserMessage = [...messages]
      .reverse()
      .find(message => message.role === "user");

    return [
      "Siap 😎",
      "",
      `Saya menerima: "${lastUserMessage?.content || ""}"`,
      "",
      "Kita akan mengerjakannya tahap demi tahap."
    ].join("\n");
  }
}

module.exports = MockProviderAdapter;
