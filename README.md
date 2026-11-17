# Gerry Berry

A single-player maze-chase game for the browser. Static files, vanilla JavaScript modules and a canvas. No build step, no runtime dependencies, nothing leaves your browser.

## Play in the browser

**Play online: <https://gerdschaeffer.github.io/gerry-berry/>**

To run it locally instead, you need a current Chromium or Firefox and any way to serve the folder over HTTP. Opening `index.html` straight from disk usually fails, because the game uses ES modules.

```sh
git clone https://github.com/gerdschaeffer/gerry-berry.git
cd gerry-berry
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8000/>. Press Enter on the title screen to start. The first key press also unlocks the sound.

## Controls

| Key | Action |
|---|---|
| Arrow keys or WASD | move |
| P | pause or resume (the game also pauses when the tab is hidden and stays paused until you press P) |
| M | mute on the title and game screens (remembered) |
| Enter | start a game, confirm initials |
| Letters, digits, Up/Down, Left/Right, Backspace | enter your initials after a highscore |

### Touch

The whole screen is the touch area, so you can swipe anywhere, not only on the maze.

| Gesture | Action |
|---|---|
| swipe | move (keep your finger down and swipe again to turn) |
| tap | start a game, pause or resume, confirm initials |
| swipe up/down on the initials screen | change the letter |
| swipe left/right on the initials screen | move to the next or previous slot |
| tap the SOUND line on the title screen | mute |

After game over the game returns to the title screen, via the initials screen if you made the top ten.

Tests: `node --test`

## Highscores

The best ten scores (three initials, A-Z and 0-9, and a score) and the mute setting are stored in your browser's `localStorage` under `maze-muncher.scores` and `maze-muncher.muted`. Stored scores are checked on load, and entries that do not fit the format are dropped. If storage is unavailable, the screen shows SCORES NOT SAVED and scores last for the session only.

## License

Copyright (c) 2026 Gerd Schäffer. Released under the [MIT License](LICENSE).

The game follows the rules and numbers of the classic arcade maze chase. The maze layout, graphics, sounds and title are original, and no arcade assets are used. Gerry Berry is not affiliated with or endorsed by Bandai Namco.
