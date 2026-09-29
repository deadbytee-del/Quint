# Quint 🟩

**The world's easiest Minecraft plugin creator.** Drag blocks, connect them like puzzle pieces (Scratch-style), and get a real, working [Paper](https://papermc.io/)/Bukkit plugin — no Java experience required.

Quint also has an **auto-decompilation** feature: drop in *any* existing plugin `.jar` and Quint will decompile it into readable Java, and do its best to reconstruct recognizable parts of it back into draggable blocks.

**[quint's website](https://deadbytee-del.github.io/Quint/) is just a download page** — pick Windows, macOS, or Linux and get the desktop app. The actual block editor also still runs entirely as a static site with nothing to install (see [`public/app/`](#how-it-works)), reachable from the "Try in browser" link on the download page, if you'd rather not install anything at all.

## Features

- 🧱 **Drag-and-connect visual editor** built on [Blockly](https://developers.google.com/blockly), styled after Scratch with a deep purple/black dark theme and [Lucide](https://lucide.dev) icons throughout, and categories for Events, Commands, Actions, Sensing, Control, Logic, Math, Text, Lists, Variables, and a separate ⚠️ Unsafe/Advanced category.
- 🔒 **Real typed sockets, not "anything fits anywhere."** A Player-shaped value only plugs into a player socket, a Boolean-shaped one only into a condition, and so on — Blockly rejects the wrong shape before you can even connect it, instead of generating Java that fails to compile. Values still nest freely wherever the type actually matches (e.g. plug "the online player named ___"'s location straight into "teleport to").
- ✅ **Pre-build validation** — Quint checks the whole workspace before compiling: a block that isn't connected to any event/command, or a socket nobody filled in, is reported with a plain-English list up front instead of surfacing as a cryptic Java error (or a plugin that silently does less than it looks like it does).
- 🧮 **A real variable system** — one variable can hold a number, a string, a boolean, a list, a player, whatever you last stored in it, so `set score = 0` → `set score = score + 1` → `if score >= 10` just works, same as lists (`create list with`, `for each item in list`, get/set/length/is empty), no separate "make a number/string/list variable" step.
- ✨ **MiniMessage-formatted text** — send/broadcast blocks that accept MiniMessage tags (`<gradient:#ff0000:#8000ff><bold>Welcome!</bold></gradient>`, `<red>...</red>`) for real colored/gradient/bold chat, on top of the plain-text versions.
- 🛡️ **LuckPerms integration (optional)** — give a player a permission or group permanently, or check group membership, via a soft dependency that safely no-ops if LuckPerms isn't installed on the server; auto-added to `plugin.yml`'s `softdepend` whenever you use one.
- 💾 **Persistent player data** — save/read a value on a player that survives server restarts (`PersistentDataContainer`-backed), separate from a plugin's in-memory variables.
- ⚠️ **An explicit Unsafe/Advanced category** — raw Java statement/expression/class-reference blocks as an escape hatch for whatever a friendly block doesn't cover yet, clearly red and clearly labeled: no coercion, no type checking, a mistake here is a normal `javac` error.
- 🔌 **Dependency manager** — declare other plugins your plugin hard/soft-depends on in Plugin Settings; written straight into `plugin.yml`.
- ⚡ **29 events** (join/quit/chat/death/respawn, drop/pickup item, sneak/sprint toggle, XP level change, mob death, block break/place/ignite, interact, damage (including PvP), teleport, world change, kick, hotbar switch, vehicle enter/exit, inventory clicks, bed enter, any command typed, plugin start/stop) and **custom `/commands`**.
- 🎮 **39 actions** — messaging (chat, broadcast, titles, action bar, MiniMessage-formatted chat/broadcast), items & inventory (give/remove/equip/clear), teleport (by coordinates or by a Location value), health/hunger/XP, potion effects, flight & walk speed, sounds & particles, mob spawning, weather/time/lightning/explosions, game mode, kicking, permissions (plain + LuckPerms), persistent player data, spawn points, running server console commands, and both one-shot ("wait then...") and repeating ("every N ticks...") delayed actions.
- 🔎 **26 sensing blocks** — player health/max health/hunger/XP/position/location/world, permissions (plain + LuckPerms group check), persistent data, sneaking/OP status, inventory contents, block type, online player count, looking up a player by name, random numbers, and more.
- 👀 **View the generated Java** at any time — nothing is hidden, so it also works as a way to *learn* Bukkit/Paper plugin development.
- 📦 **Real builds, zero install** — click "Build Plugin" to compile a genuine, ready-to-use `.jar` (or download the Maven source project instead) without installing a JDK, Maven, or anything else. See "How the in-browser compiler works" below.
- 🧭 **Targets Minecraft 1.21.11 or 1.20.4** — pick either in Plugin Settings; each compiles against its own real, matching Paper API.
- 🧩 **Auto-decompilation** — upload any existing plugin `.jar` and Quint decompiles every class with [CFR](https://www.benf.org/other/cfr/) into readable Java, right in your browser, then does a best-effort pass to turn recognizable patterns (message events, cancels, etc.) back into blocks you can drop straight into the editor.
- 📁 **My Projects** — every project you save is kept in your browser (not just one autosave slot), with its own page to browse, reopen or delete past work.
- 🗂️ **Project menu** — click the project name to rename it on the spot, start a new one, or jump straight to a recent project without leaving the workspace; the full My Projects list also supports renaming, not just delete.
- ⚙️ **App preferences** — autosave, confirm-before-New, zoom-to-fit, sound effects, a default author name, and a block rendering style, all persisted across projects.
- 🖥️ **Desktop app** for Windows/Mac/Linux, alongside the website — see below.
- 📚 Built-in example projects and save/load to a `.json` file.

## Using it

Head to [the website](https://deadbytee-del.github.io/Quint/) and download the desktop app for your OS — that's the main way to use Quint. If you'd rather not install anything, the "Try in browser" link opens the exact same block editor as a plain static page (see [`public/app/`](#how-it-works)); there's nothing to set up there either, on either side: not for you as the person building the plugin, and not for whoever hosts the page.

### Desktop app

Quint ships as a desktop app (Windows `.exe`, macOS `.dmg`, Linux `.AppImage`) — it's the same browser-based editor, opened in its own window instead of a browser tab, so it works completely offline after the first launch. Grab the latest build for your OS from the [download page](https://deadbytee-del.github.io/Quint/) or directly from the [Releases page](https://github.com/deadbytee-del/Quint/releases/latest).

The desktop app isn't just a bookmarked tab -- it does a few things a website fundamentally can't:

- ⚡ **Native compiling.** A browser tab can only run a real Java toolchain by emulating one in WebAssembly (see below) — real, but slower to start every time. The desktop app instead checks for a Java runtime already on your machine and, if it finds one, runs the very same compiler/decompiler jars through it directly. No WASM engine to load, no browser memory ceiling — builds finish in well under a second instead of the several seconds the in-browser path takes. If no system Java is found, it falls back to the exact same in-browser compiler the website uses, so it always works either way.
- 🍎 **Works the same on macOS.** GUI apps on macOS often can't see a JDK that's perfectly visible from Terminal, because they don't inherit your shell's `PATH`. Quint works around this at startup (reading your login shell's real `PATH`, plus checking `JAVA_HOME` and `/usr/libexec/java_home`), so a Java install that "should" work usually does.
- 🔄 **Auto-updates** in the background via GitHub Releases, instead of you having to notice a new version and re-download it.
- 💾 A real save-file dialog (instead of a browser downloads folder) and a proper installer with a Start Menu/Desktop shortcut on Windows.

### Running it yourself

Because it's 100% static, "running" the site is just serving a folder:

```bash
npx serve public       # the download landing page, at /
npx serve public/app   # the actual block editor, on its own
```

...or push `public/` to GitHub Pages, Netlify, or any other static host — `public/index.html` is the download page and `public/app/` is the editor, reachable at `/app/`. There's no backend, no build step, and no server-side dependency to install anywhere.

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
- The compiler/decompiler jars themselves (`ecj.jar`, `paper-api.jar` + its small set of dependencies, `cfr.jar`) are vendored under `public/app/vendor/` and loaded same-origin, because Maven Central and the PaperMC repository both refuse cross-origin `fetch()` from a browser — they simply can't be loaded directly from a webpage at runtime, only vendored.
- The first time you build a jar or import one in a given page load, there's a short pause while the Java engine and these jars load (a handful of MB, cached by the browser after that); every build/decompile after that is fast.

## Features that are honestly still work in progress

Turning arbitrary compiled Java back into beginner-friendly blocks is an open problem, so Quint doesn't pretend to solve it in general. `public/app/js/blockify.js` only recognizes a handful of very common statement shapes (`player.sendMessage("...")`, `Bukkit.broadcastMessage("...")`, `event.setJoinMessage("...")`, `event.setCancelled(true)`, etc.) inside `@EventHandler` methods for the event types Quint's blocks know about. Anything it doesn't recognize is simply left out of the reconstructed blocks — the full decompiled source is always shown alongside so nothing is hidden, and the UI reports how much of the plugin was actually recognized (e.g. "recognized 2/2 event handlers and 3/7 statements").

## How it works

```
public/                       everything served on the web -- a plain static site, no backend anywhere
  index.html                   the download landing page (this is what deadbytee-del.github.io/Quint/ shows)
  css/landing.css              its styling
  js/landing.js                 detects your OS + fetches the latest GitHub release to link the right installer
  app/                         the actual block editor, reachable at /app/ (and what the desktop app wraps)
    index.html                  page shell + modals
    css/style.css                Scratch-ish styling
    examples/                    sample projects shown in the "Examples" modal
    vendor/                      vendored jars for the in-browser/native compiler/decompiler
      ecj.jar                     Eclipse Compiler for Java (compiles the generated source)
      cfr.jar                      the CFR decompiler
      luckperms-api.jar             LuckPerms API (compile-only; LuckPerms itself is optional at runtime)
      mc1.21.11/                  paper-api.jar + matching adventure/examination/bungeecord-chat/minimessage versions
      mc1.20.4/                    for that Minecraft/Paper version -- pick one in Plugin Settings
    js/projectTemplate.js        pom.xml / plugin.yml text builder
    js/blocks.js                 custom Blockly block definitions + toolbox
    js/generator.js               a hand-written Blockly "Java" code generator
    js/blockify.js                 regex-based best-effort Java -> Blockly XML reconstruction
    js/cheerpjCompiler.js            runs ECJ/CFR inside CheerpJ's in-browser JVM
    js/app.js                          UI wiring, save/load, project menu, ties it all together

.github/workflows/pages.yml  deploys public/ (both the landing page and app/) to GitHub Pages on every push to main
```

### Code generation model

Every plugin is generated as a **single Java class** that extends `JavaPlugin`, implements `Listener` and `CommandExecutor`. Each "when ... happens" block in the workspace becomes one `@EventHandler` method (or a `case` in `onCommand`'s switch), so workspace variables can be simple fields on that one class without any cross-file wiring. All Bukkit/Paper types are fully-qualified in the generated code (e.g. `org.bukkit.entity.Player`) instead of relying on import statements, and everything compiles down to Java 8 bytecode for maximum compatibility with real Paper/Spigot servers.

## License

MIT, see [LICENSE](LICENSE). The vendored jars under `public/app/vendor/` keep their own upstream licenses (Eclipse Public License for ECJ, MIT for CFR, GPLv3-with-classpath-exception-style for the Paper API/Adventure/BungeeCord-Chat/MiniMessage, MIT for the LuckPerms API).
