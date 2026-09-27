// Best-effort reconstruction of Blockly blocks from CFR-decompiled Bukkit/Paper
// plugin source. This is intentionally conservative: it only recognizes a
// handful of very common statement shapes (send a message, broadcast, cancel
// the event, set a join/quit message). Anything it doesn't understand is left
// out of the block workspace -- the full decompiled source is always returned
// alongside so nothing is hidden from the user.

const EVENT_MAP = {
  PlayerJoinEvent: 'mc_event_join',
  PlayerQuitEvent: 'mc_event_quit',
  AsyncPlayerChatEvent: 'mc_event_chat',
  PlayerChatEvent: 'mc_event_chat',
  PlayerDeathEvent: 'mc_event_death',
  BlockBreakEvent: 'mc_event_block_break',
  BlockPlaceEvent: 'mc_event_block_place',
  PlayerInteractEvent: 'mc_event_interact',
  EntityDamageEvent: 'mc_event_damage',
};

function xmlEscape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textBlock(literal) {
  return `<block type="text"><field name="TEXT">${xmlEscape(literal)}</field></block>`;
}

function playerReporterBlock() {
  return '<block type="mc_value_event_player"></block>';
}

/** Extracts `@EventHandler ... public void name(Type arg) { body }` methods. */
function findEventHandlerMethods(source) {
  const methods = [];
  const re = /@EventHandler[^\n]*\s+public\s+void\s+(\w+)\s*\(\s*([\w.]+)\s+(\w+)\s*\)\s*(?:throws[^{]+)?\{/g;
  let match;
  while ((match = re.exec(source))) {
    const bodyStart = re.lastIndex;
    const bodyEnd = findMatchingBrace(source, bodyStart - 1);
    if (bodyEnd === -1) continue;
    const fullType = match[2];
    const simpleType = fullType.split('.').pop();
    methods.push({
      methodName: match[1],
      eventType: simpleType,
      argName: match[3],
      body: source.slice(bodyStart, bodyEnd),
    });
  }
  return methods;
}

function findMatchingBrace(source, openBraceIndex) {
  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Turns a handful of recognized statement shapes into block XML strings. */
function blockifyStatements(body, argName) {
  const lines = body
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const blocks = [];
  let recognized = 0;
  let total = 0;

  const patterns = [
    {
      // event.getPlayer().sendMessage("literal");
      re: new RegExp(`^${argName}\\.getPlayer\\(\\)\\.sendMessage\\(\\s*"((?:[^"\\\\]|\\\\.)*)"\\s*\\)\\s*;$`),
      build: (m) => `<block type="mc_action_send_message"><value name="PLAYER">${playerReporterBlock()}</value><value name="MESSAGE">${textBlock(m[1])}</value></block>`,
    },
    {
      // player.sendMessage("literal");  (any local var, generic fallback)
      re: /^\w+\.sendMessage\(\s*"((?:[^"\\]|\\.)*)"\s*\)\s*;$/,
      build: (m) => `<block type="mc_action_send_message"><value name="PLAYER">${playerReporterBlock()}</value><value name="MESSAGE">${textBlock(m[1])}</value></block>`,
    },
    {
      // Bukkit.broadcastMessage("literal");
      re: /^Bukkit\.broadcastMessage\(\s*"((?:[^"\\]|\\.)*)"\s*\)\s*;$/,
      build: (m) => `<block type="mc_action_broadcast"><value name="MESSAGE">${textBlock(m[1])}</value></block>`,
    },
    {
      // event.setJoinMessage("literal");
      re: new RegExp(`^${argName}\\.setJoinMessage\\(\\s*"((?:[^"\\\\]|\\\\.)*)"\\s*\\)\\s*;$`),
      build: (m) => `<block type="mc_action_set_join_message"><value name="MESSAGE">${textBlock(m[1])}</value></block>`,
    },
    {
      // event.setQuitMessage("literal");
      re: new RegExp(`^${argName}\\.setQuitMessage\\(\\s*"((?:[^"\\\\]|\\\\.)*)"\\s*\\)\\s*;$`),
      build: (m) => `<block type="mc_action_set_quit_message"><value name="MESSAGE">${textBlock(m[1])}</value></block>`,
    },
    {
      // event.setCancelled(true);
      re: new RegExp(`^${argName}\\.setCancelled\\(\\s*true\\s*\\)\\s*;$`),
      build: () => '<block type="mc_action_cancel_event"></block>',
    },
  ];

  for (const line of lines) {
    if (!line || line.startsWith('//') || line === '{' || line === '}') continue;
    total++;
    let matched = false;
    for (const p of patterns) {
      const m = line.match(p.re);
      if (m) {
        blocks.push(p.build(m));
        recognized++;
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Unrecognized statement: skip it, it stays visible only in the raw source.
    }
  }

  return { blocks, recognized, total };
}

function chainBlocks(blockXmlList) {
  if (blockXmlList.length === 0) return '';
  let xml = blockXmlList[blockXmlList.length - 1];
  for (let i = blockXmlList.length - 2; i >= 0; i--) {
    xml = blockXmlList[i].replace(/<\/block>$/, `<next>${xml}</next></block>`);
  }
  return xml;
}

/**
 * @param {{path:string, content:string}[]} sourceFiles
 * @returns {{xml: string|null, stats: {recognizedEvents:number, totalEvents:number, recognizedStatements:number, totalStatements:number}}}
 */
function blockifySources(sourceFiles) {
  let x = 20;
  let y = 20;
  const topBlocks = [];
  const stats = { recognizedEvents: 0, totalEvents: 0, recognizedStatements: 0, totalStatements: 0 };

  for (const file of sourceFiles) {
    const methods = findEventHandlerMethods(file.content);
    for (const method of methods) {
      stats.totalEvents++;
      const blockType = EVENT_MAP[method.eventType];
      if (!blockType) continue;
      stats.recognizedEvents++;

      const { blocks, recognized, total } = blockifyStatements(method.body, method.argName);
      stats.recognizedStatements += recognized;
      stats.totalStatements += total;

      const inner = chainBlocks(blocks);
      const statement = inner ? `<statement name="DO">${inner}</statement>` : '';
      topBlocks.push(`<block type="${blockType}" x="${x}" y="${y}">${statement}</block>`);
      y += 160;
    }
  }

  if (topBlocks.length === 0) return { xml: null, stats };

  const xml = `<xml xmlns="https://developers.google.com/blockly/xml">${topBlocks.join('')}</xml>`;
  return { xml, stats };
}

module.exports = { blockifySources };
