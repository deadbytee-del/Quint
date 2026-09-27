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

  // Every block renders its inputs inline on one row by default (e.g. "send
  // [player] the message [text]") instead of Blockly's default of stacking
  // each value input onto its own line below the block's label -- which is
  // what made blocks look like disconnected config-card forms. Pass
  // `inputsInline: false` explicitly for the rare block that genuinely
  // needs the stacked layout (e.g. one with many inputs that wouldn't fit
  // on one row).
  function define(type, json) {
    Blockly.Blocks[type] = {
      init: function () {
        this.jsonInit({ inputsInline: true, ...json });
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
    ['mc_event_respawn', '💫 when a player respawns', 'Fires right after a player comes back to life.'],
    ['mc_event_drop_item', '📤 when a player drops an item', 'Fires whenever a player drops something from their inventory.'],
    ['mc_event_toggle_sneak', '🤫 when a player starts/stops sneaking', 'Fires every time a player toggles sneaking.'],
    ['mc_event_toggle_sprint', '🏃 when a player starts/stops sprinting', 'Fires every time a player toggles sprinting.'],
    ['mc_event_level_change', '⭐ when a player\'s XP level changes', 'Fires whenever a player levels up or down.'],
    ['mc_event_entity_death', '💀 when any mob dies', 'Fires whenever a mob (or player) dies.'],
    ['mc_event_block_ignite', '🔥 when a block catches fire', 'Fires whenever fire starts spreading to a block.'],
    ['mc_event_food_change', '🍗 when hunger changes', 'Fires whenever a player\'s hunger level changes.'],
    ['mc_event_command_preprocess', '⌨ when a player types any command', 'Fires right before ANY command runs (even ones from other plugins). Use "the message" below to read what they typed.'],
    ['mc_event_inventory_click', '🖱 when a player clicks in an inventory', 'Fires whenever a player clicks a slot in a chest, crafting table, their own inventory, etc.'],
    ['mc_event_bed_enter', '🛏 when a player gets in bed', 'Fires when a player tries to sleep.'],
    ['mc_event_pickup_item', '🫳 when a player picks up an item', 'Fires whenever a player picks an item up off the ground.'],
    ['mc_event_kick', '👢 when a player is about to be kicked', 'Fires right before a player gets disconnected for being kicked. Cancel it to let them stay.'],
    ['mc_event_change_world', '🌍 when a player changes world', 'Fires right after a player arrives in a different world (e.g. through a portal or teleport).'],
    ['mc_event_teleport', '🌀 when a player teleports', 'Fires whenever a player is teleported, by a command, a portal, or a plugin.'],
    ['mc_event_damage_by_entity', '⚔ when an entity is damaged by another entity', 'Fires on any entity-vs-entity damage (e.g. PvP or a player hitting a mob). Use "the player" for whoever dealt the damage.'],
    ['mc_event_item_held', '🔢 when a player switches hotbar slot', 'Fires whenever a player scrolls to a different hotbar slot.'],
    ['mc_event_vehicle_enter', '🚗 when a player enters a vehicle', 'Fires when a player gets into a boat, minecart, or similar.'],
    ['mc_event_vehicle_exit', '🚪 when a player exits a vehicle', 'Fires when a player gets out of a boat, minecart, or similar.'],
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
    message0: '⚡ command /%1 — %2 %3',
    args0: [
      { type: 'field_input', name: 'CMDNAME', text: 'heal' },
      { type: 'field_input', name: 'DESCRIPTION', text: 'A custom command' },
      { type: 'input_dummy' },
    ],
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'DO' }],
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
  const WEATHER_OPTIONS = [['Clear', 'CLEAR'], ['Storm', 'STORM']];
  const ON_OFF = [['On', 'ON'], ['Off', 'OFF']];
  const POTION_EFFECTS = [
    ['Speed', 'SPEED'], ['Slowness', 'SLOWNESS'], ['Jump Boost', 'JUMP_BOOST'], ['Strength', 'STRENGTH'],
    ['Instant Health', 'INSTANT_HEALTH'], ['Regeneration', 'REGENERATION'], ['Fire Resistance', 'FIRE_RESISTANCE'],
    ['Water Breathing', 'WATER_BREATHING'], ['Invisibility', 'INVISIBILITY'], ['Night Vision', 'NIGHT_VISION'],
    ['Health Boost', 'HEALTH_BOOST'], ['Absorption', 'ABSORPTION'], ['Levitation', 'LEVITATION'],
    ['Glowing', 'GLOWING'], ['Luck', 'LUCK'], ['Slow Falling', 'SLOW_FALLING'], ['Poison', 'POISON'],
    ['Weakness', 'WEAKNESS'], ['Hunger', 'HUNGER'], ['Blindness', 'BLINDNESS'], ['Nausea', 'NAUSEA'],
    ['Mining Fatigue', 'MINING_FATIGUE'],
  ];

  define('mc_action_send_message', {
    message0: '💬 send %1 the message %2',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }, { type: 'input_value', name: 'MESSAGE' }],
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
      { type: 'input_value', name: 'PLAYER', check: 'Player' },
      { type: 'field_dropdown', name: 'MATERIAL', options: MATERIALS },
      { type: 'input_value', name: 'AMOUNT', check: 'Number' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Puts items directly into a player\'s inventory.',
  });

  define('mc_action_teleport', {
    message0: '🚀 teleport %1 to X:%2 Y:%3 Z:%4',
    args0: [
      { type: 'input_value', name: 'PLAYER', check: 'Player' },
      { type: 'input_value', name: 'X', check: 'Number' },
      { type: 'input_value', name: 'Y', check: 'Number' },
      { type: 'input_value', name: 'Z', check: 'Number' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Teleports a player to exact coordinates in their current world.',
  });

  define('mc_action_teleport_to_location', {
    message0: '🚀 teleport %1 to %2',
    args0: [
      { type: 'input_value', name: 'PLAYER', check: 'Player' },
      { type: 'input_value', name: 'LOCATION', check: 'Location' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Teleports a player to a location value (e.g. another player\'s location).',
  });

  define('mc_action_set_health', {
    message0: '❤ set %1 health to %2',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }, { type: 'input_value', name: 'AMOUNT', check: 'Number' }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Sets health points (max 20 = full hearts).',
  });

  define('mc_action_set_food', {
    message0: '🍗 set %1 hunger to %2',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }, { type: 'input_value', name: 'AMOUNT', check: 'Number' }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Sets food/hunger level (max 20 = full drumsticks).',
  });

  define('mc_action_play_sound', {
    message0: '🔊 play sound %1 for %2',
    args0: [{ type: 'field_dropdown', name: 'SOUND', options: SOUNDS }, { type: 'input_value', name: 'PLAYER', check: 'Player' }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Plays a sound effect only that player can hear.',
  });

  define('mc_action_spawn_particle', {
    message0: '✨ show %1 particles (%2) at %3\'s location',
    args0: [
      { type: 'field_dropdown', name: 'PARTICLE', options: PARTICLES },
      { type: 'input_value', name: 'COUNT', check: 'Number' },
      { type: 'input_value', name: 'PLAYER', check: 'Player' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Spawns a burst of particles at a player\'s current location.',
  });

  define('mc_action_spawn_mob', {
    message0: '🐺 spawn a %1 near %2',
    args0: [{ type: 'field_dropdown', name: 'ENTITY', options: MOBS }, { type: 'input_value', name: 'PLAYER', check: 'Player' }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Spawns a mob right next to a player.',
  });

  define('mc_action_set_gamemode', {
    message0: '🎮 set %1 game mode to %2',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }, { type: 'field_dropdown', name: 'GAMEMODE', options: GAMEMODES }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Switches a player between Survival, Creative, Adventure or Spectator.',
  });

  define('mc_action_kick_player', {
    message0: '👢 kick %1 with reason %2',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }, { type: 'input_value', name: 'REASON' }],
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
    args0: [{ type: 'input_value', name: 'TICKS', check: 'Number' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
    previousStatement: null,
    nextStatement: null,
    colour: CONTROL_COLOR,
    tooltip: 'Schedules the connected blocks to run later, without freezing the server. Blocks placed AFTER this one still run immediately.',
  });

  define('mc_action_repeat_every_ticks', {
    message0: '🔁 every %1 ticks, repeat: %2 %3',
    args0: [{ type: 'input_value', name: 'PERIOD', check: 'Number' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
    previousStatement: null,
    nextStatement: null,
    colour: CONTROL_COLOR,
    tooltip: 'Runs the connected blocks over and over, forever, every N ticks (20 = 1 second) -- without freezing the server.',
  });

  define('mc_action_set_time', {
    message0: '🕐 set %1\'s world time to %2 ticks',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }, { type: 'input_value', name: 'TICKS', check: 'Number' }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: '0 = sunrise, 6000 = noon, 12000 = sunset, 18000 = midnight.',
  });

  define('mc_action_set_weather', {
    message0: '🌦 set %1\'s world weather to %2',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }, { type: 'field_dropdown', name: 'WEATHER', options: WEATHER_OPTIONS }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Changes the weather in that player\'s world.',
  });

  define('mc_action_strike_lightning', {
    message0: '⚡ strike lightning at %1',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Strikes visual + damaging lightning at a player\'s location.',
  });

  define('mc_action_create_explosion', {
    message0: '💥 explode at %1 with power %2',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }, { type: 'input_value', name: 'POWER', check: 'Number' }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Creates an explosion (like TNT) at a player\'s location. Power 4 = about one TNT block.',
  });

  define('mc_action_add_potion_effect', {
    message0: '🧪 give %1 the %2 effect for %3 seconds (level %4)',
    args0: [
      { type: 'input_value', name: 'PLAYER', check: 'Player' },
      { type: 'field_dropdown', name: 'EFFECT', options: POTION_EFFECTS },
      { type: 'input_value', name: 'SECONDS', check: 'Number' },
      { type: 'input_value', name: 'LEVEL', check: 'Number' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Applies a potion effect. Level 1 is the normal strength.',
  });

  define('mc_action_clear_potion_effects', {
    message0: '🧪 clear all effects from %1',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Removes every active potion effect from a player.',
  });

  define('mc_action_set_flying', {
    message0: '🕊 set %1\'s flying to %2',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }, { type: 'field_dropdown', name: 'STATE', options: ON_OFF }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Lets a player fly (or stops them from flying).',
  });

  define('mc_action_set_walk_speed', {
    message0: '👟 set %1\'s walk speed to %2',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }, { type: 'input_value', name: 'SPEED', check: 'Number' }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Normal speed is 0.2. Try values between -1 and 1.',
  });

  define('mc_action_clear_inventory', {
    message0: '🎒 clear %1\'s inventory',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Empties everything out of a player\'s inventory.',
  });

  define('mc_action_give_xp', {
    message0: '⭐ give %1 %2 XP points',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }, { type: 'input_value', name: 'AMOUNT', check: 'Number' }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Adds experience points to a player.',
  });

  define('mc_action_set_level', {
    message0: '⭐ set %1\'s XP level to %2',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }, { type: 'input_value', name: 'LEVEL', check: 'Number' }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Sets the number shown above a player\'s XP bar.',
  });

  define('mc_action_equip_item', {
    message0: '✋ put %1 in %2\'s hand',
    args0: [{ type: 'field_dropdown', name: 'MATERIAL', options: MATERIALS }, { type: 'input_value', name: 'PLAYER', check: 'Player' }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Equips an item directly into a player\'s main hand.',
  });

  define('mc_action_set_block_at_player', {
    message0: '🧱 turn the block under %1 into %2',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }, { type: 'field_dropdown', name: 'MATERIAL2', options: MATERIALS }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Changes the block at a player\'s exact location.',
  });

  define('mc_action_send_title', {
    message0: '🏆 show %1 the title %2 and subtitle %3',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }, { type: 'input_value', name: 'TITLE' }, { type: 'input_value', name: 'SUBTITLE' }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Shows big text in the middle of a player\'s screen, like a level-up banner.',
  });

  define('mc_action_send_actionbar', {
    message0: '📊 show %1 the action bar text %2',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }, { type: 'input_value', name: 'TEXT' }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Shows a short message just above a player\'s hotbar.',
  });

  define('mc_action_remove_item', {
    message0: '🗑 remove %1 x %2 from %3\'s inventory',
    args0: [
      { type: 'field_dropdown', name: 'MATERIAL', options: MATERIALS },
      { type: 'input_value', name: 'AMOUNT', check: 'Number' },
      { type: 'input_value', name: 'PLAYER', check: 'Player' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Takes items out of a player\'s inventory, if they have them.',
  });

  define('mc_action_run_console_command', {
    message0: '🖥 run the server command %1',
    args0: [{ type: 'input_value', name: 'COMMAND' }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Runs a command as the server console, exactly like typing it in the server terminal (e.g. "gamemode creative Steve"). Don\'t include the leading /.',
  });

  define('mc_action_set_spawn_point', {
    message0: '🛏 set %1\'s spawn point to their current location',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Like sleeping in a bed -- the player respawns here after dying.',
  });

  define('mc_action_grant_permission', {
    message0: '🔑 give %1 the permission %2',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }, { type: 'input_value', name: 'PERMISSION' }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION_COLOR,
    tooltip: 'Grants a permission node (e.g. "essentials.fly") to a player for as long as they stay online.',
  });

  // ---------------------------------------------------------------------
  // Sensing / value reporters.
  // ---------------------------------------------------------------------
  define('mc_value_event_player', {
    message0: '🧍 the player',
    output: 'Player',
    colour: SENSING_COLOR,
    tooltip: 'The player involved in this event/command.',
  });

  define('mc_value_event_message', {
    message0: '💬 the message',
    output: 'String',
    colour: SENSING_COLOR,
    tooltip: 'Only available inside "when a player sends a chat message".',
  });

  define('mc_value_event_block', {
    message0: '🧱 the block',
    output: 'Block',
    colour: SENSING_COLOR,
    tooltip: 'Only available inside block break/place events.',
  });

  define('mc_value_player_name', {
    message0: '%1\'s name',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }],
    output: 'String',
    colour: SENSING_COLOR,
    tooltip: 'The player\'s username, as text.',
  });

  define('mc_value_command_sender', {
    message0: '⚡ whoever ran the command',
    output: 'CommandSender',
    colour: SENSING_COLOR,
    tooltip: 'Only available inside a command block.',
  });

  define('mc_value_command_arg', {
    message0: 'argument # %1',
    args0: [{ type: 'field_number', name: 'INDEX', value: 1, min: 1, precision: 1 }],
    output: 'String',
    colour: SENSING_COLOR,
    tooltip: 'Whatever the player typed after the command name, e.g. /heal 50 -> argument #1 is "50". Safe even if not enough arguments were given.',
  });

  define('mc_value_command_args_joined', {
    message0: '⚡ all the arguments, joined with spaces',
    output: 'String',
    colour: SENSING_COLOR,
    tooltip: 'Only available inside a command block.',
  });

  define('mc_value_player_health', {
    message0: '%1\'s health',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }],
    output: 'Number',
    colour: SENSING_COLOR,
    tooltip: 'A number from 0 to 20 (full hearts).',
  });

  define('mc_value_player_food', {
    message0: '%1\'s hunger',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }],
    output: 'Number',
    colour: SENSING_COLOR,
    tooltip: 'A number from 0 to 20 (full drumsticks).',
  });

  define('mc_value_player_level', {
    message0: '%1\'s XP level',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }],
    output: 'Number',
    colour: SENSING_COLOR,
    tooltip: 'The number shown above a player\'s XP bar.',
  });

  define('mc_value_player_world_name', {
    message0: '%1\'s world name',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }],
    output: 'String',
    colour: SENSING_COLOR,
    tooltip: 'The name of the world a player is standing in, as text.',
  });

  define('mc_value_player_x', {
    message0: '%1\'s X position',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }],
    output: 'Number',
    colour: SENSING_COLOR,
    tooltip: 'How far east/west a player is standing.',
  });

  define('mc_value_player_y', {
    message0: '%1\'s Y position',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }],
    output: 'Number',
    colour: SENSING_COLOR,
    tooltip: 'How high up a player is standing.',
  });

  define('mc_value_player_z', {
    message0: '%1\'s Z position',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }],
    output: 'Number',
    colour: SENSING_COLOR,
    tooltip: 'How far north/south a player is standing.',
  });

  define('mc_value_player_location', {
    message0: '%1\'s location',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }],
    output: 'Location',
    colour: SENSING_COLOR,
    tooltip: 'A player\'s exact position, as a single Location value -- plug this into "teleport to" instead of separate X/Y/Z numbers.',
  });

  define('mc_value_online_count', {
    message0: '🧍 number of players online',
    output: 'Number',
    colour: SENSING_COLOR,
    tooltip: 'How many players are currently on the server.',
  });

  define('mc_value_random_number', {
    message0: '🎲 random number from 0 to %1',
    args0: [{ type: 'input_value', name: 'MAX', check: 'Number' }],
    output: 'Number',
    colour: SENSING_COLOR,
    tooltip: 'Picks a random whole number, including both 0 and the max.',
  });

  define('mc_value_block_type', {
    message0: '🧱 the block\'s type',
    output: 'String',
    colour: SENSING_COLOR,
    tooltip: 'The material name of "the block" (e.g. "STONE"), as text. Only available in block break/place events.',
  });

  define('mc_value_has_permission', {
    message0: 'is %1 allowed to %2 ?',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }, { type: 'input_value', name: 'PERMISSION' }],
    output: 'Boolean',
    colour: SENSING_COLOR,
    tooltip: 'True if the player has this permission node (e.g. "essentials.fly").',
  });

  define('mc_value_is_sneaking', {
    message0: 'is %1 sneaking?',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }],
    output: 'Boolean',
    colour: SENSING_COLOR,
    tooltip: 'True while the player is crouching.',
  });

  define('mc_value_is_op', {
    message0: 'is %1 a server operator?',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }],
    output: 'Boolean',
    colour: SENSING_COLOR,
    tooltip: 'True if the player has server operator (OP) status.',
  });

  define('mc_value_has_item', {
    message0: 'does %1 have %2 x %3 ?',
    args0: [
      { type: 'input_value', name: 'PLAYER', check: 'Player' },
      { type: 'field_dropdown', name: 'MATERIAL', options: MATERIALS },
      { type: 'input_value', name: 'AMOUNT', check: 'Number' },
    ],
    output: 'Boolean',
    colour: SENSING_COLOR,
    tooltip: 'True if the player\'s inventory contains at least that many of the item.',
  });

  define('mc_value_player_max_health', {
    message0: '%1\'s max health',
    args0: [{ type: 'input_value', name: 'PLAYER', check: 'Player' }],
    output: 'Number',
    colour: SENSING_COLOR,
    tooltip: 'A player\'s maximum possible health (normally 20, but can be changed by other plugins/effects).',
  });

  define('mc_value_player_by_name', {
    message0: '🧍 the online player named %1',
    args0: [{ type: 'input_value', name: 'NAME' }],
    output: 'Player',
    colour: SENSING_COLOR,
    tooltip: 'Looks up a player by exact username. Use this to target someone other than the event\'s own player -- e.g. plug it into any block\'s player socket. Empty/nothing if that player isn\'t online.',
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
        'mc_event_respawn', 'mc_event_drop_item', 'mc_event_toggle_sneak', 'mc_event_toggle_sprint',
        'mc_event_level_change', 'mc_event_entity_death', 'mc_event_block_ignite', 'mc_event_food_change',
        'mc_event_command_preprocess', 'mc_event_inventory_click', 'mc_event_bed_enter', 'mc_event_pickup_item',
        'mc_event_kick', 'mc_event_change_world', 'mc_event_teleport', 'mc_event_damage_by_entity',
        'mc_event_item_held', 'mc_event_vehicle_enter', 'mc_event_vehicle_exit',
      ]),
      cat('Commands', COMMAND_COLOR, ['mc_command_define']),
      cat('Actions', ACTION_COLOR, [
        'mc_action_send_message', 'mc_action_broadcast', 'mc_action_send_title', 'mc_action_send_actionbar',
        'mc_action_give_item', 'mc_action_equip_item', 'mc_action_remove_item', 'mc_action_clear_inventory', 'mc_action_teleport', 'mc_action_teleport_to_location',
        'mc_action_set_health', 'mc_action_set_food', 'mc_action_give_xp', 'mc_action_set_level',
        'mc_action_add_potion_effect', 'mc_action_clear_potion_effects', 'mc_action_set_flying', 'mc_action_set_walk_speed',
        'mc_action_play_sound', 'mc_action_spawn_particle', 'mc_action_spawn_mob', 'mc_action_strike_lightning',
        'mc_action_create_explosion', 'mc_action_set_block_at_player', 'mc_action_set_time', 'mc_action_set_weather',
        'mc_action_set_gamemode', 'mc_action_kick_player', 'mc_action_set_spawn_point',
        'mc_action_grant_permission', 'mc_action_run_console_command',
        'mc_action_set_join_message', 'mc_action_set_quit_message', 'mc_action_cancel_event',
      ]),
      cat('Sensing', SENSING_COLOR, [
        'mc_value_event_player', 'mc_value_event_message', 'mc_value_event_block',
        'mc_value_player_name', 'mc_value_player_health', 'mc_value_player_max_health', 'mc_value_player_food', 'mc_value_player_level',
        'mc_value_player_world_name', 'mc_value_player_x', 'mc_value_player_y', 'mc_value_player_z', 'mc_value_player_location',
        'mc_value_block_type', 'mc_value_online_count', 'mc_value_random_number', 'mc_value_player_by_name',
        'mc_value_has_permission', 'mc_value_is_sneaking', 'mc_value_is_op', 'mc_value_has_item',
        'mc_value_command_sender', 'mc_value_command_arg', 'mc_value_command_args_joined',
      ]),
      cat('Control', CONTROL_COLOR, [
        'controls_if', 'controls_repeat_ext', 'controls_whileUntil',
        'mc_action_wait_then', 'mc_action_repeat_every_ticks',
      ]),
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
