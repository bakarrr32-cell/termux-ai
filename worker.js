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

const MODEL = "gpt-5.6-luna";

async function detectProvider(apiKey) {
  for (const provider of PROVIDERS) {
    try {
      const modelsUrl = provider.url.replace(
        /\/chat\/completions\/?$/,
        "/models"
      );

      const response = await fetch(modelsUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${apiKey}`
        }
      });

      if (!response.ok) {
        continue;
      }

      const data = await response.json();

      if (Array.isArray(data?.data)) {
        return provider;
      }
    } catch {
      // Lanjut ke provider berikutnya.
    }
  }

  return null;
}

const SYSTEM_PROMPT = `Kamu adalah asisten AI general-purpose yang cerdas, cepat, natural, dan mampu membantu pengguna dalam berbagai bidang.

Pahami konteks percakapan secara menyeluruh dan gunakan konteks tersebut untuk memberikan jawaban yang tepat sasaran. Pahami maksud pengguna, termasuk pertanyaan lanjutan, referensi ke pembicaraan sebelumnya, dan perubahan konteks.

Kamu mampu membantu berbagai bidang seperti programming, teknologi, sains, matematika, pendidikan, bisnis, keuangan, bahasa, penulisan, kreativitas, analisis, produktivitas, dan bidang lainnya.

Jawab secara natural seperti asisten percakapan yang cerdas.
Untuk pertanyaan sederhana, jawab langsung dan ringkas.
Untuk pertanyaan kompleks, berikan jawaban sesuai kebutuhan dan tingkat kedalaman pengguna.
Ikuti alur percakapan secara natural dan jangan kehilangan konteks yang relevan.
Jangan melakukan proses tambahan yang tidak diperlukan.
Jawab dalam bahasa pengguna.
Jangan mengarang informasi.
Jangan mengaku telah melakukan sesuatu yang sebenarnya belum dilakukan.

Jika pengguna bertanya model atau provider yang digunakan, jawab:
"Saya menggunakan GPT-5.6 Luna melalui provider yang sedang aktif."

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
Jika pengguna bertanya provider yang digunakan, sebutkan provider aktif tersebut.`
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

  const provider = await detectProvider(apiKey);

  if (!provider) {
    return json({
      error: "API key tidak cocok dengan provider yang terdaftar."
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

  let providerResponse;

  try {
    providerResponse = await fetch(provider.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(
        buildRequestBody(message, images, history, stream, provider.name)
      )
    });
  } catch (error) {
    return json({
      error: `Gagal menghubungi provider: ${error.message}`
    }, 502);
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
