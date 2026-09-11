# Tools

Generated from the code by `pnpm docs:tools`. Do not edit by hand.

## Sessions

### `join-server`

Connect a new bot to a Minecraft server and keep it online until leave-server is called. The bot survives MCP session restarts, so reuse it instead of joining again.

Arguments:

  - `name` (string, required) — Name used to address this bot in other tools
  - `host` (string, required) — Server host or Kubernetes service name to connect to
  - `port` (integer, optional) — Server port (default: 25565)
  - `username` (string, optional) — In-game username (default: derived from name)
  - `version` (string, optional) — Force a protocol version instead of auto-detecting
  - `owner` (string, optional) — Free-form label recording who asked for this bot. Defaults to the authenticated caller.

### `leave-server`

Disconnect a bot and forget it.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.

### `list-bots`

List every bot this server currently holds, including bots joined by other agents.

Takes no arguments.

### `get-bot-status`

Report connection state, position and health for one bot.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.

## Server checks

### `ping-server`

Send a Minecraft server list ping and report version, protocol, player count and MOTD. Use it to check a server is up and speaks a version we can join before spending a bot slot.

Arguments:

  - `host` (string, required) — Server host
  - `port` (integer, optional) — Server port (default: 25565)
  - `timeoutMs` (integer, optional) — How long to wait for the answer (default: 3000)

## Server interaction

### `run-command`

Run a slash command as the bot and return the messages the server sent back.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `command` (string, required) — Command with or without the leading slash
  - `collectMs` (integer, optional) — How long to collect the reply before returning (default: 1000)

### `switch-server`

Send the bot to another backend server through the proxy and wait until it spawns there.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `target` (string, required) — Backend server name the proxy knows
  - `timeoutMs` (integer, optional) — Give up after this long (default: 30000)

### `wait-for-chat`

Wait until a message matching a regular expression arrives. Only messages received after the call count.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `pattern` (string, required) — JavaScript regular expression source
  - `timeoutMs` (integer, optional) — How long to wait (default: 10000)

### `wait-ticks`

Wait a number of server ticks so the server has time to apply a change.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `ticks` (integer, required) — How many ticks to wait (20 ticks is one second)

### `detect-gamemode`

Report the game mode the server assigned to the bot.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.

### `complete-command`

Ask the server what completes a partial command, which is how to find out what a plugin offers without being told. "/" lists every command the bot may run.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `text` (string, required) — The partial command, for example "/is "
  - `timeoutMs` (integer, optional) — How long to wait for the answer (default: 5000)
  - `limit` (integer, optional) — How many completions to show (default: 60)

## Movement

### `get-position`

Report the block position the bot currently stands on.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.

### `move-to-position`

Walk the bot to a position using pathfinding.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `x` (number, required) — X coordinate
  - `y` (number, required) — Y coordinate
  - `z` (number, required) — Z coordinate
  - `range` (number, optional) — How close to get (default: 1)
  - `timeoutMs` (integer, optional) — Give up after this long (default: 60000)

### `look-at`

Turn the bot to face a position.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `x` (number, required) — X coordinate
  - `y` (number, required) — Y coordinate
  - `z` (number, required) — Z coordinate

### `jump`

Make the bot jump once.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.

### `move-in-direction`

Hold a movement key for a while. Use this when pathfinding is not wanted.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `direction` (`forward` | `back` | `left` | `right`, required) — Direction to move
  - `durationMs` (integer, optional) — How long to hold the key (default: 1000)

### `fly-to`

Fly straight to a position. Requires creative mode.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `x` (number, required) — X coordinate
  - `y` (number, required) — Y coordinate
  - `z` (number, required) — Z coordinate

## World interaction

### `activate-block`

Right-click the block at a position, walking to it first when out of reach. Presses buttons and levers, opens doors, and triggers custom blocks.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `x` (number, required) — X coordinate
  - `y` (number, required) — Y coordinate
  - `z` (number, required) — Z coordinate

### `interact-entity`

Right-click the nearest entity whose name matches, walking to it first when out of reach. This is what opens an NPC dialogue.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `name` (string, required) — Entity name or part of a player name, for example villager or Steve
  - `maxDistance` (number, optional) — Search radius (default: 8)

### `attack-entity`

Attack the nearest entity whose name matches, walking to it first when out of reach.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `name` (string, required) — Entity name or part of a player name, for example villager or Steve
  - `maxDistance` (number, optional) — Search radius (default: 8)
  - `times` (integer, optional) — How many swings to land (default: 1, at most 20)

### `use-held-item`

Right-click with the item the bot is holding, optionally holding the button down for a while.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `offhand` (boolean, optional) — Use the off-hand item instead of the main hand (default: false)
  - `holdMs` (integer, optional) — How long to keep the button down before releasing, for bows and the like (default: 0)

### `fish`

Cast the rod and wait for a bite, then reel in. Equips a fishing rod from the inventory if one is not already in hand. The bot has to be standing within reach of water.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `timeoutMs` (integer, optional) — How long to wait for a bite (default: 60000)

## GUI windows

### `wait-for-window`

Wait until a GUI window opens and return its contents. Returns straight away if a matching window is already open.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `titlePattern` (string, optional) — JavaScript regular expression the window title must match (default: any window)
  - `timeoutMs` (integer, optional) — How long to wait (default: 10000)

### `read-window`

Read every filled slot of the GUI window the bot currently has open.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.

### `close-window`

Close the GUI window the bot currently has open.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.

## Slots and containers

### `click-slot`

Click one slot of the window that is currently open.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `slot` (integer, required) — Slot number as listed by the window contents
  - `button` (`left` | `right`, optional) — Which mouse button to press (default: 'left')
  - `shift` (boolean, optional) — Shift-click, which moves the whole stack across the window (default: false)

### `open-container`

Open the chest-like block at a position, walking to it first when out of reach, and list what it holds.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `x` (number, required) — X coordinate
  - `y` (number, required) — Y coordinate
  - `z` (number, required) — Z coordinate

### `drop-held-item`

Drop whatever the cursor is holding, or the stack in a given slot. The window stays open.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `slot` (integer, optional) — Slot to empty onto the ground. Omit it to drop what the cursor holds.

## Inventory

### `list-inventory`

List every item in the bot's inventory with slot numbers.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.

### `find-item`

Look for an item in the bot's inventory by exact or partial name.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `nameOrType` (string, required) — Item name or a fragment of it

### `equip-item`

Equip an item from the inventory.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `itemName` (string, required) — Item name or a fragment of it
  - `destination` (`hand` | `head` | `torso` | `legs` | `feet` | `off-hand`, optional) — Where to equip it (default: 'hand')

### `give-item`

Put an item straight into the inventory. Creative mode only, which is what makes it useful: a test can start from the state it needs instead of gathering its way there.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `itemName` (string, required) — Exact item name, for example diamond_pickaxe
  - `count` (integer, optional) — How many (default: 1)
  - `slot` (integer, optional) — Inventory slot to fill (default: the first empty one)

## Blocks

### `get-block-info`

Describe the block at a position.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `x` (number, required) — X coordinate
  - `y` (number, required) — Y coordinate
  - `z` (number, required) — Z coordinate

### `find-blocks`

Find nearby blocks of a given type.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `blockType` (string, required) — Block name, for example oak_log
  - `maxDistance` (number, optional) — Search radius (default: 16)
  - `count` (integer, optional) — How many to return (default: 1, clamped to 256)

### `dig-block`

Break the block at a position, walking to it first when out of reach.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `x` (number, required) — X coordinate
  - `y` (number, required) — Y coordinate
  - `z` (number, required) — Z coordinate

### `place-block`

Place the held block at a position, using an adjacent block as reference.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `x` (number, required) — X coordinate
  - `y` (number, required) — Y coordinate
  - `z` (number, required) — Z coordinate
  - `faceDirection` (`down` | `up` | `north` | `south` | `east` | `west`, optional) — Which neighbouring face to try first (default: 'down')

### `read-block-entity`

Read the data a block carries beyond its type: sign text, a container's custom name, a banner's pattern. Signs are the common case, since that is where servers write instructions into the world itself.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `x` (number, required) — X coordinate
  - `y` (number, required) — Y coordinate
  - `z` (number, required) — Z coordinate

## Entities

### `find-entity`

Find nearby entities, optionally filtered by type or name.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `type` (string, optional) — "player", "mob", or part of an entity name. Omit to match anything.
  - `maxDistance` (number, optional) — Search radius (default: 16)
  - `count` (integer, optional) — How many to return (default: 1)

## Chat

### `send-chat`

Say something in chat as the bot. Use run-command for slash commands.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `message` (string, required) — Text to say

### `read-chat`

Read recent chat and system messages the bot received.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `count` (integer, optional) — How many recent lines to return (default: 20)

## HUD

### `read-scoreboard`

Read the scoreboard the server draws on screen, which most servers use for stats and quest progress.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `slot` (`sidebar` | `list` | `belowName`, optional) — Which display slot to read (default: 'sidebar')

### `read-boss-bars`

Read every boss bar the server is showing above the hotbar.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.

### `read-player-list`

List the players on the tab list, with their game mode and ping.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.

### `read-action-bar`

Read the action bar text above the hotbar, which servers use for live status. Repeats are collapsed, so each line is a change. A HUD drawn in custom fonts arrives as several pieces separated by " | ", each tagged with the font that names it.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `count` (integer, optional) — How many recent lines to return (default: 5)

### `wait-for-action-bar`

Wait until the action bar shows text matching a regular expression. Returns straight away if it already says so.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `pattern` (string, required) — JavaScript regular expression source
  - `timeoutMs` (integer, optional) — How long to wait (default: 10000)

### `read-title`

Read the titles and subtitles the server has thrown across the screen, which is where servers put things the player must not miss. Repeats are collapsed, so each line is a change. A HUD drawn in custom fonts arrives as several pieces separated by " | ", each tagged with the font that names it.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `count` (integer, optional) — How many recent lines to return (default: 5)

### `wait-for-title`

Wait until a title or subtitle matching a regular expression is shown. Returns straight away if it already says so.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `pattern` (string, required) — JavaScript regular expression source
  - `timeoutMs` (integer, optional) — How long to wait (default: 10000)

### `get-player-state`

Report the health, hunger, experience and position the bot sees for itself.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.

## Crafting

### `list-recipes`

List recipes the bot can craft right now with what it carries. Pass outputItem to inspect one item instead of scanning everything.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `outputItem` (string, optional) — Restrict the list to this item

### `get-recipe`

Show every recipe for an item together with what the bot still needs.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `itemName` (string, required) — Item to look up

### `can-craft`

Check whether the bot can craft an item right now.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `itemName` (string, required) — Item to check

### `craft-item`

Craft an item, walking to a nearby crafting table when the recipe needs one.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `outputItem` (string, required) — Item to craft
  - `amount` (integer, optional) — How many times to craft (default: 1)

## Smelting

### `smelt-item`

Load a furnace, blast furnace or smoker with fuel and input, then optionally wait for the output.

Arguments:

  - `bot` (string, optional) — Bot name given to join-server. Optional while exactly one bot is connected.
  - `x` (number, required) — X coordinate
  - `y` (number, required) — Y coordinate
  - `z` (number, required) — Z coordinate
  - `inputItem` (string, required) — Item to smelt
  - `inputCount` (integer, optional) — How much input to load (default: 1)
  - `fuelItem` (string, required) — Item to burn as fuel
  - `fuelCount` (integer, optional) — How much fuel to load (default: 1)
  - `takeOutput` (boolean, optional) — Wait for the result and collect it (default: true)
  - `timeoutMs` (integer, optional) — How long to wait for the result (default: 60000)
