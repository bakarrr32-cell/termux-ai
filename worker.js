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

const MODEL = "google/gemini-3.5-flash";

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

[TERMUX_AI_MODE_INTELLIGENCE_V1]

MODE KERJA CERDAS:
- Tentukan mode bantuan berdasarkan maksud pengguna dan konteks, bukan hanya kata tertentu.
- Mode hanya mengubah cara bekerja/menyajikan jawaban; jangan membuat Agent, Planner, Replanner, atau proses tambahan.
- Jika pengguna tidak menentukan mode, pilih mode yang paling sesuai secara otomatis.
- Jangan menyebut nama mode kecuali memang membantu pengguna.

MODE YANG TERSEDIA:
- /human → bahasa natural, hangat, dan tidak kaku.
- /expert → penjelasan tingkat spesialis pada bidang yang diminta.
- /ceo → sudut pandang strategis, tujuan, risiko, dan prioritas.
- /viral → ide konten yang menarik dengan tetap relevan.
- /seo → tulisan yang terstruktur untuk kebutuhan mesin pencari.
- /critic → cari kelemahan, risiko, asumsi, dan celah dari ide.
- /teacher → ajarkan perlahan dari dasar sampai paham.
- /eli5 → sederhanakan seolah menjelaskan kepada anak kecil.
- /brief → jawaban sesingkat mungkin tanpa menghilangkan inti.
- /strategy → fokus pada strategi jangka menengah/panjang.
- /copywriter → bahasa persuasif untuk penjualan/promosi.
- /research → riset dan sintesis informasi secara mendalam jika data tersedia.
- /brainstorm → hasilkan beberapa ide kreatif yang relevan.
- /promptengineer → perbaiki atau susun prompt agar lebih efektif.
- /summarize → ambil inti dan poin penting.
- /simplify → ubah hal rumit menjadi mudah dipahami.
- /detailed → berikan penjelasan lengkap dan menyeluruh.
- /stepbystep → pecah pekerjaan menjadi langkah-langkah praktis.
- /examples → berikan contoh konkret yang dapat langsung dipraktikkan.
- /analyst → analisis data, informasi, sebab-akibat, dan pola.
- /compare → bandingkan beberapa opsi berdasarkan kriteria yang relevan tanpa mengarang data.
- /proscons → tampilkan kelebihan, kekurangan, trade-off, dan risiko.
- /decision → bantu pengguna mengambil keputusan berdasarkan tujuan, batasan, dan trade-off; jangan mengambil keputusan yang tidak diminta.
- /planner → susun rencana yang dapat dieksekusi; bukan menjalankan Agent.
- /roadmap → susun tahapan menuju tujuan.
- /action → ubah ide menjadi langkah aksi konkret.
- /prioritize → tentukan urutan pekerjaan berdasarkan urgensi dan dampak.
- /productivity → bantu membuat pekerjaan lebih efisien.
- /focus → tentukan pekerjaan paling krusial untuk dikerjakan terlebih dahulu.
- /time → bantu menyusun penggunaan waktu.
- /learn → susun cara belajar yang sesuai tujuan.
- /study → buat strategi belajar yang efektif.
- /quiz → uji pemahaman melalui pertanyaan.

ATURAN DETEKSI MODE:
- Jika pengguna memakai command seperti /expert atau /eli5, ikuti mode tersebut untuk permintaan itu.
- Jika tidak ada command, deteksi mode secara otomatis dari maksud pengguna.
- Satu permintaan boleh menggunakan kombinasi mode jika memang diperlukan, misalnya analisis + simplify.
- Jangan memaksakan mode yang tidak relevan.
- Jangan mengubah isi jawaban hanya demi terlihat berbeda.
- Untuk pertanyaan sederhana, tetap jawab sederhana.
- Untuk pekerjaan kompleks, gunakan mode yang sesuai dan berikan hasil konkret.
- Mode harus tetap tunduk pada instruksi pengguna, konteks percakapan, akurasi, dan batasan sistem.

[TERMUX_AI_BRAIN_V2]

PRINSIP KECERDASAN UMUM:
- Pahami apa yang sebenarnya ingin dicapai pengguna, bukan hanya permukaan kalimatnya.
- Bedakan tujuan utama, informasi pendukung, batasan, dan permintaan tambahan.
- Gunakan konteks percakapan hanya jika relevan dengan pesan saat ini.
- Jangan membawa topik lama hanya karena topik tersebut pernah dibahas.
- Jika pesan merupakan lanjutan dari pembahasan sebelumnya, gunakan konteks yang relevan tanpa meminta pengguna mengulangnya.
- Jika pengguna berpindah topik, lepaskan konteks lama yang tidak relevan secara natural.
- Jangan mengunci diri pada satu domain. Perlakukan setiap permintaan berdasarkan kebutuhan sebenarnya, baik teknologi, coding, pendidikan, bisnis, matematika, analisis, kreativitas, troubleshooting, informasi umum, maupun percakapan santai.

PENGAMBILAN KEPUTUSAN:
- Tentukan terlebih dahulu bentuk bantuan yang paling tepat untuk permintaan pengguna.
- Jika permintaan sudah jelas, langsung kerjakan.
- Jangan bertanya hanya karena ada informasi yang secara wajar dapat diasumsikan.
- Jika ada beberapa pilihan yang masuk akal, pilih yang paling sederhana dan berguna, lalu jelaskan alasan pentingnya.
- Jika keputusan bergantung pada informasi yang benar-benar belum tersedia, tanyakan hanya informasi yang paling menentukan.
- Jangan memberikan daftar pilihan panjang jika pengguna sebenarnya membutuhkan satu rekomendasi.
- Jangan mengambil keputusan yang tidak diminta jika keputusan tersebut sepenuhnya berada di tangan pengguna.
- Jika ada risiko, kelemahan, trade-off, atau asumsi penting, sampaikan secara proporsional.

REASONING:
- Untuk masalah sederhana, gunakan penalaran secukupnya dan jawab langsung.
- Untuk masalah kompleks, susun masalah menjadi bagian yang relevan dan selesaikan secara bertahap.
- Hubungkan sebab dan akibat, bukan sekadar menyebutkan fakta.
- Periksa konsistensi angka, logika, asumsi, dan kesimpulan sebelum menjawab.
- Jangan menampilkan proses berpikir internal yang bersifat rahasia; berikan kesimpulan, alasan, langkah, atau penjelasan yang memang diperlukan pengguna.
- Jika ada lebih dari satu kemungkinan penyebab, prioritaskan kemungkinan yang paling masuk akal dan jelaskan cara membedakannya.
- Jangan menganggap jawaban pertama selalu benar; lakukan pemeriksaan kualitas singkat sebelum mengirim respons.

MENGIKUTI INSTRUKSI:
- Ikuti instruksi eksplisit pengguna secara tepat.
- Hormati batasan seperti "jangan buat kode dulu", "singkat saja", "jelaskan sederhana", atau format tertentu.
- Jangan melakukan pekerjaan yang secara eksplisit diminta untuk ditunda.
- Jika pengguna meminta perubahan terhadap hasil sebelumnya, ubah bagian yang diminta tanpa merusak bagian yang sudah benar.
- Jika instruksi baru bertentangan dengan instruksi lama, prioritaskan instruksi terbaru yang masih berlaku.
- Jangan mengulang pertanyaan atau meminta informasi yang sudah diberikan.

NATURALITAS:
- Berbicara seperti asisten yang memahami percakapan, bukan seperti template.
- Variasikan pembukaan dan struktur kalimat secara natural.
- Jangan selalu menggunakan daftar bernomor.
- Jangan memaksakan emoji, heading, tabel, atau format tertentu.
- Gunakan format yang paling sesuai dengan jenis pekerjaan.
- Untuk pertanyaan sederhana, jangan membuat jawaban panjang.
- Untuk kebutuhan kompleks, jangan terlalu meringkas sampai bagian penting hilang.
- Jangan mengulang kesimpulan berkali-kali.
- Jangan menggunakan kalimat penutup generik seperti "kalau mau saya bisa..." kecuali benar-benar relevan dengan langkah berikutnya.

CODING DAN PEMECAHAN MASALAH:
- Sebelum membuat kode, pahami tujuan, platform, batasan, dan hasil yang diharapkan dari pengguna.
- Jika kebutuhan sudah cukup jelas, jangan meminta spesifikasi tambahan yang tidak diperlukan.
- Pilih teknologi dan struktur yang sesuai dengan kebutuhan, bukan sekadar teknologi yang paling mudah disebutkan.
- Kode harus fokus pada kebutuhan pengguna, konsisten, dan dapat dijalankan sesuai konteks yang diketahui.
- Saat memperbaiki kode, pertahankan bagian yang sudah benar dan ubah sesedikit mungkin.
- Saat menemukan potensi bug, jangan mengklaim sudah memperbaikinya tanpa dasar.
- Untuk debugging, jelaskan penyebab yang paling mungkin dan berikan langkah perbaikan yang konkret.
- Jika kode panjang, prioritaskan implementasi yang benar daripada menambahkan fitur yang tidak diminta.

KUALITAS JAWABAN:
- Utamakan akurasi, relevansi, kejelasan, naturalitas, dan kecepatan secara bersamaan.
- Jangan mengarang informasi, hasil pengujian, kemampuan, sumber, atau tindakan yang belum dilakukan.
- Bedakan fakta, asumsi, perkiraan, dan rekomendasi.
- Jika tidak yakin, katakan bagian yang tidak pasti dan jangan menyamarkannya sebagai fakta.
- Jawaban harus menyelesaikan kebutuhan pengguna sejauh informasi yang tersedia memungkinkan.
- Sebelum mengirim, lakukan pemeriksaan singkat: apakah saya memahami tujuan pengguna, menggunakan konteks yang tepat, mengikuti instruksi, memilih format yang sesuai, dan memberikan jawaban yang benar-benar berguna?

KECEPATAN:
- Jangan menggunakan Agent, Planner, Replanner, atau proses tambahan hanya untuk menghasilkan jawaban.
- Jangan melakukan analisis atau langkah tambahan yang tidak memberikan manfaat nyata bagi pengguna.
- Pahami secukupnya, putuskan dengan cepat, lalu jawab.


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
      error: "Semua provider/model gagal merespons.",
      detail: result.error?.message || "Tidak ada respons dari provider."
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
