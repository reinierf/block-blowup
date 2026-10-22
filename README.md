# Block Blowup

A mobile-first block puzzle game closely modelled on Block Blast!, built as an installable
PWA. Drag blocks from a hand of three onto an 8×8 grid; fill a row or column to clear it;
chain clears for combo bonuses; play until nothing fits.

Personal project. Forked from the MIT-licensed
[SSWheatley/block_blast](https://github.com/SSWheatley/block_blast).

![Gameplay](docs/screenshot.png)

## Run it

```bash
npm install
npm run dev        # http://localhost:5173, also reachable from a phone on the same network
```

Other scripts: `build`, `preview`, `test`, `coverage`, `typecheck`, `lint`, `format`, `e2e`,
`e2e:visual`, `sim`, `lighthouse`, `icons`. See [`AGENTS.md`](AGENTS.md).

It is an installable PWA: open it in Chrome (Android) or Safari (iOS) and use "Install" /
"Add to Home Screen". It works offline and resumes a game after the app is closed.

## How to play

1. Drag one of the three blocks at the bottom onto the board.
2. A **green** preview means the spot is legal; **red** means it's blocked.
3. Fill an entire **row or column** to clear it and score points.
4. Clear on **consecutive moves** to build a combo multiplier.
5. The game ends when none of your remaining blocks fit anywhere.

## Documentation

- [`AGENTS.md`](AGENTS.md): orientation, commands, conventions.
- [`HANDOVER.md`](HANDOVER.md): research, specs and the phased plan.
- [`docs/plan.md`](docs/plan.md): phase progress.
- [`docs/game-design.md`](docs/game-design.md): how the game actually works.

## License

[MIT](LICENSE).
