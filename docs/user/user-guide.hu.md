# chicken-dinner-feed — Felhasználói kézikönyv

_In English: [user-guide.en.md](user-guide.en.md)_

Ez az útmutató a közvetítést kezelő operátornak készült. Programozói ismereteket nem feltételez.

> **Ez a verzió még csak váz.** A telepítés és az indítás az itt leírtak szerint működik. Az overlay
> és az admin felület még készül, ezért a _Hamarosan_ jelölésű részek azt írják le, ami tervezett,
> nem azt, ami ma már kattintható.

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

Az adatok a PCOB kliensből jönnek, és két dolgot **a PCOB-ban** kell elvégezned, nem ebben az
alkalmazásban:

1. **Indítsd el a PCOB API-t.** Futtasd a
   `WinClient_OB_live\WinClient_OB\ObToolsNew\launch.bat` fájlt. Ez saját konzolablakot nyit —
   **azt az ablakot is nyitva kell hagyni**, különben nem keletkezik adat.
2. **A meccs kezdete előtt kattints az "API Enable" gombra a PCOB kliensben.** Ha ez kimarad, az
   alkalmazás _nincs adat_ állapotot mutat, hiába működik egyébként minden.

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

Ha meccs közben szakad meg a kapcsolat, az overlay **az utoljára kapott adatot tartja meg**, nem
ürül ki az adásban. Amint újra jön adat, magától visszakapcsolódik.

## 6. Overlay hozzáadása a közvetítő szoftverhez

_Hamarosan — a pontos lépések az első overlayjel véglegesednek._ A menet:

1. Hozz létre egy overlay példányt az adminban, és másold ki a címét.
2. OBS-ben: **Források → + → Böngésző**, illeszd be a címet, a szélességet és magasságot állítsd a
   vászon méretére (általában 1920 × 1080).
3. A **"Forrás leállítása, ha nem látható"** opciót kapcsold **ki**, hogy az overlay elrejtve is
   kapcsolatban maradjon.
4. Az overlay háttere átlátszó, így közvetlenül ráilleszkedik a videóra.

Ismételd meg minden overlay példánynál. Ugyanabból az overlay típusból több példány is futhat —
például egy világos és egy sötét, vagy egy brandelt és egy generikus verzió —, ezeket ugyanaz az élő
adat hajtja, de külön-külön állíthatók.

## 7. Overlayek beállítása

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

## 8. A beállításaid

A konfiguráció fájlokban tárolódik, az alkalmazás mappáján belüli **`backend\data`** könyvtárban.

- **Mentés:** másold ezt a mappát biztonságos helyre.
- **Átvitel másik gépre:** telepítsd ott az alkalmazást, majd másold át a `backend\data` mappádat.
- **Frissítéskor:** az új verziót csomagold ki egy _új_ mappába, majd indítás előtt másold bele a
  régi `backend\data` mappát.

## 9. Hibaelhárítás

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
A messze leggyakoribb ok: **a meccs kezdete előtt nem lett megnyomva az "API Enable" gomb a
PCOB-ban.**

**Indításkor nem nyílt meg a böngésző**
Ez nem baj. Nyiss egy böngészőt, és írd be: `http://127.0.0.1:4317/admin`.

## 10. Segítségkérés

Hibabejelentéskor küldd el ezeket:

- a verziószám, az admin felületről;
- mit mutatott az admin kapcsolatjelzője;
- a konzolablakban látható szöveg, ha van hibaüzenet;
- a szoba azonosítója (room ID) és a hozzávetőleges időpont.
