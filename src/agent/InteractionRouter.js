'use strict';

class InteractionRouter {
  constructor(options = {}) {
    this.executionPatterns = options.executionPatterns || [
      /\b(kerjakan|jalankan|eksekusi|execute|implementasikan|implement|tambahkan|buatkan|bikinkan|bangunkan|bangunlah|pasangkan|instal(?:l)?|install|perbaiki|fix|debug(?:ging)?|uji(?:kan)?|test(?:ing)?|deploy|hapuskan|pindahkan|rename|ubah(?:kan)?|edit(?:kan)?|generate|hasilkan)\b/i,
      /\b(ayo|oke|ok|siap|gas)[,!.]?\s+(kita\s+)?(buat|bikin|bangun|kerjakan|mulai|lanjutkan|implementasikan|perbaiki|jalankan)\b/i,
      /^\s*(gas|kerjakan|jalankan|eksekusi|lanjutkan)\s*!*\s*$/i
    ];
    this.conversationPatterns = options.conversationPatterns || [
      /\b(hanya|cuma|sekadar|sekedar)\s+(ngobrol|tanya|diskusi|bahas)\b/i,
      /\b(menurutmu|menurut kamu|gimana menurutmu|bagaimana menurutmu|pendapatmu|pendapat kamu)\b/i,
      /\b(kepikiran|punya ide|saya ada ide|aku ada ide|saya ingin|aku ingin|ingin tahu|penasaran|ceritain|jelaskan|jelasin|bisa nggak|bisa tidak|apakah bisa)\b/i,
      /\?\s*$/i
    ];
  }

  analyze(message, context = {}) {
    const text = String(message || '').trim();
    const explicitAction = /\b(kerjakan|jalankan|eksekusi|buatkan|bikinkan|implementasikan|perbaiki|install|pasang|tambahkan|hapuskan|pindahkan|rename|ubah|edit|generate|test|uji|deploy)\b/i.test(text);
    const conversational = this.conversationPatterns.some(re => re.test(text));
    const confirmation = /^\s*(oke|ok|siap|gas|lanjut|lanjutkan|mulai|kerjakan)\s*!*\s*$/i.test(text);
    const hasActiveTask = !!context.hasActiveTask;
    const executionSignal = this.executionPatterns.some(re => re.test(text));

    return {
      route: conversational && !explicitAction
        ? 'chat'
        : (confirmation ? (hasActiveTask ? 'execute' : 'chat') : (executionSignal ? 'execute' : 'chat')),
      explicitAction,
      conversational,
      confirmation,
      hasActiveTask
    };
  }

  getMode(message, context = {}) {
    const text = String(message || '').trim();
    const analysis = this.analyze(text, context);

    if (analysis.route === 'chat') {
      return 'chat';
    }

    // Fast path hanya untuk permintaan terminal sederhana,
    // eksplisit, dan berisiko rendah.
    const simpleAction =
      /^(jalankan|eksekusi|run)\\s+(pwd|ls(?:\\s+-[a-z-]+)?|whoami|git\\s+status|git\\s+branch|node\\s+--version|npm\\s+--version|termux-info)\\s*[.!]?$/i.test(text) ||
      /^(cek|lihat|tampilkan)\\s+(pwd|git\\s+status|git\\s+branch|node\\s+--version|npm\\s+--version)\\s*[.!]?$/i.test(text);

    if (simpleAction && !analysis.hasActiveTask) {
      return 'fast';
    }

    return 'agent';
  }

  isExecutionRequest(message, context = {}) {
    const text = String(message || '').trim();
    const confirmation = /^\s*(oke|ok|siap|gas|lanjut|lanjutkan|mulai|kerjakan)\s*!*\s*$/i.test(text);

    // A short confirmation is never an action by itself unless a task is active.
    if (confirmation) return !!context.hasActiveTask;

    return this.analyze(message, context).route === 'execute';
  }

  classify(message, context = {}) {
    return this.analyze(message, context).route;
  }
}

module.exports = InteractionRouter;
