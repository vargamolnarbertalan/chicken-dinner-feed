## Új funkció: több pályán átívelő pontok követése

Az eddigi működés nem teljesen rossz, de a pályára vonatkozó rövid memória helyett egész tournamentek/szériák pontszámkövetését kell támogassuk. Ehhez kell egy új aloldal (a Fonts után) Series control néven, ahol van egy reset series gomb (megerősítő dialog panel feljön, mint törlésnél, mert risky action), ami reseteli a szériában megszerzett pontokat (és map historyt) és újra kezdjük.

Legyen különálló táblázatokban megjelenítve a jelenlegi összesített állás, és az egyes eddigi már véget ért meccsek eredménye.

## Automata meccs lezárás

Ha az API vagy valami egyéb logika alapján el tudjuk dönteni, hogy a futó pálya véget ért, akkor mentsük el, mint lezárt pálya. Erre a funkcióra a Series control aloldalon legyen manuális gomb is, és azt is tegyük lehetővé, hogy a korábbi pályák eredményeit visszamenőlegesen átírjuk, ha esetleg az automata felismerés hibát vét. 

Ha az API streameli, hogy milyen páylán (pl. Erangel, Miramar stb) vagyunk akkor mentsük el, ha nem, nem érdekes.

A játszott pályákhoz mentsünk kezdő és befejező datetime-ot, amit a felhasználó lokális időzónájában írjunk ki. Jelenítsük meg azt is, hogy a pálya lejátszása mennyi ideig tartott (kettő különbsége).

Az élő overlayen a lezárt pálya végeredménye legyen a következő pálya kezdetéig/manuális széria resetig.

Széria reset csak manuálisan legyen lehetséges az appban, nincs minimum vagy maximum pálya szám.

## Pontok kiosztására és rendezésre vonatkozó szabály, single source of truth

ELIMS oszlop: az aktuális pályán belüli killeket számolja, új pálya esetén (de ugyanaz a széria) resetelődik, mindenki 0-ról indul. Ez lényegében változatlan.

PTS oszlop: az eddig a SZÉRIÁBAN/TOURNAMENTEN **már garantált** total pontokat mutatja, nem adódik hozzá automatikusan az éppen futó pályának a "ha minden így maradna" jellegű placement pontjai, de az éppen futó pálya ELIMS száma igen.

Ez azt is jelenti, hogy live-table szerűen az admin által konfigurált placement pontok alapján már legalább megszerzettet is hozzáadjuk: pl ha 9 élő csapatból 8 lesz, és a placement pontok alapján a 8. csapat kap 1 pontot, akkor mivel minden élő csapatra igaz, hogy legalább már 8.-ok lesznek, azt élőben hozzáírjuk. Ha pl már csak két csapat él, és a 2. placement 6 pontot kap, akkor mind a kettőhöz 6-ot hozzáadhatunk, mert legalább már második helyért járó pontot biztos szereznek.

Ezeket a real time live update-eket az eredeti, meccs előtti pontjukhoz adjuk, tehát nem duplán adjuk hozzá, hogy előbb hozzáadunk top 8-ban 1-et, utána top 6-ban kettőt stb, hanem minden kiesésnél deltát számolunk, vagy az eredetihez képest újraszámoljuk.

Ezen mutató alapján történik a csapatok rendezése. 

Ha két ugyanannyi PTS van, akkor az ELIMS a tiebreaker, ha az is egyezik, akkor csapatnév ABC.

 Azt, hogy melyik csapat él még és melyik esett már ki, azt csak az jelzi, hogy ki van szürkítve, de nem kell minden élő csapatnak a felső blokkban lennie és minden kiesett csapatnak alul tömbösítve, simán a PTS a sorrend meghatározója. Tehát lehet, hogy valaki az első, hiába a futó pályából már kiesett, mert olyan sok pontja van. Ez esetben első, csak simán szürke.

 ## Spreadsheet, amit használhatsz puskának, mert versenybírók töltötték, bár új infót nem biztos, hogy tartalmaz számunkra:
 https://docs.google.com/spreadsheets/d/1mKfiI0hfOJgCIPXW2Cvqf62QyP2PWbUo-qSOmmWRyKc/edit?pli=1&gid=192081450#gid=192081450