require("dotenv").config();

const express = require("express");
const path = require("path");
const Assistant = require("./src/ai/Assistant");
const { AgentRuntime } = require("./src/agent/AgentRuntime");

const app = express();
const PORT = process.env.PORT || 3000;
const assistant = new Assistant();
const agentRuntime = new AgentRuntime(assistant);

app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, "public")));

function normalizeImages(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(item => item && typeof item.dataUrl === "string").slice(0, 4).map(item => ({
    name: String(item.name || "image"), type: String(item.type || "image/*"), dataUrl: item.dataUrl
  })).filter(item => /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(item.dataUrl));
}

app.get("/api/status", (req, res) => res.json({ status: "ready", message: "Termux AI Assistant berjalan", runtime: assistant.engine.getRuntime() }));
app.get("/api/runtime", (req, res) => res.json(assistant.engine.getRuntime()));
app.get("/api/agent/status", (req, res) => {
  try { res.json({ status: "ready", agent: assistant.getAgentStatus(), project: assistant.getProject(), runtime: assistant.engine.getRuntime() }); }
  catch (error) { res.status(500).json({ error: error.message || "Agent status gagal." }); }
});
app.get("/api/diagnostics", (req, res) => {
  try { res.json({ status: "ready", assistant: { provider: assistant.engine.getInfo() }, runtime: assistant.engine.getRuntime(), project: assistant.getProject() }); }
  catch (error) { res.status(500).json({ status: "error", error: error.message || "Diagnostics gagal." }); }
});
app.get('/api/conversation/export', (req, res) => {
  try {
    const payload = assistant.exportConversation();
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="termux-ai-conversation-${date}.json"`);
    res.json(payload);
  } catch (error) { console.error('CONVERSATION EXPORT ERROR:', error); res.status(500).json({ error: error.message || 'Export conversation gagal.' }); }
});


function getClientApiKey(req) {
  return String(req.headers["x-api-key"] || "").trim();
}

app.post("/api/chat", async (req, res) => {
  const previousApiKey = process.env.NEOKENS_KEY;

  try {
    const clientApiKey = getClientApiKey(req);

    if (!clientApiKey) {
      return res.status(401).json({
        error: "API key belum diatur. Silakan login terlebih dahulu."
      });
    }

    process.env.NEOKENS_KEY = clientApiKey;

    const message = String(req.body?.message || "").trim();

    if (!message) {
      return res.status(400).json({
        error: "Pesan tidak boleh kosong."
      });
    }

    const images = normalizeImages(req.body?.images);
    const result = await agentRuntime.run(message, { images });

    res.json({
      response: result.response,
      project: assistant.getProject(),
      events: result.events
    });

  } catch (error) {
    console.error("CHAT ERROR:", error);

    if (!res.headersSent) {
      res.status(500).json({
        error: error.message || "Terjadi kesalahan."
      });
    }

  } finally {
    if (previousApiKey) {
      process.env.NEOKENS_KEY = previousApiKey;
    } else {
      delete process.env.NEOKENS_KEY;
    }
  }
});

app.post("/api/chat/stream", async (req, res) => {
  const previousApiKey = process.env.NEOKENS_KEY;

  try {
    const clientApiKey = getClientApiKey(req);

    if (!clientApiKey) {
      return res.status(401).json({
        error: "API key belum diatur. Silakan login terlebih dahulu."
      });
    }

    process.env.NEOKENS_KEY = clientApiKey;

    const message = String(req.body?.message || "").trim();

    if (!message) {
      return res.status(400).json({
        error: "Pesan tidak boleh kosong."
      });
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    if (res.flushHeaders) {
      res.flushHeaders();
    }

    const sendEvent = (event, data) => {
      if (!res.writableEnded) {
        res.write(
          "event: " +
          event +
          "\ndata: " +
          JSON.stringify(data) +
          "\n\n"
        );
      }
    };

    const images = normalizeImages(req.body?.images);

    let streamedText = "";

    const result = await agentRuntime.runStream(message, {
      images,

      onToken: async token => {
        streamedText += token;

        sendEvent("token", {
          content: token
        });
      },

      onEvent: event => {
        sendEvent("agent", event);
      }
    });

    sendEvent("done", {
      response: result.response,
      project: assistant.getProject(),
      events: result.events,
      streamed: streamedText.length > 0
    });

    res.end();

  } catch (error) {
    console.error("STREAM ERROR:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        error: error.message || "Terjadi kesalahan."
      });
    }

    sendError(res, error);

  } finally {
    if (previousApiKey) {
      process.env.NEOKENS_KEY = previousApiKey;
    } else {
      delete process.env.NEOKENS_KEY;
    }
  }
});


function sendError(res, error) {
  if (!res.writableEnded) {
    res.write("event: error\n" + "data: " + JSON.stringify({ error: error.message || "Terjadi kesalahan." }) + "\n\n");
    res.end();
  }
}

app.listen(PORT, () => console.log(`🔥 Termux AI Assistant berjalan di http://127.0.0.1:${PORT}`));
