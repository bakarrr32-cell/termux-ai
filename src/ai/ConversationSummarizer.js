class ConversationSummarizer {
  constructor(engine) {
    this.engine = engine;
  }

  async summarize(existingSummary, messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
      return existingSummary || "";
    }

    const conversationText = messages
      .map((message, index) => {
        const role =
          message.role === "user"
            ? "USER"
            : "ASSISTANT";

        return [
          `[MESSAGE ${index + 1}]`,
          role + ":",
          message.content
        ].join("\n");
      })
      .join("\n\n");

    const previousSummary = existingSummary
      ? existingSummary
      : "(Belum ada memory sebelumnya.)";

    const prompt = `
Kamu adalah MEMORY UPDATER untuk TERMUX AI ASSISTANT.

Tugasmu adalah MEMPERBARUI memory yang sudah ada menggunakan informasi baru.

====================
MEMORY SAAT INI
====================

${previousSummary}

====================
PESAN BARU
====================

${conversationText}

====================
ATURAN MEMORY
====================

1. MEMORY SAAT INI adalah state yang harus dipertahankan.
2. Jangan membuat memory dari nol.
3. Pertahankan fakta penting dari MEMORY SAAT INI walaupun fakta tersebut tidak disebut lagi dalam PESAN BARU.
4. Gunakan PESAN BARU untuk menambahkan fakta baru atau mengoreksi fakta lama.
5. Jika informasi baru bertentangan dengan informasi lama, informasi baru yang lebih jelas dan terbaru harus menang.
6. Jangan mengubah status "sudah selesai" menjadi "belum selesai" hanya karena batch baru tidak menyebutkannya.
7. Jangan menganggap rencana sebagai sesuatu yang sudah dilakukan.
8. Jangan menganggap sesuatu sudah selesai tanpa bukti dari percakapan.
9. Jangan mengarang nama project, file, command, teknologi, progress, error, atau keputusan teknis.
10. Jangan memasukkan informasi dari pengetahuanmu sendiri.
11. Jangan menyimpan API key, token, password, credential, secret, atau nilai rahasia apa pun.
12. Jangan menyapa user.
13. Jangan memberikan jawaban atau saran kepada user.
14. Jangan menulis kalimat pembuka seperti "Halo", "Siap", atau "Berikut".
15. Memory harus menjadi catatan konteks, bukan percakapan.
16. Hilangkan informasi yang jelas-jelas hanya contoh hipotetis atau tutorial dan bukan fakta project.
17. Jika sebuah fakta project sudah terbukti melalui output, testing, atau percakapan aktual, pertahankan sebagai fakta.
18. Prioritaskan konteks yang berguna untuk melanjutkan project.

====================
FORMAT MEMORY
====================

PROJECT:
- nama:
- tujuan:
- teknologi:

STATUS:
- progress:
- yang sudah selesai:
- yang sedang dikerjakan:
- yang belum selesai:

KEPUTUSAN TEKNIS:
- ...

FILE / KOMPONEN PENTING:
- ...

ERROR / MASALAH:
- ...

SOLUSI YANG SUDAH DICOBA:
- ...

INFORMASI PENTING LAIN:
- ...

Jika suatu kategori tidak memiliki informasi, tulis:
- belum ada informasi

Hasil akhir harus merupakan MEMORY GABUNGAN:
MEMORY LAMA + FAKTA BARU + KOREKSI YANG TERBUKTI.

Jangan menghapus fakta lama hanya karena tidak muncul dalam pesan baru.
`;

    try {
      const response = await this.engine.chat([
        {
          role: "system",
          content:
            "Kamu adalah memory updater. Pertahankan state lama dan lakukan update berdasarkan fakta baru."
        },
        {
          role: "user",
          content: prompt
        }
      ]);

      return String(response || "").trim();
    } catch (error) {
      console.error(
        "ConversationSummarizer > Gagal memperbarui memory:",
        error.message
      );

      return existingSummary || "";
    }
  }
}

module.exports = ConversationSummarizer;
