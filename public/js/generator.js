// Java code generator for Quint's Blockly workspace.
//
// Design note: the "hat" blocks (mc_on_enable, mc_on_disable, mc_event_*,
// mc_command_define) are NOT generated through forBlock. app.js walks the
// workspace's top-level blocks directly, reads their fields, and calls
// Java.statementToCode() on their DO input to get the body -- this lets
// app.js assemble those bodies into whole Java files (Main.java, a
// Listener class, one class per command) with full control over structure.
// Every other block (actions, sensing reporters, logic/math/text/control)
// is generated the normal Blockly way through Java.forBlock[...].
(function () {
  'use strict';

  const Java = new Blockly.CodeGenerator('Java');
  Java.INDENT = '    ';

  const Order = {
    ATOMIC: 0,
    UNARY: 1,
    MULTIPLICATIVE: 2,
    ADDITIVE: 3,
    RELATIONAL: 4,
    EQUALITY: 5,
    LOGICAL_AND: 6,
    LOGICAL_OR: 7,
    NONE: 99,
  };
  Java.ORDER = Order;

  Java.init = function (workspace) {
    this.nameDB_ = new Blockly.Names(this.RESERVED_WORDS_ || '');
    this.nameDB_.setVariableMap(workspace.getVariableMap());
    this.isInitialized = true;
  };
  Java.finish = function (code) {
    return code;
  };
  Java.scrubNakedValue = function (line) {
    return line + ';\n';
  };
  Java.scrub_ = function (block, code) {
    const next = block.nextConnection && block.nextConnection.targetBlock();
    const nextCode = next ? this.blockToCode(next) : '';
    return code + nextCode;
  };

  function esc(str) {
    return JSON.stringify(String(str == null ? '' : str));
  }

  function num(generator, block, name, fallback) {
    const code = generator.valueToCode(block, name, Order.ATOMIC);
    return code || String(fallback);
  }

  function val(generator, block, name, fallback) {
    const code = generator.valueToCode(block, name, Order.NONE);
    return code || fallback;
  }

  function toInt(expr) {
    return `((int)Math.round(${expr}))`;
  }

  const F = Java.forBlock;

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------
  F['mc_action_send_message'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    const msg = val(g, block, 'MESSAGE', '""');
    return `${player}.sendMessage(${msg});\n`;
  };

  F['mc_action_broadcast'] = (block, g) => {
    const msg = val(g, block, 'MESSAGE', '""');
    return `getServer().broadcastMessage(${msg});\n`;
  };

  F['mc_action_give_item'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    const material = block.getFieldValue('MATERIAL');
    const amount = num(g, block, 'AMOUNT', 1);
    return `${player}.getInventory().addItem(new org.bukkit.inventory.ItemStack(org.bukkit.Material.${material}, ${toInt(amount)}));\n`;
  };

  F['mc_action_teleport'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    const x = num(g, block, 'X', 0);
    const y = num(g, block, 'Y', 0);
    const z = num(g, block, 'Z', 0);
    return `${player}.teleport(new org.bukkit.Location(${player}.getWorld(), ${x}, ${y}, ${z}));\n`;
  };

  F['mc_action_set_health'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    const amount = num(g, block, 'AMOUNT', 20);
    return `${player}.setHealth(Math.max(0, Math.min(${player}.getMaxHealth(), ${amount})));\n`;
  };

  F['mc_action_set_food'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    const amount = num(g, block, 'AMOUNT', 20);
    return `${player}.setFoodLevel(Math.max(0, Math.min(20, ${toInt(amount)})));\n`;
  };

  F['mc_action_play_sound'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    const sound = block.getFieldValue('SOUND');
    return `${player}.playSound(${player}.getLocation(), org.bukkit.Sound.${sound}, 1.0f, 1.0f);\n`;
  };

  F['mc_action_spawn_particle'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    const particle = block.getFieldValue('PARTICLE');
    const count = num(g, block, 'COUNT', 20);
    return `${player}.getWorld().spawnParticle(org.bukkit.Particle.${particle}, ${player}.getLocation(), ${toInt(count)});\n`;
  };

  F['mc_action_spawn_mob'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    const entity = block.getFieldValue('ENTITY');
    return `${player}.getWorld().spawnEntity(${player}.getLocation(), org.bukkit.entity.EntityType.${entity});\n`;
  };

  F['mc_action_set_gamemode'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    const mode = block.getFieldValue('GAMEMODE');
    return `${player}.setGameMode(org.bukkit.GameMode.${mode});\n`;
  };

  F['mc_action_kick_player'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    const reason = val(g, block, 'REASON', '""');
    return `${player}.kickPlayer(${reason});\n`;
  };

  F['mc_action_set_join_message'] = (block, g) => {
    const msg = val(g, block, 'MESSAGE', '""');
    return `event.setJoinMessage(${msg});\n`;
  };

  F['mc_action_set_quit_message'] = (block, g) => {
    const msg = val(g, block, 'MESSAGE', '""');
    return `event.setQuitMessage(${msg});\n`;
  };

  F['mc_action_cancel_event'] = () => {
    return 'event.setCancelled(true);\n';
  };

  F['mc_action_wait_then'] = (block, g) => {
    const ticks = num(g, block, 'TICKS', 20);
    const body = g.statementToCode(block, 'DO');
    return `getServer().getScheduler().runTaskLater(this, () -> {\n${body}}, ${toInt(ticks)});\n`;
  };

  F['mc_action_repeat_every_ticks'] = (block, g) => {
    const period = num(g, block, 'PERIOD', 20);
    const body = g.statementToCode(block, 'DO');
    return `getServer().getScheduler().runTaskTimer(this, () -> {\n${body}}, ${toInt(period)}, ${toInt(period)});\n`;
  };

  F['mc_action_set_time'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    const ticks = num(g, block, 'TICKS', 0);
    return `${player}.getWorld().setTime(${toInt(ticks)});\n`;
  };

  F['mc_action_set_weather'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    const storm = block.getFieldValue('WEATHER') === 'STORM';
    return `${player}.getWorld().setStorm(${storm});\n`;
  };

  F['mc_action_strike_lightning'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    return `${player}.getWorld().strikeLightning(${player}.getLocation());\n`;
  };

  F['mc_action_create_explosion'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    const power = num(g, block, 'POWER', 4);
    return `${player}.getWorld().createExplosion(${player}.getLocation(), (float) (${power}));\n`;
  };

  F['mc_action_add_potion_effect'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    const effect = block.getFieldValue('EFFECT');
    const seconds = num(g, block, 'SECONDS', 10);
    const level = num(g, block, 'LEVEL', 1);
    return `${player}.addPotionEffect(new org.bukkit.potion.PotionEffect(org.bukkit.potion.PotionEffectType.${effect}, ${toInt(seconds)} * 20, ${toInt(level)} - 1));\n`;
  };

  F['mc_action_clear_potion_effects'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    return `for (org.bukkit.potion.PotionEffect quintEffect : ${player}.getActivePotionEffects()) { ${player}.removePotionEffect(quintEffect.getType()); }\n`;
  };

  F['mc_action_set_flying'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    const on = block.getFieldValue('STATE') === 'ON';
    return `${player}.setAllowFlight(${on}); ${player}.setFlying(${on});\n`;
  };

  F['mc_action_set_walk_speed'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    const speed = num(g, block, 'SPEED', 0.2);
    return `${player}.setWalkSpeed(Math.max(-1f, Math.min(1f, (float) (${speed}))));\n`;
  };

  F['mc_action_clear_inventory'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    return `${player}.getInventory().clear();\n`;
  };

  F['mc_action_give_xp'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    const amount = num(g, block, 'AMOUNT', 10);
    return `${player}.giveExp(${toInt(amount)});\n`;
  };

  F['mc_action_set_level'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    const level = num(g, block, 'LEVEL', 0);
    return `${player}.setLevel(${toInt(level)});\n`;
  };

  F['mc_action_equip_item'] = (block, g) => {
    const material = block.getFieldValue('MATERIAL');
    const player = val(g, block, 'PLAYER', 'player');
    return `${player}.getInventory().setItemInMainHand(new org.bukkit.inventory.ItemStack(org.bukkit.Material.${material}, 1));\n`;
  };

  F['mc_action_set_block_at_player'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    const material = block.getFieldValue('MATERIAL2');
    return `${player}.getLocation().getBlock().setType(org.bukkit.Material.${material});\n`;
  };

  F['mc_action_send_title'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    const title = val(g, block, 'TITLE', '""');
    const subtitle = val(g, block, 'SUBTITLE', '""');
    return `${player}.sendTitle(${title}, ${subtitle}, 10, 70, 20);\n`;
  };

  F['mc_action_send_actionbar'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    const text = val(g, block, 'TEXT', '""');
    return `${player}.sendActionBar(net.kyori.adventure.text.Component.text(String.valueOf(${text})));\n`;
  };

  // ---------------------------------------------------------------------
  // Sensing / reporters
  // ---------------------------------------------------------------------
  F['mc_value_event_player'] = () => ['player', Order.ATOMIC];
  F['mc_value_event_message'] = () => ['message', Order.ATOMIC];
  F['mc_value_event_block'] = () => ['block', Order.ATOMIC];
  F['mc_value_command_sender'] = () => ['sender', Order.ATOMIC];
  F['mc_value_command_args_joined'] = () => ['String.join(" ", args)', Order.ATOMIC];

  F['mc_value_player_name'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    return [`${player}.getName()`, Order.ATOMIC];
  };

  F['mc_value_command_arg'] = (block) => {
    const idx = Math.max(1, parseInt(block.getFieldValue('INDEX'), 10) || 1) - 1;
    return [`(args.length > ${idx} ? args[${idx}] : "")`, Order.ATOMIC];
  };

  F['mc_value_player_health'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    return [`${player}.getHealth()`, Order.ATOMIC];
  };

  F['mc_value_player_food'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    return [`${player}.getFoodLevel()`, Order.ATOMIC];
  };

  F['mc_value_player_level'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    return [`${player}.getLevel()`, Order.ATOMIC];
  };

  F['mc_value_player_world_name'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    return [`${player}.getWorld().getName()`, Order.ATOMIC];
  };

  F['mc_value_player_x'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    return [`${player}.getLocation().getX()`, Order.ATOMIC];
  };

  F['mc_value_player_y'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    return [`${player}.getLocation().getY()`, Order.ATOMIC];
  };

  F['mc_value_player_z'] = (block, g) => {
    const player = val(g, block, 'PLAYER', 'player');
    return [`${player}.getLocation().getZ()`, Order.ATOMIC];
  };

  F['mc_value_online_count'] = () => ['getServer().getOnlinePlayers().size()', Order.ATOMIC];

  F['mc_value_random_number'] = (block, g) => {
    const max = num(g, block, 'MAX', 10);
    return [`((int) (Math.random() * ((${max}) + 1)))`, Order.ATOMIC];
  };

  F['mc_value_block_type'] = () => ['block.getType().name()', Order.ATOMIC];

  // ---------------------------------------------------------------------
  // Control
  // ---------------------------------------------------------------------
  F['controls_if'] = (block, g) => {
    let n = 0;
    let code = '';
    do {
      const cond = g.valueToCode(block, 'IF' + n, Order.NONE) || 'false';
      const branch = g.statementToCode(block, 'DO' + n);
      code += (n === 0 ? 'if' : 'else if') + ` (${cond}) {\n${branch}}\n`;
      n++;
    } while (block.getInput('IF' + n));
    if (block.getInput('ELSE')) {
      code += `else {\n${g.statementToCode(block, 'ELSE')}}\n`;
    }
    return code;
  };

  F['controls_repeat_ext'] = (block, g) => {
    const times = num(g, block, 'TIMES', 10);
    const branch = g.statementToCode(block, 'DO');
    const loopVar = g.nameDB_.getDistinctName('count', Blockly.Names.NameType.VARIABLE);
    return `for (int ${loopVar} = 0; ${loopVar} < ${toInt(times)}; ${loopVar}++) {\n${branch}}\n`;
  };

  F['controls_whileUntil'] = (block, g) => {
    const until = block.getFieldValue('MODE') === 'UNTIL';
    let cond = g.valueToCode(block, 'BOOL', until ? Order.UNARY : Order.NONE) || 'false';
    if (until) cond = `!(${cond})`;
    const branch = g.statementToCode(block, 'DO');
    return `while (${cond}) {\n${branch}}\n`;
  };

  // ---------------------------------------------------------------------
  // Logic
  // ---------------------------------------------------------------------
  const COMPARE_OPS = { EQ: '==', NEQ: '!=', LT: '<', LTE: '<=', GT: '>', GTE: '>=' };
  F['logic_compare'] = (block, g) => {
    const op = COMPARE_OPS[block.getFieldValue('OP')];
    const order = op === '==' || op === '!=' ? Order.EQUALITY : Order.RELATIONAL;
    const a = g.valueToCode(block, 'A', order) || '0';
    const b = g.valueToCode(block, 'B', order) || '0';
    return [`(${a} ${op} ${b})`, order];
  };

  F['logic_operation'] = (block, g) => {
    const isAnd = block.getFieldValue('OP') === 'AND';
    const order = isAnd ? Order.LOGICAL_AND : Order.LOGICAL_OR;
    const a = g.valueToCode(block, 'A', order) || 'false';
    const b = g.valueToCode(block, 'B', order) || 'false';
    return [`(${a} ${isAnd ? '&&' : '||'} ${b})`, order];
  };

  F['logic_negate'] = (block, g) => {
    const bool = g.valueToCode(block, 'BOOL', Order.UNARY) || 'false';
    return [`(!${bool})`, Order.UNARY];
  };

  F['logic_boolean'] = (block) => [block.getFieldValue('BOOL') === 'TRUE' ? 'true' : 'false', Order.ATOMIC];

  // ---------------------------------------------------------------------
  // Math
  // ---------------------------------------------------------------------
  F['math_number'] = (block) => {
    const value = parseFloat(block.getFieldValue('NUM'));
    return [String(Number.isFinite(value) ? value : 0), Order.ATOMIC];
  };

  const ARITH_OPS = { ADD: '+', MINUS: '-', MULTIPLY: '*', DIVIDE: '/', POWER: null };
  F['math_arithmetic'] = (block, g) => {
    const opField = block.getFieldValue('OP');
    const order = opField === 'ADD' || opField === 'MINUS' ? Order.ADDITIVE : Order.MULTIPLICATIVE;
    const a = g.valueToCode(block, 'A', order) || '0';
    const b = g.valueToCode(block, 'B', order) || '0';
    if (opField === 'POWER') return [`Math.pow(${a}, ${b})`, Order.ATOMIC];
    return [`(${a} ${ARITH_OPS[opField]} ${b})`, order];
  };

  // ---------------------------------------------------------------------
  // Text
  // ---------------------------------------------------------------------
  F['text'] = (block) => [esc(block.getFieldValue('TEXT')), Order.ATOMIC];

  F['text_join'] = (block, g) => {
    const count = block.itemCount_ || 0;
    if (count === 0) return ['""', Order.ATOMIC];
    const parts = [];
    for (let i = 0; i < count; i++) {
      parts.push(`String.valueOf(${g.valueToCode(block, 'ADD' + i, Order.ADDITIVE) || '""'})`);
    }
    return [`(${parts.join(' + ')})`, Order.ADDITIVE];
  };

  // ---------------------------------------------------------------------
  // Variables (declared as fields on the listener/command class, typed
  // Object so any block value can be stored in them -- simple and robust
  // for a beginner-facing tool).
  // ---------------------------------------------------------------------
  F['variables_get'] = (block, g) => {
    const name = g.getVariableName(block.getFieldValue('VAR'));
    return [name, Order.ATOMIC];
  };

  F['variables_set'] = (block, g) => {
    const name = g.getVariableName(block.getFieldValue('VAR'));
    const value = g.valueToCode(block, 'VALUE', Order.NONE) || 'null';
    return `${name} = ${value};\n`;
  };

  window.QuintJava = Java;
  window.QuintJavaOrder = Order;
})();
