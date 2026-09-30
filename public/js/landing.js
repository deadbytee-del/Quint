// Quint download landing page: detects the visitor's OS to pick a sensible
// default download, and fetches the latest GitHub release to link each
// button straight at the right installer instead of just the releases page.
// Every button already has a safe fallback href (the releases page) set in
// the HTML, so if this script fails for any reason (offline, GitHub API
// rate limit, etc.) the page still works -- it just won't be as precise.
//
// macOS and Linux each ship more than one installer format now, so instead
// of guessing one for the visitor, clicking those platforms opens a small
// picker: choose the variant that matches your computer, it downloads that
// exact file, and shows the (format-specific) steps to install and open it.
(function () {
  'use strict';

  const REPO = 'deadbytee-del/Quint';

  function detectOS() {
    const ua = navigator.userAgent || '';
    const platform = navigator.platform || '';
    if (/Win/i.test(platform) || /Windows/i.test(ua)) return 'windows';
    if (/Mac/i.test(platform) || /Macintosh/i.test(ua)) return 'mac';
    if (/Linux|X11/i.test(platform) || /Linux/i.test(ua)) return 'linux';
    return null;
  }

  // Apple's own documented trick for telling an Apple Silicon Mac apart
  // from an Intel one in Safari/Chrome, both of which report "MacIntel"
  // for compatibility: only M-series Macs' browsers report touch points.
  function isAppleSilicon() {
    return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  }

  // Every release publishes two totally separate products side by side --
  // plain "Quint" and the auto-update-focused "AU-Quint" (see the callout
  // below) -- and electron-builder's AU-Quint filenames also end in
  // ".dmg"/".exe"/etc, just prefixed "AU-Quint-" instead of "Quint-". This
  // landing page is selling plain Quint, so every asset lookup below must
  // filter AU-Quint's files out first, or a plain-Quint picker can silently
  // hand someone an AU-Quint installer instead (same app, different name/
  // update channel -- confusing, not dangerous, but still wrong).
  function quintOnly(assets) {
    return assets.filter((a) => !/^AU-Quint/i.test(a.name));
  }

  function pickWindowsAsset(assets) {
    const exes = quintOnly(assets).filter((a) => a.name.toLowerCase().endsWith('.exe'));
    if (exes.length === 0) return null;
    // electron-builder names the NSIS installer "Quint-Setup-x.y.z.exe" and
    // the portable build plain "Quint-x.y.z.exe" -- prefer the installer.
    return exes.find((a) => /setup/i.test(a.name)) || exes[0];
  }

  function pickMacAsset(assets) {
    const dmgs = quintOnly(assets).filter((a) => a.name.toLowerCase().endsWith('.dmg'));
    if (dmgs.length === 0) return null;
    // The arm64 build is named "...-arm64.dmg"; the Intel build has no
    // arch suffix at all ("Quint-x.y.z.dmg"), so "not arm64" means Intel.
    const arm = dmgs.find((a) => /arm64/i.test(a.name));
    const intel = dmgs.find((a) => !/arm64/i.test(a.name));
    return (isAppleSilicon() ? arm : intel) || dmgs[0];
  }

  function pickLinuxAsset(assets) {
    return quintOnly(assets).find((a) => a.name.toLowerCase().endsWith('.appimage')) || null;
  }

  const OS_LABELS = {
    windows: 'Download for Windows',
    mac: 'Download for macOS',
    linux: 'Download for Linux',
  };

  function applyOS(os) {
    const label = document.getElementById('primary-download-label');
    const sub = document.getElementById('primary-download-sub');
    if (os && OS_LABELS[os]) {
      label.textContent = OS_LABELS[os];
      sub.textContent = 'Free & open source';
    } else {
      label.textContent = 'Download Quint';
      sub.textContent = 'Pick your platform below';
    }
    const card = document.getElementById(
      os === 'windows' ? 'dl-windows' : os === 'mac' ? 'dl-mac' : os === 'linux' ? 'dl-linux' : null
    );
    if (card) card.classList.add('current-os');
  }

  // ---------------------------------------------------------------------
  // macOS / Linux variant picker
  // ---------------------------------------------------------------------
  const GATEKEEPER_STEP = 'The first time you open it: right-click (or Control-click) <b>Quint</b> and choose <b>Open</b>, then click <b>Open</b> again in the dialog that appears. macOS shows this warning once because the app isn’t notarized by Apple yet (that needs a paid Apple Developer account) -- after that first time it opens normally, just like any other app.';

  const VARIANT_SETS = {
    mac: {
      title: 'Choose your Mac',
      icon: 'apple',
      hint: 'Pick the chip your Mac has — not sure? Apple menu () → About This Mac tells you.',
      options: [
        {
          id: 'mac-arm',
          label: 'Apple Silicon',
          detail: 'M1, M2, M3, or M4 — most Macs sold since late 2020',
          find: (assets) => quintOnly(assets).find((a) => /arm64/i.test(a.name) && a.name.toLowerCase().endsWith('.dmg')),
          instructions: [
            'Open the downloaded <code>.dmg</code> file.',
            'Drag <b>Quint</b> into the <b>Applications</b> folder.',
            GATEKEEPER_STEP,
          ],
        },
        {
          id: 'mac-intel',
          label: 'Intel',
          detail: 'Older Macs, before late 2020',
          find: (assets) => quintOnly(assets).find((a) => !/arm64/i.test(a.name) && a.name.toLowerCase().endsWith('.dmg')),
          instructions: [
            'Open the downloaded <code>.dmg</code> file.',
            'Drag <b>Quint</b> into the <b>Applications</b> folder.',
            GATEKEEPER_STEP,
          ],
        },
      ],
    },
    linux: {
      title: 'Choose your Linux',
      icon: 'terminal',
      hint: 'Pick whichever matches your distro — not sure which? AppImage needs no install and works almost everywhere.',
      options: [
        {
          id: 'linux-deb',
          label: 'Ubuntu / Debian',
          detail: 'and other .deb-based distros (Mint, Pop!_OS, ...)',
          find: (assets) => quintOnly(assets).find((a) => a.name.toLowerCase().endsWith('.deb')),
          instructions: [
            'Open a terminal in your Downloads folder.',
            'Run: <code>sudo dpkg -i quint_*.deb</code> (or just double-click the file if your file manager offers to install it).',
            'If it complains about missing dependencies, run <code>sudo apt --fix-broken install</code> once, then try again.',
            'Launch <b>Quint</b> from your applications menu.',
          ],
        },
        {
          id: 'linux-rpm',
          label: 'Fedora / RHEL',
          detail: 'and other .rpm-based distros (openSUSE, Rocky, ...)',
          find: (assets) => quintOnly(assets).find((a) => a.name.toLowerCase().endsWith('.rpm')),
          instructions: [
            'Open a terminal in your Downloads folder.',
            'Run: <code>sudo rpm -i quint-*.rpm</code> (or <code>sudo dnf install ./quint-*.rpm</code> on Fedora).',
            'Launch <b>Quint</b> from your applications menu.',
          ],
        },
        {
          id: 'linux-appimage',
          label: 'Other / not sure',
          detail: 'No install needed — works on nearly any distro',
          find: (assets) => quintOnly(assets).find((a) => a.name.toLowerCase().endsWith('.appimage')),
          instructions: [
            'Open a terminal in your Downloads folder and run <code>chmod +x Quint-*.AppImage</code> once, to make it runnable.',
            'Then run it: <code>./Quint-*.AppImage</code> — or just double-click it in your file manager from now on.',
            'If it refuses to launch, your system may be missing FUSE (<code>sudo apt install libfuse2</code> on Ubuntu 22.04+), or try the .deb/.rpm option instead.',
          ],
        },
      ],
    },
  };

  let cachedAssets = null; // set once the release fetch resolves; null forever if it fails

  function openPicker(os) {
    const set = VARIANT_SETS[os];
    if (!set) return;
    document.getElementById('os-picker-title').innerHTML = `<i data-lucide="${set.icon}"></i> ${set.title}`;
    document.getElementById('os-picker-hint').textContent = set.hint;

    const optionsEl = document.getElementById('os-picker-options');
    optionsEl.innerHTML = '';
    set.options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'os-picker-option';
      btn.innerHTML = `<span><b>${opt.label}</b><span>${opt.detail}</span></span><i data-lucide="chevron-right"></i>`;
      btn.addEventListener('click', () => chooseVariant(os, opt));
      optionsEl.appendChild(btn);
    });
    optionsEl.hidden = false;
    document.getElementById('os-picker-result').hidden = true;

    document.getElementById('modal-os-picker').hidden = false;
    if (window.lucide) lucide.createIcons();
  }

  function closePicker() {
    document.getElementById('modal-os-picker').hidden = true;
  }

  function chooseVariant(os, opt) {
    const asset = cachedAssets ? opt.find(cachedAssets) : null;
    document.getElementById('os-picker-options').hidden = true;
    const resultEl = document.getElementById('os-picker-result');
    const downloadingEl = resultEl.querySelector('#os-picker-downloading');
    const stepsEl = document.getElementById('os-picker-instructions-steps');

    if (!asset) {
      // Couldn't resolve an exact asset (release API failed, or this
      // format wasn't published for some reason) -- say so plainly and
      // send them to the releases page instead of pretending a download
      // started.
      downloadingEl.innerHTML = `<i data-lucide="alert-triangle"></i> <span>Couldn't find that exact file automatically -- opening the full releases page instead.</span>`;
      downloadingEl.classList.add('warn');
      stepsEl.innerHTML = '';
      opt.instructions.forEach((step) => {
        const li = document.createElement('li');
        li.innerHTML = step;
        stepsEl.appendChild(li);
      });
      resultEl.hidden = false;
      if (window.lucide) lucide.createIcons();
      window.open('https://github.com/deadbytee-del/Quint/releases/latest', '_blank', 'noopener');
      return;
    }

    const a = document.createElement('a');
    a.href = asset.browser_download_url;
    a.download = asset.name;
    document.body.appendChild(a);
    a.click();
    a.remove();

    downloadingEl.classList.remove('warn');
    downloadingEl.innerHTML = `<i data-lucide="check-circle-2"></i> <span>Downloading ${asset.name}…</span>`;
    stepsEl.innerHTML = '';
    opt.instructions.forEach((step) => {
      const li = document.createElement('li');
      li.innerHTML = step;
      stepsEl.appendChild(li);
    });
    resultEl.hidden = false;
    if (window.lucide) lucide.createIcons();
  }

  function wireOSPicker() {
    document.getElementById('os-picker-close').addEventListener('click', closePicker);
    document.getElementById('modal-os-picker').addEventListener('click', (e) => {
      if (e.target.id === 'modal-os-picker') closePicker();
    });
    document.getElementById('os-picker-back').addEventListener('click', () => {
      document.getElementById('os-picker-options').hidden = false;
      document.getElementById('os-picker-result').hidden = true;
    });

    document.getElementById('dl-mac').addEventListener('click', (e) => { e.preventDefault(); openPicker('mac'); });
    document.getElementById('dl-linux').addEventListener('click', (e) => { e.preventDefault(); openPicker('linux'); });

    document.getElementById('btn-primary-download').addEventListener('click', (e) => {
      const os = detectOS();
      if (os === 'mac' || os === 'linux') {
        e.preventDefault();
        openPicker(os);
      }
      // Windows (or undetected) keeps its normal direct-link behavior.
    });
  }

  async function wireDownloadLinks() {
    const os = detectOS();
    applyOS(os);

    let release;
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!res.ok) throw new Error('releases API returned ' + res.status);
      release = await res.json();
    } catch (e) {
      return; // Buttons already point at the releases page -- fine as-is.
    }

    const assets = release.assets || [];
    cachedAssets = assets;
    const winAsset = pickWindowsAsset(assets);
    const macAsset = pickMacAsset(assets);
    const linuxAsset = pickLinuxAsset(assets);

    if (winAsset) document.getElementById('dl-windows').href = winAsset.browser_download_url;
    if (macAsset) document.getElementById('dl-mac').href = macAsset.browser_download_url;
    if (linuxAsset) document.getElementById('dl-linux').href = linuxAsset.browser_download_url;

    const primaryAsset = os === 'windows' ? winAsset : os === 'mac' ? macAsset : os === 'linux' ? linuxAsset : null;
    if (primaryAsset) document.getElementById('btn-primary-download').href = primaryAsset.browser_download_url;

    if (release.tag_name) {
      document.getElementById('version-number').textContent = release.tag_name.replace(/^v/i, '');
      document.getElementById('version-tag').hidden = false;
    }
  }

  wireOSPicker();
  wireDownloadLinks();

  if (window.lucide) lucide.createIcons();
  document.addEventListener('DOMContentLoaded', () => { if (window.lucide) lucide.createIcons(); });
})();
