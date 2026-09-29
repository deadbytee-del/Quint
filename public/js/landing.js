// Quint download landing page: detects the visitor's OS to pick a sensible
// default download, and fetches the latest GitHub release to link each
// button straight at the right installer instead of just the releases page.
// Every button already has a safe fallback href (the releases page) set in
// the HTML, so if this script fails for any reason (offline, GitHub API
// rate limit, etc.) the page still works -- it just won't be as precise.
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

  function pickWindowsAsset(assets) {
    const exes = assets.filter((a) => a.name.toLowerCase().endsWith('.exe'));
    if (exes.length === 0) return null;
    // electron-builder names the NSIS installer "Quint-Setup-x.y.z.exe" and
    // the portable build plain "Quint-x.y.z.exe" -- prefer the installer.
    return exes.find((a) => /setup/i.test(a.name)) || exes[0];
  }

  function pickMacAsset(assets) {
    const dmgs = assets.filter((a) => a.name.toLowerCase().endsWith('.dmg'));
    if (dmgs.length === 0) return null;
    // The arm64 build is named "...-arm64.dmg"; the Intel build has no
    // arch suffix at all ("Quint-x.y.z.dmg"), so "not arm64" means Intel.
    const arm = dmgs.find((a) => /arm64/i.test(a.name));
    const intel = dmgs.find((a) => !/arm64/i.test(a.name));
    return (isAppleSilicon() ? arm : intel) || dmgs[0];
  }

  function pickLinuxAsset(assets) {
    return assets.find((a) => a.name.toLowerCase().endsWith('.appimage')) || null;
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

  wireDownloadLinks();

  if (window.lucide) lucide.createIcons();
  document.addEventListener('DOMContentLoaded', () => { if (window.lucide) lucide.createIcons(); });
})();
