const PROVIDER_URL = "https://api.v2.neokens.com/v1/chat/completions";
const MODEL = "gpt-5.6-luna";

const SYSTEM_PROMPT = `
Kamu adalah Termux AI, asisten AI yang membantu pengguna secara langsung.
Jawab dalam bahasa pengguna.
Untuk pertanyaan sederhana, jawab langsung dan ringkas.
Untuk coding atau tugas teknis, berikan solusi yang jelas, aman, dan dapat langsung digunakan.
Jangan mengaku telah menjalankan sesuatu jika memang belum dijalankan.
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

function buildRequestBody(message, images, stream = false) {
  return {
    model: MODEL,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT.trim()
      },
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
    providerResponse = await fetch(PROVIDER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(
        buildRequestBody(message, images, stream)
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
