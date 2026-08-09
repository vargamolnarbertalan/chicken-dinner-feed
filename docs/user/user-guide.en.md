# chicken-dinner-feed — User Guide

_Magyarul: [user-guide.hu.md](user-guide.hu.md)_

This guide is for the person operating the broadcast. It assumes no programming knowledge.

> **This version is a scaffold.** Installation and startup work as described below. The overlay and
> admin screens are still being built, so the sections marked _Coming soon_ describe what is planned
> rather than what you can click today.

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

_Coming soon — the exact steps will be finalised with the first overlay._ The approach:

1. Create an overlay instance in the admin and copy its address.
2. In OBS: **Sources → + → Browser**, paste the address, and set the width and height to your canvas
   size. **1920 × 1080, 2560 × 1440 and 3840 × 2160 are all supported** — the overlay scales itself
   and looks identical at each, so there is nothing to configure per resolution.
3. Tick **Shutdown source when not visible** off, so the overlay stays connected while hidden.
4. The overlay has a transparent background, so it composites straight over your video.

Repeat for each overlay instance. Multiple instances of the same overlay type — for example a light
and a dark version, or a branded and a generic version — are driven by the same live data and can be
configured independently.

## 7. Configuring overlays

_Coming soon._ Planned controls, per overlay instance:

- colours, fonts and font sizes;
- size and position on the canvas;
- show and hide animations, with adjustable speed;
- team names and logos;
- the scoring ruleset — placement points per rank and points per elimination.

Every change is shown in a **live preview** that renders the real overlay, so what you see is exactly
what goes on air.

**Points are calculated by this app, not by the game.** The PCOB API does not supply tournament
points, so the scoring ruleset must match your tournament's rules. Check it before a broadcast.

## 8. Your settings

Your configuration is stored as files in the **`backend\data`** folder inside the app folder.

- **To back up:** copy that folder somewhere safe.
- **To move to another computer:** install the app there, then copy your `backend\data` folder over.
- **When upgrading:** unpack the new version to a _new_ folder, then copy your old `backend\data`
  into it before starting.

## 9. Troubleshooting

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

## 10. Getting help

When reporting a problem, include:

- the version number, from the admin page;
- what the admin's connection indicator said;
- the text in the console window, if there is an error;
- the room ID and the approximate time.
