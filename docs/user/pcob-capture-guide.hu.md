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
| 1   | PC OB kliens, v4.3.0 (három fájl)        | Az Esport1 Google Drive-ja       | Nem — kérd Zsófitól       |
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

1. **Töltsd le a három fájlt** az Esport1 Drive-linkjéről, és csomagold ki.
2. **Tedd fel a patchet.** A `.pak` fájl ide megy:
   ```
   %LOCALAPPDATA%\ShadowTrackerExtra\Saved\Paks
   ```
   (Másold be az Intéző címsorába — magától feloldódik.)
3. **A klienst a helyes helyről indítsd.** Menj ide:

   ```
   .\WindowsNoEditor\ShadowTrackerExtra\Binaries\Win64
   ```

   jobb klikk a `ShadowTrackerExtra.exe`-n → **Futtatás rendszergazdaként**.

   > ⚠️ Van egy másik `ShadowTrackerExtra.exe` közvetlenül a `\WindowsNoEditor` alatt is. A guideline
   > kifejezetten kimondja, hogy **az nem fog működni**. A `Binaries\Win64` alattit használd.

4. **Ha hiányzó DLL-re panaszkodik**, telepítsd:
   - [Microsoft Visual C++ 2010 Redistributable](https://www.microsoft.com/en-us/download/details.aspx?id=48145)
   - [DirectX End-User Runtime](https://www.microsoft.com/en-us/download/details.aspx?id=35) — ez
     kell az `x3daudio1_7`-hez
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

1. Futtasd a `.bat` fájlt, amit az Esport1 a kliens mellé adott.
2. Olvasd ki az **OPENID** számsort.
3. Küldd el Zsófinak, ő továbbítja a kiadónak whitelistelésre.
4. **Két fiókkal csináld, ne eggyel.** Ha az egyik a helyszínen bedől, újat kérni már nincs idő.

Amíg ez nincs meg, minden lentebbi lépés lefut, de adat nem jön.

---

## 5. 1. szint — nézzük meg, válaszol-e az API, meccs nélkül

Tíz perc, szoba nem kell. Csináld meg, amint a kliens fent van.

1. Indítsd el a PCOB klienst, lépj be.
2. **Pipáld be az „API Enable"** gombot.
3. Nyiss egy parancssort, és futtasd:
   ```
   WinClient_OB_live\WinClient_OB\ObToolsNew\launch.bat
   ```
   **Ezt az ablakot hagyd nyitva.** Ha bezárod, az API leáll.
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
| Meccs közben elhallgat                  | Kilépett a hoszt a szobából? Hoszt nélkül nincs API.                                          |
| Helyben megy, másik gépről nem          | Tűzfal az OB gépen, 10086-os port.                                                            |
| A kliens el sem indul                   | Rossz `.exe` — a `Binaries\Win64` alattit használd ([3. pont](#3-a-pc-ob-kliens-telepítése)). |
