# Quint 🟩

**The world's easiest Minecraft plugin creator.** Drag blocks, connect them like puzzle pieces (Scratch-style), and get a real, working [Paper](https://papermc.io/)/Bukkit plugin — no Java experience required.

Quint also has an **auto-decompilation** feature: drop in *any* existing plugin `.jar` and Quint will decompile it into readable Java, and do its best to reconstruct recognizable parts of it back into draggable blocks.

## Features

- 🧱 **Drag-and-connect visual editor** built on [Blockly](https://developers.google.com/blockly), styled after Scratch, with categories for Events, Commands, Actions, Sensing, Control, Logic, Math, Text and Variables.
- ⚡ **10 events** (player join/quit/chat/death, block break/place, interact, entity damage, plugin start/stop) and **custom `/commands`**.
- 🎮 **14 actions** — send/broadcast messages, give items, teleport, set health/hunger, play sounds, spawn particles/mobs, change game mode, kick players, cancel events, and delayed ("wait then...") actions.
- 👀 **View the generated Java** at any time — nothing is hidden, so it also works as a way to *learn* Bukkit/Paper plugin development.
- 📦 **Real builds** — click "Build Plugin" to either download a ready-to-use compiled `.jar` (Quint compiles it server-side with Maven + the Paper API) or a full Maven source project you can keep hacking on.
- 🧩 **Auto-decompilation** — upload an existing plugin `.jar` and Quint decompiles every class with [CFR](https://www.benf.org/other/cfr/) into readable Java, then does a best-effort pass to turn recognizable patterns (message events, cancels, etc.) back into blocks you can drop straight into the editor.
- 📚 Built-in example projects, save/load to a `.json` file, and autosave to your browser.
- 🌐 Also runs as a **plain static site** (e.g. GitHub Pages) with graceful fallback for the two features that need a real server — see below.

## Live demo (GitHub Pages)

The whole front-end — the editor, every block, the Java code generator, save/load, examples, and the Maven **source project** export — is plain client-side JS and runs fine with no server at all, so it's auto-deployed to GitHub Pages from `public/` on every push to `main` (see `.github/workflows/pages.yml`). Only two features fundamentally need a real machine with a JVM and Maven and can't run in a static site:

- Compiling a ready-to-use `.jar` (that's a real `mvn package` run)
- Auto-decompiling an existing `.jar` (that's a real run of the CFR decompiler)

When Quint detects there's no backend to ask (like on Pages), it shows a small banner, quietly hides the "download compiled jar" option in favor of "download Maven source project" (built entirely in-browser with [JSZip](https://stuk.github.io/jszip/)), and explains the decompiler needs the full app. Run it locally (below) to unlock both.

## Running it locally (full features)

```bash
npm install
npm start
```

Then open `http://localhost:3000`. That's it — no build step, no bundler. Blockly is loaded straight from a CDN and everything else is plain JS/Express.

Requirements on the machine running the server:
- **Node.js 18+**
- **Java 17+ JDK** and **Maven** on `PATH` (used to actually compile plugins and to run the CFR decompiler)
- Outbound internet access the first time you build a plugin (Maven needs to fetch the Paper API once; it's cached after that) and the first time you decompile a jar (Quint downloads the small CFR decompiler jar on demand)

## How it works

```
public/                       everything GitHub Pages deploys, and everything the Node server serves statically
  index.html                   page shell + modals
  css/style.css                Scratch-ish styling
  examples/                    sample projects shown in the "Examples" modal (plain static files)
  js/projectTemplate.js         pom.xml / plugin.yml builder -- shared by the browser AND the server (see below)
  js/blocks.js                  custom Blockly block definitions + toolbox
  js/generator.js                a hand-written Blockly "Java" code generator
  js/app.js                        UI wiring, save/load, backend feature-detection, calls to the backend when present

server/                     only used when you run `npm start` yourself
  index.js                  Express app (serves public/, plus /api/build and /api/decompile)
  routes/build.js            turns generated Java into a Maven project, optionally compiles it
  routes/decompile.js        accepts a .jar, decompiles it, tries to "blockify" it
  lib/mavenProject.js        writes pom.xml / plugin.yml / *.java to disk (via public/js/projectTemplate.js)
  lib/build.js                shells out to `mvn package`
  lib/decompiler.js          shells out to CFR
  lib/blockify.js            regex-based best-effort Java -> Blockly XML reconstruction

scripts/setup-cfr.js       downloads the CFR decompiler jar to server/tools/cfr.jar
.github/workflows/pages.yml  deploys public/ to GitHub Pages on every push to main
```

`public/js/projectTemplate.js` is written as a small UMD module specifically so the exact same `pom.xml`/`plugin.yml` generation code runs both in the browser (for the static/no-backend "download source" path) and in the Node server (for the real `mvn package` path) — there's only one implementation to keep correct.

### Code generation model

Every plugin is generated as a **single Java class** that extends `JavaPlugin`, implements `Listener` and `CommandExecutor`. Each "when ... happens" block in the workspace becomes one `@EventHandler` method (or a `case` in `onCommand`'s switch), so workspace variables can be simple fields on that one class without any cross-file wiring. All Bukkit/Paper types are fully-qualified in the generated code (e.g. `org.bukkit.entity.Player`) instead of relying on import statements, which keeps the generator simple and avoids missing-import compile errors.

### Auto-decompilation, honestly

Turning arbitrary compiled Java back into beginner-friendly blocks is an open problem, so Quint doesn't pretend to solve it in general. `blockify.js` only recognizes a handful of very common statement shapes (`player.sendMessage("...")`, `Bukkit.broadcastMessage("...")`, `event.setJoinMessage("...")`, `event.setCancelled(true)`, etc.) inside `@EventHandler` methods for the event types Quint's blocks know about. Anything it doesn't recognize is simply left out of the reconstructed blocks — the full decompiled source is always shown alongside so nothing is hidden, and the UI reports how much of the plugin was actually recognized (e.g. "recognized 2/2 event handlers and 3/7 statements").

## License

MIT, see [LICENSE](LICENSE).
