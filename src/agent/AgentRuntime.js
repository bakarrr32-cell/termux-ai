const InteractionRouter = require('./InteractionRouter');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const ACTION_RE = /<TERMUX_ACTION>\s*([\s\S]*?)\s*<\/TERMUX_ACTION>/i;

class CommandExecutor {
  constructor(options = {}) {
    this.root = path.resolve(options.root || process.cwd());
    this.timeout = Number(options.timeout || 120000);
    this.maxBuffer = Number(options.maxBuffer || 2 * 1024 * 1024);
  }

  static isSensitiveCommand(command) {
    const text = String(command || '').toLowerCase();
    return /(^|[;&|]\s*)(rm\s+-rf\s+\/|rm\s+-rf\s+~|mkfs\b|dd\s+if=|shutdown\b|reboot\b|poweroff\b|wipefs\b)|git\s+reset\s+--hard|git\s+clean\s+-fd|git\s+push\s+--force/.test(text);
  }

  execute(command, options = {}) {
    const cmd = String(command || '').trim();
    if (!cmd) return Promise.reject(new Error('Command kosong.'));

    const cwd = path.resolve(options.cwd || this.root);
    if (!cwd.startsWith(this.root)) {
      return Promise.reject(new Error('cwd harus berada di dalam project aktif.'));
    }

    if (CommandExecutor.isSensitiveCommand(cmd)) {
      return Promise.resolve({
        ok: false,
        blocked: true,
        requiresApproval: true,
        command: cmd,
        cwd,
        stdout: '',
        stderr: 'Perintah ditahan karena termasuk operasi berisiko. Menunggu persetujuan user.'
      });
    }

    return new Promise(resolve => {
      const child = exec(cmd, {
        cwd,
        timeout: Number(options.timeout || this.timeout),
        maxBuffer: Number(options.maxBuffer || this.maxBuffer),
        windowsHide: true,
        shell: process.env.SHELL || (fs.existsSync('/system/bin/sh') ? '/system/bin/sh' : '/bin/sh')
      }, (error, stdout, stderr) => {
        resolve({
          ok: !error,
          blocked: false,
          requiresApproval: false,
          command: cmd,
          cwd,
          code: error && typeof error.code === 'number' ? error.code : (error ? 1 : 0),
          signal: error && error.signal ? error.signal : null,
          timedOut: !!(error && error.killed),
          stdout: String(stdout || '').slice(0, this.maxBuffer),
          stderr: String(stderr || '').slice(0, this.maxBuffer),
          error: error ? String(error.message || error) : null
        });
      });

      child.on('error', error => {
        resolve({
          ok: false,
          blocked: false,
          requiresApproval: false,
          command: cmd,
          cwd,
          code: 1,
          signal: null,
          timedOut: false,
          stdout: '',
          stderr: String(error.message || error),
          error: String(error.message || error)
        });
      });
    });
  }
}

function stripAction(text) {
  return String(text || '').replace(ACTION_RE, '').replace(/^\s+|\s+$/g, '');
}

function normalizeActionPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const command = String(payload.command || '').trim();
  if (!command) return null;
  return {
    command,
    reason: String(payload.reason || '').trim(),
    cwd: payload.cwd ? String(payload.cwd) : undefined
  };
}

function parseAction(text) {
  const source = String(text || '');
  const match = source.match(ACTION_RE);
  if (!match) return null;

  let payload;
  try {
    payload = JSON.parse(match[1]);
  } catch (error) {
    return { error: `TERMUX_ACTION JSON tidak valid: ${error.message}` };
  }

  const action = normalizeActionPayload(payload);
  if (!action) return { error: 'TERMUX_ACTION harus memiliki field command.' };
  return action;
}


class AgentRuntime {
  constructor(assistant, options = {}) {
    this.assistant = assistant;
    this.executor = options.executor || new CommandExecutor({ root: process.cwd() });
    this.maxTurns = Number(options.maxTurns || 8);
    this.interactionRouter = options.interactionRouter || new InteractionRouter();
  }

  buildExecutionSystem() {
    return [
      'TERMUX AGENT EXECUTION MODE:',
      '',
      'Kamu adalah AI assistant yang dapat bekerja langsung pada project aktif melalui executor Termux.',
      'Jika user meminta pekerjaan yang dapat dilakukan di project/terminal, kerjakan sendiri bila aman.',
      'Jangan menyuruh user copy-paste command yang sebenarnya bisa kamu jalankan sendiri.',
      'Jika perlu menjalankan command, keluarkan SATU action saja dengan format persis:',
      '<TERMUX_ACTION>{"command":"...","reason":"...","cwd":"."}</TERMUX_ACTION>',
      'Jangan bungkus TERMUX_ACTION dengan markdown.',
      'Setelah executor mengembalikan hasil, analisis hasil itu dan lanjutkan pekerjaan bila masih diperlukan.',
      'Jangan mengarang output command atau file yang belum diverifikasi.',
      'Jangan menampilkan API key, token, password, cookie, atau isi .env.',
      'Operasi berisiko akan ditahan dan harus meminta persetujuan user.',
      'Jika pekerjaan selesai, berikan ringkasan singkat dan hasil nyata yang sudah diverifikasi.',
      'Jika membutuhkan input user yang memang tidak dapat diperoleh dari environment, minta input tersebut secara jelas.'
    ].join('\n');
  }

  async runStream(message, options = {}) {
    const text = String(message || '').trim();
    if (!text) throw new Error('Pesan tidak boleh kosong.');

    const images = Array.isArray(options.images) ? options.images : [];
    const safeImages = images.filter(image =>
      image &&
      typeof image.dataUrl === 'string' &&
      /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(image.dataUrl)
    );

    if (safeImages.length > 4) throw new Error('Maksimal 4 gambar per pesan.');
    if (safeImages.some(image => image.dataUrl.length > 11 * 1024 * 1024)) {
      throw new Error('Ukuran gambar terlalu besar.');
    }

    const onToken = typeof options.onToken === 'function'
      ? options.onToken
      : async () => {};

    const task = this.assistant.developerAgent &&
      this.assistant.developerAgent.taskStore
      ? this.assistant.developerAgent.taskStore.get()
      : null;

    const routeContext = {
      hasActiveTask: !!(task && task.status === 'active')
    };

    const route = this.interactionRouter.classify(text, routeContext);
    const mode = this.interactionRouter.getMode(text, routeContext);

    if (route === 'chat') {
      this.assistant.conversation.addUserMessage(text || '[Gambar terlampir]');

      const messages = await this.assistant.buildMessages(false);

      if (safeImages.length) {
        for (let i = messages.length - 1; i >= 0; i -= 1) {
          if (messages[i].role === 'user') {
            const original = typeof messages[i].content === 'string'
              ? messages[i].content
              : '';
            messages[i] = {
              role: 'user',
              content: [
                { type: 'text', text: original || 'Tolong analisis gambar ini.' },
                ...safeImages.map(image => ({
                  type: 'image_url',
                  image_url: { url: image.dataUrl }
                }))
              ]
            };
            break;
          }
        }
      }

      let response = '';
      await this.assistant.engine.chatStream(messages, {}, async token => {
        response += token;
        await onToken(token);
      });

      this.assistant.recordAssistantResponse(response);
      return { response, events: [] };
    }

    this.assistant.conversation.addUserMessage(text || '[Gambar terlampir]');
    this.assistant.developerAgent.syncTask(text);

    const base = await this.assistant.buildMessages(true);
    const messages = [
      ...base,
      { role: 'system', content: this.buildExecutionSystem() },
      {
        role: 'system',
        content: [
          'DEVELOPER EXECUTION ENFORCEMENT:',
          'Untuk permintaan yang meminta membuat, mengubah, menghapus, membaca, memeriksa, menjalankan, atau menguji file/project/terminal:',
          'JANGAN memberikan jawaban final sebelum pekerjaan benar-benar diverifikasi.',
          'Keluarkan tepat SATU TERMUX_ACTION jika tindakan terminal diperlukan.',
          'Setelah hasil executor diterima, gunakan hasil tersebut sebagai bukti dan lanjutkan sampai tugas selesai.',
          'Jika action sebelumnya gagal, perbaiki command berdasarkan stderr dan coba lagi bila aman.',
          'Jika action sebelumnya berhasil tetapi tugas belum selesai, keluarkan action berikutnya.',
          'Hanya jawab final setelah kondisi tugas dapat dibuktikan dari hasil executor.'
        ].join('\n')
      }
    ];

    if (safeImages.length) {
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (messages[i].role === 'user') {
          const original = typeof messages[i].content === 'string'
            ? messages[i].content
            : '';
          messages[i] = {
            role: 'user',
            content: [
              { type: 'text', text: original || 'Tolong analisis gambar ini.' },
              ...safeImages.map(image => ({
                type: 'image_url',
                image_url: { url: image.dataUrl }
              }))
            ]
          };
          break;
        }
      }
    }

    const events = [];
    const emit = typeof options.onEvent === 'function'
      ? options.onEvent
      : () => {};

    const executedCommands = [];
    let finalText = '';
    const maxTurns = Math.max(this.maxTurns, 12);
    const ACTION_MARKER = '<TERMUX_ACTION>';
    const HOLD_SIZE = ACTION_MARKER.length - 1;

    for (let turn = 1; turn <= maxTurns; turn += 1) {
      let response = '';
      let hold = '';
      let actionDetected = false;

      await this.assistant.engine.chatStream(messages, {}, async token => {
        response += token;

        if (actionDetected) return;

        hold += token;
        const markerIndex = hold.indexOf(ACTION_MARKER);

        if (markerIndex >= 0) {
          const visible = hold.slice(0, markerIndex);
          if (visible) await onToken(visible);
          actionDetected = true;
          return;
        }

        if (hold.length > HOLD_SIZE) {
          const visible = hold.slice(0, hold.length - HOLD_SIZE);
          hold = hold.slice(-HOLD_SIZE);
          if (visible) await onToken(visible);
        }
      });

      const action = parseAction(response);

      if (action && action.error) {
        if (hold && !actionDetected) await onToken(hold);

        messages.push({ role: 'assistant', content: response });
        messages.push({
          role: 'system',
          content: [
            `ACTION ERROR: ${action.error}`,
            'Keluarkan ulang SATU TERMUX_ACTION dengan JSON valid.',
            'Jangan memberikan jawaban final sampai action yang diperlukan berhasil.'
          ].join('\n')
        });
        continue;
      }

      if (!action) {
        if (hold && !actionDetected) await onToken(hold);
        finalText = stripAction(response) || response;
        break;
      }

      const normalizedCommand = action.command.replace(/\s+/g, ' ').trim();
      const repeats = executedCommands.filter(item => item === normalizedCommand).length;

      if (repeats >= 2) {
        const loopEvent = {
          type: 'agent_loop_guard',
          turn,
          command: action.command,
          reason: 'Action yang sama diminta berulang kali tanpa kemajuan.'
        };
        events.push(loopEvent);
        emit(loopEvent);

        messages.push({ role: 'assistant', content: response });
        messages.push({
          role: 'system',
          content: [
            'AGENT LOOP GUARD:',
            'Action yang sama sudah dijalankan dua kali tanpa kemajuan.',
            'Jangan ulangi command tersebut.',
            'Analisis hasil executor sebelumnya, ubah pendekatan, atau minta informasi yang benar-benar diperlukan.',
            'Jangan mengklaim tugas selesai tanpa bukti.'
          ].join('\n')
        });
        continue;
      }

      executedCommands.push(normalizedCommand);

      const status = {
        type: 'action',
        turn,
        command: action.command,
        reason: action.reason
      };

      events.push(status);
      emit(status);

      const result = await this.executor.execute(action.command, {
        cwd: action.cwd
          ? path.resolve(this.executor.root, action.cwd)
          : this.executor.root
      });

      const resultEvent = {
        type: result.requiresApproval ? 'approval_required' : 'action_result',
        turn,
        ok: result.ok,
        blocked: !!result.blocked,
        command: result.command,
        cwd: result.cwd,
        code: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.error || null
      };

      events.push(resultEvent);
      emit(resultEvent);

      if (result.ok && this.assistant.developerAgent) {
        try {
          this.assistant.developerAgent.recordEvidence(
            `Executor OK: ${result.command} (turn ${turn})`
          );
          this.assistant.developerAgent.invalidateCaches();
        } catch {}
      }

      messages.push({
        role: 'assistant',
        content: response
      });

      messages.push({
        role: 'system',
        content: [
          'HASIL EXECUTOR TERMUX (BUKTI AKTUAL):',
          JSON.stringify(result, null, 2),
          '',
          result.requiresApproval
            ? 'Perintah belum dijalankan. Jelaskan bahwa persetujuan user diperlukan dan jangan mencoba mengulanginya.'
            : result.ok
              ? 'Executor berhasil. Periksa apakah tujuan user sudah benar-benar tercapai. Jika belum, keluarkan TERMUX_ACTION berikutnya. Jika sudah, berikan jawaban final.'
              : 'Executor gagal. Baca stderr/error secara teliti, perbaiki command, lalu keluarkan TERMUX_ACTION berikutnya bila aman. Jangan mengarang keberhasilan.'
        ].join('\n')
      });

      if (result.requiresApproval) {
        finalText =
          'Saya menemukan tindakan yang perlu persetujuan dulu:\n\n' +
          '`' + action.command + '`\n\n' +
          (action.reason || 'Perintah ini berisiko.') +
          '\n\nKalau memang kamu setujui, bilang **setujui**.';
        await onToken(finalText);
        break;
      }
    }

    if (!finalText) {
      finalText =
        'Agent berhenti setelah batas langkah otomatis tercapai. ' +
        'Tidak ada tindakan tambahan yang dijalankan tanpa kontrol.';
      await onToken(finalText);
    }

    if (finalText && this.assistant.developerAgent) {
      try {
        this.assistant.developerAgent.verify({
          ok: events.some(event => event.type === 'action_result' && event.ok === true),
          completedAt: new Date().toISOString(),
          turns: events.filter(event => event.type === 'action_result').length
        });
      } catch {}
    }

    this.assistant.recordAssistantResponse(finalText);
    return { response: finalText, events };
  }

  async run(message, options = {}) {
    const text = String(message || '').trim();
    if (!text) throw new Error('Pesan tidak boleh kosong.');

    const task = this.assistant.developerAgent && this.assistant.developerAgent.taskStore
      ? this.assistant.developerAgent.taskStore.get()
      : null;
    const routeContext = {
      hasActiveTask: !!(task && task.status === 'active')
    };

    const route = this.interactionRouter.classify(text, routeContext);
    const mode = this.interactionRouter.getMode(text, routeContext);

    // Multimodal input is normalized before any route can consume it.
    // This avoids the JavaScript temporal-dead-zone error where safeImages
    // was referenced by the conversation route before initialization.
    const images = Array.isArray(options.images) ? options.images : [];
    const safeImages = images.filter(image => image && typeof image.dataUrl === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(image.dataUrl));
    if (safeImages.length > 4) throw new Error('Maksimal 4 gambar per pesan.');
    if (safeImages.some(image => image.dataUrl.length > 11 * 1024 * 1024)) throw new Error('Ukuran gambar terlalu besar.');

    // Conversation-first: normal chat never invokes the terminal executor.
    if (route === 'chat') {
      if (typeof this.assistant.ask === 'function') {
        const response = await this.assistant.ask(text, { images: safeImages });
        return { response, events: [] };
      }

      if (this.assistant.engine && typeof this.assistant.engine.chat === 'function') {
        const messages = await this.assistant.buildMessages(false);
        const response = await this.assistant.engine.chat(messages);
        if (typeof this.assistant.recordAssistantResponse === 'function') {
          this.assistant.recordAssistantResponse(response);
        }
        return { response, events: [] };
      }

      throw new Error('Assistant tidak menyediakan jalur chat.');
    }
    if (safeImages.length > 4) throw new Error('Maksimal 4 gambar per pesan.');
    if (safeImages.some(image => image.dataUrl.length > 11 * 1024 * 1024)) throw new Error('Ukuran gambar terlalu besar.');

    this.assistant.conversation.addUserMessage(text || '[Gambar terlampir]');
    this.assistant.developerAgent.syncTask(text);

    const base = await this.assistant.buildMessages(true);
    const messages = [
      ...base,
      { role: 'system', content: this.buildExecutionSystem() }
    ];

    if (safeImages.length > 0) {
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (messages[i].role === 'user') {
          const original = typeof messages[i].content === 'string' ? messages[i].content : '';
          messages[i] = {
            role: 'user',
            content: [
              { type: 'text', text: original || 'Tolong analisis gambar ini.' },
              ...safeImages.map(image => ({ type: 'image_url', image_url: { url: image.dataUrl } }))
            ]
          };
          break;
        }
      }
    }

    const events = [];
    const emit = typeof options.onEvent === 'function' ? options.onEvent : () => {};
    let finalText = '';

    for (let turn = 1; turn <= this.maxTurns; turn += 1) {
      const response = await this.assistant.engine.chat(messages);
      const action = parseAction(response);

      if (action && action.error) {
        messages.push({ role: 'assistant', content: response });
        messages.push({ role: 'system', content: `ACTION ERROR: ${action.error}. Jangan ulangi format yang salah.` });
        continue;
      }

      if (!action) {
        finalText = stripAction(response) || response;
        break;
      }

      const status = {
        type: 'action',
        turn,
        command: action.command,
        reason: action.reason
      };
      events.push(status);
      emit(status);

      const result = await this.executor.execute(action.command, {
        cwd: action.cwd ? path.resolve(this.executor.root, action.cwd) : this.executor.root
      });

      const resultEvent = {
        type: result.requiresApproval ? 'approval_required' : 'action_result',
        turn,
        ok: result.ok,
        blocked: !!result.blocked,
        command: result.command,
        cwd: result.cwd,
        code: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.error || null
      };
      events.push(resultEvent);
      emit(resultEvent);

      messages.push({ role: 'assistant', content: stripAction(response) || response });
      messages.push({
        role: 'system',
        content: [
          'HASIL EXECUTOR TERMUX (BUKTI AKTUAL):',
          JSON.stringify(result, null, 2),
          '',
          result.requiresApproval
            ? 'Perintah belum dijalankan. Jelaskan kepada user bahwa persetujuan diperlukan.'
            : 'Gunakan hasil aktual ini untuk menentukan tindakan berikutnya. Jika pekerjaan belum selesai, keluarkan TERMUX_ACTION berikutnya. Jika selesai, jawab hasil akhirnya.'
        ].join('\n')
      });

      if (result.requiresApproval) {
        finalText = `Saya menemukan tindakan yang perlu persetujuan dulu:\n\n\`${action.command}\`\n\n${action.reason || 'Perintah ini berisiko.'}\n\nKalau memang kamu setujui, bilang **setujui**.`;
        break;
      }
    }

    if (!finalText) {
      finalText = 'Pekerjaan belum selesai dalam batas eksekusi otomatis. Saya berhenti dulu agar tidak menjalankan tindakan tanpa kontrol.';
    }

    this.assistant.recordAssistantResponse(finalText);
    return { response: finalText, events };
  }
}

module.exports = { AgentRuntime, CommandExecutor, parseAction, stripAction };
