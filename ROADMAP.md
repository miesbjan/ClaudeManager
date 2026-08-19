# Roadmap

Kam projekt směřuje — a stejně důležité, kam ne.

## Co to je

Dnes je to živý prohlížeč Markdownu. Záměrem je vyrůst v **konzoli projektu**: jeden
tab na jeden pracovní adresář, v něm shell s běžícím agentem, dokument, podle kterého
se řídíš, a pár tlačítek pro příkazy, které stejně pořád píšeš.

Nosná myšlenka: **inteligence je externí proces.** Claude Code běží jako CLI
v terminálovém panelu. Tahle aplikace nikdy nemusí být chytrá — je to okno kolem
něčeho, co už funguje. Právě proto je třídenní stavba reálná, a ne absurdní.

Není to tedy „malý Cursor“. Je to těch 5 % AI editoru, které se v práci s agentem
reálně používají, plus tři věci, které nemá žádný editor.

## Proč ne VS Code nebo Cursor

Obojí umí vyrobit stejné rozložení — terminál, náhled Markdownu, tasky, git diff —
a nasazení nestojí žádnou práci. Byly zváženy a vědomě zamítnuty:

- **VS Code**: umí všechno, a to je ten problém. Cílem je malé okno se čtyřmi věcmi,
  ne IDE, ve kterém jsou čtyři věci vidět.
- **Cursor**: jeho hodnota je vlastní AI vrstva — indexace, doplňování, agent
  v editoru. V tomhle workflow je agentem Claude Code v CLI, takže ta vrstva zůstane
  nevyužitá a zbyde editor v roli okna.

Co neumí ani jeden, je dohled nad agentem: ukázat, co právě přepsal, říct, která
z pěti sessions čeká na odpověď, nebo nechat v klidu složit delší zadání. Tyhle tři
věci jsou skutečným důvodem, proč to stavět.

Výměnou se přijímá: zhruba tři dny práce teď, pár hodin údržby ročně a terminál,
který bude o něco hrubší než dedikovaný (viz Rizika).

## Model: tab = adresář

Jeden tab = jeden pracovní adresář. Z něj se odvozuje `cwd` shellu, cesty k dokumentům
i příkazy pro build. Jeden sjednocující pojem, žádný stav navíc.

```text
┌─ myproject ──────────────── other-project ──────────────┐
│ ┌──────────────────────┬────────────────────────────┐   │
│ │ claude               │ ROADMAP.md (živě)          │   │
│ │ > implementuj krok 3 │  ## Fáze 2                 │   │
│ │                      │  - [x] watcher             │   │
│ ├──────────────────────┤  - [ ] split view          │   │
│ │ ▸ build  ▸ test      │                            │   │
│ │ exit 0 · 4.2s        │                            │   │
│ └──────────────────────┴────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

Sessions se neobnovují — obnovený tab si pamatuje svůj adresář, rozložení a dokumenty,
nikdy ne běžící proces.

## Dodávání po vrstvách

Každá vrstva se vydá samostatně a zhruba týden se používá, než začne další. Pořadí je
zvolené tak, aby drahý a nevratný krok (nativní modul) přišel až ve chvíli, kdy levné
vrstvy myšlenku ověří.

### L0 — Viewer (hotovo)

Taby, live reload, bezpečné renderování, obnova session, Auto/Light/Dark.
Plus zvýraznění změn, viz decision log ze 18. 8. 2026.

### L1 — Split view (hotovo)

Dva panely v tabu, tažitelný splitter, ukládání rozložení per tab.

Dodáno rovnou spolu s L2, protože samotné rozdělení bez shellu nemělo koho obsloužit:
vpravo je dokument, vlevo shell. Dva dokumenty vedle sebe zatím nejdou — to je zbytek
téhle vrstvy, který počká, až po něm bude poptávka.

### L2 — Terminálový panel (hotovo)

`node-pty` v main procesu, `@xterm/xterm` v rendereru, data přes stávající preload
bridge. Shell startuje v adresáři otevřeného dokumentu, jeden na tab, ``Ctrl+` ``
panel ukazuje a schovává.

Proces žije, dokud žije tab: schování panelu ani přepnutí tabu ho nezabije, zavření
tabu ano. Zkratky aplikace se při fokusu v terminálu stahují na `Ctrl+Shift+…`, aby
`Ctrl+W` a `Ctrl+D` patřily shellu.

Zbývá k modelu „tab = adresář“: tab je pořád dokument a adresář se z něj odvozuje.
Otevřít tab nad adresářem samotným, bez dokumentu, zatím nejde.

### L3 — Tasky

Tlačítka, která spustí pevně daný příkaz v adresáři tabu, výstup teče do panelu.
Exit kód, doba běhu, spuštění znovu. Nic dalšího.

*Hotovo, když:* build a testy jdou spustit bez přepínání oken.

### L4 — Šuplík

Jeden sbalitelný panel per tab, defaultně zavřený, uvnitř přepínač obsahu — takže
základní UI získá přesně jeden prvek, ne pět.

- git diff, jen ke čtení — co agent reálně změnil
- feed změn — kterých souborů se za poslední minuty dotkl
- prompt buffer — složit delší zadání, jednou klávesou poslat do terminálu
- tail logu

### L5 — Konfigurace workspace a paleta příkazů

Deklarativní soubor v kořeni projektu, který popisuje panely a tasky:

```json
{
  "panes": [
    { "type": "terminal", "command": "claude", "size": 0.5 },
    { "type": "doc", "path": "docs/ROADMAP.md" }
  ],
  "tasks": [
    { "label": "build", "run": "npm run build" },
    { "label": "test",  "run": "npm test" }
  ]
}
```

Příkazy jsou řetězce, nikdy ne kód. K tomu `Ctrl+P` pro přepínání tabů, dokumentů,
tasků a rozložení — funkce dostane jméno, ne tlačítko.

L5 je záměrně poslední: nejdřív rozložení natvrdo a teprve pak udělat deklarativní ty
tři věci, které se v praxi opravdu přepínají. Opačně vzniká konfigurace sama pro sebe.

## Tři funkce, které ospravedlňují celou stavbu

Všechno ostatní na seznamu je reimplementace editoru. Tyhle ne:

1. **Zvýraznění změn** (hotovo) - po live reloadu krátce podbarvit bloky, které se
   změnily, ať je vidět, co agent právě přepsal, bez čtení celého dokumentu znovu.
   Granularita je blok, ne slovo, a změna mimo viditelnou část dokumentu se neohlásí.
   Na to druhé je odpověď tečka aktivity, ne autoscroll.
2. **Tečka aktivity na tabu** — označit tab, kam přiteklo něco nového nebo kde proces
   čeká na vstup. Zásadní ve chvíli, kdy běží několik sessions naráz.
3. **Prompt buffer** — pole pro složení delšího zadání, odeslané do terminálu jednou
   klávesou. Psát víceřádkové prompty přímo do TUI je otrava.

Levné drobnosti ve stejném duchu, žádná nestojí trvalý pixel: název větve a počet
změněných souborů v titulku tabu a `Ctrl+F` uvnitř dokumentu.

## Uzavřený seznam funkcí

Hotový produkt jsou tyhle věci a nic víc:

| Oblast  | Funkce                                                              |
| ------- | ------------------------------------------------------------------- |
| Základ  | taby vázané na adresář, rozdělené panely, ukládání rozložení         |
| Základ  | živý panel s Markdownem (jen ke čtení, sanitizovaný)                 |
| Základ  | terminálový panel                                                    |
| Základ  | tlačítka pro tasky                                                   |
| Šuplík  | git diff (jen ke čtení), feed změn, prompt buffer, tail logu         |
| Extra   | zvýraznění změn, tečka aktivity, prompt buffer, `Ctrl+F`, paleta     |

Přidání položky na tenhle seznam je rozhodnutí, ne detail — patří k němu řádek
v decision logu níže.

## Non-goals

Vědomě odmítnuto, protože každá z těch věcí je první krok k tomu, čemu se projekt
chce vyhnout:

- textový editor a k němu strom souborů
- rozšíření nebo pluginy; konfigurace zůstane deklarativní
- parsování chyb z výstupu buildu a proklik na řádek
- git operace (commit, stage, push) — diff ke čtení ano, ovládání gitu ne; terminál
  je hned vedle
- debugger, jazykové servery, hledání symbolů
- AI uvnitř aplikace: agent zůstává externím procesem
- UI pro nastavení; konfigurační soubor stačí

## Rizika a přijaté náklady

- **Nativní modul — vyšlo levněji, než se čekalo.** `node-pty` 1.1 je postavené na
  N-API a veze si předkompilované binárky, takže není potřeba ani Visual Studio, ani
  `electron-rebuild`, a povýšení Electronu nevyžaduje přestavění. Zůstal jen
  `asarUnpack` pro `.node` soubory a vypnutý automatický rebuild v electron-builderu
  (`npmRebuild: false`), který jinak volá node-gyp a bez kompilátoru spadne.
- **Mění se bezpečnostní model.** Dnes renderer nedokáže spustit vůbec nic; celý
  návrh stojí na tom, že Markdown je jen zobrazovaný obsah. PTY je z definice kanál
  pro libovolné spuštění kódu. Hranici drží dvě pravidla: z vyrenderovaného Markdownu
  nesmí vést k PTY žádná cesta (kliknutí na odkaz, obrázky, nic), a tasky
  z projektové konfigurace se nikdy nespouští automaticky při otevření — jen na
  explicitní klik a s viditelným příkazem.
- **Kolize kláves — vyřešeno v L2.** `Ctrl+O/W/D` patří shellu ve chvíli, kdy má
  terminál fokus; zkratky aplikace se tehdy stahují na `Ctrl+Shift+…`. Průchozí
  zůstávají ``Ctrl+` `` a `Ctrl+Tab`, které žádný shell nepoužívá.
- **Terminál bude slabé místo.** xterm.js dojde zhruba na 95 %; zbylých 5 % —
  chování schránky, scrollback, výběr myší, hraniční případy při změně velikosti,
  vykreslování fontu — je tam, kde zůstane dedikovaný terminál lepší. Přijato vědomě.
- **Skutečným rizikem je rozlézání rozsahu**, ne nic z výše uvedeného. Disciplína je
  ten produkt; kód je ta snadná část.

## Pravidla údržby

- Electron je zamčený na verzi a povyšuje se vědomě dvakrát ročně, ne při každém
  `npm outdated`.
- Závislosti se dají spočítat na prstech jedné ruky. Nová potřebuje sepsaný důvod.
- Každá vrstva musí nechat aplikaci použitelnou. Žádné rozpracované mezistavy mezi
  vydáními.
- Co je čistá funkce svého vstupu, má test: `npm test`. Dnes je to diff a renderer
  Markdownu včetně escapovacích pravidel, na kterých stojí bezpečnostní model.
  UI se ověřuje rukou, a to v `build:dir`, ne v `dev`, protože packaging je to místo,
  kde se rozbije nativní modul a cesty k assetům.

## Decision log

- **18. 8. 2026** — Postavit to vlastními silami místo nasazení VS Code nebo Cursoru.
  Důvod: agent je externí, takže aplikace musí být jen okno; chtěné jsou čtyři věci
  v malém okně plus tři funkce pro dohled nad agentem, které žádný editor nemá.
  Přijatý náklad: ~3 dny teď, pár hodin údržby ročně, hrubší terminál.
- **18. 8. 2026** — Pořadí vrstev pevně L1 → L2 → L3 → L4 → L5, mezi vrstvami zhruba
  týden reálného používání. Konfigurační soubor záměrně až nakonec.
- **18. 8. 2026** — Zvýraznění změn dodáno mimo pořadí, před L1. Důvod: žádná ze tří
  funkcí, které stavbu ospravedlňují, neměla vlastní vrstvu, a tahle nepotřebuje
  závislost ani terminál.
- **19. 8. 2026** — L1 a L2 dodány společně. Rozdělený tab bez shellu nemá koho
  obsloužit, takže dělit dodávku na dvě by znamenalo vydat mezistav, který nikdo
  nepoužije. Cena: v tabu jsou zatím jen dva typy panelu, shell a dokument.
- **19. 8. 2026** — Shell se odvozuje z dokumentu (`cwd` = jeho adresář), model
  „tab = adresář“ zůstává nedodělaný. Je to menší krok se stejným užitkem; plný model
  přijde, až bude potřeba tab bez dokumentu.
- **19. 8. 2026** — Shell vybírá main proces (pwsh, jinak Windows PowerShell), renderer
  nikdy nepojmenuje spustitelný soubor. Drží to IPC hranici z bezpečnostní sekce.
- **18. 8. 2026** - Testy dělané Node runnerem (`node:test`) nad `.ts` přímo.
  Důvod: nula nových závislostí, což drží pravidlo o závislostech na prstech jedné ruky.
  Pokrývají se jen čisté funkce; DOM se nechává na ruční průchod, protože DOM harness
  by byla první skutečná testovací závislost.
- **18. 8. 2026** - Zvýraznění změn dodáno nad L0, tedy před L1.
  Důvod: ze tří funkcí, které stavbu ospravedlňují, neměla žádná svou vrstvu, takže
  hrozilo, že se odpracují L1 až L3 a zbyde horší VS Code bez toho, proč se to staví.
  Tahle jde postavit bez nových závislostí a bez terminálu, tak jde první.
  Zbývají tečka aktivity na tabu a prompt buffer; ten druhý potřebuje L2.
