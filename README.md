# The Hangout

start.ng's own game: an open park where everyone who's signed in can hang out together. It lives at **https://hangout.start.ng**.

- **Your avatar is your start.ng character**, the same 3D person as on your start.ng profile, with your start.ng name above your head.
- **Multiplayer:** everyone in the Hangout sees each other walk around, live.
- **Wave** with Space. More interactions can be added next to it.
- Signing in with start.ng is required to come in.

Controls: **WASD** or arrows to walk, **Shift** to run, **drag** to look around, **scroll** to zoom, **Space** to wave.

## How it works

| File | What it does |
| --- | --- |
| `src/main.js` | The game: camera, controls, avatars, name tags, sending your moves |
| `src/character.js` | The start.ng character (a copy of startng-fe `src/three/human.ts`) plus walking, and start.ng's starting look for accounts without a character |
| `src/world.js` | The park: grass, sun, trees, flowers, path and benches, from a fixed seed so everyone sees the same park |
| `src/net.js` | The live room connection, reconnecting when it drops |
| `src/platform.js` | Talks to start.ng: who is signed in, and a ticket into the live room |

1. The game asks start.ng's hidden `/connect` page who is signed in.
2. It asks `/connect` for a **one-minute ticket** (`startng:ticket`). start.ng gets it from `POST /games/hangout/ticket` with the player's sign-in. The game never sees the sign-in itself, and a ticket only opens this game's live room.
3. It opens the WebSocket `wss://api.start.ng/games/hangout/live?ticket=…`. The server attaches the player's real name and look, so nobody can pretend to be someone else.
4. Each player sends their position about 10 times a second while moving, plus waves. The server passes them on to everyone else, and the game smooths the movement. The message format is in startng-be `app/live.py`.

A player with the Hangout open in two tabs is only in the room once: the newest tab wins, and the other offers "Play here".

## Run locally

This needs the start.ng back end and front end running, with start.ng at `http://start.localhost:5173`, and the Worker's `dev-server.js` serving this folder as `hangout` at `http://hangout.start.localhost:8787`. The back end also needs a `hangout` game; publishing it creates one.

It's plain HTML and JavaScript with three.js from a CDN, so there's no build step.
