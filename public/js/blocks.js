// Custom Blockly block definitions for Quint's Minecraft plugin blocks.
// Standard Blockly blocks (logic, loops, math, text, variables) are reused
// as-is from blocks_compressed.js -- we only define Minecraft-specific ones.
(function () {
  'use strict';

  const EVENT_COLOR = '#FFBF00';
  const COMMAND_COLOR = '#8C1AFF';
  const ACTION_COLOR = '#4C97FF';
  const SENSING_COLOR = '#5CB1D6';
  const CONTROL_COLOR = '#FF8C1A';

  function define(type, json) {
    Blockly.Blocks[type] = {
      init: function () {
        this.jsonInit(json);
      },
    };
  }

  // ---------------------------------------------------------------------
  // Plugin lifecycle + events (hat blocks: statement input only, no
  // previous/next connectors -- these are the "start" of a script, like
  // Scratch's hat blocks).
  // ---------------------------------------------------------------------
  define('mc_on_enable', {
    message0: '▶ when the plugin starts %1 %2',
    args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
    colour: EVENT_COLOR,
    tooltip: 'Runs once when your plugin loads on the server.',
  });

  define('mc_on_disable', {
    message0: '⏹ when the plugin stops %1 %2',
    args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
    colour: EVENT_COLOR,
    tooltip: 'Runs once when your plugin is being shut down.',
  });

  const EVENT_HATS = [
    ['mc_event_join', '🚪 when a player joins the server', 'Fires every time a player connects.'],
    ['mc_event_quit', '🚪 when a player leaves the server', 'Fires every time a player disconnects.'],
    ['mc_event_chat', '💬 when a player sends a chat message', 'Fires whenever a player chats. Use "the message" below to read what they typed.'],
    ['mc_event_death', '💀 when a player dies', 'Fires whenever a player dies, for any reason.'],
    ['mc_event_block_break', '⛏ when a block is broken', 'Fires whenever any player breaks a block.'],
    ['mc_event_block_place', '🧱 when a block is placed', 'Fires whenever any player places a block.'],
    ['mc_event_interact', '👆 when a player interacts (clicks)', 'Fires when a player left/right-clicks with an item or block.'],
    ['mc_event_damage', '🩸 when an entity takes damage', 'Fires whenever any entity (player or mob) takes damage.'],
  ];
  for (const [type, label, tooltip] of EVENT_HATS) {
    define(type, {
      message0: `${label} %1 %2`,
      args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
      colour: EVENT_COLOR,
      tooltip,
    });
  }

  // ---------------------------------------------------------------------
  // Custom command definition (also a hat block).
  // ---------------------------------------------------------------------
  define('mc_command_define', {
    message0: '⚡ when someone runs the command /%1',
    args0: [{ type: 'field_input', name: 'CMDNAME', text: 'heal' }],
    message1: '📝 description: %1',
    args1: [{ type: 'field_input', name: 'DESCRIPTION', text: 'A custom command' }],
    message2: '%1',
    args2: [{ type: 'input_statement', name: 'DO' }],
    colour: COMMAND_COLOR,
    tooltip: 'Creates a brand new /command for your plugin. Anything connected below runs when a player types it.',
  });

  // ---------------------------------------------------------------------
  // Actions (statement blocks that chain together inside a hat's body).
  // ---------------------------------------------------------------------
  const MATERIALS = [
    ['Diamond Sword', 'DIAMOND_SWORD'], ['Diamond', 'DIAMOND'], ['Iron Ingot', 'IRON_INGOT'],
    ['Golden Apple', 'GOLDEN_APPLE'], ['Apple', 'APPLE'], ['Bread', 'BREAD'],
    ['Cooked Beef', 'COOKED_BEEF'], ['Ender Pearl', 'ENDER_PEARL'], ['TNT', 'TNT'],
    ['Obsidian', 'OBSIDIAN'], ['Dirt', 'DIRT'], ['Stone', 'STONE'], ['Oak Log', 'OAK_LOG'],
    ['Torch', 'TORCH'], ['Water Bucket', 'WATER_BUCKET'], ['Bow', 'BOW'], ['Arrow', 'ARROW'],
    ['Shield', 'SHIELD'], ['Elytra', 'ELYTRA'], ['Netherite Ingot', 'NETHERITE_INGOT'], ['Emerald', 'EMERALD'],
  ];
  const SOUNDS = [
    ['Level Up', 'ENTITY_PLAYER_LEVELUP'], ['XP Pickup', 'ENTITY_EXPERIENCE_ORB_PICKUP'],
    ['Note Block Ping', 'BLOCK_NOTE_BLOCK_PLING'], ['Ender Dragon Growl', 'ENTITY_ENDERDRAGON_GROWL'],
    ['Wither Spawn', 'ENTITY_WITHER_SPAWN'], ['Anvil Land', 'BLOCK_ANVIL_LAND'],
    ['Firework Blast', 'ENTITY_FIREWORK_ROCKET_BLAST'], ['Villager Yes', 'ENTITY_VILLAGER_YES'],
    ['Villager No', 'ENTITY_VILLAGER_NO'], ['Button Click', 'UI_BUTTON_CLICK'],
  ];
  const PARTICLES = [
    ['Flame', 'FLAME'], ['Heart', 'HEART'], ['Happy Villager', 'HAPPY_VILLAGER'], ['Cloud', 'CLOUD'],
    ['Explosion', 'EXPLOSION'], ['Smoke', 'SMOKE'], ['Portal', 'PORTAL'], ['Critical Hit', 'CRIT'],
    ['End Rod', 'END_ROD'], ['Firework', 'FIREWORK'], ['Dripping Lava', 'DRIPPING_LAVA'], ['Snowflake', 'SNOWFLAKE'],
  ];
  const MOBS = [
    ['Zombie', 'ZOMBIE'], ['Skeleton', 'SKELETON'], ['Creeper', 'CREEPER'], ['Spider', 'SPIDER'],
    ['Cow', 'COW'], ['Pig', 'PIG'], ['Sheep', 'SHEEP'], ['Chicken', 'CHICKEN'], ['Villager', 'VILLAGER'],
    ['Wolf', 'WOLF'], ['Iron Golem', 'IRON_GOLEM'], ['Enderman', 'ENDERMAN'],
    ['Wither Skeleton', 'WITHER_SKELETON'], ['Blaze', 'BLAZE'], ['Ghast', 'GHAST'],
  ];
  const GAMEMODES = [['Survival', 'SURVIVAL'], ['Creative', 'CREATIVE'], ['Adventure', 'ADVENTURE'], ['Spectator', 'SPECTATOR']];

  define('mc_action_send_message', {
    message0: '💬 send %1 the message %2',
    args0: [{ type: 'input_value', name: 'PLAYER' }, { type: 'input_value', name: 'MESSAGE' }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Sends a private chat message to one player.',
  });

  define('mc_action_broadcast', {
    message0: '📢 broadcast to everyone: %1',
    args0: [{ type: 'input_value', name: 'MESSAGE' }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Sends a message to every player currently online.',
  });

  define('mc_action_give_item', {
    message0: '🎁 give %1 %2 x %3',
    args0: [
      { type: 'input_value', name: 'PLAYER' },
      { type: 'field_dropdown', name: 'MATERIAL', options: MATERIALS },
      { type: 'input_value', name: 'AMOUNT' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Puts items directly into a player\'s inventory.',
  });

  define('mc_action_teleport', {
    message0: '🚀 teleport %1 to X:%2 Y:%3 Z:%4',
    args0: [
      { type: 'input_value', name: 'PLAYER' },
      { type: 'input_value', name: 'X' },
      { type: 'input_value', name: 'Y' },
      { type: 'input_value', name: 'Z' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Teleports a player to exact coordinates in their current world.',
  });

  define('mc_action_set_health', {
    message0: '❤ set %1 health to %2',
    args0: [{ type: 'input_value', name: 'PLAYER' }, { type: 'input_value', name: 'AMOUNT' }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Sets health points (max 20 = full hearts).',
  });

  define('mc_action_set_food', {
    message0: '🍗 set %1 hunger to %2',
    args0: [{ type: 'input_value', name: 'PLAYER' }, { type: 'input_value', name: 'AMOUNT' }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Sets food/hunger level (max 20 = full drumsticks).',
  });

  define('mc_action_play_sound', {
    message0: '🔊 play sound %1 for %2',
    args0: [{ type: 'field_dropdown', name: 'SOUND', options: SOUNDS }, { type: 'input_value', name: 'PLAYER' }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Plays a sound effect only that player can hear.',
  });

  define('mc_action_spawn_particle', {
    message0: '✨ show %1 particles (%2) at %3\'s location',
    args0: [
      { type: 'field_dropdown', name: 'PARTICLE', options: PARTICLES },
      { type: 'input_value', name: 'COUNT' },
      { type: 'input_value', name: 'PLAYER' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Spawns a burst of particles at a player\'s current location.',
  });

  define('mc_action_spawn_mob', {
    message0: '🐺 spawn a %1 near %2',
    args0: [{ type: 'field_dropdown', name: 'ENTITY', options: MOBS }, { type: 'input_value', name: 'PLAYER' }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Spawns a mob right next to a player.',
  });

  define('mc_action_set_gamemode', {
    message0: '🎮 set %1 game mode to %2',
    args0: [{ type: 'input_value', name: 'PLAYER' }, { type: 'field_dropdown', name: 'GAMEMODE', options: GAMEMODES }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Switches a player between Survival, Creative, Adventure or Spectator.',
  });

  define('mc_action_kick_player', {
    message0: '👢 kick %1 with reason %2',
    args0: [{ type: 'input_value', name: 'PLAYER' }, { type: 'input_value', name: 'REASON' }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Disconnects a player from the server with a message.',
  });

  define('mc_action_set_join_message', {
    message0: '✏ set the join announcement to %1',
    args0: [{ type: 'input_value', name: 'MESSAGE' }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Only works inside "when a player joins" -- replaces the default green join text.',
  });

  define('mc_action_set_quit_message', {
    message0: '✏ set the leave announcement to %1',
    args0: [{ type: 'input_value', name: 'MESSAGE' }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Only works inside "when a player leaves" -- replaces the default yellow leave text.',
  });

  define('mc_action_cancel_event', {
    message0: '🚫 cancel this (stop it from happening)',
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Stops the triggering action, e.g. stops a block from actually breaking.',
  });

  define('mc_action_wait_then', {
    message0: '⏳ wait %1 ticks (20 = 1 second), then: %2 %3',
    args0: [{ type: 'input_value', name: 'TICKS' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
    previousStatement: null,
    nextStatement: null,
    colour: CONTROL_COLOR,
    tooltip: 'Schedules the connected blocks to run later, without freezing the server. Blocks placed AFTER this one still run immediately.',
  });

  // ---------------------------------------------------------------------
  // Sensing / value reporters.
  // ---------------------------------------------------------------------
  define('mc_value_event_player', {
    message0: '🧍 the player',
    output: null,
    colour: SENSING_COLOR,
    tooltip: 'The player involved in this event/command.',
  });

  define('mc_value_event_message', {
    message0: '💬 the message',
    output: null,
    colour: SENSING_COLOR,
    tooltip: 'Only available inside "when a player sends a chat message".',
  });

  define('mc_value_event_block', {
    message0: '🧱 the block',
    output: null,
    colour: SENSING_COLOR,
    tooltip: 'Only available inside block break/place events.',
  });

  define('mc_value_player_name', {
    message0: '%1\'s name',
    args0: [{ type: 'input_value', name: 'PLAYER' }],
    output: null,
    colour: SENSING_COLOR,
    tooltip: 'The player\'s username, as text.',
  });

  define('mc_value_command_sender', {
    message0: '⚡ whoever ran the command',
    output: null,
    colour: SENSING_COLOR,
    tooltip: 'Only available inside a command block.',
  });

  define('mc_value_command_arg', {
    message0: 'argument # %1',
    args0: [{ type: 'field_number', name: 'INDEX', value: 1, min: 1, precision: 1 }],
    output: null,
    colour: SENSING_COLOR,
    tooltip: 'Whatever the player typed after the command name, e.g. /heal 50 -> argument #1 is "50". Safe even if not enough arguments were given.',
  });

  define('mc_value_command_args_joined', {
    message0: '⚡ all the arguments, joined with spaces',
    output: null,
    colour: SENSING_COLOR,
    tooltip: 'Only available inside a command block.',
  });

  // ---------------------------------------------------------------------
  // Toolbox
  // ---------------------------------------------------------------------
  function cat(name, colour, blockTypes, extra) {
    return {
      kind: 'category',
      name,
      colour,
      contents: [...blockTypes.map((t) => ({ kind: 'block', type: t })), ...(extra || [])],
    };
  }

  window.QUINT_TOOLBOX = {
    kind: 'categoryToolbox',
    contents: [
      cat('Events', EVENT_COLOR, [
        'mc_on_enable', 'mc_on_disable', 'mc_event_join', 'mc_event_quit', 'mc_event_chat',
        'mc_event_death', 'mc_event_block_break', 'mc_event_block_place', 'mc_event_interact', 'mc_event_damage',
      ]),
      cat('Commands', COMMAND_COLOR, ['mc_command_define']),
      cat('Actions', ACTION_COLOR, [
        'mc_action_send_message', 'mc_action_broadcast', 'mc_action_give_item', 'mc_action_teleport',
        'mc_action_set_health', 'mc_action_set_food', 'mc_action_play_sound', 'mc_action_spawn_particle',
        'mc_action_spawn_mob', 'mc_action_set_gamemode', 'mc_action_kick_player',
        'mc_action_set_join_message', 'mc_action_set_quit_message', 'mc_action_cancel_event',
      ]),
      cat('Sensing', SENSING_COLOR, [
        'mc_value_event_player', 'mc_value_event_message', 'mc_value_event_block',
        'mc_value_player_name', 'mc_value_command_sender', 'mc_value_command_arg', 'mc_value_command_args_joined',
      ]),
      cat('Control', CONTROL_COLOR, ['controls_if', 'controls_repeat_ext', 'controls_whileUntil', 'mc_action_wait_then']),
      { kind: 'category', name: 'Logic', colour: '#5C81A6', contents: [
        { kind: 'block', type: 'logic_compare' },
        { kind: 'block', type: 'logic_operation' },
        { kind: 'block', type: 'logic_negate' },
        { kind: 'block', type: 'logic_boolean' },
      ] },
      { kind: 'category', name: 'Math', colour: '#5C68A6', contents: [
        { kind: 'block', type: 'math_number' },
        { kind: 'block', type: 'math_arithmetic' },
      ] },
      { kind: 'category', name: 'Text', colour: '#5CA65C', contents: [
        { kind: 'block', type: 'text' },
        { kind: 'block', type: 'text_join' },
      ] },
      { kind: 'category', name: 'Variables', colour: '#A65C81', custom: 'VARIABLE' },
    ],
  };
})();
