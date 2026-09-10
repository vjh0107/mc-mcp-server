# Protocol notes

Things this server has to do differently because of what mineflayer and the 26.1 protocol actually do. Each one was measured against a real server; each one can go away when upstream catches up.

## The resource pack reply

`src/bot/patches.ts` answers a resource pack offer with `resource_pack_receive` twice: result 3 (accepted), then result 0 (successfully loaded).

Without it a bot stalls in the configuration phase forever on any server that requires a pack. mineflayer raises an event and never answers, and `bot.acceptResourcePack()` cannot be used either: it sends the uuid as a uuid-1345 object rather than the string the server sent, which the server cannot read.

Nothing else needed patching to drive a 26.1 server behind a proxy. Play packets do not leak into the configuration phase, and mineflayer's settings plugin resends client settings on every login packet, which is exactly what a backend switch produces.

## Scoreboard and action bar are read from the packets

Reading what the server draws on screen is the point of those tools, and mineflayer delivers neither on 26.1.

**Scoreboard.** Since 1.20.3 the `scoreboard_score` packet has no `action` field and removal moved to `reset_score`, but mineflayer's handler still only adds an entry when `packet.action === 0` (`lib/plugins/scoreboard.js`). The title arrives and the numbers never do. `src/minecraft/scoreboard.ts` listens for `scoreboard_score` and `reset_score` itself; `read-scoreboard` prefers mineflayer's list whenever it has one.

**Action bar.** 26.1 sends a separate `action_bar` packet, while mineflayer only emits `actionBar` from a `system_chat` with `positionId === 2`, which is how it worked before 1.17 (`lib/plugins/chat.js`). The event never fires at all, so the bot session listens for the packet as well.

## Chat text arrives as NBT

Window titles, item names, lore, scoreboard entries and action bar text all come wrapped as prismarine-nbt, for example `{type:'compound', value:{text:{type:'string', value:'Shop Button'}}}`. A vanilla window title is a `translate` key wrapped the same way. `src/minecraft/text.ts` unwraps every shape, including plain chat components, JSON strings and bare strings.

## The SRV lookup is skipped in-cluster

minecraft-protocol looks up `_minecraft._tcp.<host>` before connecting whenever the port is 25565 and the host is not an IP. That is correct for a public domain, but in-cluster the record does not exist and CoreDNS answers SERVFAIL. With `ndots:5` and the search domains, the retries burn 11 to 17 seconds on every connection.

Skipping it for hosts ending in `.svc` or `.cluster.local` took a `ping-server` sweep of four servers from four timeouts to 699ms, and a join from about twelve seconds to 1.3. Public hostnames keep the lookup.

## Known limits

- **The target server has to be offline-mode.** The bots authenticate offline. They cannot join a proxy running online-mode, and connecting straight to a backend does not get past Velocity's modern forwarding either.
- **`player_info` packets carrying a large game profile property are dropped silently.** protodef fails to parse them and prints the stack to stdout, which would corrupt the stdio transport, so `hideErrors: true` is set. Player information in those packets can go missing.
- **Bots share one event loop.** Node is single-threaded, so every bot paths on the same thread. Measured on an idle flat world: 116 MiB with no bots, 157 with four, 206 with eight.
- **Joining bots faster than the server's connection throttle fails.** Paper refuses connections from the same address inside roughly four seconds of each other.
- **Use it inside a trust boundary.** In-game chat and command output flow into the LLM context. Responses are marked as data rather than instructions, but that alone does not stop prompt injection.
