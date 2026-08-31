# Claude Manager

Elektronová aplikace pro Windows: jedno okno na jeden projekt, v něm shell, živý
Markdown a běžící aplikace. Kód, komentáře a `README.md` jsou anglicky, `ROADMAP.md`,
`PREHLED.md` a `semantic/` česky.

## Plán kola — na začátku

Než začneš pracovat, napiš plán do `semantic/plan.md` a nech ho otevřený v panelu. Do
terminálu ho nevypisuj — v souboru se sám překreslí a podbarví se, co se v něm změnilo.

- **Věty o chování, ne o souborech**, stejně jako v popisu chování. Ideálně rovnou jako
  navržený rozdíl: které věty v `semantic/chovani.md` přibudou a které se přepíšou.
- **Krátce a konkrétně natolik, aby se s tím dalo nesouhlasit.** Plán, který se odklikne
  bez čtení, je horší než žádný — vyrábí pocit kontroly a nemá proti sobě žádnou pojistku.
- **Otevřené otázky jako volby**, ne jako odstavce. Odškrtnutý checkbox znamená „tohle
  nedělej", přepsaná věta „tohle jinak".
- **U bugfixu a refaktoru je plán jedna věta.** Zvláštní režim pro ně není a nebude —
  liší se jen tím, které sekce vyjdou prázdné, a prázdno je odpověď.

## Popis chování — na konci každého kola

`semantic/chovani.md` je popis toho, co aplikace dělá, vytažený z kódu. Není to plán
ani návod. Čte se jeho diff mezi koly, místo diffu kódu — proto na něm záleží, jak se
píše:

- **Věty v přítomném čase o chování.** Podmět je uživatel, okno nebo shell. Žádné názvy
  souborů, tříd, funkcí ani proměnných.
- **Přepiš jen ty věty, kterých se změna týká.** Pořadí vět, nadpisy a formátování neměň
  a soubor nikdy nepřeformátovávej — podbarví se jinak celý dokument a nebude v něm vidět
  nic.
- **Aktualizuj ho jednou, až je práce hotová**, ne průběžně během kola. Podbarvení se
  počítá proti poslednímu načtení, takže tři zápisy za sebou ukážou jen ten poslední.
- **Když se chování nezměnilo, soubor nech být** a napiš to do závěru. Prázdno je platný
  výsledek, ne nedodělaná práce — u refaktoru je to ta hlavní kontrola.
- **Netvrď nic, co jsi neověřil v kódu.** Co ověřit nejde, patří do sekce
  „Co se z kódu nepotvrdilo“, ne mezi tvrzení.

Ta pravidla popisuje `ROADMAP.md`, sekce **L6 — Sémantická vrstva**, spolu s tím, proč
to takhle je a co má přijít dál.

## Roadmapa — taky na konci

`ROADMAP.md` je backlog: vrstvy se značkami hotovo / rozdělaný / návrh a u každé etapy
kritérium „Dál, když". Když kolo něco z toho dodělalo, odškrtni to tam. **Kolo končí dvěma
zápisy, ne jedním** — popis chování říká, co aplikace dělá, roadmapa co dál. Druhý seznam
úkolů nezakládej.

## Údržba

- Testy: `npm test` (Node runner nad `.ts` přímo, bez frameworku). Co je čistá funkce
  svého vstupu, má mít test.
- Formátovač tu není a styl je držený rukou — `npx prettier` na tenhle repozitář nepouštěj.
- Před přestavěním aplikace se musí zavřít běžící instance; `npm run build` a
  `build:dir` proto nespouštěj bez vyzvání.
