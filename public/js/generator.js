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

  // For sockets that need a Java String: Blockly doesn't enforce output
  // types between blocks, so any reporter (a number, a player, etc.) can
  // be plugged into a "message"-shaped socket. Wrapping in String.valueOf
  // makes that always compile, whatever type actually comes out.
  function str(generator, block, name, fallback) {
    const code = generator.valueToCode(block, name, Order.NONE);
    return code ? `String.valueOf(${code})` : fallback;
  }

  function toInt(expr) {
    return `((int)Math.round(${expr}))`;
  }

  // Some identifiers (`player`, `message`, `block`, `sender`, `args`) only
  // exist inside specific event/command bodies -- app.js sets
  // generator.scopeVars before generating each body. Blocks that reference
  // one of these bare identifiers (either as an explicit reporter, or as
  // the implicit default for an empty PLAYER socket) must not emit that
  // identifier when it isn't in scope, or the generated Java fails to
  // compile ("cannot find symbol"). Instead they fall back to a
  // type-correct placeholder and flag the block with a warning so the
  // mistake is visible in the editor instead of only at compile time.
  function inScope(generator, name) {
    return !!(generator.scopeVars && generator.scopeVars.has(name));
  }

  function scopedIdentifier(generator, block, name, fallback) {
    if (inScope(generator, name)) {
      block.setWarningText(null);
      return name;
    }
    block.setWarningText(`This block needs "${name}", which isn't available here. Move it into an event or command that provides it.`);
    return fallback;
  }

  function playerInput(generator, block, name) {
    const code = generator.valueToCode(block, name || 'PLAYER', Order.NONE);
    if (code) {
      block.setWarningText(null);
      return code;
    }
    return scopedIdentifier(generator, block, 'player', '((org.bukkit.entity.Player) null)');
  }

  const F = Java.forBlock;

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------
  F['mc_action_send_message'] = (block, g) => {
    const player = playerInput(g, block);
    const msg = str(g, block, 'MESSAGE', '""');
    return `${player}.sendMessage(${msg});\n`;
  };

  F['mc_action_broadcast'] = (block, g) => {
    const msg = str(g, block, 'MESSAGE', '""');
    return `getServer().broadcastMessage(${msg});\n`;
  };

  F['mc_action_give_item'] = (block, g) => {
    const player = playerInput(g, block);
    const material = block.getFieldValue('MATERIAL');
    const amount = num(g, block, 'AMOUNT', 1);
    return `${player}.getInventory().addItem(new org.bukkit.inventory.ItemStack(org.bukkit.Material.${material}, ${toInt(amount)}));\n`;
  };

  F['mc_action_teleport'] = (block, g) => {
    const player = playerInput(g, block);
    const x = num(g, block, 'X', 0);
    const y = num(g, block, 'Y', 0);
    const z = num(g, block, 'Z', 0);
    return `${player}.teleport(new org.bukkit.Location(${player}.getWorld(), ${x}, ${y}, ${z}));\n`;
  };

  F['mc_action_teleport_to_location'] = (block, g) => {
    const player = playerInput(g, block);
    const location = val(g, block, 'LOCATION', `${player}.getLocation()`);
    return `${player}.teleport(${location});\n`;
  };

  F['mc_action_set_health'] = (block, g) => {
    const player = playerInput(g, block);
    const amount = num(g, block, 'AMOUNT', 20);
    return `${player}.setHealth(Math.max(0, Math.min(${player}.getMaxHealth(), ${amount})));\n`;
  };

  F['mc_action_set_food'] = (block, g) => {
    const player = playerInput(g, block);
    const amount = num(g, block, 'AMOUNT', 20);
    return `${player}.setFoodLevel(Math.max(0, Math.min(20, ${toInt(amount)})));\n`;
  };

  F['mc_action_play_sound'] = (block, g) => {
    const player = playerInput(g, block);
    const sound = block.getFieldValue('SOUND');
    return `${player}.playSound(${player}.getLocation(), org.bukkit.Sound.${sound}, 1.0f, 1.0f);\n`;
  };

  F['mc_action_spawn_particle'] = (block, g) => {
    const player = playerInput(g, block);
    const particle = block.getFieldValue('PARTICLE');
    const count = num(g, block, 'COUNT', 20);
    return `${player}.getWorld().spawnParticle(org.bukkit.Particle.${particle}, ${player}.getLocation(), ${toInt(count)});\n`;
  };

  F['mc_action_spawn_mob'] = (block, g) => {
    const player = playerInput(g, block);
    const entity = block.getFieldValue('ENTITY');
    return `${player}.getWorld().spawnEntity(${player}.getLocation(), org.bukkit.entity.EntityType.${entity});\n`;
  };

  F['mc_action_set_gamemode'] = (block, g) => {
    const player = playerInput(g, block);
    const mode = block.getFieldValue('GAMEMODE');
    return `${player}.setGameMode(org.bukkit.GameMode.${mode});\n`;
  };

  F['mc_action_kick_player'] = (block, g) => {
    const player = playerInput(g, block);
    const reason = str(g, block, 'REASON', '""');
    return `${player}.kickPlayer(${reason});\n`;
  };

  F['mc_action_set_join_message'] = (block, g) => {
    const msg = str(g, block, 'MESSAGE', '""');
    if (!g.hasJoinMsg) {
      block.setWarningText('This only works inside "when a player joins".');
      return '';
    }
    block.setWarningText(null);
    return `event.setJoinMessage(${msg});\n`;
  };

  F['mc_action_set_quit_message'] = (block, g) => {
    const msg = str(g, block, 'MESSAGE', '""');
    if (!g.hasQuitMsg) {
      block.setWarningText('This only works inside "when a player leaves".');
      return '';
    }
    block.setWarningText(null);
    return `event.setQuitMessage(${msg});\n`;
  };

  F['mc_action_cancel_event'] = (block, g) => {
    if (!g.cancellable) {
      block.setWarningText('This event can\'t be cancelled -- this block has no effect here.');
      return '';
    }
    block.setWarningText(null);
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
    const player = playerInput(g, block);
    const ticks = num(g, block, 'TICKS', 0);
    return `${player}.getWorld().setTime(${toInt(ticks)});\n`;
  };

  F['mc_action_set_weather'] = (block, g) => {
    const player = playerInput(g, block);
    const storm = block.getFieldValue('WEATHER') === 'STORM';
    return `${player}.getWorld().setStorm(${storm});\n`;
  };

  F['mc_action_strike_lightning'] = (block, g) => {
    const player = playerInput(g, block);
    return `${player}.getWorld().strikeLightning(${player}.getLocation());\n`;
  };

  F['mc_action_create_explosion'] = (block, g) => {
    const player = playerInput(g, block);
    const power = num(g, block, 'POWER', 4);
    return `${player}.getWorld().createExplosion(${player}.getLocation(), (float) (${power}));\n`;
  };

  F['mc_action_add_potion_effect'] = (block, g) => {
    const player = playerInput(g, block);
    const effect = block.getFieldValue('EFFECT');
    const seconds = num(g, block, 'SECONDS', 10);
    const level = num(g, block, 'LEVEL', 1);
    return `${player}.addPotionEffect(new org.bukkit.potion.PotionEffect(org.bukkit.potion.PotionEffectType.${effect}, ${toInt(seconds)} * 20, ${toInt(level)} - 1));\n`;
  };

  F['mc_action_clear_potion_effects'] = (block, g) => {
    const player = playerInput(g, block);
    return `for (org.bukkit.potion.PotionEffect quintEffect : ${player}.getActivePotionEffects()) { ${player}.removePotionEffect(quintEffect.getType()); }\n`;
  };

  F['mc_action_set_flying'] = (block, g) => {
    const player = playerInput(g, block);
    const on = block.getFieldValue('STATE') === 'ON';
    return `${player}.setAllowFlight(${on}); ${player}.setFlying(${on});\n`;
  };

  F['mc_action_set_walk_speed'] = (block, g) => {
    const player = playerInput(g, block);
    const speed = num(g, block, 'SPEED', 0.2);
    return `${player}.setWalkSpeed(Math.max(-1f, Math.min(1f, (float) (${speed}))));\n`;
  };

  F['mc_action_clear_inventory'] = (block, g) => {
    const player = playerInput(g, block);
    return `${player}.getInventory().clear();\n`;
  };

  F['mc_action_give_xp'] = (block, g) => {
    const player = playerInput(g, block);
    const amount = num(g, block, 'AMOUNT', 10);
    return `${player}.giveExp(${toInt(amount)});\n`;
  };

  F['mc_action_set_level'] = (block, g) => {
    const player = playerInput(g, block);
    const level = num(g, block, 'LEVEL', 0);
    return `${player}.setLevel(${toInt(level)});\n`;
  };

  F['mc_action_equip_item'] = (block, g) => {
    const material = block.getFieldValue('MATERIAL');
    const player = playerInput(g, block);
    return `${player}.getInventory().setItemInMainHand(new org.bukkit.inventory.ItemStack(org.bukkit.Material.${material}, 1));\n`;
  };

  F['mc_action_set_block_at_player'] = (block, g) => {
    const player = playerInput(g, block);
    const material = block.getFieldValue('MATERIAL2');
    return `${player}.getLocation().getBlock().setType(org.bukkit.Material.${material});\n`;
  };

  F['mc_action_send_title'] = (block, g) => {
    const player = playerInput(g, block);
    const title = str(g, block, 'TITLE', '""');
    const subtitle = str(g, block, 'SUBTITLE', '""');
    return `${player}.sendTitle(${title}, ${subtitle}, 10, 70, 20);\n`;
  };

  F['mc_action_send_actionbar'] = (block, g) => {
    const player = playerInput(g, block);
    const text = val(g, block, 'TEXT', '""');
    return `${player}.sendActionBar(net.kyori.adventure.text.Component.text(String.valueOf(${text})));\n`;
  };

  F['mc_action_remove_item'] = (block, g) => {
    const material = block.getFieldValue('MATERIAL');
    const amount = num(g, block, 'AMOUNT', 1);
    const player = playerInput(g, block);
    return `${player}.getInventory().removeItem(new org.bukkit.inventory.ItemStack(org.bukkit.Material.${material}, ${toInt(amount)}));\n`;
  };

  F['mc_action_run_console_command'] = (block, g) => {
    const command = str(g, block, 'COMMAND', '""');
    return `getServer().dispatchCommand(getServer().getConsoleSender(), ${command});\n`;
  };

  F['mc_action_set_spawn_point'] = (block, g) => {
    const player = playerInput(g, block);
    return `${player}.setBedSpawnLocation(${player}.getLocation(), true);\n`;
  };

  F['mc_action_grant_permission'] = (block, g) => {
    const player = playerInput(g, block);
    const permission = str(g, block, 'PERMISSION', '""');
    return `${player}.addAttachment(this, ${permission}, true);\n`;
  };

  // ---------------------------------------------------------------------
  // Sensing / reporters
  // ---------------------------------------------------------------------
  F['mc_value_event_player'] = (block, g) => [scopedIdentifier(g, block, 'player', '((org.bukkit.entity.Player) null)'), Order.ATOMIC];
  F['mc_value_event_message'] = (block, g) => [scopedIdentifier(g, block, 'message', '""'), Order.ATOMIC];
  F['mc_value_event_block'] = (block, g) => [scopedIdentifier(g, block, 'block', '((org.bukkit.block.Block) null)'), Order.ATOMIC];
  F['mc_value_command_sender'] = (block, g) => [scopedIdentifier(g, block, 'sender', '((org.bukkit.command.CommandSender) null)'), Order.ATOMIC];
  F['mc_value_command_args_joined'] = (block, g) => {
    if (!inScope(g, 'args')) {
      block.setWarningText('This only works inside a command.');
      return ['""', Order.ATOMIC];
    }
    block.setWarningText(null);
    return ['String.join(" ", args)', Order.ATOMIC];
  };

  F['mc_value_player_name'] = (block, g) => {
    const player = playerInput(g, block);
    return [`${player}.getName()`, Order.ATOMIC];
  };

  F['mc_value_command_arg'] = (block, g) => {
    const idx = Math.max(1, parseInt(block.getFieldValue('INDEX'), 10) || 1) - 1;
    if (!inScope(g, 'args')) {
      block.setWarningText('This only works inside a command.');
      return ['""', Order.ATOMIC];
    }
    block.setWarningText(null);
    return [`(args.length > ${idx} ? args[${idx}] : "")`, Order.ATOMIC];
  };

  F['mc_value_player_health'] = (block, g) => {
    const player = playerInput(g, block);
    return [`${player}.getHealth()`, Order.ATOMIC];
  };

  F['mc_value_player_food'] = (block, g) => {
    const player = playerInput(g, block);
    return [`${player}.getFoodLevel()`, Order.ATOMIC];
  };

  F['mc_value_player_level'] = (block, g) => {
    const player = playerInput(g, block);
    return [`${player}.getLevel()`, Order.ATOMIC];
  };

  F['mc_value_player_world_name'] = (block, g) => {
    const player = playerInput(g, block);
    return [`${player}.getWorld().getName()`, Order.ATOMIC];
  };

  F['mc_value_player_x'] = (block, g) => {
    const player = playerInput(g, block);
    return [`${player}.getLocation().getX()`, Order.ATOMIC];
  };

  F['mc_value_player_y'] = (block, g) => {
    const player = playerInput(g, block);
    return [`${player}.getLocation().getY()`, Order.ATOMIC];
  };

  F['mc_value_player_z'] = (block, g) => {
    const player = playerInput(g, block);
    return [`${player}.getLocation().getZ()`, Order.ATOMIC];
  };

  F['mc_value_player_location'] = (block, g) => {
    const player = playerInput(g, block);
    return [`${player}.getLocation()`, Order.ATOMIC];
  };

  F['mc_value_online_count'] = () => ['getServer().getOnlinePlayers().size()', Order.ATOMIC];

  F['mc_value_random_number'] = (block, g) => {
    const max = num(g, block, 'MAX', 10);
    return [`((int) (Math.random() * ((${max}) + 1)))`, Order.ATOMIC];
  };

  F['mc_value_block_type'] = (block, g) => {
    const b = scopedIdentifier(g, block, 'block', '((org.bukkit.block.Block) null)');
    return [`${b}.getType().name()`, Order.ATOMIC];
  };

  F['mc_value_has_permission'] = (block, g) => {
    const player = playerInput(g, block);
    const permission = str(g, block, 'PERMISSION', '""');
    return [`${player}.hasPermission(${permission})`, Order.ATOMIC];
  };

  F['mc_value_is_sneaking'] = (block, g) => {
    const player = playerInput(g, block);
    return [`${player}.isSneaking()`, Order.ATOMIC];
  };

  F['mc_value_is_op'] = (block, g) => {
    const player = playerInput(g, block);
    return [`${player}.isOp()`, Order.ATOMIC];
  };

  F['mc_value_has_item'] = (block, g) => {
    const player = playerInput(g, block);
    const material = block.getFieldValue('MATERIAL');
    const amount = num(g, block, 'AMOUNT', 1);
    return [`${player}.getInventory().contains(org.bukkit.Material.${material}, ${toInt(amount)})`, Order.ATOMIC];
  };

  F['mc_value_player_max_health'] = (block, g) => {
    const player = playerInput(g, block);
    return [`${player}.getMaxHealth()`, Order.ATOMIC];
  };

  F['mc_value_player_by_name'] = (block, g) => {
    const name = str(g, block, 'NAME', '""');
    return [`getServer().getPlayerExact(${name})`, Order.ATOMIC];
  };

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
    // Route the condition through a method call rather than emitting it
    // raw: a literal/constant "true"/"false" condition (e.g. "repeat until
    // [true]") makes the loop body a compile-time-constant-false
    // condition, which javac/ECJ reject as an "unreachable statement".
    // Boolean.valueOf(...).booleanValue() is never a JLS constant
    // expression, so this sidesteps that check without changing behavior.
    return `while (Boolean.valueOf(${cond}).booleanValue()) {\n${branch}}\n`;
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
