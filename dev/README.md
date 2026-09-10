# Test server

A Minecraft server to run the tools against. Offline-mode, flat world, with the bot opped and in creative. Do not run it outside a dev environment.

```bash
docker compose -f dev/compose.yml up -d
```

It publishes **25577**, not 25565, because 25565 is often already taken. Override with `MC_PORT`.

```bash
MCP_AUTH_TOKEN=devtoken node dist/main.js --port 3399 --bind-host 127.0.0.1
```

Joining as `probe` gives the username `mcp_probe`, which compose ops at startup. Use `BOT_USERNAME` to match a different name.

```
join-server(name: "probe", host: "127.0.0.1", port: 25577)
run-command(command: "/gamemode creative")
```

The world is flat at `y=-60` with structures and mob spawning off, so the pathfinder does not get stuck and a check cannot be skewed by terrain.

To exercise the GUI tools, place a chest and put a named item in it:

```
run-command(command: "/setblock ~2 ~ ~ chest")
run-command(command: "/item replace block <x> <y> <z> container.13 with diamond[custom_name={text:'Shop Button',color:gold},lore=[{text:'Click to buy'}]] 5")
wait-ticks(ticks: 40)
open-container(x: <x>, y: <y>, z: <z>)
```

Chunks are not loaded the instant a bot joins. Call `wait-ticks` once before any tool that takes coordinates.

```bash
docker compose -f dev/compose.yml down -v
```
