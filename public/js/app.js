(function () {
  'use strict';

  // -----------------------------------------------------------------------
  // Workspace setup
  // -----------------------------------------------------------------------
  const workspace = Blockly.inject('blocklyDiv', {
    toolbox: window.QUINT_TOOLBOX,
    renderer: 'zelos',
    trashcan: true,
    zoom: { controls: true, wheel: true, startScale: 0.95 },
    grid: { spacing: 25, length: 3, colour: '#e3e7f5', snap: true },
    move: { scrollbars: true, drag: true, wheel: true },
  });

  // -----------------------------------------------------------------------
  // Backend feature-detection. Quint's editor, code view, save/load and
  // source-project export all work with no server at all (e.g. hosted as a
  // static site on GitHub Pages). Real jar compilation and jar
  // auto-decompilation need a JVM + Maven + CFR, so they only light up when
  // the full Node app (`npm start`) is actually serving this page.
  // -----------------------------------------------------------------------
  let hasBackend = false;

  function updateBackendUI() {
    document.body.classList.toggle('static-mode', !hasBackend);
    document.getElementById('static-mode-banner').hidden = hasBackend;
    document.getElementById('btn-build-jar-real').hidden = !hasBackend;
    document.getElementById('build-static-note').hidden = hasBackend;
  }
  updateBackendUI();

  fetch('health', { cache: 'no-store' })
    .then((r) => { hasBackend = r.ok; })
    .catch(() => { hasBackend = false; })
    .finally(updateBackendUI);

  // -----------------------------------------------------------------------
  // Project metadata
  // -----------------------------------------------------------------------
  let meta = defaultMeta();

  function defaultMeta() {
    return {
      name: 'MyFirstPlugin',
      packageName: 'com.quint.myfirstplugin',
      mainClass: 'MyFirstPlugin',
      version: '1.0.0',
      description: 'Made with Quint.',
      author: '',
      apiVersion: '1.20',
    };
  }

  function syncTitleFromName() {
    document.getElementById('project-name-input').value = meta.name;
  }
  syncTitleFromName();

  document.getElementById('project-name-input').addEventListener('change', (e) => {
    meta.name = e.target.value.trim() || 'MyPlugin';
    meta.mainClass = sanitizeIdentifier(meta.name, 'QuintMain');
    autosave();
  });

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------
  function sanitizeIdentifier(name, fallback) {
    const cleaned = String(name || '').replace(/[^A-Za-z0-9_]/g, '');
    if (!cleaned) return fallback;
    return /^[0-9]/.test(cleaned) ? `P${cleaned}` : cleaned;
  }

  function sanitizeCmdName(name) {
    return sanitizeIdentifier(name, 'cmd').toLowerCase();
  }

  function toast(message, kind) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className = kind || '';
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 4200);
  }

  function setStatus(text) {
    document.getElementById('status-text').textContent = text;
  }

  function showModal(id) { document.getElementById(id).hidden = false; }
  function hideModal(id) { document.getElementById(id).hidden = true; }
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', (e) => { hideModal(e.target.closest('.modal-backdrop').id); });
  });

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // -----------------------------------------------------------------------
  // Java code generation (assembles ONE Main.java from the workspace)
  // -----------------------------------------------------------------------
  const EVENT_INFO = {
    mc_event_join: { cls: 'org.bukkit.event.player.PlayerJoinEvent', bind: 'org.bukkit.entity.Player player = event.getPlayer();' },
    mc_event_quit: { cls: 'org.bukkit.event.player.PlayerQuitEvent', bind: 'org.bukkit.entity.Player player = event.getPlayer();' },
    mc_event_chat: { cls: 'org.bukkit.event.player.AsyncPlayerChatEvent', bind: 'org.bukkit.entity.Player player = event.getPlayer(); String message = event.getMessage();' },
    mc_event_death: { cls: 'org.bukkit.event.entity.PlayerDeathEvent', bind: 'org.bukkit.entity.Player player = event.getEntity();' },
    mc_event_block_break: { cls: 'org.bukkit.event.block.BlockBreakEvent', bind: 'org.bukkit.entity.Player player = event.getPlayer(); org.bukkit.block.Block block = event.getBlock();' },
    mc_event_block_place: { cls: 'org.bukkit.event.block.BlockPlaceEvent', bind: 'org.bukkit.entity.Player player = event.getPlayer(); org.bukkit.block.Block block = event.getBlock();' },
    mc_event_interact: { cls: 'org.bukkit.event.player.PlayerInteractEvent', bind: 'org.bukkit.entity.Player player = event.getPlayer();' },
    mc_event_damage: { cls: 'org.bukkit.event.entity.EntityDamageEvent', bind: 'org.bukkit.entity.Player player = (event.getEntity() instanceof org.bukkit.entity.Player) ? (org.bukkit.entity.Player) event.getEntity() : null;' },
  };

  function generateMainJava() {
    const Java = window.QuintJava;
    Java.init(workspace);

    const top = workspace.getTopBlocks(true);
    const enableBlocks = top.filter((b) => b.type === 'mc_on_enable');
    const disableBlocks = top.filter((b) => b.type === 'mc_on_disable');
    const eventBlocks = top.filter((b) => EVENT_INFO[b.type]);
    const commandBlocks = top.filter((b) => b.type === 'mc_command_define');

    const varFields = workspace.getAllVariables()
      .map((v) => `    double ${Java.getVariableName(v.getId())} = 0;`)
      .join('\n');

    const enableBody = enableBlocks.map((b) => Java.statementToCode(b, 'DO')).join('');
    const disableBody = disableBlocks.map((b) => Java.statementToCode(b, 'DO')).join('');

    let eventMethods = '';
    eventBlocks.forEach((b, i) => {
      const info = EVENT_INFO[b.type];
      const body = Java.statementToCode(b, 'DO');
      eventMethods += `    @org.bukkit.event.EventHandler\n    public void quintEvent${i}(${info.cls} event) {\n        ${info.bind}\n${body}    }\n\n`;
    });

    const commands = [];
    let commandSwitch = '';
    let registerCommands = '';
    commandBlocks.forEach((b) => {
      const name = sanitizeCmdName(b.getFieldValue('CMDNAME'));
      const description = b.getFieldValue('DESCRIPTION') || 'A custom command';
      commands.push({ name, description, usage: `/${name}` });
      const body = Java.statementToCode(b, 'DO');
      commandSwitch += `                case "${name}": {\n                    org.bukkit.entity.Player player = (sender instanceof org.bukkit.entity.Player) ? (org.bukkit.entity.Player) sender : null;\n${body}                    return true;\n                }\n`;
      registerCommands += `        if (getCommand("${name}") != null) { getCommand("${name}").setExecutor(this); }\n`;
    });

    const code = `package ${meta.packageName};

// Generated by Quint -- https://github.com/deadbytee-del/Quint (drag-and-drop Minecraft plugin creator)
public final class ${meta.mainClass} extends org.bukkit.plugin.java.JavaPlugin
        implements org.bukkit.event.Listener, org.bukkit.command.CommandExecutor {

${varFields}

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
${registerCommands}${enableBody}    }

    @Override
    public void onDisable() {
${disableBody}    }

    @Override
    public boolean onCommand(org.bukkit.command.CommandSender sender, org.bukkit.command.Command command, String label, String[] args) {
        switch (label.toLowerCase()) {
${commandSwitch}            default:
                return false;
        }
    }

${eventMethods}}
`;

    return { code, commands };
  }

  // -----------------------------------------------------------------------
  // Toolbar: New / Save / Load
  // -----------------------------------------------------------------------
  document.getElementById('btn-new').addEventListener('click', () => {
    if (!confirm('Start a new plugin? Anything not saved will be lost.')) return;
    workspace.clear();
    meta = defaultMeta();
    syncTitleFromName();
    setStatus('New project started. Drag an Events block in to begin!');
  });

  document.getElementById('btn-save').addEventListener('click', () => {
    const state = Blockly.serialization.workspaces.save(workspace);
    const blob = new Blob([JSON.stringify({ meta, state }, null, 2)], { type: 'application/json' });
    download(blob, `${meta.name || 'quint-project'}.json`);
    toast('Project saved to a file on your computer.', 'success');
  });

  document.getElementById('btn-load').addEventListener('click', () => {
    document.getElementById('file-load-input').click();
  });
  document.getElementById('file-load-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      workspace.clear();
      if (parsed.meta) meta = { ...defaultMeta(), ...parsed.meta };
      if (parsed.state) Blockly.serialization.workspaces.load(parsed.state, workspace);
      syncTitleFromName();
      toast('Project loaded!', 'success');
    } catch (err) {
      toast('That file could not be read as a Quint project.', 'error');
    }
  });

  function autosave() {
    try {
      const state = Blockly.serialization.workspaces.save(workspace);
      localStorage.setItem('quint-autosave', JSON.stringify({ meta, state }));
    } catch (e) { /* best effort only */ }
  }
  workspace.addChangeListener((e) => {
    if (e.isUiEvent) return;
    clearTimeout(autosave._t);
    autosave._t = setTimeout(autosave, 800);
  });

  (function restoreAutosave() {
    try {
      const raw = localStorage.getItem('quint-autosave');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.meta) meta = { ...defaultMeta(), ...parsed.meta };
      if (parsed.state) Blockly.serialization.workspaces.load(parsed.state, workspace);
      syncTitleFromName();
    } catch (e) { /* ignore */ }
  })();

  // -----------------------------------------------------------------------
  // Settings modal
  // -----------------------------------------------------------------------
  document.getElementById('btn-settings').addEventListener('click', () => {
    document.getElementById('set-name').value = meta.name;
    document.getElementById('set-package').value = meta.packageName;
    document.getElementById('set-version').value = meta.version;
    document.getElementById('set-description').value = meta.description;
    document.getElementById('set-author').value = meta.author;
    document.getElementById('set-mcversion').value = meta.apiVersion;
    showModal('modal-settings');
  });
  document.getElementById('btn-settings-save').addEventListener('click', () => {
    meta.name = document.getElementById('set-name').value.trim() || meta.name;
    meta.mainClass = sanitizeIdentifier(meta.name, 'QuintMain');
    meta.packageName = document.getElementById('set-package').value.trim() || meta.packageName;
    meta.version = document.getElementById('set-version').value.trim() || '1.0.0';
    meta.description = document.getElementById('set-description').value.trim();
    meta.author = document.getElementById('set-author').value.trim();
    meta.apiVersion = document.getElementById('set-mcversion').value;
    syncTitleFromName();
    hideModal('modal-settings');
    autosave();
    toast('Settings saved.', 'success');
  });

  // -----------------------------------------------------------------------
  // Examples modal
  // -----------------------------------------------------------------------
  document.getElementById('btn-examples').addEventListener('click', async () => {
    showModal('modal-examples');
    const list = document.getElementById('examples-list');
    list.textContent = 'Loading…';
    try {
      const examples = await fetch('examples/manifest.json', { cache: 'no-store' }).then((r) => r.json());
      if (!examples.length) { list.textContent = 'No examples available.'; return; }
      list.innerHTML = '';
      for (const ex of examples) {
        const card = document.createElement('div');
        card.className = 'example-card';
        card.innerHTML = `<b>${ex.title}</b><span>${ex.description || ''}</span>`;
        card.addEventListener('click', async () => {
          const xml = await fetch(`examples/${ex.file}`).then((r) => r.text());
          if (ex.meta) meta = { ...defaultMeta(), ...ex.meta };
          const dom = Blockly.utils.xml.textToDom(xml);
          workspace.clear();
          Blockly.Xml.domToWorkspace(dom, workspace);
          syncTitleFromName();
          hideModal('modal-examples');
          toast(`Loaded example: ${ex.title}`, 'success');
        });
        list.appendChild(card);
      }
    } catch (err) {
      list.textContent = 'Could not load examples.';
    }
  });

  // -----------------------------------------------------------------------
  // View code modal
  // -----------------------------------------------------------------------
  document.getElementById('btn-view-code').addEventListener('click', () => {
    try {
      const { code } = generateMainJava();
      document.getElementById('code-tabs').innerHTML = `<div class="tab active">${meta.mainClass}.java</div>`;
      document.getElementById('code-view').textContent = code;
      showModal('modal-code');
    } catch (err) {
      console.error(err);
      toast('Could not generate code: ' + err.message, 'error');
    }
  });

  // -----------------------------------------------------------------------
  // Build modal (download jar / source)
  // -----------------------------------------------------------------------
  document.getElementById('btn-build-jar').addEventListener('click', () => {
    document.getElementById('build-progress').hidden = true;
    document.getElementById('build-log').hidden = true;
    showModal('modal-build');
  });

  // Builds the same Maven project layout as the server (pom.xml, plugin.yml,
  // the generated .java file) entirely in the browser with JSZip. Used for
  // "download source" whenever there's no backend to ask instead.
  async function buildSourceZipClientSide(code, commands) {
    const T = window.QuintProjectTemplate;
    const packageName = T.sanitizePackage(meta.packageName);
    const mainClass = T.sanitizeIdentifier(meta.mainClass, 'QuintMain');
    const normalizedProject = { ...meta, packageName, mainClass };
    const packagePath = packageName.split('.').join('/');

    const zip = new JSZip();
    zip.file('pom.xml', T.buildPomXml(normalizedProject));
    zip.file('src/main/resources/plugin.yml', T.buildPluginYml(normalizedProject, commands));
    zip.file(`src/main/java/${packagePath}/${mainClass}.java`, code);
    return zip.generateAsync({ type: 'blob' });
  }

  async function runBuild(mode, downloadName) {
    const progress = document.getElementById('build-progress');
    const progressText = document.getElementById('build-progress-text');
    const log = document.getElementById('build-log');
    log.hidden = true;
    progress.hidden = false;
    progressText.textContent = mode === 'jar'
      ? 'Compiling your plugin into a real .jar (downloading Paper API on first use can take a minute)…'
      : 'Packaging your source project…';

    let code, commands;
    try {
      ({ code, commands } = generateMainJava());
    } catch (err) {
      progress.hidden = true;
      log.hidden = false;
      log.textContent = 'Could not generate code: ' + err.message;
      return;
    }

    if (mode === 'jar' && !hasBackend) {
      progress.hidden = true;
      log.hidden = false;
      log.textContent = 'No build server is available here (demo mode). Download the source project instead and run "mvn package" yourself, or run Quint locally.';
      return;
    }

    if (mode === 'source' && !hasBackend) {
      try {
        const blob = await buildSourceZipClientSide(code, commands);
        download(blob, downloadName);
        progress.hidden = true;
        toast('Download starting…', 'success');
        hideModal('modal-build');
      } catch (err) {
        progress.hidden = true;
        log.hidden = false;
        log.textContent = 'Could not build the source zip: ' + err.message;
      }
      return;
    }

    try {
      const res = await fetch('api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          project: meta,
          commands,
          files: [{ path: `${meta.mainClass}.java`, content: code }],
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || contentType.includes('application/json')) {
        const errBody = await res.json().catch(() => ({}));
        progress.hidden = true;
        log.hidden = false;
        log.textContent = (errBody.error || 'Build failed') + (errBody.log ? '\n\n' + errBody.log : '');
        return;
      }

      const blob = await res.blob();
      download(blob, downloadName);
      progress.hidden = true;
      toast('Download starting…', 'success');
      hideModal('modal-build');
    } catch (err) {
      progress.hidden = true;
      log.hidden = false;
      log.textContent = 'Network error: ' + err.message;
    }
  }

  document.getElementById('btn-build-jar-real').addEventListener('click', () => {
    runBuild('jar', `${sanitizeIdentifier(meta.name, 'plugin').toLowerCase()}-${meta.version}.jar`);
  });
  document.getElementById('btn-build-source').addEventListener('click', () => {
    runBuild('source', `${sanitizeIdentifier(meta.name, 'plugin').toLowerCase()}-source.zip`);
  });

  // -----------------------------------------------------------------------
  // Decompile modal (auto decompilation)
  // -----------------------------------------------------------------------
  let lastDecompile = null;

  document.getElementById('btn-import-jar').addEventListener('click', () => {
    if (!hasBackend) {
      document.getElementById('decompile-unavailable').hidden = false;
      document.getElementById('decompile-progress').hidden = true;
      document.getElementById('decompile-result').hidden = true;
      showModal('modal-decompile');
      return;
    }
    document.getElementById('file-jar-input').click();
  });

  document.getElementById('file-jar-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    document.getElementById('decompile-unavailable').hidden = true;
    document.getElementById('decompile-progress').hidden = false;
    document.getElementById('decompile-result').hidden = true;
    document.getElementById('btn-decompile-download-zip').hidden = true;
    document.getElementById('btn-decompile-load-blocks').hidden = true;
    showModal('modal-decompile');

    const form = new FormData();
    form.append('jarfile', file);
    try {
      const res = await fetch('api/decompile', { method: 'POST', body: form });
      const data = await res.json();
      document.getElementById('decompile-progress').hidden = true;
      if (!res.ok) {
        document.getElementById('decompile-result').hidden = false;
        document.getElementById('decompile-stats').textContent = data.error || 'Decompilation failed.';
        document.getElementById('decompile-tabs').innerHTML = '';
        document.getElementById('decompile-source').textContent = data.log || '';
        return;
      }
      lastDecompile = data;
      renderDecompileResult(data);
    } catch (err) {
      document.getElementById('decompile-progress').hidden = true;
      document.getElementById('decompile-result').hidden = false;
      document.getElementById('decompile-stats').textContent = 'Network error: ' + err.message;
    }
  });

  function renderDecompileResult(data) {
    document.getElementById('decompile-result').hidden = false;
    const stats = data.stats || {};
    const statsEl = document.getElementById('decompile-stats');
    if (data.blocks) {
      statsEl.textContent = `🧩 Auto-decompilation recognized ${stats.recognizedEvents || 0}/${stats.totalEvents || 0} event handlers and ${stats.recognizedStatements || 0}/${stats.totalStatements || 0} simple statements as blocks. Everything else is still available below as plain Java.`;
      document.getElementById('btn-decompile-load-blocks').hidden = false;
    } else {
      statsEl.textContent = `Decompiled ${data.files.length} class file(s). Quint could not automatically recognize any blocks in this jar (it may use patterns beyond the beginner block set) -- but you can still read the full source below.`;
      document.getElementById('btn-decompile-load-blocks').hidden = true;
    }
    document.getElementById('btn-decompile-download-zip').hidden = false;

    const tabsEl = document.getElementById('decompile-tabs');
    const sourceEl = document.getElementById('decompile-source');
    tabsEl.innerHTML = '';
    data.files.forEach((f, i) => {
      const tab = document.createElement('div');
      tab.className = 'tab' + (i === 0 ? ' active' : '');
      tab.textContent = f.path;
      tab.addEventListener('click', () => {
        tabsEl.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        sourceEl.textContent = f.content;
      });
      tabsEl.appendChild(tab);
    });
    sourceEl.textContent = data.files[0] ? data.files[0].content : '';
  }

  document.getElementById('btn-decompile-download-zip').addEventListener('click', () => {
    if (!lastDecompile) return;
    const bundle = lastDecompile.files.map((f) => `// ===== ${f.path} =====\n${f.content}`).join('\n\n');
    download(new Blob([bundle], { type: 'text/plain' }), `${(lastDecompile.fileName || 'decompiled').replace(/\.jar$/i, '')}-source.txt`);
  });

  document.getElementById('btn-decompile-load-blocks').addEventListener('click', () => {
    if (!lastDecompile || !lastDecompile.blocks) return;
    const dom = Blockly.utils.xml.textToDom(lastDecompile.blocks);
    Blockly.Xml.appendDomToWorkspace(dom, workspace);
    hideModal('modal-decompile');
    toast('Recognized blocks were added to your workspace.', 'success');
  });

  setStatus('Ready. Drag a block from the Events category to get started!');
})();
