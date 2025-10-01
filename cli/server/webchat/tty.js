import { buildExecArgs } from '../../services/docker.js';

function createTTYFactory({ runtime, containerName, ptyLib, workdir, entry }) {
  const DEBUG = process.env.WEBTTY_DEBUG === '1';
  const log = (...args) => { if (DEBUG) console.log('[webchat][tty]', ...args); };
	const factory = () => {
    const wd = workdir || process.cwd();
    const env = { ...process.env, TERM: 'xterm-256color' };
    const shellCmd = entry && String(entry).trim()
      ? entry
      : "(command -v /bin/bash >/dev/null 2>&1 && exec /bin/bash) || exec /bin/sh";
    const execArgs = buildExecArgs(containerName, wd, shellCmd, true);
    let ptyProc = null;
    const outputHandlers = new Set();
    const closeHandlers = new Set();

    const emitOutput = (data) => {
      for (const h of outputHandlers) {
        try { h(data); } catch (_) {}
      }
    };
    const emitClose = () => {
      for (const h of closeHandlers) {
        try { h(); } catch (_) {}
      }
    };

    if (!ptyLib) throw new Error("'node-pty' is required for WebChat sessions.");
    try {
      ptyProc = ptyLib.spawn(runtime, execArgs, {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: process.cwd(),
        env
      });
      log('spawned PTY', { runtime, containerName });
      ptyProc.onData(emitOutput);
      ptyProc.onExit(() => {
        log('pty exit');
        emitClose();
      });
    } catch (e) {
      log('pty spawn failed', e?.message || e);
      throw e;
    }

    return {
      onOutput(handler) {
        if (handler) outputHandlers.add(handler);
        return () => outputHandlers.delete(handler);
      },
      onClose(handler) {
        if (handler) closeHandlers.add(handler);
        return () => closeHandlers.delete(handler);
      },
      write(data) {
        if (DEBUG) log('write', { bytes: Buffer.byteLength(data || '') });
        try { ptyProc?.write?.(data); } catch (e) { log('write error', e?.message || e); }
      },
      resize(cols, rows) {
        try { ptyProc?.resize?.(cols, rows); } catch (e) { log('resize error', e?.message || e); }
      },
      close() {
        try { ptyProc?.kill?.(); } catch (_) {}
      }
    };
  };

  return { create: factory };
}

export { createTTYFactory, createLocalTTYFactory };

function createLocalTTYFactory({ ptyLib, workdir, command }) {
  const DEBUG = process.env.WEBTTY_DEBUG === '1';
  const log = (...args) => { if (DEBUG) console.log('[webchat][tty-local]', ...args); };
  const factory = () => {
    const wd = workdir || process.cwd();
    const env = { ...process.env, TERM: 'xterm-256color' };
    let ptyProc = null;
    const outputHandlers = new Set();
    const closeHandlers = new Set();
    const emitOutput = (data) => {
      for (const h of outputHandlers) {
        try { h(data); } catch (_) {}
      }
    };
    const emitClose = () => {
      for (const h of closeHandlers) {
        try { h(); } catch (_) {}
      }
    };

		const hasCustom = !!(command && String(command).trim());
		const parentShell = process.env.WEBCHAT_SHELL || process.env.SHELL || '/bin/sh';
		const fallbackEntry = 'command -v /bin/bash >/dev/null 2>&1 && exec /bin/bash || exec /bin/sh';

		function startProc({ entry, isFallback } = {}) {
			const useEntry = entry && String(entry).trim() ? String(entry) : fallbackEntry;
			const shCmd = `cd '${wd}' && ${useEntry}`;
			if (!ptyLib) throw new Error("'node-pty' is required for local WebChat sessions.");
			try {
				ptyProc = ptyLib.spawn(parentShell, ['-lc', shCmd], {
					name: 'xterm-color',
					cols: 80,
					rows: 24,
					cwd: wd,
					env
				});
				ptyProc.onData(emitOutput);
				ptyProc.onExit(() => {
					log('local pty exit', { isFallback: !!isFallback });
					if (!isFallback && hasCustom) {
						try { startProc({ entry: fallbackEntry, isFallback: true }); return; } catch (_) {}
					}
					emitClose();
				});
			} catch (e) {
				log('local pty spawn failed', e?.message || e);
				throw e;
			}
		}

		// Start with custom command if provided; fallback to base shell after it exits
		startProc({ entry: hasCustom ? String(command) : fallbackEntry, isFallback: !hasCustom });

    return {
      onOutput(handler) { if (handler) outputHandlers.add(handler); return () => outputHandlers.delete(handler); },
      onClose(handler) { if (handler) closeHandlers.add(handler); return () => closeHandlers.delete(handler); },
      write(data) { try { ptyProc?.write?.(data); } catch (e) { log('write error', e?.message || e); } },
      resize(cols, rows) { try { ptyProc?.resize?.(cols, rows); } catch (e) { log('resize error', e?.message || e); } },
      close() { try { ptyProc?.kill?.(); } catch (_) {} }
    };
  };

  return { create: factory };
}
