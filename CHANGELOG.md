# Changelog

Versions follow [semantic versioning](https://semver.org). While the major version is 0:

- **minor** when a tool is added or removed, when one takes different arguments or answers in a
  different shape, or when a chart default changes how a deployment behaves.
- **patch** for a fix, a document, or anything that leaves the surface alone.

`package.json` holds the version. The chart carries the same one, the published tag is built from
it, and CI refuses a change to anything that ships unless the version went up.

## 0.3.1

### Fixed

- `read-dialog` never saw a dialog. `show_dialog` wraps the definition in a registry entry holder,
  so the NBT sits under `data`; passing the holder to the parser yielded nothing and the read of
  the title threw, which the bot reported as an error and swallowed. An NBT list of one also
  arrives as a bare compound, so a dialog with a single line of body or a lone button was read as
  having neither. Confirmed against Paper 26.1.2 in `dev/compose.yml`: a two-line, two-button
  dialog now reads `Notice | Cast from the bank only / Bait required | buttons: Got it, Later`.

## 0.3.0

### Added

- `get-world-state`. The vanilla clock and weather, for a feature that only happens at a certain
  time of day. A server running its own calendar draws that on the HUD instead.
- `get-bot-status` reports `serverBrand`. Behind a proxy that is the only thing naming the backend
  the bot actually landed on, and a proxy that rewrites its brand says more still. Finding out
  otherwise meant asking each candidate server whether it had the bot.

### Fixed

- The development instructions started the server with flags that no longer exist, so following
  them printed usage instead of running anything.

## 0.2.0

### Added

- `read-title` and `wait-for-title`. Servers put what a player must not miss on the title.
- `read-displays`. Name tags, holograms and NPC labels are display entities, and `find-entity`
  could only report that one was there.
- `read-dialog` and `wait-for-dialog`. `show_dialog` is new in 26.1 and mineflayer does not know
  it. Reading is all that is on offer, because the packet that answers a dialog carries no field
  definition in the protocol data and cannot be sent.
- `read-effects` and `wait-for-effect`. Sounds and particles, for feedback that never becomes
  words on screen.
- `fish`. Equips a rod, casts, and reels in on the bite, with a bounded wait.
- `complete-command`. Asks the server what completes a partial command, tooltips included.
- `give-item`. Creative only, so a test can start from the state it needs.
- `read-block-entity`. Sign faces, container names, banner patterns.
- `set-stance`. Crouching and sprinting, which were only ever set inside other tools.
- The chart generates an auth token when none is given and reads it back on upgrade, so the value
  survives. `auth.generate` turns it off.

### Changed

- Text keeps its pieces apart. A HUD drawn in custom fonts used to flatten to one string, which
  turned a health bar, a food bar and two currencies into `20/2020/2000`. Action bars, boss bars,
  titles, signs and displays now arrive as segments joined with ` | ` and tagged with their font.
- A death is written into the message log.

### Fixed

- The pod restarts when a generated token changes. The checksum annotation hashed the value from
  the values file, which is empty whenever the chart is the one making the token.
- Tab completions read their `match` field instead of printing `[object Object]`.
- `prismarine-nbt` is a direct dependency, which pnpm's layout requires for our own imports.

## 0.1.0

First release. 47 tools over a Streamable HTTP endpoint, a Helm chart, and a bot registry whose
lifetime is separate from the MCP session's.
