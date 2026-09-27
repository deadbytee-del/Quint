(function () {
  'use strict';

  // -----------------------------------------------------------------------
  // Preferences (app-level, persisted across all projects)
  // -----------------------------------------------------------------------
  const DEFAULT_PREFS = { autosave: true, confirmNew: true, zoomFit: true, sound: false, author: '', renderer: 'zelos' };
  let prefs = loadPrefs();

  function loadPrefs() {
    try {
      return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem('quint-prefs') || '{}') };
    } catch (e) {
      return { ...DEFAULT_PREFS };
    }
  }
  function savePrefs() {
    try { localStorage.setItem('quint-prefs', JSON.stringify(prefs)); } catch (e) { /* ignore */ }
  }

  function playClick() {
    if (!prefs.sound) return;
    try {
      const ctx = playClick._ctx || (playClick._ctx = new (window.AudioContext || window.webkitAudioContext)());
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.13);
    } catch (e) { /* ignore, audio is a nice-to-have */ }
  }

  // -----------------------------------------------------------------------
  // Workspace setup (re-creatable so the "block style" preference can swap
  // the renderer live).
  // -----------------------------------------------------------------------
  const QUINT_BLOCKLY_THEME = Blockly.Theme.defineTheme('quintDark', {
    base: Blockly.Themes.Classic,
    componentStyles: {
      workspaceBackgroundColour: '#0b0712',
      toolboxBackgroundColour: '#140d24',
      toolboxForegroundColour: '#ece7f7',
      flyoutBackgroundColour: '#140d24',
      flyoutForegroundColour: '#ece7f7',
      flyoutOpacity: 1,
      scrollbarColour: '#251a40',
      scrollbarOpacity: 0.9,
      insertionMarkerColour: '#8b5cf6',
      insertionMarkerOpacity: 0.4,
      cursorColour: '#c4b5fd',
    },
  });

  let workspace = null;
  function createWorkspace(rendererName) {
    const state = workspace ? Blockly.serialization.workspaces.save(workspace) : null;
    if (workspace) workspace.dispose();
    workspace = Blockly.inject('blocklyDiv', {
      toolbox: window.QUINT_TOOLBOX,
      renderer: rendererName || prefs.renderer || 'zelos',
      theme: QUINT_BLOCKLY_THEME,
      trashcan: true,
      zoom: { controls: true, wheel: true, startScale: 0.95 },
      grid: { spacing: 25, length: 3, colour: '#251a40', snap: true },
      move: { scrollbars: true, drag: true, wheel: true },
    });
    workspace.addChangeListener((e) => {
      if (e.isUiEvent) return;
      clearTimeout(autosave._t);
      autosave._t = setTimeout(autosave, 800);
    });
    if (state) Blockly.serialization.workspaces.load(state, workspace);
    return workspace;
  }
  createWorkspace(prefs.renderer);

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
      author: prefs.author || '',
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
    if (kind === 'success') playClick();
  }

  function setStatus(text) {
    document.getElementById('status-text').textContent = text;
  }

  function showModal(id) { document.getElementById(id).hidden = false; }
  function hideModal(id) { document.getElementById(id).hidden = true; }
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', (e) => { hideModal(e.target.closest('.modal-backdrop').id); });
  });

  async function download(blob, filename) {
    // Inside the desktop app, a blob: URL click never reaches Electron's
    // download machinery (blob: URLs stay in the renderer, off the network
    // layer Electron hooks into) -- so hand the bytes to the main process
    // over the bridge exposed by electron-preload.js instead.
    if (window.quintDesktop) {
      const buf = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < buf.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, buf.subarray(i, i + chunkSize));
      }
      await window.quintDesktop.saveFile(btoa(binary), filename);
      return;
    }

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
  // `vars` lists which bare Java identifiers this event's `bind` line
  // actually declares -- used to gate blocks like "the message" or "the
  // block" so they only ever generate code where that identifier exists.
  // `cancellable` reflects whether the real Bukkit/Paper event class
  // implements Cancellable (verified against the vendored paper-api.jar,
  // not assumed -- a few of these, like PlayerDeathEvent, are cancellable
  // on Paper even though vanilla Spigot habit says otherwise).
  const EVENT_INFO = {
    mc_event_join: { cls: 'org.bukkit.event.player.PlayerJoinEvent', bind: 'org.bukkit.entity.Player player = event.getPlayer();', vars: ['player'], cancellable: false, hasJoinMsg: true },
    mc_event_quit: { cls: 'org.bukkit.event.player.PlayerQuitEvent', bind: 'org.bukkit.entity.Player player = event.getPlayer();', vars: ['player'], cancellable: false, hasQuitMsg: true },
    mc_event_chat: { cls: 'org.bukkit.event.player.AsyncPlayerChatEvent', bind: 'org.bukkit.entity.Player player = event.getPlayer(); String message = event.getMessage();', vars: ['player', 'message'], cancellable: true },
    mc_event_death: { cls: 'org.bukkit.event.entity.PlayerDeathEvent', bind: 'org.bukkit.entity.Player player = event.getEntity();', vars: ['player'], cancellable: true },
    mc_event_block_break: { cls: 'org.bukkit.event.block.BlockBreakEvent', bind: 'org.bukkit.entity.Player player = event.getPlayer(); org.bukkit.block.Block block = event.getBlock();', vars: ['player', 'block'], cancellable: true },
    mc_event_block_place: { cls: 'org.bukkit.event.block.BlockPlaceEvent', bind: 'org.bukkit.entity.Player player = event.getPlayer(); org.bukkit.block.Block block = event.getBlock();', vars: ['player', 'block'], cancellable: true },
    mc_event_interact: { cls: 'org.bukkit.event.player.PlayerInteractEvent', bind: 'org.bukkit.entity.Player player = event.getPlayer();', vars: ['player'], cancellable: true },
    mc_event_damage: { cls: 'org.bukkit.event.entity.EntityDamageEvent', bind: 'org.bukkit.entity.Player player = (event.getEntity() instanceof org.bukkit.entity.Player) ? (org.bukkit.entity.Player) event.getEntity() : null;', vars: ['player'], cancellable: true },
    mc_event_respawn: { cls: 'org.bukkit.event.player.PlayerRespawnEvent', bind: 'org.bukkit.entity.Player player = event.getPlayer();', vars: ['player'], cancellable: false },
    mc_event_drop_item: { cls: 'org.bukkit.event.player.PlayerDropItemEvent', bind: 'org.bukkit.entity.Player player = event.getPlayer();', vars: ['player'], cancellable: true },
    mc_event_toggle_sneak: { cls: 'org.bukkit.event.player.PlayerToggleSneakEvent', bind: 'org.bukkit.entity.Player player = event.getPlayer();', vars: ['player'], cancellable: true },
    mc_event_toggle_sprint: { cls: 'org.bukkit.event.player.PlayerToggleSprintEvent', bind: 'org.bukkit.entity.Player player = event.getPlayer();', vars: ['player'], cancellable: true },
    mc_event_level_change: { cls: 'org.bukkit.event.player.PlayerLevelChangeEvent', bind: 'org.bukkit.entity.Player player = event.getPlayer();', vars: ['player'], cancellable: false },
    mc_event_entity_death: { cls: 'org.bukkit.event.entity.EntityDeathEvent', bind: 'org.bukkit.entity.Player player = (event.getEntity() instanceof org.bukkit.entity.Player) ? (org.bukkit.entity.Player) event.getEntity() : null;', vars: ['player'], cancellable: true },
    mc_event_block_ignite: { cls: 'org.bukkit.event.block.BlockIgniteEvent', bind: 'org.bukkit.entity.Player player = event.getPlayer(); org.bukkit.block.Block block = event.getBlock();', vars: ['player', 'block'], cancellable: true },
    mc_event_food_change: { cls: 'org.bukkit.event.entity.FoodLevelChangeEvent', bind: 'org.bukkit.entity.Player player = (event.getEntity() instanceof org.bukkit.entity.Player) ? (org.bukkit.entity.Player) event.getEntity() : null;', vars: ['player'], cancellable: true },
  };

  // Contexts that aren't an EVENT_INFO event but still generate a method
  // body: plugin start/stop have no bound identifiers at all, and a
  // command body binds `player` (cast from the sender), `sender` and `args`.
  const NO_CONTEXT = { vars: [], cancellable: false };
  const COMMAND_CONTEXT = { vars: ['player', 'sender', 'args'], cancellable: false };

  function setGenScope(Java, ctx) {
    Java.scopeVars = new Set(ctx.vars);
    Java.cancellable = !!ctx.cancellable;
    Java.hasJoinMsg = !!ctx.hasJoinMsg;
    Java.hasQuitMsg = !!ctx.hasQuitMsg;
  }

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

    setGenScope(Java, NO_CONTEXT);
    const enableBody = enableBlocks.map((b) => Java.statementToCode(b, 'DO')).join('');
    const disableBody = disableBlocks.map((b) => Java.statementToCode(b, 'DO')).join('');

    let eventMethods = '';
    eventBlocks.forEach((b, i) => {
      const info = EVENT_INFO[b.type];
      setGenScope(Java, info);
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
      setGenScope(Java, COMMAND_CONTEXT);
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
    if (prefs.confirmNew && !confirm('Start a new plugin? Anything not saved will be lost.')) return;
    workspace.clear();
    meta = defaultMeta();
    syncTitleFromName();
    setStatus('New project started. Drag an Events block in to begin!');
    playClick();
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
      if (prefs.zoomFit) workspace.zoomToFit();
      saveProjectSnapshot();
      toast('Project loaded!', 'success');
    } catch (err) {
      toast('That file could not be read as a Quint project.', 'error');
    }
  });

  // -----------------------------------------------------------------------
  // My Projects: every project ever saved in this browser, not just one
  // autosave slot. Each project gets a stable id; the index tracks
  // name/last-updated so the "Projects" modal can list, load and delete them.
  // -----------------------------------------------------------------------
  function projectsIndexGet() {
    try { return JSON.parse(localStorage.getItem('quint-projects-index') || '[]'); } catch (e) { return []; }
  }
  function projectsIndexSet(list) {
    try { localStorage.setItem('quint-projects-index', JSON.stringify(list)); } catch (e) { /* ignore */ }
  }
  function ensureProjectId() {
    if (!meta.id) meta.id = 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    return meta.id;
  }
  function saveProjectSnapshot() {
    const id = ensureProjectId();
    const state = Blockly.serialization.workspaces.save(workspace);
    try { localStorage.setItem('quint-project-' + id, JSON.stringify({ meta, state })); } catch (e) { return; }
    const idx = projectsIndexGet();
    const existing = idx.find((p) => p.id === id);
    if (existing) { existing.name = meta.name; existing.updatedAt = Date.now(); }
    else idx.unshift({ id, name: meta.name, updatedAt: Date.now() });
    projectsIndexSet(idx);
    try { localStorage.setItem('quint-last-project-id', id); } catch (e) { /* ignore */ }
  }
  function loadProjectById(id) {
    const raw = localStorage.getItem('quint-project-' + id);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      workspace.clear();
      if (parsed.meta) meta = { ...defaultMeta(), ...parsed.meta };
      if (parsed.state) Blockly.serialization.workspaces.load(parsed.state, workspace);
      syncTitleFromName();
      if (prefs.zoomFit) workspace.zoomToFit();
      try { localStorage.setItem('quint-last-project-id', id); } catch (e) { /* ignore */ }
      return true;
    } catch (e) {
      return false;
    }
  }
  function deleteProject(id) {
    localStorage.removeItem('quint-project-' + id);
    projectsIndexSet(projectsIndexGet().filter((p) => p.id !== id));
  }

  function autosave() {
    if (!prefs.autosave) return;
    try { saveProjectSnapshot(); } catch (e) { /* best effort only */ }
  }

  (function migrateAndRestore() {
    try {
      // One-time migration from the old single-slot autosave format.
      const legacy = localStorage.getItem('quint-autosave');
      if (legacy && projectsIndexGet().length === 0) {
        const parsed = JSON.parse(legacy);
        const id = 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const legacyMeta = { ...defaultMeta(), ...(parsed.meta || {}), id };
        localStorage.setItem('quint-project-' + id, JSON.stringify({ meta: legacyMeta, state: parsed.state }));
        projectsIndexSet([{ id, name: legacyMeta.name, updatedAt: Date.now() }]);
        localStorage.setItem('quint-last-project-id', id);
        localStorage.removeItem('quint-autosave');
      }

      const lastId = localStorage.getItem('quint-last-project-id');
      if (lastId) loadProjectById(lastId);
    } catch (e) { /* ignore, just start fresh */ }
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
  // App Settings (preferences) modal
  // -----------------------------------------------------------------------
  document.getElementById('btn-app-settings').addEventListener('click', () => {
    document.getElementById('pref-autosave').checked = prefs.autosave;
    document.getElementById('pref-confirm-new').checked = prefs.confirmNew;
    document.getElementById('pref-zoom-fit').checked = prefs.zoomFit;
    document.getElementById('pref-sound').checked = prefs.sound;
    document.getElementById('pref-author').value = prefs.author;
    document.getElementById('pref-renderer').value = prefs.renderer;
    showModal('modal-app-settings');
  });

  function wirePrefToggle(id, key, onChange) {
    document.getElementById(id).addEventListener('change', (e) => {
      prefs[key] = e.target.checked;
      savePrefs();
      if (onChange) onChange();
    });
  }
  wirePrefToggle('pref-autosave', 'autosave');
  wirePrefToggle('pref-confirm-new', 'confirmNew');
  wirePrefToggle('pref-zoom-fit', 'zoomFit');
  wirePrefToggle('pref-sound', 'sound', () => playClick());

  document.getElementById('pref-author').addEventListener('change', (e) => {
    prefs.author = e.target.value.trim();
    savePrefs();
  });
  document.getElementById('pref-renderer').addEventListener('change', (e) => {
    prefs.renderer = e.target.value;
    savePrefs();
    createWorkspace(prefs.renderer);
    toast('Block style updated.', 'success');
  });

  // -----------------------------------------------------------------------
  // My Projects modal
  // -----------------------------------------------------------------------
  function timeAgo(ts) {
    const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  function renderProjectsList() {
    const listEl = document.getElementById('projects-list');
    const emptyEl = document.getElementById('projects-empty');
    const projects = projectsIndexGet().sort((a, b) => b.updatedAt - a.updatedAt);
    listEl.innerHTML = '';
    emptyEl.hidden = projects.length > 0;
    for (const p of projects) {
      const row = document.createElement('div');
      row.className = 'project-row';
      row.innerHTML = `
        <div class="project-info">
          <b>${p.name}</b>
          <span>${timeAgo(p.updatedAt)}</span>
        </div>
        <div class="project-actions">
          <span class="icon-btn" data-action="delete" title="Delete"><i data-lucide="trash-2"></i></span>
        </div>`;
      row.querySelector('.project-info').addEventListener('click', () => {
        if (loadProjectById(p.id)) {
          hideModal('modal-projects');
          toast(`Loaded "${p.name}"`, 'success');
        } else {
          toast('Could not load that project.', 'error');
        }
      });
      row.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
        e.stopPropagation();
        if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
        deleteProject(p.id);
        renderProjectsList();
        toast('Project deleted.', 'success');
      });
      listEl.appendChild(row);
    }
    if (window.lucide) lucide.createIcons();
  }

  document.getElementById('btn-projects').addEventListener('click', () => {
    renderProjectsList();
    showModal('modal-projects');
  });

  // -----------------------------------------------------------------------
  // Windows/Mac/Linux desktop app download button (hidden if we're already
  // running inside the desktop app itself).
  // -----------------------------------------------------------------------
  if (window.quintDesktop) {
    const exeBtn = document.getElementById('btn-download-exe');
    if (exeBtn) exeBtn.style.display = 'none';
  }

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
          delete meta.id;
          const dom = Blockly.utils.xml.textToDom(xml);
          workspace.clear();
          Blockly.Xml.domToWorkspace(dom, workspace);
          syncTitleFromName();
          if (prefs.zoomFit) workspace.zoomToFit();
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

  // Builds the same Maven project layout (pom.xml, plugin.yml, the generated
  // .java file) entirely in the browser with JSZip.
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
    progressText.textContent = mode === 'jar' ? 'Getting ready to compile…' : 'Packaging your source project…';

    let code, commands;
    try {
      ({ code, commands } = generateMainJava());
    } catch (err) {
      progress.hidden = true;
      log.hidden = false;
      log.textContent = 'Could not generate code: ' + err.message;
      return;
    }

    if (mode === 'source') {
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

    // mode === 'jar': compile entirely client-side (ECJ + the Paper API,
    // running inside a WebAssembly JVM via CheerpJ -- see cheerpjCompiler.js).
    try {
      const T = window.QuintProjectTemplate;
      const packageName = T.sanitizePackage(meta.packageName);
      const mainClass = T.sanitizeIdentifier(meta.mainClass, 'QuintMain');
      const normalizedProject = { ...meta, packageName, mainClass };
      const pluginYml = T.buildPluginYml(normalizedProject, commands);

      const blob = await window.QuintCompiler.compilePluginJar(
        { packageName, mainClass, javaSource: code, pluginYml },
        (msg) => { progressText.textContent = msg; }
      );
      download(blob, downloadName);
      progress.hidden = true;
      toast('Download starting…', 'success');
      hideModal('modal-build');
    } catch (err) {
      progress.hidden = true;
      log.hidden = false;
      log.textContent = (err.message || 'Build failed') + (err.log ? '\n\n' + err.log : '');
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
    document.getElementById('file-jar-input').click();
  });

  document.getElementById('file-jar-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    const progressTextEl = document.querySelector('#decompile-progress span');
    document.getElementById('decompile-progress').hidden = false;
    document.getElementById('decompile-result').hidden = true;
    document.getElementById('btn-decompile-download-zip').hidden = true;
    document.getElementById('btn-decompile-load-blocks').hidden = true;
    showModal('modal-decompile');

    try {
      const jarBytes = new Uint8Array(await file.arrayBuffer());
      const files = await window.QuintCompiler.decompileJarClientSide(jarBytes, (msg) => {
        if (progressTextEl) progressTextEl.textContent = msg;
      });
      const { xml, stats } = window.QuintBlockify.blockifySources(files);
      document.getElementById('decompile-progress').hidden = true;
      lastDecompile = { fileName: file.name, files, blocks: xml, stats };
      renderDecompileResult(lastDecompile);
    } catch (err) {
      document.getElementById('decompile-progress').hidden = true;
      document.getElementById('decompile-result').hidden = false;
      document.getElementById('decompile-stats').textContent = (err.message || 'Decompilation failed.') + (err.log ? '\n\n' + err.log : '');
      document.getElementById('decompile-tabs').innerHTML = '';
      document.getElementById('decompile-source').textContent = '';
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

  if (window.lucide) lucide.createIcons();

  setStatus('Ready. Drag a block from the Events category to get started!');
})();
