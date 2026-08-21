# Co Project Console umí

Přehled hotového stavu k 21. 8. 2026. Kam to směřuje, je v [ROADMAP.md](ROADMAP.md),
technické detaily a build v [README.md](README.md).

## K čemu to je

Jedno okno na jeden projekt: vlevo shell, ve kterém běží agent nebo build, vpravo
dokument, podle kterého se řídíš, a vedle něj běžící aplikace. Dokument se překresluje
sám, jakmile ho někdo na disku přepíše, takže agenta pracujícího vedle něj jde
sledovat, aniž bys soubor otevíral znovu.

Není to editor. Psaní kódu a review velkého diffu zůstává v editoru — [seznam věcí,
které se vědomě nestaví](ROADMAP.md#non-goals), je v roadmapě.

## Okno a taby

- **Tab je místo, ne soubor.** Drží adresář, svůj shell, svůj dev server a všechny
  soubory, které jsi v něm otevřel; jeden z nich je na obrazovce. `Ctrl+T` udělá další
  místo, `Ctrl+W` zavře soubor a teprve poslední zavře tab.
- **Mezi soubory v tabu** se chodí `Ctrl+PageUp` / `Ctrl+PageDown`, stavový řádek
  říká kolikátý z kolika, tooltip tabu je vypíše všechny.
- **`Ctrl+P`** nabídne, co je otevřené tady, a po prvním písmenu každý soubor
  projektu. Soubor otevřený v jiném tabu se nabídne taky a řádek to řekne.
- **Vlastní jméno tabu** dvojklikem na popisek — co tam děláš, popisuje místo líp než
  jméno souboru.
- **Tečka na tabu** říká, co se v něm děje, když se zrovna díváš jinam: blikající
  kroužek pracuje se, zelená hotovo nebo je chvíli ticho, oranžová ptá se na
  povolení, červená zazvonil nebo spadl shell. Když program svůj stav hlásí sám
  (`OSC 9;4`, což Claude Code umí), tečka mu věří; jinak hádá z ticha a tooltip
  řekne, které to je.
- **Ikona v hlavním panelu** dělá totéž přes všechny taby dohromady, aby to bylo
  poznat i z jiné obrazovky, a nese číslo: kolik tabů na tebe čeká. Tab se počítá
  jednou, ať má důvodů kolik chce, pracující taby se nepočítají, a barva je ten
  nejnaléhavější důvod — zelená hotovo, oranžová ptá se, červená spadl.

## Dokument

- **Živý Markdown**: nadpisy, seznamy, tabulky, checkboxy, citace, kód se
  zvýrazněnou syntaxí, obrázky, relativní odkazy mezi soubory.
- **Načítá se sám**, ať soubor přepíše kdokoli — ty, editor, agent. Pozice
  posuvníku zůstává, kde byla.
- **Změněná místa se na pět vteřin označí**, takže je vidět, do čeho ten druhý sáhl.
  Tab, který se změnil na pozadí, blikne až při otevření, a jen jednou.
- **`Ctrl+E`** přepne na prostý text tak, jak je zapsaný; tam jde i psát a `Ctrl+S`
  uloží. Neuložené úpravy nejdou zavřít potichu.
- **`Ctrl+F`** hledá v dokumentu, `Enter` a `Shift+Enter` skáčou po nálezech.
- **Smazaný soubor** zůstane otevřený jako nedostupný a načte se sám, jakmile se
  objeví zpátky.

## Shell

- **Ctrl+`** rozdělí tab: shell vlevo, dokument vpravo, dělič se hýbe myší i
  klávesnicí. Jeden shell na tab, žije, dokud tab žije — schování panelu ani přepnutí
  tabu proces neruší.
- **Startuje v adresáři dokumentu**, takže build i agent běží tam, kde soubor leží.
- **Cesty ve výstupu jsou klikací**: `src/main/index.ts:224` otevře ten soubor na tom
  řádku. Nabídnou se jen cesty, které opravdu existují.
- **Prompt buffer (`Alt+P`)** je šuplík pod shellem na delší zadání; `Ctrl+Enter` ho
  pošle jako jeden celek, takže víceřádkový prompt nedojde do TUI po částech.
  Rozepsaný text přežije restart.
- **Velikost písma** `Ctrl+=` / `Ctrl+-`, pamatuje se.

## Spuštění a web

- **Jedno tlačítko Spustit.** Projekt se najde chozením nahoru od dokumentu;
  `package.json` přispěje svým `dev`, `start`, `serve` nebo `preview`, solution nebo
  `.csproj` přispěje `dotnet run`. Monorepo nabídne seznam a volbu si zapamatuje.
  Žádné tlačítko na build ani testy — spuštění buildí stejně a zbytek je příkaz do
  shellu, který je hned vedle.
- **Webový panel.** Adresu, kterou dev server vypíše, aplikace zachytí z výstupu a
  stránku ukáže vedle dokumentu. Spuštění tlačítkem ji otevře samo.
- **`Alt+W`** cykluje pravou stranu: dokument, dev server, obojí vedle sebe.
  Adresu jde i napsat ručně a ta pak výstupu nepodléhá. Jen adresy na tomhle stroji.

## Panely

Ctrl patří tabům, Alt panelům, jako v tmuxu: `Alt+←` / `Alt+→` fokus, `Alt+1/2/3`
shell / dokument / server, `Alt+Shift+šipky` posun děliče, `Alt+Z` zvětšení na celý
tab a zpět. Jakmile má fokus shell, ostatní klávesy jdou nedotčené jemu.

## Čísla vpravo dole

- **Tahle session**: kontext, který měl model minule před sebou, a všechno, co za
  session napsal. Čte se z transcriptu, který Claude Code píše tak jako tak — session
  se na nic neptá a nic ji to nestojí.
- **Účet**: pětihodinové okno a sedmidenní limit jako ukazatele od 0 do 100, stejná
  čísla jako `/usage`. Barva se čte jako palivoměr — do poloviny zelená, od poloviny
  oranžová, od čtyř pětin červená. Tooltip řekne, kdy se okno obnoví.
  Když se je nepodaří zjistit, nezobrazí se nic — nikdy chyba.

## Vzhled, jazyk, paměť

- **Motiv** Auto / Světlý / Tmavý (`Ctrl+D`), platí i na nativní části okna.
- **Jazyk rozhraní** EN/CS, tlačítko ukazuje, na co přepne. Klávesy, cesty a výstup
  shellu se nepřekládají.
- **`?`** ukáže všechny zkratky a pod nimi i to, co se děje bez klávesy.
- **Session se pamatuje**: otevřené soubory, aktivní tab, rozložení panelů a šířky
  děličů, jména tabů, rozepsaný prompt, pozice okna. Po startu jsi tam, kde jsi
  skončil. Neuložená úprava souboru se ale nepamatuje — na tu se aplikace zeptá při
  zavírání a jinam ji neodkládá.

## Bezpečnost

Markdown se nikdy nespustí: HTML v souboru se escapuje, renderer běží s
`contextIsolation` a bez Node, do hlavního procesu vede jen úzký most v preloadu.
Webový panel je sandboxovaný rámec a CSP mu dovolí jen `localhost`.
