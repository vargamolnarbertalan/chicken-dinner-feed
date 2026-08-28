# Valódi PCOB-adat rögzítése — lépésről lépésre

_In English: [pcob-capture-guide.en.md](pcob-capture-guide.en.md)_

Az adatbeolvasó réteg jelenleg olyan gyártói PDF-ek alapján készül, amelyek ellentmondanak egymásnak
([`specs/PCOB-API.md`](../../specs/PCOB-API.md) §2). **Egyetlen felvétel egy valódi meccsről az összes
nyitott kérdést lezárja.** Ez az útmutató arról szól, hogyan szerezzük meg.

Mielőtt bármit szerveznél, olvasd el az [1. pontot](#1-mi-kell-hozzá-és-kitől): amire szükség van,
annak a kétharmada az Esport1-tól és a Tencenttől jön, és az átfutási idejük nem rajtad múlik.

---

## 1. Mi kell hozzá, és kitől

| #   | Mi                                       | Honnan                           | Meg tudod szerezni magad? |
| --- | ---------------------------------------- | -------------------------------- | ------------------------- |
| 1   | PC OB kliens, v4.5.x (három fájl + patch fájlok) | Az Esport1 Google Drive-ja       | Nem — kérd Zsófitól       |
| 2   | PUBG Mobile fiók az observernek          | Te vagy az Esport1               | Igen                      |
| 3   | **A Tencent által whitelistelt OPENID**  | Tencent, az Esport1-on keresztül | **Nem**                   |
| 4   | Tournament szobakártya (CD-KEY)          | Tencent, az Esport1-on keresztül | Nem                       |
| 5   | Egy telefon PUBG Mobile-lal, hosztolásra | Te                               | Igen                      |
| 6   | Néhány játékos a szobába                 | Te és a kollégák                 | Igen                      |

**A 3-as pont a kemény kapu.** Whitelist nélkül **egyáltalán nincs API-adat** — a kliens elindul, a
meccs lemegy, és az endpoint nem ad használható választ. Ez egyben az is, aminek ismeretlen az
átfutási ideje, mert a kiadóhoz megy.

Tehát a **nulladik lépés egy levél Zsófinak**: az 1-es, 3-as és 4-es tétel, azzal a megjegyzéssel,
hogy **elég egy kicsi, belsős tesztszoba** — nem versenyidőpontot kérsz.

### „Kell a PUBG Mobile a Windows gépre?"

Nem is, meg igen is.

- **A sima PUBG Mobile játékot nem telepíted Windowsra.** A PC OB kliens _maga_ egy PUBG Mobile
  build — `ShadowTrackerExtra.exe`. Ha azt telepíted, megvan minden, ami a néző oldalon kell.
- **Telefonra viszont kell PUBG Mobile**, mert a guideline egy dolgot szigorúan kiköt: _„tournament
  custom room-ot csak mobil eszközről lehet létrehozni, a PC OB csak csatlakozni tud."_ Android
  emulátor is jó hosztnak — a guideline megengedi a _„mobil kliens vagy emulátor"_ változatot.

A minimális felállás tehát **egy Windows PC** (observer, és ahol az appunk fut) **plusz egy telefon**
(hoszt). A játékosok bármilyen telefonon lehetnek.

### „Ugyanazzal a fiókkal lépjek be telefonon is?"

**Nem — és nem is lehet.** A két fiók két szerepet tölt be, és **egyszerre kell bent lenniük a
szobában**:

| Hol                | Szerep                            | Mit igényel                        |
| ------------------ | --------------------------------- | ---------------------------------- |
| PC — ShadowTracker | **Observer** — csatlakozik és néz | ez a fiók legyen **whitelistelve** |
| Telefon            | **Host** — létrehozza a szobát    | erre kell a **tournament kártya**  |

Egy PUBG Mobile fiók nem lehet egyszerre két eszközön bejelentkezve; a második kirúgná az elsőt.
Mivel a hostnak bent kell lennie _miközben_ az observer csatlakozik, ez fizikailag **két külön
fiókot** jelent. A guideline ezt külön is kimondja: _„DO NOT use PC OB to be the host"_ — ha a PC OB
a host és összeomlik, az egész meccs vele omlik.

**A host egyben játékos is lehet**, tehát nem kell neki külön fiók.

---

## 2. Három tesztszint — az olcsóval kezdd

| Szint | Mi kell hozzá                         | Mire ad választ                                                |
| ----- | ------------------------------------- | -------------------------------------------------------------- |
| **1** | Telepített, futó PCOB. Meccs nélkül.  | Válaszolnak-e egyáltalán az endpointok? Mi a boríték kulcsa?   |
| **2** | Egy custom szoba maroknyi játékossal. | **Minden, amire szükségünk van.**                              |
| **3** | Teljes 16 × 4 főpróba.                | Nekünk semmi pluszt — az közvetítési főpróba, nem adatgyűjtés. |

**A cél a 2-es szint.** A ranglistát nem érdekli, hogy 8 vagy 64 játékos van: a mezőnevek, az
enum-értékek és az azonosítók pontosan ugyanazok. **Ne várj valódi versenyre.**

**Az 1-es szintet csináld meg aznap, amikor a kliens felkerül.** Tíz perc, nem kell hozzá se szoba,
se más ember, és már ez is megválaszolhatja a legnagyobb kérdést: `TotalPlayerList`-nek vagy
`playerInfoList`-nek hívják-e a borítékot.

---

## 3. A PC OB kliens telepítése

Azon a Windows gépen, amelyik az observer lesz.

> **A lentiek a v4.5.0 csomag tényleges tartalmán alapulnak, élesben ellenőrizve**
> (`Win64_Release4.5.0_No17_4.5.0.21320_Shipping_OB_Shelled`), nem a guideline általános leírásán. A
> kettő **több ponton eltér** — ahol igen, ott a csomag az igazság, és jelezzük. A v4.3.0-ra vonatkozó
> korábbi megfigyelések a v4.5.0-n is érvényesnek bizonyultak, a lenti pontosításokkal.

A kicsomagolt csomag gyökerében **pontosan** két mappa van, semmi más:

```
<csomag>\
  ObToolsNew\        <- az API szerver (node.exe + ob.js + launch.bat)
  WindowsNoEditor\   <- maga a kliens
```

1. **Csomagold ki** a 3 részes `.zip.001/.002/.003`-at (~50 GB tömörítve, ~48 GB+ kicsomagolva —
   legyen bőven szabad hely, ideiglenesen a duplájára is szükség lehet).

   > ⚠️ **Kicsomagolási csapda, amibe most mi is belefutottunk.** Ha az Intézőben **„Kibontás ide
   > (`<archívnév>\`)"** paranccsal bontod ki (nem **„Kibontás itt"**-tel), a tömörítő két egymásba
   > ágyazott mappát hoz létre — a külsőt a teljes archívnévvel, **`.zip` végződéssel együtt**, a
   > belsőt anélkül —, és a fel nem dolgozott kötetdarabok (`.zip.002`, `.zip.003`) másolatai is
   > bekerülnek a kicsomagolt fába. Eredmény: dupla mappaszint és ~26 GB fölösleges duplikáció.
   > **A helyes végeredmény pontosan a fenti két mappa, semmi más, egyetlen szinten** — ha ennél
   > több van, told fel eggyel a tartalmat, és töröld a maradékot.

2. **Patch — a 4.5.x-hez tényleg kell.** A guideline szerint egy külön letöltött `.pak`-ot a
   `%LOCALAPPDATA%\ShadowTrackerExtra\Saved\Paks` mappába kell tenni. **A v4.5.0 csomag ezt nem
   tartalmazza**, de a v4.3.0-tól eltérően itt **valóban szükség van rá**: 3 patch fájlt kaptunk
   Zsófitól (`core_patch_4.5.0.21323.pak`, `game_patch_4.5.0.21125.pak`,
   `game_patch_4.5.0.21324.pak`), és a fenti mappába másolva **működik**.

3. **A klienst a helyes helyről indítsd:**

   ```
   <csomag>\WindowsNoEditor\ShadowTrackerExtra\Binaries\Win64\ShadowTrackerExtra.exe
   ```

   jobb klikk → **Futtatás rendszergazdaként**.

   > ⚠️ Van egy másik `ShadowTrackerExtra.exe` közvetlenül a `\WindowsNoEditor` alatt is. A
   > méretkülönbség árulkodó: **~0,16 MB** (csak indító, 164 352 bájt) vs **~105 MB** (a valódi
   > kliens, 105 076 776 bájt). A guideline kimondja, hogy az előbbi nem működik — a méret ezt meg is
   > erősíti.

4. **Telepítsd a legacy DirectX 9 runtime-ot — tiszta Windows 11-en ez nem opcionális.**

   A guideline ezt „ha hiányzó DLL hibát kapsz" feltételként írja. A gyakorlatban **garantáltan
   kapni fogod**: a Windows 11 DirectX 12-t szállít, de a régi D3DX / XAudio / X3DAudio DLL-eket
   soha nem telepíti. Egy friss gépen ellenőrizve **egyik sem** volt fent — se `x3daudio1_7.dll`,
   se `d3dx9_43.dll`, se `xinput1_3.dll`, se `xactengine3_7.dll`.

   A tipikus hibaüzenet:

   ```
   Error code [126]: Failed to load x3daudio1_7.dll, the file is missing or corrupt!
   ```

   **A megoldás — és a buktató benne:**

   1. Töltsd le a hivatalos offline csomagot:
      [`directx_Jun2010_redist.exe`](https://download.microsoft.com/download/8/4/A/84A35BF1-DAFE-4AE8-82AF-AD2AE20B6B14/directx_Jun2010_redist.exe)
      (~96 MB)
   2. Futtasd. **Ez nem telepít, csak kicsomagol** — megkérdezi, hova, kipakol, és kilép. Sokan itt
      hiszik azt, hogy elszállt.
   3. Menj a kicsomagolt mappába, és futtasd a **`DXSETUP.exe`**-t. **Ez telepít ténylegesen.**
   4. Ellenőrzés: `Test-Path C:\Windows\System32\x3daudio1_7.dll` → `True`

   > ⚠️ **Ne tölts le egyedi DLL-t „dll-letöltő" oldalakról.** Erre a hibaüzenetre azok jönnek ki
   > elsőként a keresőben, és rendszeresen malware-t szállítanak.
   >
   > ⚠️ **A `winget install Microsoft.DirectX` nem elég.** Kipróbálva: „Successfully installed"-ot
   > ír, a `winget list`-ben meg is jelenik, de **egyetlen DLL-t sem telepít** — a csomag a webes
   > telepítő, ami csendes módban kilép. Az offline csomagot használd.

   Ha `.dll` hiba a Visual C++-ra utal, akkor kell ez is:
   [Microsoft Visual C++ 2010 Redistributable](https://www.microsoft.com/en-us/download/details.aspx?id=48145)

5. **Email + jelszóval lépj be**, ne vendégként. Ha az observer fióknak még nincs PUBG Mobile
   identitása: indítsd el a játékot telefonon, válaszd a **Guest login**-t, majd csatolj hozzá
   emailt és jelszót.
6. **Állítsd át a kliens nyelvét** kínairól angolra (guideline §11-II). Az alábbiak angol
   feliratokat feltételeznek.

> **Ha a kliens közvetlenül a belépés után összeomlik**, a guideline egy megoldást kínál — szó
> szerint idézem, mert a forrásban félreérthetően van megfogalmazva: hozz létre egy új felhasználói
> környezeti változót `~0x200000200000000` értékkel (Vezérlőpult → Rendszer → Speciális
> rendszerbeállítások → Új felhasználói változó), majd indítsd újra a gépet. Azt **nem írja meg,
> hogy mi legyen a változó neve.** Ha ebbe futsz bele, kérdezd Zsófit, ne találgass.

---

## 4. Az OPENID whitelistelése

Ez az a lépés, aminek átfutási ideje van. Kezdd el abban a percben, amikor a kliens elindul.

A csomagban **két** ilyen `.bat` van, és nem ugyanazt csinálják:

| Fájl                      | Hol                                                  | Mit csinál                                                |
| ------------------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| `SearchOpenID.bat`        | `WindowsNoEditor\ShadowTrackerExtra\Binaries\Win64\` | Elindítja a klienst a login-képernyőre `-log` kapcsolóval |
| `get_facebook_openid.bat` | `ObToolsNew\`                                        | **Kiírja az OPENID-t** a bejelentkezés után               |

A sorrend tehát: előbb lépj be a kliensbe (`SearchOpenID.bat` vagy a rendes indítás), **utána**
futtasd a `get_facebook_openid.bat`-ot.

A második fájl belsejéből kiderül, honnan olvas — és ez a leggyorsabb út, ha a `.bat` nem indul:

```
%LOCALAPPDATA%\ShadowTrackerExtra\Saved\token.txt
```

Ez egy vesszővel tagolt sor, és az **OPENID a harmadik mező**. Ha a `.bat` valamiért nem működik,
nyisd meg ezt a fájlt Jegyzettömbben, és olvasd ki kézzel.

> A fájl **most nem létezik** — a kliens még soha nem lépett be ezen a gépen. Az első sikeres
> belépés hozza létre. Ez egyben a legegyszerűbb ellenőrzés is arra, hogy a belépés tényleg
> megtörtént-e.

1. Lépj be a kliensbe.
2. Futtasd a `ObToolsNew\get_facebook_openid.bat`-ot, és olvasd ki az **OPENID** számsort.
3. Küldd el Zsófinak, ő továbbítja a kiadónak whitelistelésre.
4. **Két fiókkal csináld, ne eggyel.** Ha az egyik a helyszínen bedől, újat kérni már nincs idő.

Amíg ez nincs meg, minden lentebbi lépés lefut, de adat nem jön.

### „Mire kell az OPENID, ha a fiók már whitelistelt?"

**Az OPENID _maga_ a whitelist azonosítója** — nem külön lépés. Ezt küldted el, és a kiadó ezt vette
fel az engedélyezett listára. Ha a fiók már whitelistelt, **ez a szakasz kész, ugorhatod.**

Egy dolgot ér még, és az fontos: **annak ellenőrzését, hogy a megfelelő fiókkal vagy-e bejelentkezve.**
Nyisd meg ezt a fájlt, és vedd a **3. mezőt**:

```
%LOCALAPPDATA%\ShadowTrackerExtra\Saved\token.txt
```

Hasonlítsd össze azzal az OPENID-vel, amit annak idején whitelistelésre küldtél. Ha nem egyezik,
rossz fiókkal vagy bent — és ez pontosan az a hiba, ami később úgy jelentkezik, hogy „minden fut, de
nincs adat", miközben látszólag semmi sem rossz.

> Ugyanez az azonosító-fajta szerepel az API-válaszban is, `playerOpenId` néven, a játékosokra.

---

## 5. 1. szint — nézzük meg, válaszol-e az API, meccs nélkül

Tíz perc, szoba nem kell. Csináld meg, amint a kliens fent van.

1. Indítsd el a PCOB klienst, lépj be.
2. **Pipáld be az „API Enable"** gombot.
3. Nyiss egy parancssort, és futtasd:

   ```
   <csomag>\ObToolsNew\launch.bat
   ```

   > ⚠️ **A guideline rossz útvonalat ír.** Ott ez szerepel:
   > `WinClient_OB_live\WinClient_OB\ObToolsNew\launch.bat`. Ilyen mappa **nincs** a 4.5.0
   > csomagban sem (ezt élesben újra ellenőriztük) — az `ObToolsNew` közvetlenül a **csomag
   > gyökerében** van.

   **Ezt az ablakot hagyd nyitva.** Ha bezárod, az API leáll.

   > ⚠️ **Az ablak üres marad, és ez normális.** A `launch.bat` egyetlen sora `node.exe ob.js`, az
   > `ob.js` pedig átirányítja a saját kimenetét fájlba. Tehát **nem fogsz semmilyen üzenetet látni**
   > benne, akkor sem, ha minden tökéletesen működik. Ne ebből próbáld eldönteni, hogy él-e — arra a 4. lépés való.

4. Ugyanezen a gépen, böngészőben nyisd meg:
   ```
   http://127.0.0.1:10086/isingame
   ```
   Ha bármi visszajön — akár `{"isInGame":false}` —, az API él.
5. Futtasd a capture szkriptet ([8. pont](#8-a-capture-futtatása)) rövid ablakkal:
   ```
   capture-pcob.bat -Seconds 30
   ```

Meccs nélkül is végigmegy mind a tizenhárom dokumentált útvonalon, és elmenti, amit kap.
**Küldd át a mappát akkor is, ha üresnek tűnik.** Egy üres, de formával bíró válasz is elárulja a
boríték kulcsát — épp azt, amiben a legkevésbé vagyunk biztosak.

> ⚠️ **Ez a teszt NEM igazolja a whitelistet.** A whitelist azt szabályozza, hogy a játékszerver
> küld-e adatot a kliensnek; a `launch.bat` helyi HTTP szervere ettől függetlenül elindul és
> válaszol. Vagyis a végig zöld 1-es szint mellett is kiderülhet később, hogy a fiók nincs
> whitelistelve. **Ezt csak egy valódi meccs mutatja meg** — és ez a legfőbb ok, amiért nem szabad
> az első éles adást megvárni vele.

---

## 6. Szoba létrehozása

**Telefonon** — a PC OB kliensből ez nem megy.

1. Váltsd be a tournament CD-KEY-t a PUBG Mobile beváltó oldalán, a telefonos fiók
   **Character ID**-jével.
2. Nyisd meg a játékbeli **postaládát**, és vedd át a kártyát a **készletbe** (Inventory).
3. A készletben **használd** a kártyát.
4. Hozz létre egy **tournament custom room**-ot.

   > **Tournament** kártyának kell lennie. A normál és az advanced szobakártyán nincsenek meg az
   > esport-beállítások és a 30 OB-hely.

5. Jegyezd fel a **szoba azonosítóját**.

> ⚠️ **Soha ne a PC OB kliens legyen a hoszt.** A guideline nyersen fogalmaz: ha a PC OB a hoszt és
> összeomlik, az egész meccs vele omlik. Mindig telefonról hosztolj.

---

## 7. A tesztmeccs

1. A játékosok telefonról belépnek a szobába.
2. **Az observer a PC OB kliensből csatlakozik, és observer módba áll.**
3. **A meccs indulása ELŐTT pipáld be az „API Enable"-t.** Ha ez kimarad, nincs adat — és messze ez
   a leggyakoribb oka annak, ha látszólag semmi nem működik.
4. Ellenőrizd, hogy a `launch.bat` még fut a saját ablakában.
5. Indítsd el a capture-t ([8. pont](#8-a-capture-futtatása)) nagyjából egy perccel a meccs kezdete
   **előtt**.
6. Indítsd a meccset.
7. **A hoszt végig maradjon bent a szobában.** Amíg a hoszt le van csatlakozva, nincs API-adat.
8. A meccs vége után **várj legalább 30 másodpercet**, mielőtt a hoszt kilép. A végeredmény
   késleltetve érkezik.

### Mitől lesz jó a felvétel

Három dolog, fontossági sorrendben:

1. **Essen ki legalább egy csapat a felvétel alatt.** Ez válaszolja meg, hogy a `rank` menet közben
   töltődik-e vagy csak a meccs után — és ez dönti el, honnan jön a ranglista helyezési pontja.
2. **A felvétel érje el a meccs végét**, és ha lehet, a következő elejét is. Ez mutatja meg, hogy az
   adat nullázódik, megmarad vagy kiürül két meccs között.
3. **Fusson legalább egy percig.** Egy korai és egy késői minta összevetése bizonyítja, hogy a
   játékosazonosítók stabilak — ezen áll vagy bukik az ALIVE oszlop elrendezése.

Az a felvétel is ér valamit, amiben ezek közül egy sincs. Az, amiben mind a három megvan, lezárja az
ügyet.

---

## 8. A capture futtatása

A szkript ebben a repóban van, a [`tools/`](../../tools/) mappában. Másold át a mappát az OB gépre —
semmi mást nem kell telepíteni hozzá, csak Windows kell.

**Dupla katt a `capture-pcob.bat`-ra.**

Amit csinál:

- ellenőrzi, hogy elérhető-e az API, és ha nem, pontosan megmondja, mit nézz meg;
- egyszer végigmegy mind a tizenhárom dokumentált útvonalon, és mindent elment;
- utána 5 percen át 2 másodpercenként mintát vesz a négy élő útvonalról;
- a végén kiírja, mit sikerült tisztázni — így még a helyszínen látod, hogy jó lett-e.

Kapcsolók, ha kellenek:

```
capture-pcob.bat -Seconds 600
capture-pcob.bat -BaseUrl http://192.168.1.50:10086
```

A második akkor kell, ha a capture **másik** gépen fut, nem az observerén. A PCOB API az OB gép saját
címén figyel, tehát ez működik — de az adott gép tűzfalán engedni kell a 10086-os portot.

Ha végzett, **zippeld be a kimeneti mappát** (az Asztalra kerül, `pcob-capture_<dátum>` néven), és
küldd át. Csak nyers JSON van benne: játékosnevek és -azonosítók, ezen túl semmilyen személyes adat.

### Van egy második adatforrás is, ingyen

Az `ob.js` **magától naplóz minden kérést és minden válasz teljes törzsét** ide:

```
<csomag>\ObToolsNew\log\log-ÉÉÉÉHHNN.txt
```

Ez akkor is keletkezik, ha a capture szkriptet el sem indítod — a `launch.bat` elindításának
pillanatától gyűlik. Két következménye van:

- **Ha elfelejted futtatni a capture-t, az adat akkor is megvan.** A meccs után küldd át ezt a
  fájlt; nehezebb feldolgozni, mint a rendezett mappát, de mindent tartalmaz.
- **Gyorsan hízik**, és minden lekérdezés minden válaszát tárolja. Hosszú verseny után érdemes
  ránézni a méretére, és a `log/` mappát időnként üríteni.

Ha a szkript valamiért nem indul el a helyszínen, ez a mentőöv.

---

## 9. Kérdések Zsófinak

Három dolog, amire a gyártói dokumentumok nem válaszolnak, és bármelyik megspórolhatja az egész
kiszállást:

1. **Hány játékos kell egy custom szobába, hogy elinduljon a meccs?** Ha kettő, a teszt triviális. Ha
   tizenhat, azt szervezni kell.
2. **Ad-e az API adatot visszajátszás közben?** A kliensben van replay-idővonal (`J`) és
   „meccseredmény betöltése" gomb (`E`). Ha replay fölött is működik az API, akkor **nem kell élő
   játékos**, és az egész íróasztal mellől megoldható.
3. **A júniusi időszakból megvan még a fiókok whitelistje?** Ha igen, az [1. pont](#1-mi-kell-hozzá-és-kitől)
   3-as és 4-es tétele már kész.

---

## 10. Ha nem jön semmi

Ezt a listát vedd sorra — aszerint van rendezve, hogy melyik szokott lenni az ok:

| Tünet                                   | Mit nézz meg                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| A szkript azt írja, nem éri el az API-t | Nyitva van még a `launch.bat` ablaka?                                                         |
| Nyitva van, mégsincs semmi              | Be volt pipálva az **„API Enable"** a meccs indulása _előtt_?                                 |
| Ez is rendben, mégsincs adat            | Whitelistelve van az OPENID? Enélkül minden fut, és adat nincs.                               |
| Minden fenti rendben, élő meccs alatt mégsincs adat | A PC OB kliens **ténylegesen a meccset mutatja-e** (nem lobbiban/menüben áll)? Egyezik-e a bejelentkezett OpenID (`%LOCALAPPDATA%\ShadowTrackerExtra\Saved\token.txt`, 3. mező) azzal, amit whitelistelésre küldtél? *(Élesben előfordult: 2026-08-28, 2 csapat, 1-1 játékos — az `isingame` tartósan `false` maradt, holott az „API Enable" be volt pipálva és a `launch.bat` futott. A root cause ezen a napon nem lett tisztázva.)* |
| Meccs közben elhallgat                  | Kilépett a hoszt a szobából? Hoszt nélkül nincs API.                                          |
| Helyben megy, másik gépről nem          | Tűzfal az OB gépen, 10086-os port.                                                            |
| A kliens el sem indul                   | Rossz `.exe` — a `Binaries\Win64` alattit használd ([3. pont](#3-a-pc-ob-kliens-telepítése)). |
