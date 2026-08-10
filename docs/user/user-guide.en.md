# chicken-dinner-feed — User Guide

_Magyarul: [user-guide.hu.md](user-guide.hu.md)_

This guide is for the person operating the broadcast. It assumes no programming knowledge.

> **This version is in progress.** Installation, startup, the leaderboard overlay, the admin page,
> team logos and Stream Deck control all work as described. The live game connection still needs the
> real PCOB adapter — until then the app runs on simulated match data, so you can set everything up
> in advance.

---

## 1. What this application does

During a PUBG Mobile tournament broadcast, the PC Observer (PCOB) client produces live match data —
who is alive, how much health they have, how many eliminations they have. chicken-dinner-feed reads
that data and turns it into **overlays**: graphics you can place on top of your live video in OBS,
vMix or any broadcast tool that supports a browser source.

You control how those overlays look from a local **admin page** in your browser: colours, fonts,
sizes, placement, and how they animate in and out.

Everything runs on your own computer. Nothing is sent to the internet during a broadcast, and the
app keeps working if the venue's internet goes down.

## 2. Before you start

You need:

- **Windows** — the same computer that runs, or can see, the PCOB client.
- **Node.js version 22 or newer** — a free runtime. If it is not installed, download the **LTS**
  version from <https://nodejs.org/> and install it with the default options.
- **Internet access, once**, for the installation step only.

## 3. Installation

1. Download the release ZIP.
2. Unpack it to a folder you can find again — for example `C:\broadcast\chicken-dinner-feed`.
   **Do not** run it from inside the ZIP file.
3. Double-click **`install-dependencies.bat`**.
4. Wait. It can take a few minutes. When it finishes you will see
   `[OK] Done. You can now start the app with startup.bat`.
5. Press a key to close the window.

You only do this once per version. If you later download a newer release, run it again in the new
folder.

**If it fails:** the script tells you what went wrong in English and Hungarian. The two common causes
are Node.js not being installed, and no internet connection.

## 4. Starting the app

Double-click **`startup.bat`**.

A black console window opens and stays open, and your browser opens the admin page automatically.

> ⚠️ **Leave the console window open for the entire broadcast.** Closing it stops the app, and every
> overlay on your stream goes blank.

The addresses you will need:

| What       | Address                                                                      |
| ---------- | ---------------------------------------------------------------------------- |
| Admin page | `http://127.0.0.1:4317/admin`                                                |
| An overlay | `http://127.0.0.1:4317/overlay/<id>` — the admin gives you the exact address |

To stop the app, close the console window, or click into it and press `Ctrl+C`.

## 5. Connecting the game data

The match data comes from the PCOB client. Everything in this section happens **in PCOB**, not in
this app — but if any of it is missed, this app shows no data.

### Once per tournament: get the account whitelisted

This has to be done well in advance, not on the day.

1. Log in to the PCOB client, ideally with an email and password. An observer with no PUBG Mobile
   account can start the game on a phone, choose **Guest login**, then attach an email and password.
2. Run the provided `.bat` file and read out the **OPENID** number.
3. Send that OPENID to the publisher for **whitelisting**. **Without whitelisting there is no API
   data at all**, no matter what else is configured correctly.
4. Get **two accounts** whitelisted rather than one. If the first fails on the day, there is no time
   to request another.

### Before every match

1. The observer joins the lobby through the PCOB (ShadowTracker) client and switches to observer
   mode.
2. **Tick "API Enable" in the PCOB client before the match starts.** If this is forgotten, the app
   shows _no data_ even though everything else is working correctly. This is the single most common
   cause of an apparently broken overlay.
3. **Start the PCOB API.** Run `WinClient_OB_live\WinClient_OB\ObToolsNew\launch.bat` from a command
   prompt. It opens its own console window — **that window must also stay open**, or no data is
   produced.

Two things worth knowing, because they are not faults in this app:

- **If the room host disconnects, data stops.** The host must stay online, and should wait at least
  30 seconds after a match ends before leaving the room.
- **Data updates about every 2 seconds.** The overlay smooths the movement between updates so it
  looks continuous.

The admin page shows the connection state at all times:

| Indicator        | Meaning                                         | What to do                                                               |
| ---------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| **Connected**    | Data is arriving                                | Nothing                                                                  |
| **Stale**        | Connected, but nothing new has arrived recently | Check that the host is still in the room                                 |
| **Disconnected** | No connection to the PCOB API                   | Check the `launch.bat` window is still open and "API Enable" was clicked |

If it says **Disconnected** and the `launch.bat` window is open, the likely cause is that the
account was never whitelisted.

If the connection drops mid-match, the overlay **keeps showing the last data it received** rather
than going blank on air. It reconnects on its own when data returns.

## 6. Adding an overlay to your broadcast software

1. Open the admin page and go to **Overlays**. Select an overlay, then use the **Copy** button next
   to _Browser source address_ — retyping it by hand is a good way to end up with a blank source.
2. In OBS: **Sources → + → Browser**, paste the address, and set the width and height to your canvas
   size. **1920 × 1080, 2560 × 1440 and 3840 × 2160 are all supported** — the overlay scales itself
   and looks identical at each, so there is nothing to configure per resolution.
3. Untick **Shutdown source when not visible**, so the overlay stays connected while hidden.
4. The overlay has a transparent background, so it composites straight over your video.

Repeat for each overlay you want, giving each a different id. Multiple overlays are driven by the
same live data but are shown and hidden independently.

## 7. Controlling overlays from a Stream Deck (Bitfocus Companion)

Overlays can be animated on and off air from a hardware button. The app answers plain web addresses,
so anything that can make a web request works — Companion is just the usual one.

### The addresses

Replace `<id>` with the overlay instance id (the same one that appears in its browser-source
address):

| Address                                          | What it does                          |
| ------------------------------------------------ | ------------------------------------- |
| `http://127.0.0.1:4317/api/overlays/<id>/show`   | Animates the overlay on               |
| `http://127.0.0.1:4317/api/overlays/<id>/hide`   | Animates it off                       |
| `http://127.0.0.1:4317/api/overlays/<id>/toggle` | Flips it                              |
| `http://127.0.0.1:4317/api/overlays/<id>/state`  | Reports whether it is currently shown |

### Setting up a Companion button

1. Add a button and give it an action from the **Generic HTTP** module.
2. Choose **GET** and paste one of the addresses above.
3. That is the whole setup. A `toggle` button is usually the most useful; `show` and `hide` on
   separate buttons is safer when several people are operating.

Two things worth knowing:

- **Pressing a button twice is safe.** Pressing "show" on an overlay that is already showing does
  nothing — it will not restart the animation or make the overlay flicker on air.
- **Reloading a browser source keeps the current state.** An overlay that is hidden stays hidden
  when its browser source reloads; it will not flash on screen.

### If Companion runs on a different computer

By default the app only listens to the machine it is running on, so a Companion on another computer
cannot reach it. To allow it:

1. Open `backend\.env` in Notepad and change `HOST=127.0.0.1` to `HOST=0.0.0.0`.
2. In Companion, use the overlay machine's network address instead of `127.0.0.1`.

⚠️ **This also makes the admin page reachable by anyone on the same network**, and the admin has no
password. On a closed production network that is usually fine. If you want a little protection, set
`CONTROL_TOKEN=something-you-choose` in `backend\.env` and append `?token=something-you-choose` to
the addresses in Companion. That protects the show/hide buttons only, not the admin page.

## 8. Configuring overlays

Everything is on the admin page at `http://127.0.0.1:4317/admin`.

### Overlays tab

Select an overlay on the left, then adjust:

- **Placement** — which side of the screen, distance from that edge, whether it is centred
  vertically, and its size. Distances are given in 1080p pixels and mean the same thing at 1440p and
  4K.
- **Type and rows** — font, how many teams to show, whether the colour legend appears.
- **Colours** — the three player states (alive, knocked, eliminated), plus text and accent colours.
  The translucent panel backgrounds are under _Panel backgrounds_ and are edited as text so you can
  keep them see-through.
- **Show / hide animation** — direction, speed and easing.

⚠️ **Changes only reach your broadcast when you press Save.** The preview updates as you type.

Each overlay shows whether it is currently **ON AIR** or **HIDDEN**, both in the list on the left and
next to the show/hide button. That state is live: if someone presses a Stream Deck button, the admin
updates to match. Every action you take confirms itself with a short notification in the corner,
which fades on its own or can be dismissed with the ×.

The preview has two modes. **Full canvas** shows the whole 16∶9 frame — use it to judge placement.
**Actual size** renders at true 1080p pixels — use it to judge colours and whether names are
legible. The checkerboard stands in for your video, so you can see how translucent backgrounds look.

To make a second overlay — for example a light and a dark version driven by the same data — type an
id, then press either **Create** (starts from the defaults) or **Duplicate** (copies the look of the
overlay currently selected).

**An overlay id cannot be changed after it is created.** It is baked into your browser source and
Companion buttons, so renaming it would silently break them. Create a new overlay instead.

### Teams tab

Team names, short names and logos, by team number. **The number is the slot the game reports** — it
has to match the numbering the observer set up in `TeamLogoAndColor.ini`, or the wrong team's
players will appear on the wrong row. The short name is what the overlay prints.

**Start with Import TeamLogoAndColor.ini.** That is the file your observer already maintains for the
PCOB client, and importing it fills in every team number, name and logo in one step instead of
typing 16–25 rows by hand. It **replaces** the whole list, because that file is the team list for
the event. If a logo path in it no longer exists, the import says how many were missing rather than
leaving you to notice on air.

**Logos.** Click the square beside a team to pick an image; it uploads immediately and appears on air
straight away — no need to press Save for that. The small × removes it. PNG, JPEG, WebP and SVG are
accepted, up to 2 MB. Prefer **SVG** if you have it: overlays run at up to 4K and a vector logo is
the only kind that stays sharp there. Otherwise use at least 256 × 256. The chequered background
behind each logo is there so you can see which parts are transparent.

Everything except the logos needs **Save teams**.

### Scoring tab

**Points are calculated by this app, not by the game.** The PCOB API supplies no tournament points
at all, so this must match your tournament's rules — check it before every event.

- **Points per elimination** — added for every kill the team gets.
- **Placement points** — awarded when a team is eliminated, or when the match ends. A team still
  playing has not placed yet and scores nothing here. Positions past the end of the list score zero.

The default is the standard PUBG Mobile table (10/6/5/4/3/2/1/1, 1 point per kill).

Saving takes effect immediately, including mid-match.

## 9. Your settings

Your configuration is stored as files in the **`backend\data`** folder inside the app folder.

- **To back up:** copy that folder somewhere safe.
- **To move to another computer:** install the app there, then copy your `backend\data` folder over.
- **When upgrading:** unpack the new version to a _new_ folder, then copy your old `backend\data`
  into it before starting.

## 10. Troubleshooting

**"Port 4317 is already in use"**
The app is probably already running. Look for another console window and close it. If the port is
taken by unrelated software, open `backend\.env` in Notepad and change `PORT=4317` to another number,
for example `PORT=4400`. Your overlay addresses change to match.

**The overlay is blank in OBS**
Check, in order: is the console window still open; does the admin page load in a browser; is the
address in OBS exactly what the admin shows; is the browser source large enough.

**The overlay shows data but it is frozen**
The connection to PCOB has probably dropped — the admin will show _Stale_ or _Disconnected_. Check
the `launch.bat` window and whether the room host is still connected.

**No data at all, though everything looks fine**
In order of likelihood: **"API Enable" was not clicked** in PCOB before the match started; the
`launch.bat` console window was closed; or the observer's **account was never whitelisted** by the
publisher. The last one cannot be fixed on the day — see section 5.

**The browser did not open on startup**
Not a problem. Open a browser yourself and go to `http://127.0.0.1:4317/admin`.

## 11. Getting help

When reporting a problem, include:

- the version number, from the admin page;
- what the admin's connection indicator said;
- the text in the console window, if there is an error;
- the room ID and the approximate time.
