export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/status") {
      return Response.json({
        status: "ready",
        message: "Termux AI Worker berjalan",
        runtime: "cloudflare-workers"
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json(
        {
          error: "API Worker sedang dalam tahap migrasi."
        },
        { status: 501 }
      );
    }

    return env.ASSETS.fetch(request);
  }
};
