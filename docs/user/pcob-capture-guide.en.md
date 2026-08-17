# Capturing real PCOB data — step by step

_Magyarul: [pcob-capture-guide.hu.md](pcob-capture-guide.hu.md)_

The ingestion adapter is currently written against vendor PDFs that contradict each other
([`specs/PCOB-API.md`](../../specs/PCOB-API.md) §2). **One capture from a real match settles every
open question at once.** This is how to get it.

Read [§1](#1-what-you-need-and-who-has-to-give-it-to-you) before booking anything: two thirds of
what you need has to come from Esport1 and Tencent, and the lead time on it is not yours to control.

---

## 1. What you need, and who has to give it to you

| #   | Thing                                  | Comes from                         | Can you get it yourself? |
| --- | -------------------------------------- | ---------------------------------- | ------------------------ |
| 1   | PC OB client, v4.3.0 (three files)     | Esport1's Google Drive             | No — ask Zsófi           |
| 2   | A PUBG Mobile account for the observer | You, or Esport1                    | Yes                      |
| 3   | **The OPENID whitelisted by Tencent**  | Tencent, requested through Esport1 | **No**                   |
| 4   | A tournament room card (CD-KEY)        | Tencent, through Esport1           | No                       |
| 5   | A phone with PUBG Mobile, to host      | You                                | Yes                      |
| 6   | A few players to join the room         | You and colleagues                 | Yes                      |

**Item 3 is the hard gate.** Without whitelisting there is no API data at all — the client runs, the
match plays, and the endpoint returns nothing useful. It is also the one with an unknown lead time,
because it goes to the publisher.

So **step zero is one email to Zsófi** asking for items 1, 3 and 4, and mentioning that a small
internal test room is enough — you are not asking for a tournament slot.

### "Do I need PUBG Mobile on the Windows PC?"

No, and yes.

- **You do not install the normal PUBG Mobile game on Windows.** The PC OB client _is_ a PUBG Mobile
  build — `ShadowTrackerExtra.exe`. Installing that is installing what you need.
- **You do need PUBG Mobile on a phone**, because of one hard restriction in the guideline:
  _"Only mobile devices can create tournament custom rooms, PC OBs just able to join the room."_
  An Android emulator also works as the host; the guideline permits _"a mobile client or Emulator"_.

So the minimum setup is **one Windows PC** (observer, and where our app runs) **plus one phone**
(host). The players can be on any phones.

### "Do I log in on the phone with the same account as on the PC?"

**No — and you cannot.** The two accounts play different roles and must be **in the room at the same
time**:

| Where              | Role                             | What it needs                          |
| ------------------ | -------------------------------- | -------------------------------------- |
| PC — ShadowTracker | **Observer** — joins and watches | this is the **whitelisted** one        |
| Phone              | **Host** — creates the room      | this one holds the **tournament card** |

One PUBG Mobile account cannot be signed in on two devices at once; the second would kick the first
off. Since the host has to be present _while_ the observer joins, that makes them physically **two
separate accounts**. The guideline says as much: _"DO NOT use PC OB to be the host"_ — if the PC OB
is the host and it crashes, the whole match crashes with it.

**The host can also be one of the players**, so it does not need an account of its own.

---

## 2. Three levels of test — do the cheap one first

| Level | What it needs                            | What it answers                                                      |
| ----- | ---------------------------------------- | -------------------------------------------------------------------- |
| **1** | PCOB installed and running. No match.    | Do the endpoints answer at all? What are the envelope keys?          |
| **2** | A custom room with a handful of players. | **Everything we need.**                                              |
| **3** | A full 16 × 4 rehearsal.                 | Nothing extra for us — this is a broadcast rehearsal, not a capture. |

**Level 2 is the target.** A leaderboard does not care whether there are 8 players or 64; the field
names, the enum values and the identifiers are identical either way. Do not wait for a real
tournament.

**Do Level 1 the day the client is installed.** It costs ten minutes, needs no room and no other
people, and it may already answer the single biggest question — whether the payload envelope is
called `TotalPlayerList` or `playerInfoList`.

---

## 3. Install the PC OB client

On the Windows PC that will be the observer.

> **What follows is based on the actual contents of the v4.3.0 package**
> (`Win64_Release4.3.0_No14_4.3.0.20920_Shipping_OB_Shelled`), not on the guideline's generic
> description. **They differ in several places** — where they do, the package is right, and it is
> called out.

The unpacked package root contains exactly two folders:

```
<package>\
  ObToolsNew\        <- the API server (node.exe + ob.js + launch.bat)
  WindowsNoEditor\   <- the client itself
```

1. **Extract** the `.7z`. It is ~47 GB across 6,500 files — check you have the room.

2. **The patch.** The guideline says to drop a separately downloaded `.pak` into
   `%LOCALAPPDATA%\ShadowTrackerExtra\Saved\Paks`. **There is no such `.pak` in this package**
   (only the engine's own CEF resources). Either 4.3.0 already includes it or it has to be requested
   separately — **ask Zsófi** rather than guessing.

3. **Start the client from the right place:**

   ```
   <package>\WindowsNoEditor\ShadowTrackerExtra\Binaries\Win64\ShadowTrackerExtra.exe
   ```

   right-click → **Run as administrator**.

   > ⚠️ There is a second `ShadowTrackerExtra.exe` directly under `\WindowsNoEditor`. The size
   > difference gives it away: **0.2 MB** (a launcher) versus **97.2 MB** (the real client). The
   > guideline says the former will not work, and the size confirms it.

4. **Install the legacy DirectX 9 runtime — on a clean Windows 11 this is not optional.**

   The guideline frames it as "if you get a missing-DLL error". In practice you **will**: Windows 11
   ships DirectX 12 but never installs the old D3DX / XAudio / X3DAudio DLLs. Checked on a fresh
   machine, **none** of them were present — no `x3daudio1_7.dll`, no `d3dx9_43.dll`, no
   `xinput1_3.dll`, no `xactengine3_7.dll`.

   The error looks like this:

   ```
   Error code [126]: Failed to load x3daudio1_7.dll, the file is missing or corrupt!
   ```

   **The fix, and the trap inside it:**

   1. Download the official offline package:
      [`directx_Jun2010_redist.exe`](https://download.microsoft.com/download/8/4/A/84A35BF1-DAFE-4AE8-82AF-AD2AE20B6B14/directx_Jun2010_redist.exe)
      (~96 MB)
   2. Run it. **It does not install — it only extracts.** It asks for a folder, unpacks, and exits.
      This is where people conclude it failed.
   3. Go into that folder and run **`DXSETUP.exe`**. **That is what actually installs.**
   4. Verify: `Test-Path C:\Windows\System32\x3daudio1_7.dll` → `True`

   > ⚠️ **Do not download individual DLLs from "dll download" sites.** They are the top search
   > results for this error and routinely serve malware.
   >
   > ⚠️ **`winget install Microsoft.DirectX` is not enough.** Tried it: it reports "Successfully
   > installed" and shows up in `winget list`, but installs **no DLLs at all** — the package is the
   > web installer, which exits silently in a non-interactive shell. Use the offline package.

   If a `.dll` error points at Visual C++ instead, you also need
   [Microsoft Visual C++ 2010 Redistributable](https://www.microsoft.com/en-us/download/details.aspx?id=48145).

5. **Log in with email and password**, not as a guest. If the observer account has no PUBG Mobile
   identity yet: start the game on a phone, choose **Guest login**, then attach an email and
   password to it.
6. **Change the client language** from Chinese to English (guideline §11-II). Everything below
   assumes English labels.

> **If the client crashes right after login**, the guideline offers one remedy, quoted verbatim
> because it is written ambiguously in the source: set a new user environment variable with the
> value `~0x200000200000000` (Control Panel → System → Advanced System Settings → New User
> Variable), then restart the computer. It does not say what to name the variable. If you hit this,
> ask Zsófi rather than guessing.

---

## 4. Get the OPENID whitelisted

This is the step with the lead time. Start it the moment the client runs.

The package ships **two** such `.bat` files, and they do different things:

| File                      | Where                                                | What it does                                          |
| ------------------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| `SearchOpenID.bat`        | `WindowsNoEditor\ShadowTrackerExtra\Binaries\Win64\` | Launches the client onto the login screen with `-log` |
| `get_facebook_openid.bat` | `ObToolsNew\`                                        | **Prints the OPENID**, after you have logged in       |

So the order is: log into the client first, **then** run `get_facebook_openid.bat`.

Reading that second file shows where it gets the number from — which is the fastest route if the
`.bat` misbehaves:

```
%LOCALAPPDATA%\ShadowTrackerExtra\Saved\token.txt
```

A single comma-separated line, with the **OPENID as the third field**. If the `.bat` will not run,
open this in Notepad and read it out by hand.

> The file **does not exist yet** — the client has never logged in on this machine. The first
> successful login creates it, which also makes it the simplest check that the login actually
> worked.

1. Log into the client.
2. Run `ObToolsNew\get_facebook_openid.bat` and read the **OPENID** number.
3. Send it to Zsófi, who forwards it to the publisher for whitelisting.
4. **Do two accounts, not one.** If one fails on the day there is no time to request another.

Until this is done, everything below will run but produce no data.

### "What is the OPENID for, if the account is already whitelisted?"

**The OPENID _is_ the whitelist identifier** — it is not a separate step. It is what you sent, and
what the publisher added to the allowed list. If the account is already whitelisted, **this section
is done; skip it.**

One use remains, and it matters: **checking that you are signed in as the right account.** Open this
file and take the **third field**:

```
%LOCALAPPDATA%\ShadowTrackerExtra\Saved	oken.txt
```

Compare it against the OPENID you originally sent for whitelisting. If they differ, you are logged
in as the wrong account — which is exactly the fault that later presents as "everything runs but no
data arrives", with nothing visibly wrong.

> The same kind of identifier appears in the API payload as `playerOpenId`, for players.

---

## 5. Level 1 — check the API answers, with no match at all

Ten minutes, no room needed. Do this as soon as the client is installed.

1. Start the PCOB client and log in.
2. **Tick "API Enable"** in the client.
3. Open a command prompt and run:

   ```
   <package>\ObToolsNew\launch.bat
   ```

   > ⚠️ **The guideline prints the wrong path.** It gives
   > `WinClient_OB_live\WinClient_OB\ObToolsNew\launch.bat`. No such folder exists in the 4.3.0
   > package — `ObToolsNew` sits directly in the **package root**.

   **Leave that window open.** Closing it stops the API.

   > ⚠️ **The window stays blank, and that is normal.** `launch.bat` is one line — `node.exe ob.js`
   > — and `ob.js` redirects its own output to a file. You will see **no messages at all**, even
   > when everything is working perfectly. Do not judge liveness from this window; step 4 is what
   > tells you.

4. In a browser on the same PC, open:
   ```
   http://127.0.0.1:10086/isingame
   ```
   Anything at all coming back — even `{"isInGame":false}` — means the API is alive.
5. Run the capture script ([§8](#8-run-the-capture)) with a short window:
   ```
   capture-pcob.bat -Seconds 30
   ```

Even with no match running, the probe pass hits all thirteen documented routes and saves whatever
each returns. **Send that folder over even if it looks empty.** An empty-but-shaped response still
reveals the envelope key, which is the thing we are least sure about.

> ⚠️ **This test does NOT prove the whitelist works.** Whitelisting governs whether the game server
> sends data to the client; the local HTTP server started by `launch.bat` comes up and answers
> regardless. So a Level 1 run can be green from end to end and the account still not be
> whitelisted. **Only a real match shows that** — which is the main reason not to leave it until the
> first live broadcast.

---

## 6. Create a room

On a **phone** — this cannot be done from the PC OB client.

1. Redeem the tournament CD-KEY at the PUBG Mobile redeem site, using the phone account's
   **Character ID**.
2. Open the in-game **mailbox** and collect the card into your **Inventory**.
3. In the Inventory, **use** the card.
4. Create a **tournament custom room**.

   > It has to be the **tournament** card. Normal and advanced room cards do not have the esports
   > settings or the 30 OB slots.

5. Note the **room ID**.

> ⚠️ **Never host from the PC OB client.** The guideline is blunt about it: if the PC OB is the host
> and it crashes, the whole match crashes with it. Host from the phone, always.

---

## 7. Run the test match

1. Players join the room from their phones.
2. **The observer joins from the PC OB client and switches to observer mode.**
3. **Tick "API Enable" before the match starts.** If this is missed, there is no data — and this is
   the single most common cause of an apparently broken setup.
4. Make sure `launch.bat` is still running in its own window.
5. Start the capture ([§8](#8-run-the-capture)) about a minute **before** the match starts.
6. Start the match.
7. **The host must stay in the room the whole time.** No API data flows while the host is
   disconnected.
8. When the match ends, **wait at least 30 seconds** before the host leaves the room. The final
   figures arrive with a delay.

### What makes a capture good

Three things, in order:

1. **At least one team eliminated while the capture is running.** This is what answers whether
   `rank` fills in during a match or only after it — and that decides where the leaderboard's
   placement points come from.
2. **The capture spans the end of the match**, and ideally the start of the next one. That is what
   shows whether the data resets, holds, or empties between matches.
3. **The capture runs for at least a minute.** Comparing an early sample with a late one is what
   proves player identifiers stay stable — which the whole ALIVE column layout depends on.

A capture with none of those is still worth sending. A capture with all three closes the file.

---

## 8. Run the capture

The script lives in this repository under [`tools/`](../../tools/). Copy that folder to the OB PC —
it needs nothing else installed, only Windows.

**Double-click `capture-pcob.bat`.**

It will:

- check that the API is reachable, and tell you exactly what to fix if it is not;
- hit all thirteen documented routes once and save every response;
- then sample the four live routes every 2 seconds for 5 minutes;
- and finally print what the capture settled, so you know at the venue whether it worked.

Options, if you need them:

```
capture-pcob.bat -Seconds 600
capture-pcob.bat -BaseUrl http://192.168.1.50:10086
```

The second form is for running the capture from a **different** PC than the observer's. The PCOB API
listens on the OB PC's own address, so this works — but that PC's firewall has to allow port 10086.

When it finishes, **zip the output folder** (it lands on the Desktop, named `pcob-capture_<date>`)
and send it over. It contains raw JSON only: in-game player names and ids, nothing personal beyond
that.

### There is a second data source, for free

`ob.js` **logs every request and every full response body** by itself, to:

```
<package>\ObToolsNew\log\log-YYYYMMDD.txt
```

It accumulates from the moment `launch.bat` starts, whether or not the capture script ever runs. Two
consequences:

- **If you forget to run the capture, the data still exists.** Send this file after the match; it is
  harder to work with than the tidy folder, but it contains everything.
- **It grows fast**, storing every response to every request. After a long event, check its size and
  clear the `log/` folder periodically.

If the script will not start at the venue, this is the safety net.

---

## 9. Questions to put to Zsófi

Three things the vendor documents do not answer, and any of them could save the whole trip:

1. **How many players does a custom room need before a match can start?** If it is two, the test is
   trivial. If it is sixteen, it needs organising.
2. **Does the API produce data during a replay?** The client has a replay timeline (`J`) and a
   "load match result" key (`E`). If the API works over a replay, no live players are needed at all
   and this becomes a desk job.
3. **Are the observer accounts already whitelisted from the June window?** If the whitelist survived,
   items 3 and 4 in [§1](#1-what-you-need-and-who-has-to-give-it-to-you) are already done.

---

## 10. If nothing comes back

Work down this list — it is ordered by how often each one is the cause:

| Symptom                                        | Check                                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| The capture script says "cannot reach the API" | Is the `launch.bat` window still open?                                              |
| It is open, still nothing                      | Was **"API Enable"** ticked _before_ the match started?                             |
| Both fine, still nothing                       | Is the OPENID whitelisted? Without it, everything runs and no data flows.           |
| Data stops mid-match                           | Did the host leave the room? No host, no API.                                       |
| Works locally, not from the other PC           | Firewall on the OB PC, port 10086.                                                  |
| The client will not start                      | Wrong `.exe` — use the one in `Binaries\Win64` ([§3](#3-install-the-pc-ob-client)). |
