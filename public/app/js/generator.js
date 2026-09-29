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

  // Variables are stored as plain `Object` fields (so one variable can hold
  // a number, a string, a boolean, a list, ... whatever gets assigned to it
  // last -- there's no separate "make a String/Number/List variable" step).
  // That means anything read back out of a variable is statically an
  // Object, even where a block needs a primitive double/boolean to do
  // arithmetic or comparisons. These two helpers do that unboxing at the
  // point of use; wrapping is always safe even when the expression already
  // *is* a primitive (autoboxes then immediately unboxes, compiler-cheap).
  function asDouble(code) {
    return `(((Number) (Object) (${code})).doubleValue())`;
  }

  function asBoolean(code) {
    return `(((Boolean) (Object) (${code})).booleanValue())`;
  }

  function num(generator, block, name, fallback) {
    const code = generator.valueToCode(block, name, Order.NONE);
    return code ? asDouble(code) : String(fallback);
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

  // Walks up from a block to the enclosing mc_command_define hat, for
  // blocks (like the "not enough arguments" guard) that want to mention
  // the command's own name in a message without the user typing it twice.
  function findCommandName(block) {
    let b = block;
    while (b) {
      if (b.type === 'mc_command_define') return b.getFieldValue('CMDNAME') || 'command';
      b = b.getSurroundParent();
    }
    return 'command';
  }

  const F = Java.forBlock;

  // ---------------------------------------------------------------------
  // More Commands blocks
  // ---------------------------------------------------------------------
  F['mc_command_reply'] = (block, g) => {
    if (!inScope(g, 'sender')) {
      block.setWarningText('This only works inside a command.');
      return '';
    }
    block.setWarningText(null);
    const msg = str(g, block, 'MESSAGE', '""');
    return `sender.sendMessage(${msg});\n`;
  };

  F['mc_command_require_player'] = (block, g) => {
    const body = g.statementToCode(block, 'DO');
    if (!inScope(g, 'player')) {
      block.setWarningText('This only works inside a command.');
      return body;
    }
    block.setWarningText(null);
    return `if (player != null) {\n${body}} else {\n    sender.sendMessage("Only players can use this command.");\n}\n`;
  };

  F['mc_command_require_permission'] = (block, g) => {
    const body = g.statementToCode(block, 'DO');
    if (!inScope(g, 'sender')) {
      block.setWarningText('This only works inside a command.');
      return body;
    }
    block.setWarningText(null);
    const permission = str(g, block, 'PERMISSION', '""');
    return `if (sender.hasPermission(${permission})) {\n${body}} else {\n    sender.sendMessage("You don't have permission to use this command.");\n}\n`;
  };

  F['mc_command_require_arg_count'] = (block, g) => {
    const body = g.statementToCode(block, 'DO');
    if (!inScope(g, 'args')) {
      block.setWarningText('This only works inside a command.');
      return body;
    }
    block.setWarningText(null);
    const count = num(g, block, 'COUNT', 1);
    const usage = esc(`Usage: /${findCommandName(block)} ...`);
    return `if (args.length >= ${toInt(count)}) {\n${body}} else {\n    sender.sendMessage(${usage});\n}\n`;
  };

  F['mc_command_arg_count'] = (block, g) => {
    if (!inScope(g, 'args')) {
      block.setWarningText('This only works inside a command.');
      return ['0', Order.ATOMIC];
    }
    block.setWarningText(null);
    return ['args.length', Order.ATOMIC];
  };

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
      const rawCond = g.valueToCode(block, 'IF' + n, Order.NONE);
      const cond = rawCond ? asBoolean(rawCond) : 'false';
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
    const rawCond = g.valueToCode(block, 'BOOL', Order.NONE);
    let cond = rawCond ? asBoolean(rawCond) : 'false';
    if (until) cond = `!(${cond})`;
    const branch = g.statementToCode(block, 'DO');
    // asBoolean's cast-to-Boolean is never a JLS compile-time constant
    // expression, so a literal "repeat until [true]" condition can't be
    // constant-folded into a compile-time-false loop, which javac/ECJ
    // would otherwise reject as an "unreachable statement".
    return `while (${cond}) {\n${branch}}\n`;
  };

  F['controls_forEach'] = (block, g) => {
    const listCode = g.valueToCode(block, 'LIST', Order.NONE) || 'new java.util.ArrayList<Object>()';
    const varName = g.getVariableName(block.getFieldValue('VAR'));
    const branch = g.statementToCode(block, 'DO');
    return `for (Object ${varName} : ((java.util.List<Object>) (${listCode}))) {\n${branch}}\n`;
  };

  // ---------------------------------------------------------------------
  // Logic
  // ---------------------------------------------------------------------
  const COMPARE_OPS = { EQ: '==', NEQ: '!=', LT: '<', LTE: '<=', GT: '>', GTE: '>=' };
  F['logic_compare'] = (block, g) => {
    const op = block.getFieldValue('OP');
    const a = g.valueToCode(block, 'A', Order.NONE);
    const b = g.valueToCode(block, 'B', Order.NONE);
    if (op === 'EQ' || op === 'NEQ') {
      // Variables/reporters are plain Objects here, so "==" would compare
      // references, not values (e.g. two equal-looking Strings would be
      // "unequal"). Objects.equals does the right thing for every type,
      // including two nulls -- except two numbers that happen to be boxed
      // differently (Integer 10 vs Double 10.0), which .equals() treats as
      // unequal even though they're clearly "the same number" to a user;
      // compare those by numeric value instead.
      const ax = a || 'null';
      const bx = b || 'null';
      const eq = `((((Object) (${ax})) instanceof Number && ((Object) (${bx})) instanceof Number) ? Double.compare(${asDouble(ax)}, ${asDouble(bx)}) == 0 : java.util.Objects.equals(${ax}, ${bx}))`;
      return [op === 'EQ' ? eq : `(!${eq})`, Order.UNARY];
    }
    const expr = `(${asDouble(a || '0')} ${COMPARE_OPS[op]} ${asDouble(b || '0')})`;
    return [expr, Order.RELATIONAL];
  };

  F['logic_operation'] = (block, g) => {
    const isAnd = block.getFieldValue('OP') === 'AND';
    const rawA = g.valueToCode(block, 'A', Order.NONE);
    const rawB = g.valueToCode(block, 'B', Order.NONE);
    const a = rawA ? asBoolean(rawA) : 'false';
    const b = rawB ? asBoolean(rawB) : 'false';
    const order = isAnd ? Order.LOGICAL_AND : Order.LOGICAL_OR;
    return [`(${a} ${isAnd ? '&&' : '||'} ${b})`, order];
  };

  F['logic_negate'] = (block, g) => {
    const raw = g.valueToCode(block, 'BOOL', Order.NONE);
    const bool = raw ? asBoolean(raw) : 'false';
    return [`(!${bool})`, Order.UNARY];
  };

  F['mc_logic_xor'] = (block, g) => {
    const rawA = g.valueToCode(block, 'A', Order.NONE);
    const rawB = g.valueToCode(block, 'B', Order.NONE);
    const a = rawA ? asBoolean(rawA) : 'false';
    const b = rawB ? asBoolean(rawB) : 'false';
    return [`(${a} ^ ${b})`, Order.EQUALITY];
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
    const a = asDouble(g.valueToCode(block, 'A', Order.NONE) || '0');
    const b = asDouble(g.valueToCode(block, 'B', Order.NONE) || '0');
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
  // Lists -- generated as a plain java.util.List<Object>, so a list can mix
  // numbers/strings/players/whatever, same as a variable can.
  // ---------------------------------------------------------------------
  function asList(code) {
    return `((java.util.List<Object>) (${code || 'new java.util.ArrayList<Object>()'}))`;
  }

  // FIRST/LAST/RANDOM/FROM_END/FROM_START -> a zero-based java.util.List index.
  function listIndexExpr(g, block, listVar) {
    const where = block.getFieldValue('WHERE') || 'FROM_START';
    if (where === 'FIRST') return '0';
    if (where === 'LAST') return `(${listVar}.size() - 1)`;
    if (where === 'RANDOM') return `new java.util.Random().nextInt(${listVar}.size())`;
    const at = num(g, block, 'AT', 1);
    if (where === 'FROM_END') return `(${listVar}.size() - ${toInt(at)})`;
    return `(${toInt(at)} - 1)`; // FROM_START
  }

  F['lists_create_with'] = (block, g) => {
    const count = block.itemCount_ || 0;
    const items = [];
    for (let i = 0; i < count; i++) {
      items.push(g.valueToCode(block, 'ADD' + i, Order.NONE) || 'null');
    }
    return [`new java.util.ArrayList<Object>(java.util.Arrays.asList(${items.join(', ')}))`, Order.ATOMIC];
  };

  F['lists_length'] = (block, g) => {
    const code = g.valueToCode(block, 'VALUE', Order.NONE) || '""';
    return [`(((Object) (${code})) instanceof java.util.List ? ((java.util.List) (${code})).size() : String.valueOf(${code}).length())`, Order.ATOMIC];
  };

  F['lists_isEmpty'] = (block, g) => {
    const code = g.valueToCode(block, 'VALUE', Order.NONE) || '""';
    return [`(((Object) (${code})) instanceof java.util.List ? ((java.util.List) (${code})).isEmpty() : String.valueOf(${code}).isEmpty())`, Order.ATOMIC];
  };

  F['lists_getIndex'] = (block, g) => {
    const listVar = asList(g.valueToCode(block, 'VALUE', Order.NONE));
    const idx = listIndexExpr(g, block, listVar);
    const mode = block.getFieldValue('MODE') || 'GET';
    if (mode === 'REMOVE') return `${listVar}.remove(${idx});\n`;
    const method = mode === 'GET_REMOVE' ? 'remove' : 'get';
    return [`${listVar}.${method}(${idx})`, Order.ATOMIC];
  };

  F['lists_setIndex'] = (block, g) => {
    const listVar = asList(g.valueToCode(block, 'LIST', Order.NONE));
    const idx = listIndexExpr(g, block, listVar);
    const mode = block.getFieldValue('MODE') || 'SET';
    const to = val(g, block, 'TO', 'null');
    if (mode === 'INSERT') {
      if (block.getFieldValue('WHERE') === 'LAST') return `${listVar}.add(${to});\n`;
      return `${listVar}.add(${idx}, ${to});\n`;
    }
    return `${listVar}.set(${idx}, ${to});\n`;
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

  // ---------------------------------------------------------------------
  // MiniMessage-formatted text (colors/gradients/bold/etc via tags).
  // ---------------------------------------------------------------------
  F['mc_action_send_minimessage'] = (block, g) => {
    const player = playerInput(g, block);
    const message = str(g, block, 'MESSAGE', '""');
    return `${player}.sendMessage(net.kyori.adventure.text.minimessage.MiniMessage.miniMessage().deserialize(${message}));\n`;
  };

  F['mc_action_broadcast_minimessage'] = (block, g) => {
    const message = str(g, block, 'MESSAGE', '""');
    return `getServer().sendMessage(net.kyori.adventure.text.minimessage.MiniMessage.miniMessage().deserialize(${message}));\n`;
  };

  // ---------------------------------------------------------------------
  // LuckPerms (soft-dependency: every block below no-ops safely if the
  // LuckPerms plugin isn't installed on the server, instead of throwing).
  // ---------------------------------------------------------------------
  function luckPerms() {
    return 'org.bukkit.Bukkit.getPluginManager().isPluginEnabled("LuckPerms") ? net.luckperms.api.LuckPermsProvider.get() : null';
  }

  F['mc_action_luckperms_add_permission'] = (block, g) => {
    const player = playerInput(g, block);
    const permission = str(g, block, 'PERMISSION', '""');
    return `{ net.luckperms.api.LuckPerms lp = ${luckPerms()}; if (lp != null) { net.luckperms.api.model.user.User lpUser = lp.getUserManager().getUser(${player}.getUniqueId()); if (lpUser != null) { lpUser.data().add(net.luckperms.api.node.types.PermissionNode.builder(${permission}).build()); lp.getUserManager().saveUser(lpUser); } } }\n`;
  };

  F['mc_action_luckperms_add_to_group'] = (block, g) => {
    const player = playerInput(g, block);
    const group = str(g, block, 'GROUP', '""');
    return `{ net.luckperms.api.LuckPerms lp = ${luckPerms()}; if (lp != null) { net.luckperms.api.model.user.User lpUser = lp.getUserManager().getUser(${player}.getUniqueId()); if (lpUser != null) { lpUser.data().add(net.luckperms.api.node.types.InheritanceNode.builder(${group}).build()); lp.getUserManager().saveUser(lpUser); } } }\n`;
  };

  F['mc_value_luckperms_in_group'] = (block, g) => {
    const player = playerInput(g, block);
    const group = str(g, block, 'GROUP', '""');
    return [`(new java.util.function.Supplier<Boolean>() { public Boolean get() { net.luckperms.api.LuckPerms lp = ${luckPerms()}; if (lp == null) return false; net.luckperms.api.model.user.User lpUser = lp.getUserManager().getUser(${player}.getUniqueId()); return lpUser != null && lpUser.getInheritedGroups(lpUser.getQueryOptions()).stream().anyMatch(gr -> gr.getName().equalsIgnoreCase(${group})); } }).get()`, Order.ATOMIC];
  };

  // ---------------------------------------------------------------------
  // Persistent player data (survives restarts -- org.bukkit.persistence).
  // ---------------------------------------------------------------------
  F['mc_action_set_persistent_data'] = (block, g) => {
    const player = playerInput(g, block);
    const key = esc(block.getFieldValue('KEY') || 'myData');
    const value = str(g, block, 'VALUE', '""');
    return `${player}.getPersistentDataContainer().set(new org.bukkit.NamespacedKey(this, ${key}), org.bukkit.persistence.PersistentDataType.STRING, ${value});\n`;
  };

  F['mc_value_persistent_data'] = (block, g) => {
    const key = esc(block.getFieldValue('KEY') || 'myData');
    const player = playerInput(g, block, 'PLAYER');
    const dflt = str(g, block, 'DEFAULT', '""');
    return [`${player}.getPersistentDataContainer().getOrDefault(new org.bukkit.NamespacedKey(this, ${key}), org.bukkit.persistence.PersistentDataType.STRING, ${dflt})`, Order.ATOMIC];
  };

  // ---------------------------------------------------------------------
  // Unsafe / Advanced -- pastes the given text straight into the generated
  // Java. No coercion, no type checking: whatever the user typed goes in
  // verbatim, so a mistake here is a normal javac error, not a friendly
  // block-shaped one.
  // ---------------------------------------------------------------------
  F['mc_unsafe_raw_statement'] = (block) => {
    const code = block.getFieldValue('CODE') || '';
    return code.trim() ? `${code}\n` : '';
  };

  F['mc_unsafe_raw_expression'] = (block) => {
    const code = block.getFieldValue('CODE') || 'null';
    return [`(${code})`, Order.NONE];
  };

  F['mc_unsafe_import_class'] = (block) => {
    const code = block.getFieldValue('CLASSNAME') || 'java.lang.Object';
    return [code, Order.ATOMIC];
  };

  F['mc_unsafe_new_instance'] = (block) => {
    const className = block.getFieldValue('CLASSNAME') || 'java.lang.Object';
    const args = block.getFieldValue('ARGS') || '';
    return [`(new ${className}(${args}))`, Order.ATOMIC];
  };

  F['mc_unsafe_static_call'] = (block) => {
    const className = block.getFieldValue('CLASSNAME') || 'java.lang.Object';
    const method = block.getFieldValue('METHOD') || 'toString';
    const args = block.getFieldValue('ARGS') || '';
    return [`${className}.${method}(${args})`, Order.ATOMIC];
  };

  F['mc_unsafe_cast'] = (block, g) => {
    const type = block.getFieldValue('TYPE') || 'java.lang.Object';
    const value = val(g, block, 'VALUE', 'null');
    return [`((${type}) (${value}))`, Order.ATOMIC];
  };

  F['mc_unsafe_comment'] = (block) => {
    const text = String(block.getFieldValue('TEXT') || '').replace(/[\r\n]+/g, ' ');
    return `// ${text}\n`;
  };

  F['mc_unsafe_try_catch'] = (block, g) => {
    const tryBody = g.statementToCode(block, 'TRY');
    const catchBody = g.statementToCode(block, 'CATCH');
    return `try {\n${tryBody}} catch (Exception quintEx) {\n${catchBody}}\n`;
  };

  // ---------------------------------------------------------------------
  // More Math blocks (stock Blockly block types, targeting java.lang.Math).
  // ---------------------------------------------------------------------
  F['math_single'] = (block, g) => {
    const op = block.getFieldValue('OP');
    if (op === 'NEG') return [`(-${num(g, block, 'NUM', 0)})`, Order.ATOMIC];
    const n = num(g, block, 'NUM', 0);
    const OPS = {
      ABS: `Math.abs(${n})`, ROOT: `Math.sqrt(${n})`, LN: `Math.log(${n})`,
      LOG10: `Math.log10(${n})`, EXP: `Math.exp(${n})`, POW10: `Math.pow(10, ${n})`,
    };
    return [`(${OPS[op] || n})`, Order.ATOMIC];
  };

  F['math_trig'] = (block, g) => {
    const op = block.getFieldValue('OP');
    const n = num(g, block, 'NUM', 0);
    const OPS = {
      SIN: `Math.sin(Math.toRadians(${n}))`, COS: `Math.cos(Math.toRadians(${n}))`, TAN: `Math.tan(Math.toRadians(${n}))`,
      ASIN: `Math.toDegrees(Math.asin(${n}))`, ACOS: `Math.toDegrees(Math.acos(${n}))`, ATAN: `Math.toDegrees(Math.atan(${n}))`,
    };
    return [`(${OPS[op] || n})`, Order.ATOMIC];
  };

  F['math_round'] = (block, g) => {
    const op = block.getFieldValue('OP');
    const n = num(g, block, 'NUM', 0);
    if (op === 'ROUNDUP') return [`Math.ceil(${n})`, Order.ATOMIC];
    if (op === 'ROUNDDOWN') return [`Math.floor(${n})`, Order.ATOMIC];
    return [`((double) Math.round(${n}))`, Order.ATOMIC];
  };

  F['math_constant'] = (block) => {
    const CONSTS = {
      PI: 'Math.PI', E: 'Math.E', GOLDEN_RATIO: '((1 + Math.sqrt(5)) / 2)',
      SQRT2: 'Math.sqrt(2)', SQRT1_2: 'Math.sqrt(0.5)', INFINITY: 'Double.POSITIVE_INFINITY',
    };
    return [CONSTS[block.getFieldValue('CONSTANT')] || '0', Order.ATOMIC];
  };

  F['math_number_property'] = (block, g) => {
    const property = block.getFieldValue('PROPERTY');
    const n = num(g, block, 'NUMBER_TO_CHECK', 0);
    switch (property) {
      case 'EVEN': return [`(${n} % 2 == 0)`, Order.ATOMIC];
      case 'ODD': return [`(${n} % 2 != 0)`, Order.ATOMIC];
      case 'WHOLE': return [`(${n} % 1 == 0)`, Order.ATOMIC];
      case 'POSITIVE': return [`(${n} > 0)`, Order.ATOMIC];
      case 'NEGATIVE': return [`(${n} < 0)`, Order.ATOMIC];
      case 'DIVISIBLE_BY': {
        const divisor = num(g, block, 'DIVISOR', 1);
        return [`(${n} % ${divisor} == 0)`, Order.ATOMIC];
      }
      case 'PRIME':
        return [`(new java.util.function.Supplier<Boolean>() { public Boolean get() { double quintN = ${n}; if (quintN != Math.floor(quintN) || quintN < 2) return false; if (quintN == 2) return true; if (quintN % 2 == 0) return false; for (int quintI = 3; quintI * quintI <= quintN; quintI += 2) { if (quintN % quintI == 0) return false; } return true; } }).get()`, Order.ATOMIC];
      default:
        return ['false', Order.ATOMIC];
    }
  };

  F['math_modulo'] = (block, g) => {
    const dividend = num(g, block, 'DIVIDEND', 0);
    const divisor = num(g, block, 'DIVISOR', 1);
    return [`(${dividend} % ${divisor})`, Order.ATOMIC];
  };

  F['math_constrain'] = (block, g) => {
    const value = num(g, block, 'VALUE', 0);
    const low = num(g, block, 'LOW', 0);
    const high = num(g, block, 'HIGH', 0);
    return [`Math.min(Math.max(${value}, ${low}), ${high})`, Order.ATOMIC];
  };

  F['math_random_int'] = (block, g) => {
    const from = num(g, block, 'FROM', 1);
    const to = num(g, block, 'TO', 10);
    return [`(new java.util.function.Supplier<Integer>() { public Integer get() { double quintA = ${from}, quintB = ${to}; if (quintA > quintB) { double quintT = quintA; quintA = quintB; quintB = quintT; } return (int) Math.floor(Math.random() * (quintB - quintA + 1) + quintA); } }).get()`, Order.ATOMIC];
  };

  F['math_random_float'] = () => ['Math.random()', Order.ATOMIC];

  F['math_change'] = (block, g) => {
    const varName = g.getVariableName(block.getFieldValue('VAR'));
    const delta = num(g, block, 'DELTA', 1);
    return `${varName} = (((Object) ${varName}) instanceof Number ? ${asDouble(varName)} : 0.0) + ${delta};\n`;
  };

  F['math_on_list'] = (block, g) => {
    const op = block.getFieldValue('OP');
    const listVar = asList(g.valueToCode(block, 'LIST', Order.NONE));
    const nums = `(new java.util.function.Supplier<java.util.List<Double>>() { public java.util.List<Double> get() { java.util.List<Double> quintNums = new java.util.ArrayList<Double>(); for (Object quintItem : ${listVar}) { quintNums.add(((Object) quintItem) instanceof Number ? ${asDouble('quintItem')} : 0.0); } return quintNums; } }).get()`;
    switch (op) {
      case 'SUM': return [`${nums}.stream().mapToDouble(Double::doubleValue).sum()`, Order.ATOMIC];
      case 'MIN': return [`${nums}.stream().mapToDouble(Double::doubleValue).min().orElse(0)`, Order.ATOMIC];
      case 'MAX': return [`${nums}.stream().mapToDouble(Double::doubleValue).max().orElse(0)`, Order.ATOMIC];
      case 'AVERAGE': return [`${nums}.stream().mapToDouble(Double::doubleValue).average().orElse(0)`, Order.ATOMIC];
      case 'RANDOM': return [`(new java.util.function.Supplier<Double>() { public Double get() { java.util.List<Double> quintL = ${nums}; return quintL.isEmpty() ? 0.0 : quintL.get(new java.util.Random().nextInt(quintL.size())); } }).get()`, Order.ATOMIC];
      case 'MEDIAN': return [`(new java.util.function.Supplier<Double>() { public Double get() { java.util.List<Double> quintL = new java.util.ArrayList<Double>(${nums}); if (quintL.isEmpty()) return 0.0; java.util.Collections.sort(quintL); int quintMid = quintL.size() / 2; return quintL.size() % 2 == 0 ? (quintL.get(quintMid - 1) + quintL.get(quintMid)) / 2 : quintL.get(quintMid); } }).get()`, Order.ATOMIC];
      case 'STD_DEV': return [`(new java.util.function.Supplier<Double>() { public Double get() { java.util.List<Double> quintL = ${nums}; if (quintL.isEmpty()) return 0.0; double quintMean = quintL.stream().mapToDouble(Double::doubleValue).average().orElse(0); double quintVar = quintL.stream().mapToDouble(quintX -> (quintX - quintMean) * (quintX - quintMean)).average().orElse(0); return Math.sqrt(quintVar); } }).get()`, Order.ATOMIC];
      case 'MODE': return [`(new java.util.function.Supplier<Double>() { public Double get() { java.util.List<Double> quintL = ${nums}; java.util.Map<Double, Integer> quintCounts = new java.util.HashMap<Double, Integer>(); double quintBest = 0; int quintBestCount = -1; for (Double quintV : quintL) { int quintC = quintCounts.merge(quintV, 1, Integer::sum); if (quintC > quintBestCount) { quintBestCount = quintC; quintBest = quintV; } } return quintBest; } }).get()`, Order.ATOMIC];
      default: return ['0.0', Order.ATOMIC];
    }
  };

  // ---------------------------------------------------------------------
  // More Text blocks (stock Blockly block types, targeting java.lang.String).
  // ---------------------------------------------------------------------
  F['text_length'] = (block, g) => [`(${str(g, block, 'VALUE', '""')}).length()`, Order.ATOMIC];
  F['text_isEmpty'] = (block, g) => [`(${str(g, block, 'VALUE', '""')}).isEmpty()`, Order.ATOMIC];

  F['text_indexOf'] = (block, g) => {
    const haystack = str(g, block, 'VALUE', '""');
    const needle = str(g, block, 'FIND', '""');
    const method = block.getFieldValue('END') === 'LAST' ? 'lastIndexOf' : 'indexOf';
    return [`((${haystack}).${method}(${needle}) + 1)`, Order.ATOMIC];
  };

  F['text_charAt'] = (block, g) => {
    const where = block.getFieldValue('WHERE') || 'FROM_START';
    const s = str(g, block, 'VALUE', '""');
    if (where === 'FIRST') return [`(${s}).substring(0, 1)`, Order.ATOMIC];
    if (where === 'LAST') return [`(${s}).substring((${s}).length() - 1)`, Order.ATOMIC];
    if (where === 'RANDOM') return [`(new java.util.function.Supplier<String>() { public String get() { String quintS = ${s}; return quintS.isEmpty() ? "" : String.valueOf(quintS.charAt(new java.util.Random().nextInt(quintS.length()))); } }).get()`, Order.ATOMIC];
    const at = num(g, block, 'AT', 1);
    const idx = where === 'FROM_END' ? `((${s}).length() - ${toInt(at)})` : `(${toInt(at)} - 1)`;
    return [`(new java.util.function.Supplier<String>() { public String get() { String quintS = ${s}; int quintI = ${idx}; return (quintI >= 0 && quintI < quintS.length()) ? String.valueOf(quintS.charAt(quintI)) : ""; } }).get()`, Order.ATOMIC];
  };

  function textBoundExpr(g, block, whereField, atField, strExpr, isStart) {
    const where = block.getFieldValue(whereField) || (isStart ? 'FIRST' : 'LAST');
    if (isStart) {
      if (where === 'FIRST') return '0';
      if (where === 'FROM_END') return `(${strExpr}.length() - ${toInt(num(g, block, atField, 1))})`;
      return `(${toInt(num(g, block, atField, 1))} - 1)`;
    }
    if (where === 'LAST') return `${strExpr}.length()`;
    if (where === 'FROM_END') return `(${strExpr}.length() - ${toInt(num(g, block, atField, 1))} + 1)`;
    return `${toInt(num(g, block, atField, 1))}`;
  }

  F['text_getSubstring'] = (block, g) => {
    const strExpr = `(${str(g, block, 'STRING', '""')})`;
    const start = textBoundExpr(g, block, 'WHERE1', 'AT1', strExpr, true);
    const end = textBoundExpr(g, block, 'WHERE2', 'AT2', strExpr, false);
    const clampedStart = `Math.max(0, Math.min(${strExpr}.length(), ${start}))`;
    const clampedEnd = `Math.max(0, Math.min(${strExpr}.length(), ${end}))`;
    return [`${strExpr}.substring(${clampedStart}, Math.max(${clampedStart}, ${clampedEnd}))`, Order.ATOMIC];
  };

  F['text_changeCase'] = (block, g) => {
    const mode = block.getFieldValue('CASE');
    const s = str(g, block, 'TEXT', '""');
    if (mode === 'UPPERCASE') return [`(${s}).toUpperCase()`, Order.ATOMIC];
    if (mode === 'LOWERCASE') return [`(${s}).toLowerCase()`, Order.ATOMIC];
    return [`(new java.util.function.Supplier<String>() { public String get() { String[] quintWords = (${s}).split(" "); StringBuilder quintOut = new StringBuilder(); for (int quintI = 0; quintI < quintWords.length; quintI++) { if (quintI > 0) quintOut.append(" "); String quintW = quintWords[quintI]; if (!quintW.isEmpty()) quintOut.append(Character.toUpperCase(quintW.charAt(0))).append(quintW.substring(1).toLowerCase()); } return quintOut.toString(); } }).get()`, Order.ATOMIC];
  };

  F['text_trim'] = (block, g) => {
    const mode = block.getFieldValue('MODE');
    const s = str(g, block, 'TEXT', '""');
    if (mode === 'LEFT') return [`(${s}).replaceAll("^\\\\s+", "")`, Order.ATOMIC];
    if (mode === 'RIGHT') return [`(${s}).replaceAll("\\\\s+$", "")`, Order.ATOMIC];
    return [`(${s}).trim()`, Order.ATOMIC];
  };

  F['text_count'] = (block, g) => {
    const text = str(g, block, 'TEXT', '""');
    const sub = str(g, block, 'SUB', '""');
    return [`(new java.util.function.Supplier<Integer>() { public Integer get() { String quintT = ${text}, quintS = ${sub}; return quintS.isEmpty() ? quintT.length() + 1 : (quintT.length() - quintT.replace(quintS, "").length()) / quintS.length(); } }).get()`, Order.ATOMIC];
  };

  F['text_replace'] = (block, g) => {
    const text = str(g, block, 'TEXT', '""');
    const from = str(g, block, 'FROM', '""');
    const to = str(g, block, 'TO', '""');
    return [`(${text}).replace(${from}, ${to})`, Order.ATOMIC];
  };

  F['text_reverse'] = (block, g) => [`new StringBuilder(${str(g, block, 'TEXT', '""')}).reverse().toString()`, Order.ATOMIC];

  F['text_append'] = (block, g) => {
    const varName = g.getVariableName(block.getFieldValue('VAR'));
    const text = str(g, block, 'TEXT', '""');
    return `${varName} = String.valueOf(${varName}) + ${text};\n`;
  };

  // ---------------------------------------------------------------------
  // More Logic blocks
  // ---------------------------------------------------------------------
  F['logic_ternary'] = (block, g) => {
    const rawIf = g.valueToCode(block, 'IF', Order.NONE);
    const cond = rawIf ? asBoolean(rawIf) : 'false';
    const then = val(g, block, 'THEN', 'null');
    const els = val(g, block, 'ELSE', 'null');
    return [`(${cond} ? (Object)(${then}) : (Object)(${els}))`, Order.ATOMIC];
  };

  F['logic_null'] = () => ['((Object) null)', Order.ATOMIC];

  // ---------------------------------------------------------------------
  // More Lists blocks (stock Blockly block types, targeting java.util.List<Object>).
  // ---------------------------------------------------------------------
  F['lists_create_empty'] = () => ['new java.util.ArrayList<Object>()', Order.ATOMIC];

  F['lists_repeat'] = (block, g) => {
    const item = val(g, block, 'ITEM', 'null');
    const count = num(g, block, 'NUM', 0);
    return [`(new java.util.function.Supplier<java.util.List<Object>>() { public java.util.List<Object> get() { java.util.List<Object> quintList = new java.util.ArrayList<Object>(); int quintN = ${toInt(count)}; for (int quintI = 0; quintI < quintN; quintI++) { quintList.add(${item}); } return quintList; } }).get()`, Order.ATOMIC];
  };

  F['lists_indexOf'] = (block, g) => {
    const listVar = asList(g.valueToCode(block, 'VALUE', Order.NONE));
    const find = val(g, block, 'FIND', 'null');
    const method = block.getFieldValue('END') === 'LAST' ? 'lastIndexOf' : 'indexOf';
    return [`(${listVar}.${method}(${find}) + 1)`, Order.ATOMIC];
  };

  F['lists_sort'] = (block, g) => {
    const listVar = asList(g.valueToCode(block, 'LIST', Order.NONE));
    const type = block.getFieldValue('TYPE') || 'NUMERIC';
    const dir = block.getFieldValue('DIRECTION') === '-1' ? -1 : 1;
    let cmpBody;
    if (type === 'NUMERIC') cmpBody = `Double.compare(${asDouble('quintX')}, ${asDouble('quintY')})`;
    else if (type === 'IGNORE_CASE') cmpBody = `String.valueOf(quintX).compareToIgnoreCase(String.valueOf(quintY))`;
    else cmpBody = `String.valueOf(quintX).compareTo(String.valueOf(quintY))`;
    return [`(new java.util.function.Supplier<java.util.List<Object>>() { public java.util.List<Object> get() { java.util.List<Object> quintList = new java.util.ArrayList<Object>(${listVar}); quintList.sort((quintX, quintY) -> ${dir} * (${cmpBody})); return quintList; } }).get()`, Order.ATOMIC];
  };

  F['lists_split'] = (block, g) => {
    const delim = str(g, block, 'DELIM', '""');
    const mode = block.getFieldValue('MODE') || 'SPLIT';
    if (mode === 'JOIN') {
      const listVar = asList(g.valueToCode(block, 'INPUT', Order.NONE));
      return [`String.join(${delim}, ${listVar}.stream().map(String::valueOf).toArray(String[]::new))`, Order.ATOMIC];
    }
    const input = str(g, block, 'INPUT', '""');
    return [`new java.util.ArrayList<Object>(java.util.Arrays.asList((${input}).split(java.util.regex.Pattern.quote(${delim}), -1)))`, Order.ATOMIC];
  };

  F['lists_reverse'] = (block, g) => {
    const listVar = asList(g.valueToCode(block, 'LIST', Order.NONE));
    return [`(new java.util.function.Supplier<java.util.List<Object>>() { public java.util.List<Object> get() { java.util.List<Object> quintList = new java.util.ArrayList<Object>(${listVar}); java.util.Collections.reverse(quintList); return quintList; } }).get()`, Order.ATOMIC];
  };

  // ---------------------------------------------------------------------
  // More Control blocks
  // ---------------------------------------------------------------------
  F['controls_for'] = (block, g) => {
    const varName = g.getVariableName(block.getFieldValue('VAR'));
    const from = num(g, block, 'FROM', 1);
    const to = num(g, block, 'TO', 10);
    const by = num(g, block, 'BY', 1);
    const branch = g.statementToCode(block, 'DO');
    const loopVar = g.nameDB_.getDistinctName('quintForLoop', Blockly.Names.NameType.VARIABLE);
    const stepVar = g.nameDB_.getDistinctName('quintForStep', Blockly.Names.NameType.VARIABLE);
    const endVar = g.nameDB_.getDistinctName('quintForEnd', Blockly.Names.NameType.VARIABLE);
    return `for (double ${loopVar} = ${from}, ${stepVar} = (${by}), ${endVar} = (${to}); ${stepVar} >= 0 ? ${loopVar} <= ${endVar} : ${loopVar} >= ${endVar}; ${loopVar} += ${stepVar}) {\n    ${varName} = ${loopVar};\n${branch}}\n`;
  };

  F['controls_flow_statements'] = (block) => (block.getFieldValue('FLOW') === 'CONTINUE' ? 'continue;\n' : 'break;\n');

  window.QuintJava = Java;
  window.QuintJavaOrder = Order;
})();
