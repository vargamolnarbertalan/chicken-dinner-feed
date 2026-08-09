# App tervezet a chicken-dinner-feed alkalmazáshoz

## Általános leírás és cél

Ez egy PUBG Mobile esport közvetítésekhez használt alkalmazás lesz, ami egy real-time adatszolgáltató és a közvetítő szoftver közötti interfész. Az alkalmazás megkap egy API-n keresztül élő adatokat a játéktól (például életerő) és azokat pár egyszerű konfiguráció és/vagy transzformáció után megjeleníti. Szükséges egy fogadó és feldolgozó backend, egy megjelenítő frontend és egy admin felület. Mind a frontend mind az admin modern kinézetű és érzetű kell legyen, támogatnia kell animációkat az overlay megjelenítéshez és elrejtéshez.

## Két lehetséges irány (döntési helyzet)

- Vagy egy docker stacket építünk, amiben benne van frontend, backend, admin, adatbázis, ezt hosztolnám a vps-emen, reverse proxy, domain stb adottak
- Vagy egy windowson futtatható local app, amiben szintén benne van minden (egy run.bat indítja backendet és frontend+admint), de ez esetben szinte biztos, hogy a perzisztensen tárolandó adatokat csak egy .jsonbe menteném.

## Megrendelői követelmények

Forrás: `specs/PCOB_Tool_fejlesztes_thread.md` (Esport1 / Berze Zsófia levelezés, 2026. augusztus 9-én továbbítva). Ezek szerződéses vállalások, nem opciók:

- **Az overlaynek dinamikusan támogatnia kell a FullHD, 1440p és 4K felbontást.** Ez a terv többi részéből nem következik, de az árajánlat része. Megvalósítás: [ADR-0011](../docs/adr/0011-resolution-independent-overlay-scaling.md).
- Böngészőforrás, ami **minden mainstream streaming programban** használható — tehát semmi OBS-specifikus megoldás.
- Felhasználó központú, használati útmutató-szerű dokumentáció.
- Mini webszerver, ami az adatot fogadja és feldolgozza.

⚠️ **Hatókör-eltérés az admin körül.** Az árajánlat szerint az első kör testreszabhatósága **színvilág és betűtípus**, a vezérlőpult pedig kifejezetten későbbi, külön egyeztetendő bővítés. Ez a terv ezzel szemben teljes admint ír le (méret, elhelyezés, animációk, több overlay típus és instance, preview). A kettő nem ugyanaz a hatókör — a különbség nem volt beárazva, ezért tudatos döntés kérdése, nem sodródásé. Nyitott döntésként rögzítve a `docs/progression.md`-ben.

**Határidő:** az eredetileg megjelölt használati ablak 2026. június 2–7. volt, ez elmúlt. Új dátum egyeztetése szükséges, mert ez határozza meg a 2. kör prioritásait.

## Az API

Az API elérhetősége a megrendelői levelezésből kiderült: **`http://localhost:10086`**, HTTP + JSON. Az ismert végpont a `gettotalplayerlist`, ami viszont a leírás szerint meccs **után** használatos — az élő adat útvonala még nem ismert. Részletek és a nyitott kérdések: `specs/PCOB-FINDINGS.md`, döntés: [ADR-0010](../docs/adr/0010-poll-the-pcob-http-api.md).

A specs mappában található _PCOB Guideline (Last updated 6th Jan 2026).pdf írja le, hogy mi az a 3rd party app aminek az API-ját be kéne fogadnunk. Ezt a pdf-et nagyon alaposan fel kéne dolgozni, a számunkra releváns dolgokat egy könnyen olvasható .md fájlba berakni. Figyelem! A pdf tartalmaz számos további linket, hivatkozást, amik további számunkra hasznos infót tartalmaznak, ezeket is nézd meg. Ha valamit nem érsz el, szólj.

## A backend

Bármilyen ajánlásra nyitott vagyok, én django ninjára gondoltam swagger openapi schema generálással.

## A frontend

A frontend tailwind css-sel és shadcnnel megtámogatott, modern, smooth animációkat tartalmazó state managementet támogató app kell legyen. React + TypeScript + Vite ?
De itt is nyitott vagyok az ajánlásokra.
A specs/example.png megmutatja, hogy nagyjából mire van szükség: vertikális oldalsáv-szerű overlay, egy fejléc, a sorok a csapatok, oszlopok pedig: helyezés, logó, rövid név, alive players, points, eliminations. Az alive oszlopban az élő, a knocked és a halott játékosoknak más a színe. Az oszlop magassága a health percentage. Minden változás (pl lejjebb megy élet, meghal, spawnol stb stb minden animált legyen).

## Az admin

Igazából lehet a frontend kliens része pl védett path azon belül. Nem szükséges külön app. Komoly userkezelés sem szükséges első POC-ba, az adminon olyasmi állítható első terv szerint, hogy színek, betűtípus, méret, elhelyezés, fel és le animálása az overlaynek. Ez is nézzen ki szépen, modernen, legyen reszponzív, óriási plusz lenne, ha lenne az egyes overlayekről preview. Támogasson több overlay típust és azokból is több instance-t (tehát pl ugyanabból az adatból lehessen külön kezelni egy light meg egy dark themed vagy egy branded meg egy generic overlayt).

## Perzisztens adattárolás

Konfigot, preferenciát kell perzisztensen tárolni, titkokat valószínűleg nem, pláne ha localhoston fog működni az app productionben is (közvetítésekben bevett szokás), akkor a .json read-write elég.

## Mappaszerkezet

chicken-dinner-feed a root, ezen belül legyen specs, backend (.env és /data ha localhostos), frontend (ezen belül public, pls images, fonts)

## Dokumentáció

Legyen angolul és magyarul egy felhasználó központú használati utasítás-szerű dokumentáció.

## Git

Töltsd fel egy repoba az egész stacket. feat > develop > main (release tagging) a menet, konvencionális commit message-ekkel, merging PR-ból

## Csomagolás és futtatás (all-in-one bundle)

A végtermék egy **all-in-one bundle** legyen: egyetlen kicsomagolható csomag, ami mindent tartalmaz (backend, frontend build, admin, alapértelmezett konfigurációk, dokumentáció), és amit egy nem fejlesztő operátor is el tud indítani a közvetítés helyszínén.

Ehhez a csomag gyökerében legyenek külön, egyértelműen elnevezett indító szkriptek:

- `install-dependencies.bat` — egyszeri, telepítés jellegű lépés. Ellenőrzi az előfeltételeket (pl. Node.js megléte és verziója), és telepít mindent, ami a futtatáshoz kell. Ha valami hiányzik, érthető, magyarul is olvasható hibaüzenettel jelezzen, ne csak stack trace-t dobjon.
- `startup.bat` — a napi használat belépési pontja. Elindítja a backendet, kiszolgálja a frontendet/admint, és megnyitja az admin felületet a böngészőben. Ezt kell dupla kattintással indítani egy közvetítés előtt.

Elvárások a bundle-lel szemben:

- Ne igényeljen fejlesztői eszközláncot a futtatáshoz azon túl, amit az `install-dependencies.bat` telepít.
- Az internetkapcsolat csak a telepítéskor legyen követelmény; a közvetítés alatt offline is működjön.
- A `startup.bat` legyen idempotens és újraindítható: ha egy port foglalt vagy egy korábbi példány fut, azt jelezze, ne csendben hasaljon el.
- A perzisztens adatok (konfigok, overlay beállítások) a bundle-ön belül, jól ismert helyen legyenek, hogy egy frissítéskor átmenthetők legyenek.

## Release

Ha felhő alapút csinálunk, akkor kell egy manuálisan git release létrehozásával triggerelt flow ami build & push a vpsem dockerébe valószínűleg ghcr.io képből. Ha localhostos megoldást választjuk, akkor valami industry standard zip (minden release szempontjából nem érdekes fájl mellőzésével) létrehozásával és a release-be mellékletként feltöltésével. Ez a zip pontosan a fenti all-in-one bundle: kicsomagolás után `install-dependencies.bat`, majd `startup.bat`.

## Fejlesztés menete

Ez a terv egy top-level áttekintése az appnak. Azt, hogy mi van kész, mi van hátra és milyen döntések születtek vezessük a progression.md-ben.
