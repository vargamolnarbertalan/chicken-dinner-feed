# chicken-dinner-feed — Felhasználói kézikönyv

_In English: [user-guide.en.md](user-guide.en.md)_

Ez az útmutató a közvetítést kezelő operátornak készült. Programozói ismereteket nem feltételez.

> **Ez a verzió készülőben van.** A telepítés, az indítás, a ranglista-overlay és a Stream Deck
> vezérlés az itt leírtak szerint működik. Az **admin felület még nincs kész**, ezért a 8. fejezet
> azt írja le, ami tervezett — és amíg nincs meg, az overlay azonosítókat te választod, nem egy
> felületen hozod létre őket.

---

## 1. Mit csinál ez az alkalmazás

Egy PUBG Mobile verseny közvetítése közben a PC Observer (PCOB) kliens élő meccsadatokat állít elő:
ki él, mennyi az életereje, hány kiütése van. A chicken-dinner-feed ezeket az adatokat beolvassa, és
**overlayeket** készít belőlük: olyan grafikákat, amiket rá lehet tenni az élő videóra OBS-ben,
vMixben vagy bármilyen közvetítő szoftverben, ami támogatja a browser source-t.

Az overlayek kinézetét egy helyi, böngészőből elérhető **admin felületről** állítod: színek,
betűtípusok, méretek, elhelyezés, valamint a fel- és leanimálás.

Minden a saját géped fut. A közvetítés alatt semmi nem megy ki az internetre, és az alkalmazás akkor
is működik, ha a helyszínen elmegy a net.

## 2. Mielőtt nekikezdesz

Ami kell:

- **Windows** — ugyanaz a gép, amin a PCOB kliens fut, vagy ami látja azt.
- **Node.js 22-es vagy újabb verzió** — ez egy ingyenes futtatókörnyezet. Ha nincs telepítve, töltsd
  le az **LTS** változatot innen: <https://nodejs.org/>, és telepítsd az alapbeállításokkal.
- **Internet, egyszer**, kizárólag a telepítéshez.

## 3. Telepítés

1. Töltsd le a release ZIP fájlt.
2. Csomagold ki egy olyan mappába, amit később is megtalálsz — például
   `C:\kozvetites\chicken-dinner-feed`. **Ne** a ZIP fájlon belülről indítsd.
3. Kattints duplán az **`install-dependencies.bat`** fájlra.
4. Várj. Ez eltarthat pár percig. A végén ezt látod:
   `[OK] Done. You can now start the app with startup.bat`.
5. Nyomj meg egy billentyűt az ablak bezárásához.

Ezt verziónként csak egyszer kell megcsinálni. Ha később újabb kiadást töltesz le, az új mappában
futtasd le újra.

**Ha hibát jelez:** a szkript magyarul és angolul is kiírja, mi a baj. A két leggyakoribb ok: nincs
telepítve a Node.js, vagy nincs internetkapcsolat.

## 4. Az alkalmazás indítása

Kattints duplán a **`startup.bat`** fájlra.

Megnyílik egy fekete konzolablak, ami nyitva marad, és a böngésződben automatikusan megjelenik az
admin felület.

> ⚠️ **A konzolablakot hagyd nyitva a teljes közvetítés alatt.** Ha bezárod, az alkalmazás leáll, és
> az adásban minden overlay eltűnik.

A címek, amikre szükséged lesz:

| Mi            | Cím                                                                     |
| ------------- | ----------------------------------------------------------------------- |
| Admin felület | `http://127.0.0.1:4317/admin`                                           |
| Egy overlay   | `http://127.0.0.1:4317/overlay/<id>` — a pontos címet az admin adja meg |

Leállítani úgy tudod, hogy bezárod a konzolablakot, vagy belekattintasz és `Ctrl+C`-t nyomsz.

## 5. A játékadatok bekötése

Az adatok a PCOB kliensből jönnek. Az ebben a fejezetben leírtak mind **a PCOB-ban** történnek, nem
ebben az alkalmazásban — de ha bármelyik kimarad, ez az alkalmazás nem kap adatot.

### Versenyenként egyszer: fiók whitelistelése

Ezt jó előre el kell intézni, nem a helyszínen.

1. Lépj be a PCOB kliensbe, lehetőleg email + jelszó párossal. Ha az observernek nincs PUBG Mobile
   fiókja, mobilon indítsa el a játékot, válassza a **Guest login**-t, majd csatoljon hozzá emailt és
   jelszót.
2. Futtasd a kapott `.bat` fájlt, és olvasd ki az **OPENID** számsort.
3. Ezt az OPENID-t el kell küldeni a kiadónak **whitelistelésre**. **Whitelist nélkül egyáltalán
   nincs API adat**, hiába van minden más jól beállítva.
4. Ne egy, hanem **két fiókot** whitelisteltess. Ha az egyik a helyszínen bedől, újat kérni már nincs
   idő.

### Minden meccs előtt

1. Az observer a PCOB (ShadowTracker) kliensen keresztül becsatlakozik a lobbiba, és observer módba
   áll.
2. **A meccs kezdete előtt pipáld be az "API Enable" gombot a PCOB kliensben.** Ha ez kimarad, az
   alkalmazás _nincs adat_ állapotot mutat, hiába működik egyébként minden. Messze ez a leggyakoribb
   oka annak, ha látszólag nem működik az overlay.
3. **Indítsd el a PCOB API-t.** Futtasd parancssorból a
   `WinClient_OB_live\WinClient_OB\ObToolsNew\launch.bat` fájlt. Ez saját konzolablakot nyit —
   **azt az ablakot is nyitva kell hagyni**, különben nem keletkezik adat.

Két dolog, amit érdemes tudni, mert ezek nem az alkalmazás hibái:

- **Ha a szoba hostja lecsatlakozik, az adat megszűnik.** A hostnak végig bent kell maradnia, és a
  meccs vége után legalább 30 másodpercet várnia kell, mielőtt kilép a szobából.
- **Az adat körülbelül 2 másodpercenként frissül.** Az overlay a frissítések között simítja a
  mozgást, hogy folyamatosnak tűnjön.

Az admin felület folyamatosan mutatja a kapcsolat állapotát:

| Jelzés           | Jelentése                                     | Mi a teendő                                                                               |
| ---------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Connected**    | Érkezik az adat                               | Semmi                                                                                     |
| **Stale**        | Van kapcsolat, de mostanában nem jött új adat | Ellenőrizd, hogy a host bent van-e még a szobában                                         |
| **Disconnected** | Nincs kapcsolat a PCOB API-val                | Nézd meg, hogy nyitva van-e a `launch.bat` ablaka, és megnyomtad-e az "API Enable" gombot |

Ha **Disconnected** állapotot mutat, és a `launch.bat` ablaka nyitva van, akkor valószínűleg a fiók
whitelistelése maradt el.

Ha meccs közben szakad meg a kapcsolat, az overlay **az utoljára kapott adatot tartja meg**, nem
ürül ki az adásban. Amint újra jön adat, magától visszakapcsolódik.

## 6. Overlay hozzáadása a közvetítő szoftverhez

1. Válassz az overlaynek egy rövid nevet — bármi lehet, például `main`. Ez lesz az **azonosítója**, a
   címe pedig `http://127.0.0.1:4317/overlay/main`. (Ha majd elkészül az admin felület, ott hozod
   létre a példányokat, nem magadnak kell azonosítót választanod.)
2. OBS-ben: **Források → + → Böngésző**, illeszd be a címet, a szélességet és magasságot állítsd a
   vászon méretére. **1920 × 1080, 2560 × 1440 és 3840 × 2160 is támogatott** — az overlay magától
   skálázódik, és mindháromnál ugyanúgy néz ki, tehát felbontásonként nincs mit beállítani.
3. A **"Forrás leállítása, ha nem látható"** opciót kapcsold **ki**, hogy az overlay elrejtve is
   kapcsolatban maradjon.
4. Az overlay háttere átlátszó, így közvetlenül ráilleszkedik a videóra.

Ismételd meg minden overlaynél, mindegyiknek más azonosítót adva. Az overlayeket ugyanaz az élő adat
hajtja, de egymástól függetlenül jeleníthetők meg és rejthetők el.

## 7. Overlayek vezérlése Stream Deckről (Bitfocus Companion)

Az overlayek hardveres gombról fel- és leanimálhatók. Az alkalmazás sima webcímekre válaszol, tehát
bármi működik, ami képes webkérést küldeni — a Companion csak a legelterjedtebb ilyen.

### A címek

A `<id>` helyére az overlay példány azonosítója kerül (ugyanaz, ami a browser source címében is
szerepel):

| Cím                                              | Mit csinál               |
| ------------------------------------------------ | ------------------------ |
| `http://127.0.0.1:4317/api/overlays/<id>/show`   | Felanimálja az overlayt  |
| `http://127.0.0.1:4317/api/overlays/<id>/hide`   | Leanimálja               |
| `http://127.0.0.1:4317/api/overlays/<id>/toggle` | Átbillenti               |
| `http://127.0.0.1:4317/api/overlays/<id>/state`  | Megmondja, épp látszik-e |

### Companion gomb beállítása

1. Hozz létre egy gombot, és adj neki egy akciót a **Generic HTTP** modulból.
2. Válaszd a **GET** metódust, és illeszd be a fenti címek egyikét.
3. Ennyi a beállítás. Általában a `toggle` gomb a leghasznosabb; ha többen kezelitek, biztonságosabb
   külön `show` és `hide` gomb.

Két dolog, amit érdemes tudni:

- **A gombot kétszer megnyomni biztonságos.** A már látszó overlayen a „show" nem csinál semmit — nem
  indítja újra az animációt, és nem villan meg az adásban.
- **A browser source újratöltése megőrzi az állapotot.** Egy elrejtett overlay elrejtve marad
  újratöltés után is, nem villan fel a képernyőn.

### Ha a Companion másik gépen fut

Alapból az alkalmazás csak a saját gépéről érhető el, tehát egy másik gépen futó Companion nem éri
el. Ha engedni akarod:

1. Nyisd meg a `backend\.env` fájlt Jegyzettömbben, és írd át a `HOST=127.0.0.1` sort erre:
   `HOST=0.0.0.0`.
2. A Companionban a `127.0.0.1` helyett az overlay-gép hálózati címét használd.

⚠️ **Ezzel az admin felület is elérhetővé válik mindenki számára a hálózaton**, és az adminon nincs
jelszó. Zárt közvetítői hálózaton ez általában rendben van. Ha szeretnél némi védelmet, állíts be egy
`CONTROL_TOKEN=valami-amit-te-választasz` értéket a `backend\.env` fájlban, és a Companionban fűzd a
címek végére: `?token=valami-amit-te-választasz`. Ez csak a show/hide gombokat védi, az admin
felületet nem.

## 8. Overlayek beállítása

_Hamarosan._ A tervezett beállítások, overlay példányonként:

- színek, betűtípusok és betűméretek;
- méret és pozíció a vásznon;
- fel- és leanimálás, állítható sebességgel;
- csapatnevek és logók;
- a pontozási szabályrendszer — helyezési pontok és pont/kiütés.

Minden változást **élő előnézet** mutat, ami a valódi overlayt jeleníti meg, tehát pontosan azt
látod, ami adásba megy.

**A pontokat ez az alkalmazás számolja, nem a játék.** A PCOB API nem ad versenypontokat, ezért a
pontozási szabályrendszernek meg kell egyeznie a te versenyed szabályaival. Közvetítés előtt
ellenőrizd.

## 9. A beállításaid

A konfiguráció fájlokban tárolódik, az alkalmazás mappáján belüli **`backend\data`** könyvtárban.

- **Mentés:** másold ezt a mappát biztonságos helyre.
- **Átvitel másik gépre:** telepítsd ott az alkalmazást, majd másold át a `backend\data` mappádat.
- **Frissítéskor:** az új verziót csomagold ki egy _új_ mappába, majd indítás előtt másold bele a
  régi `backend\data` mappát.

## 10. Hibaelhárítás

**„Port 4317 is already in use"**
Valószínűleg már fut az alkalmazás. Keresd meg a másik konzolablakot, és zárd be. Ha a portot egy
másik program foglalja, nyisd meg a `backend\.env` fájlt Jegyzettömbben, és írd át a `PORT=4317`
sort egy másik számra, például `PORT=4400`. Az overlay címek ennek megfelelően változnak.

**Az overlay üres az OBS-ben**
Ellenőrizd sorban: nyitva van-e még a konzolablak; betölt-e az admin felület a böngészőben; pontosan
az a cím van-e az OBS-ben, amit az admin mutat; elég nagy-e a browser source.

**Az overlay mutat adatot, de befagyott**
Valószínűleg megszakadt a kapcsolat a PCOB-bal — az admin _Stale_ vagy _Disconnected_ állapotot
mutat. Nézd meg a `launch.bat` ablakát, és hogy a szoba hostja bent van-e még.

**Egyáltalán nincs adat, pedig minden rendben van**
Gyakoriság szerint: **nem lett bepipálva az "API Enable"** a meccs kezdete előtt; bezárult a
`launch.bat` konzolablaka; vagy az observer **fiókja nem lett whitelistelve** a kiadónál. Az utóbbi a
helyszínen már nem javítható — lásd az 5. fejezetet.

**Indításkor nem nyílt meg a böngésző**
Ez nem baj. Nyiss egy böngészőt, és írd be: `http://127.0.0.1:4317/admin`.

## 11. Segítségkérés

Hibabejelentéskor küldd el ezeket:

- a verziószám, az admin felületről;
- mit mutatott az admin kapcsolatjelzője;
- a konzolablakban látható szöveg, ha van hibaüzenet;
- a szoba azonosítója (room ID) és a hozzávetőleges időpont.
