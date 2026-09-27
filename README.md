# Quint 🟩

**The world's easiest Minecraft plugin creator.** Drag blocks, connect them like puzzle pieces (Scratch-style), and get a real, working [Paper](https://papermc.io/)/Bukkit plugin — no Java experience required.

Quint also has an **auto-decompilation** feature: drop in *any* existing plugin `.jar` and Quint will decompile it into readable Java, and do its best to reconstruct recognizable parts of it back into draggable blocks.

**It's just a website.** Open it and start building — there's nothing to install, no account, no command line, not even for compiling a real, ready-to-use `.jar`. Compiling and decompiling Java both run for real, entirely inside your browser tab.

## Features

- 🧱 **Drag-and-connect visual editor** built on [Blockly](https://developers.google.com/blockly), styled after Scratch, with categories for Events, Commands, Actions, Sensing, Control, Logic, Math, Text and Variables.
- ⚡ **10 events** (player join/quit/chat/death, block break/place, interact, entity damage, plugin start/stop) and **custom `/commands`**.
- 🎮 **14 actions** — send/broadcast messages, give items, teleport, set health/hunger, play sounds, spawn particles/mobs, change game mode, kick players, cancel events, and delayed ("wait then...") actions.
- 👀 **View the generated Java** at any time — nothing is hidden, so it also works as a way to *learn* Bukkit/Paper plugin development.
- 📦 **Real builds, zero install** — click "Build Plugin" to compile a genuine, ready-to-use `.jar` (or download the Maven source project instead) without installing a JDK, Maven, or anything else. See "How the in-browser compiler works" below.
- 🧩 **Auto-decompilation** — upload any existing plugin `.jar` and Quint decompiles every class with [CFR](https://www.benf.org/other/cfr/) into readable Java, right in your browser, then does a best-effort pass to turn recognizable patterns (message events, cancels, etc.) back into blocks you can drop straight into the editor.
- 📚 Built-in example projects, save/load to a `.json` file, and autosave to your browser.

## Using it

Just open the site and start dragging blocks. There is nothing to set up, on either side: not for you as the person building the plugin, and not for whoever hosts the page. It's a plain static site — every feature, including compiling a real `.jar`, runs entirely in the visitor's own browser tab.

### Desktop app

Prefer a normal installed app over a browser tab? Quint also ships as a desktop app (Windows `.exe`, macOS `.dmg`, Linux `.AppImage`) — it's the exact same `public/` site, just opened in its own window instead of a browser, so it works completely offline after the first launch. Grab the latest build for your OS from the [Releases page](https://github.com/deadbytee-del/Quint/releases/latest).

### Running it yourself

Because it's 100% static, "running" Quint is just serving a folder:

```bash
npx serve public
```

...or push `public/` to GitHub Pages, Netlify, or any other static host. There's no backend, no build step, and no server-side dependency to install anywhere.

To build the desktop app yourself instead of downloading a release:

```bash
npm install
npm run dist        # builds an installer for your current OS into dist/
npm run electron:dev  # or just run it directly, unpackaged, while developing
```

## How the in-browser compiler works

Real Minecraft plugins have to be actual compiled JVM bytecode — there's no faking that part. Quint gets there without a server by running a real Java toolchain *inside the page*, using [CheerpJ](https://cheerpj.com) (a WebAssembly build of a JVM):

- **Compiling**: your generated Java source is fed to the [Eclipse Compiler for Java (ECJ)](https://download.eclipse.org/eclipse/downloads/) running inside CheerpJ, against a real copy of the Paper API, producing genuine `.class` bytecode. That gets zipped up (with JSZip) alongside `plugin.yml` into a normal, loadable plugin `.jar` — same as `mvn package` would produce, just with nothing installed on your machine.
- **Decompiling**: an uploaded `.jar` is fed to the real [CFR decompiler](https://www.benf.org/other/cfr/) (also just a Java program), also running inside CheerpJ, producing the same clean readable source CFR always would.
- The compiler/decompiler jars themselves (`ecj.jar`, `paper-api.jar` + its small set of dependencies, `cfr.jar`) are vendored under `public/vendor/` and loaded same-origin, because Maven Central and the PaperMC repository both refuse cross-origin `fetch()` from a browser — they simply can't be loaded directly from a webpage at runtime, only vendored.
- The first time you build a jar or import one in a given page load, there's a short pause while the Java engine and these jars load (a handful of MB, cached by the browser after that); every build/decompile after that is fast.

## Features that are honestly still work in progress

Turning arbitrary compiled Java back into beginner-friendly blocks is an open problem, so Quint doesn't pretend to solve it in general. `public/js/blockify.js` only recognizes a handful of very common statement shapes (`player.sendMessage("...")`, `Bukkit.broadcastMessage("...")`, `event.setJoinMessage("...")`, `event.setCancelled(true)`, etc.) inside `@EventHandler` methods for the event types Quint's blocks know about. Anything it doesn't recognize is simply left out of the reconstructed blocks — the full decompiled source is always shown alongside so nothing is hidden, and the UI reports how much of the plugin was actually recognized (e.g. "recognized 2/2 event handlers and 3/7 statements").

## How it works

```
public/                       the entire app -- a plain static site, no backend anywhere
  index.html                   page shell + modals
  css/style.css                Scratch-ish styling
  examples/                    sample projects shown in the "Examples" modal
  vendor/                      vendored jars for the in-browser compiler/decompiler
    ecj.jar                     Eclipse Compiler for Java (compiles the generated source)
    paper-api.jar                the Paper API (what the generated code is compiled against)
    adventure-api.jar             \_ small transitive deps paper-api needs to resolve
    bungeecord-chat.jar           /
    cfr.jar                      the CFR decompiler
  js/projectTemplate.js        pom.xml / plugin.yml text builder
  js/blocks.js                 custom Blockly block definitions + toolbox
  js/generator.js               a hand-written Blockly "Java" code generator
  js/blockify.js                 regex-based best-effort Java -> Blockly XML reconstruction
  js/cheerpjCompiler.js            runs ECJ/CFR inside CheerpJ's in-browser JVM
  js/app.js                          UI wiring, save/load, ties it all together

.github/workflows/pages.yml  deploys public/ to GitHub Pages on every push to main
```

### Code generation model

Every plugin is generated as a **single Java class** that extends `JavaPlugin`, implements `Listener` and `CommandExecutor`. Each "when ... happens" block in the workspace becomes one `@EventHandler` method (or a `case` in `onCommand`'s switch), so workspace variables can be simple fields on that one class without any cross-file wiring. All Bukkit/Paper types are fully-qualified in the generated code (e.g. `org.bukkit.entity.Player`) instead of relying on import statements, and everything compiles down to Java 8 bytecode for maximum compatibility with real Paper/Spigot servers.

## License

MIT, see [LICENSE](LICENSE). The vendored jars under `public/vendor/` keep their own upstream licenses (Eclipse Public License for ECJ, MIT for CFR, GPLv3-with-classpath-exception-style for the Paper API/Adventure/BungeeCord-Chat).
