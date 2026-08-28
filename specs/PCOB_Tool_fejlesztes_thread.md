# PCOB Tool fejlesztés

## Zsófia Berze → Bertalan Varga-Molnár

**2026. augusztus 9. 17:04**

Szio!

Ennyit beszéltünk itt mailben. :)

---

## Bertalan Varga-Molnár → Zsófia Berze

**2026. április 17. 11:07**

Szia Zsófia!

Tekintettel arra, hogy az Esport1 részéről ez nem az első (és reményeim szerint nem is az utolsó) szoftverfejlesztési együttműködésünk, továbbá, hogy nem "tegnapra kell", így a becsléseim szerint **155.000 forintra jön ki az árajánlatom.**

Ez tartalmazza a felhasználó központú, használati útmutató-szerű dokumentációt, egy mini webszervert, ami adatot fogad és feldolgoz, illetve ready-to-use böngészőforrást generál real time adatokkal, ami használható minden mainstream streaming programban.

Az overlay testreszabhatósága első körben színvilág és betűtípus állításában merül ki, de ha később bővíteni szeretnétek az appot, akkor beszélhetünk egy vezérlőpultról is.

Az overlay támogatni fog FullHD, 1440p és 4K felbontásokat is dinamikusan.

Köszönöm az előzetes információkat, és ha megvan a zöld jelzés ezekre a feltételekre és az összegre, akkor kezdem is a fejlesztést.

Üdvözlettel,  
Berci

---

## Zsófia Berze → Bertalan Varga-Molnár

**2026. április 17. 09:43**

Szia Berci,

PCOB setup és linkek:

"PMNC oldalról szeretném összefoglalni a számomra ismeretes lépéseket, illetve amit az observernek mindenképpen meg kéne tenni, a kapott guide alapján, illetve azt kiegészítve (Korábban megosztásra került guide).

### Ezt mielőbb meg kellene tenni:

1. Letölteni innen a fájlokat:
   - [Google Drive fájl](https://drive.google.com/)

2. Első belépésnél javasolt email / jelszó belépés.
   - **[BELÉPÉSI ADATOK REDAKTÁLVA]**
   - Majd amikor bejön, ebben a dokumentumban található `.bat` fájl indítása kellene.

   - [Google Drive `.bat` fájl](https://drive.google.com/)
   1. Ha nincs PUBG Mobile fiókja az observernek, akkor mobilról a játékot indítva a legegyszerűbb a "Guest login-t" választani, majd a fiókhoz hozzácsatolni az emailt + jelszót.

3. A `.bat` fájl indítása után az OPENID számsorra lenne szükségem. Ezt az OPEN ID fiókot el kell küldenem a kiadónak, hogy whiteliteljék a fiókokat, a további lépések a játékba, illetve az API-ból kapott adatok csak így lehetséges megkapni.
   - Javasolt lenne 2 fiókkal is megtenni ezt a biztonság kedvéért.

### Ha megvan a whitelist:

- Lobbi elkészült, observer becsatlakozik a ShadowTrackeren keresztül (PCOB kliens), beáll observer módba, bepipálja az "API ENABLE" gombot, majd futtatja parancssorból a `WinClient_OB_live\WinClient_OB\ObToolsNew\launch.bat` parancsot.
- A beugró ablakot végig nyitva kell hagyni.
- A mérkőzés vége után parancssorba bemásolandó:
  - `http://localhost:10086/gettotalplayerlist`
  - Erre érdemes többször ráfrissíteni a mérkőzés után.
- Ezt az adatot JSON-ba le lehet menteni, JSON-t `.CSV`-be átkonvertálni (itt már nem biztos, hogy pontos amit írok, nem teszteltem), majd a kapott adathalmazt Google Sheetre átmásolni, onnantól pedig rendszerezni, hogy közvetítőszoftverbe megjeleníthető legyen (ezt már ti látjátok jobban).

### Amit observernek be kell állítani PC-ről:

- Ezen dokumentum 10-es pontja.

A dinamikus tabella része nem tudom még pontosan hogyan működik, igyekszem informálódni és mielőbb továbbítani, de javaslom mielőbb küldjétek meg az OPEN-IDkat hogy a whitelist megtörténhessen."

---

Ezen felül **2026. június 2. – június 7. között** használnánk legközelebb, így május vége lenne a legjobb.

Árajánlatot kérlek majd válaszba dobj!

Köszi!  
Zsófi
