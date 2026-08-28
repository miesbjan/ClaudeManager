# Co Claude Manager dělá

Popis chování aplikace, vytažený z kódu. Ne plán a ne návod — věty o tom, co platí teď.
Agent ho aktualizuje na konci každého kola, pravidla jsou v `CLAUDE.md`. Diff tohohle
souboru mezi koly je to, co se čte místo diffu kódu.

## Okno a taby

- Tab je místo: drží adresář, svůj shell, svůj dev server a všechny soubory, které jsi v něm otevřel; na obrazovce je jeden z nich.
- Stejný soubor může být otevřený ve víc tabech, protože každý tab je samostatné místo.
- Tab se dá pojmenovat po svém a vlastní jméno má přednost před jménem zobrazeného souboru.
- Pořadí tabů se mění tažením do strany; prostřední tlačítko tab zavře, pravé nabídne přejmenovat, načíst, zavřít a ukázat ve složce.
- Mezi taby se chodí `Ctrl+Tab`, nebo `Ctrl+1` až `Ctrl+9` podle pořadí.
- Vývojový a nainstalovaný běh mají vlastní uložený stav, takže běží vedle sebe a nepřepisují si taby.
- Druhé spuštění zástupce nespustí druhou aplikaci, jen vrátí okno.

## Místa a soubory

- Co v adresáři otevřeš, nabídne se ti tam příště samo, od naposledy otevřeného, a nemusí se nic označovat ručně.
- Ta paměť patří místu, takže přežije zavření tabu i konec session.
- `Ctrl+P` jde na soubor v projektu, `Ctrl+O` kdekoli; `Delete` na řádku nabídky (nebo `×`) soubor zavře a přestane ho nabízet.
- Nabídka souborů přeskakuje adresáře začínající tečkou a složky, které vyrobil build nebo správce balíčků.
- Soubory, které by panel stejně neuměl ukázat — obrázky, archivy, spustitelné soubory — se nenabízejí.
- Nabídka se zastaví na dvou tisících souborech a řekne, že je zkrácená, místo aby mlčky vynechala zbytek.
- `Ctrl+W` zavře soubor a poslední zavře tab.
- Soubor přetažený do okna se otevře v tomhle tabu.

## Dokument

- Dokument se načte sám, kdykoli soubor někdo přepíše — ty, editor, agent — a pozice posuvníku zůstane, kde byla.
- Bloky, ve kterých se změnily řádky, se na pět vteřin podbarví.
- Podbarvení se počítá proti tomu, co bylo naposledy načtené, ne proti stavu na začátku práce, takže tři zápisy za sebou ukážou jen ten poslední rozdíl.
- Tab, který se změnil, když ses díval jinam, blikne jednou při otevření.
- `Ctrl+E` přepne na zdroj, ve kterém jde psát, `Ctrl+S` ho uloží; víc než to editor není.
- Neuložená úprava se nedá zavřít mlčky: soubor, tab i okno se zeptají a stavový řádek řekne, který soubor to drží.
- Rozdělaná úprava se pamatuje mezi spuštěními do dvou set tisíc znaků; delší zůstane jen na obrazovce.
- `Ctrl+F` hledá v dokumentu, `Ctrl+R` ho načte znovu.
- Odkaz na jiný soubor ten soubor otevře; číslo řádku za `#` se cestou ztratí a soubor se otevře od začátku.
- Obrázek zapsaný relativní cestou se zobrazí.
- Smazaný soubor zůstane otevřený jako nedostupný a načte se sám, jakmile se objeví zpátky.

## Shell

- Na tab je jeden shell a žije, dokud žije tab; schování panelu ani přepnutí tabu ho neruší.
- Shell přežije i zavření okna: nové okno si ho vezme zpátky i s tím, co mezitím vypsal, a řekne to ve stavovém řádku.
- Z výpisu se pro tenhle účel drží posledních 256 kB, takže po velmi dlouhém běhu se vrátí jen konec.
- Cesta ve výpisu je klikací, jen když ten soubor opravdu existuje; číslo za dvojtečkou otevře soubor na tom řádku.
- `Ctrl+C` kopíruje výběr, a když není co kopírovat, přeruší; `Ctrl+V` vloží a pravé tlačítko udělá to jedno nebo druhé podle výběru.
- Velikost písma terminálu se mění `Ctrl+=` a `Ctrl+-` odkudkoli v okně a pamatuje se.
- Všechno ostatní jde do shellu nedotčené; aplikace si i za jeho fokusu bere jen přepnutí panelu, přechod mezi taby, otevírání souborů a písmo.

## Prompt pod shellem

- `Alt+P` otevře pole pod shellem, ve kterém se dá složit delší zadání, a `Ctrl+Enter` ho pošle jako jeden celek.
- Text jde do shellu jako vložení, ne jako psaní, takže víceřádkové zadání nedojde do rozhraní agenta po částech.
- Rozepsaný text přežije restart do osmi tisíc znaků.

## Spuštění a webový panel

- Tlačítko Spustit se objeví, jakmile je pod dokumentem rozpoznaný projekt, a pustí jeho příkaz v shellu toho místa.
- Projekt se hledá chozením nahoru od dokumentu, nejvýš o osm úrovní, takže dokumentace uvnitř projektu spustí ten projekt.
- Z projektu v Node se vezme `dev`, `start`, `serve`, `preview` nebo `watch`; když žádný takový není, nabídnou se skripty tvaru `dev:něco` a volba se u toho místa zapamatuje.
- Z několika projektů v .NET se vybere ten spustitelný, ne knihovna.
- Tlačítko na build ani na testy není: spuštění buildí stejně a zbytek je příkaz do shellu, který je hned vedle.
- Adresu, kterou dev server vypíše, otevře pravý panel sám.
- Přijme se jen adresa na tomhle stroji; samotné číslo se bere jako port na localhostu a `0.0.0.0` i `[::1]` se přepíšou na localhost, protože je to totéž místo.
- Adresa napsaná ručně už výstupu nepodléhá.
- `Alt+W` přepne pravou stranu na to druhé; jsou jen dvě možnosti, dokument a server.
- Vložená stránka běží ve vlastním procesu, takže její pád nezabije aplikaci ani běžící agenty.

## Tečka na tabu a ikona v hlavním panelu

- Tečka se objeví jen tam, kde je poznat agent nebo program hlásící svůj postup; nad samotným shellem v adresáři nesvítí nic.
- Kroužek se točí, dokud se pracuje, zelená znamená hotovo nebo ticho, oranžová že se agent ptá na povolení, červená zvonek, chybu nebo spadlý shell.
- Agent se pozná podle toho, co jeho rozhraní vypisuje, protože Claude Code sekvenci o postupu neposílá; změna těch textů tečku zhasne, nerozsvítí ji špatně.
- Co program o sobě řekne, má přednost před odhadem z ticha, a ticho se počítá po dvou vteřinách.
- Tečka se pohledem nemění, protože říká stav, ne nepřečtenou zprávu; jediné, co pohled zhasne, je červená, protože chyba je událost.
- Shell ukončený příkazem s kódem nula se nepočítá za pád a nic nerozsvítí.
- Ikona v hlavním panelu nese počet tabů, které na tebe čekají, barvu má podle toho nejnaléhavějšího důvodu a číslo klesá tím, že do těch tabů přijdeš — ne tím, že se podíváš na okno.

## Zavírání

- Zavřít tab, ve kterém se pracuje, se nejdřív zeptá; pracuje se znamená běží, nebo stojí na otázce o povolení.
- Hotový, tichý nebo spadlý tab se zavře rovnou.
- Křížek okna nechá aplikaci běžet za ikonou v traye vždycky, když je v některém tabu poznaný agent.
- Když běží shell, o kterém se neví, jestli je to agent, aplikace se zeptá místo hádání.
- Když neběží nic, okno se zavře a aplikace skončí; taby, rozložení i jména se vrátí při dalším spuštění.
- Bez ikony v traye se okno nikdy neschovává, protože schované okno, které se nedá vrátit, je ztracené okno.

## Čísla vpravo dole

- Tahle session ukazuje, co měl model minule před sebou a co za celou session napsal.
- Čte se to ze záznamu, který Claude Code píše tak jako tak, takže se session na nic neptá a nic ji to nestojí.
- Pod tím je pětihodinové okno a sedmidenní limit účtu; jsou to čísla o účtu, ne o tabu, takže jsou ve všech tabech stejná.
- Poslední přečtená hodnota zůstane i po restartu a okno u ní řekne, kdy ji četlo, místo aby zmizela.
- Když se nepodaří zjistit nic, nezobrazí se nic — nikdy chyba.

## Kde jsme skončili

- Tlačítko se zeptá agenta, co se v tomhle místě dělo za posledních deset commitů, a odpověď ukáže v okně jako dva krátké seznamy v řeči toho, co aplikace dělá.
- Ptá se v režimu, který smí jen číst, s omezeným počtem kroků, a stane se to jen po stisku.
- Cokoli se pokazí — chybějící CLI, chybějící repozitář, odmítnutí, vypršení času — skončí jako věta v tom samém boxu.

## Vzhled, jazyk, paměť

- Motiv je Auto, Světlý nebo Tmavý a platí i na nativní části okna.
- Rozhraní mluví česky nebo anglicky; klávesy, cesty a výstup shellu se nepřekládají.
- Panel `?` ukáže všechny zkratky a pod nimi i to, co se v okně děje bez stisku klávesy.
- Mezi spuštěními se pamatují otevřené soubory, aktivní tab, rozložení panelů, šířky děličů, jména tabů, rozepsaný prompt a pozice okna.

## Bezpečnost

- Do shellu zapisují jen dvě místa: klávesy z terminálu a příkaz z tlačítka Spustit.
- Z vykresleného dokumentu do shellu nevede cesta žádná, ani přes odkaz, ani přes obrázek.
- HTML zapsané v markdownu se escapuje a nikdy nespustí.
- Adresa vložené stránky se kontroluje na dvou místech nezávisle na sobě a shodu těch dvou seznamů hlídá test.

## Co se z kódu nepotvrdilo

- Jestli nový tab startuje shell v domovském adresáři, dokud v něm není otevřený soubor.
- Jestli otevření promptu v tabu bez shellu ten shell samo spustí.
- Jestli `Ctrl+W` v posledním souboru nechá otevřený tab, který vznikl jako místo.
- Co se stane s tabem, ve kterém je rozdělaná úprava, při ukončení z ikony v traye.

---

*První verze vznikla v sezení, které předtím četlo `README.md`, `PREHLED.md` i `ROADMAP.md`,
takže to není slepý test extrakce. Slepým testem je až první kolo, ve kterém tenhle soubor
aktualizuje sezení, které ty dokumenty nevidělo.*
