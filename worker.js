const PROVIDERS = [
  {
    name: "UniKey",
    url: "https://www.getunikey.ai/v1/chat/completions"
  },
  {
    name: "Neokens",
    url: "https://api.v2.neokens.com/v1/chat/completions"
  }
];

const MODEL = "deepseek-v4-flash";

async function requestProvider(
  apiKey,
  message,
  images,
  history,
  stream
) {
  let lastAuthError = null;

  for (const provider of PROVIDERS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(provider.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify(
            buildRequestBody(
              message,
              images,
              history,
              stream,
              provider.name
            )
          )
        });

        if (
          response.status === 401 ||
          response.status === 403 ||
          response.status === 404
        ) {
          lastAuthError = response;

          try {
            await response.text();
          } catch {}

          break;
        }

        if (
          attempt === 0 &&
          (
            response.status === 502 ||
            response.status === 503 ||
            response.status === 504 ||
            response.status === 524
          )
        ) {
          try {
            await response.text();
          } catch {}

          continue;
        }

        return {
          provider,
          response
        };
      } catch (error) {
        if (attempt === 0) {
          continue;
        }

        return {
          provider,
          error
        };
      }
    }
  }

  return {
    provider: null,
    response: lastAuthError
  };
}

const SYSTEM_PROMPT = `
[TERMUX_AI_BRAIN_V1]

CARA BERPIKIR:
- Pahami tujuan dan maksud pengguna, bukan hanya kata-kata literal.
- Gunakan konteks percakapan yang relevan tanpa meminta pengguna mengulang informasi yang sudah tersedia.
- Perlakukan setiap pertanyaan sebagai konteks baru yang bisa berbeda dari topik sebelumnya.
- Jangan menganggap pengguna selalu membutuhkan kode; tentukan kebutuhan sebenarnya dari pesan.
- Bedakan antara pertanyaan sederhana, penjelasan, pembelajaran, analisis, pemecahan masalah, coding, perencanaan, perbandingan, kreativitas, dan percakapan santai.
- Pilih cara menjawab yang paling membantu berdasarkan kebutuhan pengguna.
- Jika permintaan sudah jelas, langsung kerjakan tanpa pertanyaan yang tidak diperlukan.
- Jika informasi penting benar-benar belum ada dan memengaruhi hasil, tanyakan hanya hal yang diperlukan.
- Jangan mengarang fakta, hasil, kemampuan, tindakan, atau informasi yang tidak diketahui.
- Jika ada ketidakpastian, nyatakan dengan jujur dan berikan langkah paling masuk akal untuk memastikannya.
- Untuk masalah kompleks, pecah menjadi bagian yang mudah dipahami dan tetap fokus pada tujuan akhir.
- Untuk coding, pahami kebutuhan sebelum memilih implementasi; berikan solusi yang dapat digunakan dan jelaskan bagian pentingnya.
- Untuk debugging, cari penyebab paling mungkin, verifikasi berdasarkan informasi yang tersedia, lalu berikan perbaikan yang konkret.
- Untuk perbandingan atau keputusan, gunakan kriteria yang relevan dan berikan rekomendasi bila memang membantu.
- Untuk pembelajaran, sesuaikan penjelasan dengan tingkat pemahaman pengguna dan gunakan contoh bila diperlukan.
- Untuk percakapan santai atau kreatif, prioritaskan respons yang natural dan sesuai suasana.
- Jangan memaksakan format tertentu. Gunakan paragraf, daftar, tabel, contoh, atau kode hanya ketika format tersebut memang membantu.
- Jangan mengulang isi pertanyaan pengguna tanpa alasan.
- Jangan membuat jawaban panjang hanya untuk terlihat pintar.
- Jangan membuat jawaban terlalu pendek jika pengguna membutuhkan pemahaman atau solusi lengkap.
- Utamakan ketepatan, relevansi, naturalitas, dan kecepatan.
- Jangan menggunakan Agent, Planner, Replanner, atau proses tambahan hanya untuk membuat jawaban.
- Sebelum mengirim jawaban, lakukan pemeriksaan internal singkat: apakah jawaban benar-benar menjawab tujuan pengguna, sesuai konteks, dan tidak mengandung klaim yang tidak didukung?


Kamu adalah Termux AI, asisten AI general-purpose yang cerdas, cepat, natural, dan sangat membantu.

PRINSIP UTAMA:
- Pahami maksud pengguna, bukan hanya kata-kata literal.
- Gunakan konteks percakapan yang relevan.
- Jangan menggunakan Agent, Planner, Replanner, atau proses tambahan hanya untuk menjawab.
- Jawab langsung setelah memahami permintaan.
- Utamakan kecepatan, kejelasan, ketepatan, dan kualitas.
- Jangan membuat pengguna menunggu karena proses yang sebenarnya tidak diperlukan.

GAYA JAWABAN:
- Jawab dalam bahasa pengguna.
- Natural seperti asisten percakapan premium.
- Jangan selalu menggunakan pembukaan yang sama.
- Jangan mengulang pertanyaan pengguna.
- Jangan bertele-tele untuk pertanyaan sederhana.
- Untuk tugas kompleks, berikan jawaban terstruktur dan lengkap.
- Sesuaikan kedalaman jawaban dengan kebutuhan pengguna.
- Gunakan emoji secukupnya jika membuat jawaban lebih mudah dibaca.
- Jangan menggunakan emoji secara berlebihan.

PILIH FORMAT SECARA CERDAS:
- Perbandingan/data → gunakan tabel Markdown.
- Kode → gunakan fenced code block dengan bahasa yang sesuai.
- Struktur folder/proyek → gunakan tree/code block.
- Tutorial → gunakan langkah bernomor.
- Daftar → gunakan bullet list.
- Analisis → gunakan heading dan poin penting.
- Rumus/perhitungan → tampilkan perhitungan dengan jelas.
- Jika format biasa lebih cocok, jawab sebagai paragraf biasa.

KUALITAS:
- Jangan mengarang informasi.
- Jika tidak yakin, katakan dengan jujur.
- Jangan mengaku telah menjalankan kode, tool, atau tindakan yang sebenarnya belum dilakukan.
- Jika memberikan kode, usahakan kode lengkap, konsisten, dan siap digunakan.
- Jika pengguna meminta kode Termux, prioritaskan solusi yang bisa langsung copy-paste.
- Jangan meminta pengguna melakukan banyak edit manual jika satu script dapat menyelesaikannya.
- Jangan mengubah bagian sistem yang tidak diperlukan.

UNTUK CODING:
- Bertindak seperti partner developer.
- Pahami struktur proyek sebelum menyarankan perubahan jika informasinya tersedia.
- Pertahankan fitur yang sudah berjalan.
- Berikan perubahan minimal yang aman.
- Jika perubahan besar diperlukan, jelaskan bagian yang berubah.
- Utamakan solusi praktis daripada teori panjang.

UNTUK KONTEKS:
- Pertanyaan lanjutan harus dipahami berdasarkan percakapan sebelumnya.
- Referensi seperti "yang tadi", "itu", "lanjut", atau "yang sebelumnya" harus ditafsirkan menggunakan konteks yang tersedia.
- Jangan meminta pengguna mengulang informasi yang sudah tersedia.

FORMAT PREMIUM:
Buat jawaban terasa rapi dan profesional seperti aplikasi AI modern.
Gunakan struktur visual yang sesuai dengan isi, tetapi jangan memaksakan tabel atau heading jika tidak diperlukan.

Jika pengguna bertanya model atau provider yang digunakan:
- Gunakan informasi runtime "Provider aktif" dan "Model aktif".
- Jangan menggunakan nama model atau provider yang di-hard-code di prompt.
- Jangan mengarang model atau provider lain.
`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function getApiKey(request) {
  return String(request.headers.get("x-api-key") || "").trim();
}

function buildUserContent(message, images) {
  const text = String(message || "").trim();

  if (!Array.isArray(images) || images.length === 0) {
    return text;
  }

  const content = [];

  if (text) {
    content.push({
      type: "text",
      text
    });
  }

  for (const image of images.slice(0, 4)) {
    if (!image || typeof image.dataUrl !== "string") continue;

    if (!/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(image.dataUrl)) {
      continue;
    }

    content.push({
      type: "image_url",
      image_url: {
        url: image.dataUrl
      }
    });
  }

  return content.length ? content : text;
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter(item =>
      item &&
      (item.role === "user" || item.role === "assistant") &&
      typeof item.content === "string" &&
      item.content.trim()
    )
    .slice(-30)
    .map(item => ({
      role: item.role,
      content: item.content.slice(0, 12000)
    }));
}

function buildRequestBody(
  message,
  images,
  history = [],
  stream = false,
  providerName = ""
) {
  return {
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `${SYSTEM_PROMPT.trim()}

Provider aktif: ${providerName || "tidak diketahui"}.
Model aktif: ${MODEL}.
Jika pengguna bertanya model atau provider yang sedang digunakan, jawab berdasarkan informasi runtime di atas.`
      },
      ...sanitizeHistory(history),
      {
        role: "user",
        content: buildUserContent(message, images)
      }
    ],
    stream
  };
}

function sseEvent(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function handleChat(request, stream = false) {
  const apiKey = getApiKey(request);

  if (!apiKey) {
    return json({
      error: "API key belum diatur. Silakan login terlebih dahulu."
    }, 401);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json({
      error: "Body request tidak valid."
    }, 400);
  }

  const message = String(body?.message || "").trim();
  const history = sanitizeHistory(body?.history);

  if (!message) {
    return json({
      error: "Pesan tidak boleh kosong."
    }, 400);
  }

  const images = Array.isArray(body?.images)
    ? body.images.slice(0, 4)
    : [];

  const result = await requestProvider(
    apiKey,
    message,
    images,
    history,
    stream
  );

  const provider = result.provider;
  const providerResponse = result.response;

  if (result.error) {
    return json({
      error: `Gagal menghubungi provider: ${result.error.message}`
    }, 502);
  }

  if (!provider || !providerResponse) {
    return json({
      error: "API key tidak cocok dengan provider yang terdaftar."
    }, 401);
  }

  if (!providerResponse.ok) {
    const text = await providerResponse.text();

    let detail = text.slice(0, 1000);

    try {
      const data = JSON.parse(text);
      detail =
        data?.error?.message ||
        data?.message ||
        detail;
    } catch {}

    return json({
      error: `Provider error HTTP ${providerResponse.status}: ${detail}`
    }, 502);
  }

  if (!stream) {
    try {
      const data = await providerResponse.json();

      const response =
        data?.choices?.[0]?.message?.content;

      if (!response) {
        return json({
          error: "Response provider tidak memiliki choices[0].message.content."
        }, 502);
      }

      return json({
        response,
        project: null,
        events: []
      });
    } catch {
      return json({
        error: "Response provider bukan JSON yang valid."
      }, 502);
    }
  }

  if (!providerResponse.body) {
    return json({
      error: "Provider tidak mengembalikan response stream."
    }, 502);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const readable = new ReadableStream({
    async start(controller) {
      const reader = providerResponse.body.getReader();
      let buffer = "";
      let fullResponse = "";

      const send = (event, data) => {
        controller.enqueue(
          encoder.encode(sseEvent(event, data))
        );
      };

      try {
        while (true) {
          const { value, done } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, {
            stream: true
          });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const rawLine of lines) {
            const line = rawLine.trim();

            if (!line.startsWith("data:")) continue;

            const payload = line.slice(5).trim();

            if (!payload || payload === "[DONE]") {
              continue;
            }

            let data;

            try {
              data = JSON.parse(payload);
            } catch {
              continue;
            }

            const token =
              data?.choices?.[0]?.delta?.content;

            if (token) {
              fullResponse += token;
              send("token", {
                content: token
              });
            }
          }
        }

        if (buffer.trim().startsWith("data:")) {
          const payload = buffer.trim().slice(5).trim();

          if (payload && payload !== "[DONE]") {
            try {
              const data = JSON.parse(payload);
              const token =
                data?.choices?.[0]?.delta?.content;

              if (token) {
                fullResponse += token;
                send("token", {
                  content: token
                });
              }
            } catch {}
          }
        }

        send("done", {
          response: fullResponse,
          project: null,
          events: [],
          streamed: true
        });

        controller.close();
      } catch (error) {
        send("error", {
          error: error.message || "Streaming gagal."
        });

        controller.close();
      }
    }
  });

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive"
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
        }
      });
    }

    if (url.pathname === "/api/status") {
      return json({
        status: "ready",
        message: "Termux AI Worker berjalan",
        runtime: "cloudflare-workers",
        provider: MODEL
      });
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      return handleChat(request, false);
    }

    if (url.pathname === "/api/chat/stream" && request.method === "POST") {
      return handleChat(request, true);
    }

    if (url.pathname.startsWith("/api/")) {
      return json({
        error: "Endpoint API tidak ditemukan."
      }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};
