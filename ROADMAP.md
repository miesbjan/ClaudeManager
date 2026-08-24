# Roadmap

Kam projekt směřuje — a stejně důležité, kam ne.

## Co to je

**Konzole projektu**: jeden tab na jeden projekt, v něm shell s běžícím agentem,
dokument, podle kterého se řídíš, běžící aplikace vedle a tlačítko, které ji spustí.
Začínalo to jako prohlížeč Markdownu — odtud i původní jméno, které projekt nesl do
19. 8. 2026.

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

**Tab nad adresářem** (hotovo). Tab se dá otevřít nad adresářem, bez jediného souboru:
tlačítko *Otevřít adresář*, nebo adresář přetažený do okna. Ten adresář je pak to, v čem
startuje shell, co prohledává `Ctrl+P`, z čeho se pozná projekt pro tlačítko Run, a jak
se tab jmenuje. Tím je model „tab = adresář" hotový v obou směrech: adresář se dá zvolit
a soubor se dá otevřít, aniž by to místo přestěhoval.

Místo se pamatuje i bez souborů, což je jediná netriviální část: session dřív zahazovala
každý tab bez souborů, a to na dvou místech - při čtení souboru a při obnově v rendereru.
Tab, který je adresář, drží záměrně nic, a přesto je to to jediné, čím je.

**Víc souborů v jednom tabu** (hotovo). Tab je místo a drží seznam souborů, jeden je
vidět. Otevřený soubor padne do tabu, ve kterém jsi; nový tab si vyžádáš přes `Ctrl+T`.
`Ctrl+W` zavírá soubor a teprve poslední zavře tab, `Ctrl+PageUp` a `Ctrl+PageDown`
přepínají mezi soubory. Projekt a shell patří tabu, takže přepnutí souboru shell
nepřestěhuje - to je celý smysl toho, že tab je místo.

Seznam otevřených souborů záměrně nemá vlastní řádek v UI: kolikátý z kolika je vidět
ve status baru a celý výčet v tooltipu tabu. Vybírat ze seznamu půjde až paletou z L3d.

Rozepsané úpravy se nedají ztratit tichem. Zavření souboru, tabu i celého okna se ptá,
a u okna to musí odmítnout renderer, protože nativní dialog nad zavírajícím se oknem
se ukázal jako nespolehlivý.

**Stabilní identita tabu** (hotovo). Shelly byly klíčované cestou k dokumentu, takže
výměna dokumentu by klíč rozpadla. Tab má teď vlastní id a podle něj se drží všechno,
co patří tabu jako místu, především jeho shell. Co patří souboru, tedy sledování,
reload a zapamatované rozložení, zůstává klíčované cestou.

Tím je výměna dokumentu odblokovaná. Zbytek modelu „tab = adresář“, tedy otevřít tab
nad adresářem bez dokumentu, pořád není.

### L3 — Spuštění projektu (hotovo)

Jedno tlačítko: spusť to. Projekt se hledá odspoda nahoru od dokumentu, shell startuje
v jeho kořeni. `package.json` dá svůj `dev`, `.csproj` dá `dotnet run`. Monorepo nabídne
seznam appek a volbu si u toho dokumentu zapamatuje.

Původní návrh (vlastní panel, exit kód, doba běhu, správa procesu) se nekonal — viz
decision log z 19. 8. 2026.

### L3b — Webový panel (hotovo)

Pravý panel umí místo dokumentu ukázat běžící dev server. Adresu si vezme z výpisu
shellu, když ji server vypíše, takže není co nastavovat; jde ji i napsat ručně.
Povolený je jen tenhle stroj.
Stránka běží ve vlastní session, a tím i ve vlastním procesu, bez preloadu a v sandboxu.
`Alt+W` přepíná.

Spuštění přes tlačítko panel otevře samo — kdo něco spustí, chce se na to podívat.
Shell navíc dostává `BROWSER=none`, aby si projekt neotevřel systémový prohlížeč.
`Alt+W` cykluje pravou stranu: dokument → web → obojí, tedy až tři sloupce vedle sebe.

Tím vznikla ta smyčka, o kterou šlo: vlevo běží aplikace, vpravo se na ni koukáš,
dokument je na jedno kliknutí zpátky.

### L3c - Prostý text a malé úpravy (hotovo)

Panel umí zobrazit i soubor, který není Markdown, a udělat v něm malou úpravu.
Vložit API klíč do `.env`, přepnout jednu hodnotu v konfiguraci, opravit překlep.
Tedy věci, pro které je otevírání celého editoru neúměrné, a které se s agentem
odbavují špatně.

Je to jedna funkce, ne dvě. Jakmile panel zvládne surový text, umí tím zobrazit
`.json`, `.log`, `.env` i `.txt`, a editace je pak textarea nad tím samým.
Dnes je konzole projektu slepá ke všemu kromě jednoho formátu, přitom agent běžně
píše logy a data.

Bez nové závislosti, žádný CodeMirror ani Monaco: všechno nad prostou textareou je
editor, a ten je non-goal. Zvýraznění syntaxe v editačním režimu taky ne, i když je
`highlight.js` v projektu už dnes - pro vložení klíče nemá žádnou hodnotu a je to
první krok jinam.

Pravidla, na kterých to stojí:

- Ukládá se jen na `Ctrl+S`. Autosave v aplikaci, která sleduje soubory přepisované
  agentem, je cesta k tomu, že si navzájem přepíšete práci.
- Když se soubor na disku změní a v panelu jsou neuložené úpravy, nereloaduje se.
  Panel to oznámí a rozhodnutí nechá na člověku.
- Zapisuje se výhradně do cesty, která je právě otevřená v panelu, a jen na tu
  klávesu. Nikdy do cesty odvozené z obsahu dokumentu. To je třetí pravidlo
  k těm dvěma v bezpečnostní sekci.

*Hotovo, když:* vložíš klíč do `.env` otevřeného projektu a uložíš ho, aniž bys sáhl
po editoru, a prohlédneš si `.log`, který agent napsal.

### L3d - Navigace v adresáři (hotovo)

Dvě věci, které z „jsem v adresáři" udělají pravdu.

**`Ctrl+P` - jdi na soubor. Hotovo.**
Pole nad dokumentem, které nabízí dvě skupiny v jedné: soubory otevřené v tomhle tabu
a soubory projektu.
Prázdný dotaz ukáže jen ty otevřené, takže `Ctrl+P` je zároveň odpověď na „co tu mám
otevřeno" - tab bar žádný druhý řádek s nimi záměrně nemá.
Cokoli napsaného hledání rozšíří na celý projekt, jehož kořen umí najít `detectProject`.
Doteď se soubor otevíral jen dialogem nebo přetažením, což je u konzole projektu rozpor
v základu.

Rozhodnutí, která za tím stojí:

- Skupina „otevřené v jiných tabech" tam není jako skupina.
  Soubor otevřený jinde se objeví, protože je to soubor projektu, ale svůj řádek
  označí `open in <tab>` a Enter tam skočí místo otevírání druhé kopie.
  Dvě rozpracované verze téhož souboru jsou horší než skok do jiného tabu.
- Hledá se podstrunou ve jménu souboru, dokud dotaz neobsahuje `/`; pak v cestě.
  Bez toho se pět souborů jménem `index.ts` od sebe nedá odlišit.
  Fuzzy hledání ne: `mn/idx` sice najde `main/index`, ale s ním patnáct dalších věcí,
  a řadit je podle skóre je celá další vrstva, kterou tahle věc nepotřebuje.
- Řadí se: otevřené tady, pak kratší cesta, pak abecedně.
  Soubor blíž ke kořeni je skoro vždycky ten hledaný.
- Chůze po disku vynechává `.` adresáře, `node_modules` a co po sobě nechá build,
  jde do šířky a zastaví se na 2000 souborech.
  Strop se hlásí v poli, ne mlčí: soubor chybějící v paletě by jinak vypadal jako
  soubor chybějící v projektu.
- Rozložení panelů se tím nemění. Otevřít soubor není totéž co přeskládat okno.
- Za fokusem v terminálu platí `Ctrl+Shift+P`, jako u ostatních appových kláves.
  Samotné `Ctrl+P` v shellu patří shellu.

**Kliknutelné cesty ve výstupu. Hotovo.**
Agent napíše `src/main/index.ts:224`, kliknutí to otevře v pravém panelu a skočí na
ten řádek.
Z výpisu agenta se tím stane navigace, a je to ta nejčastější věc, kterou v něm
člověk hledá.

Rozhodnutí, která za tím stojí:

- Nabízí se jen cesta, která na disku existuje.
  Tvar to nikdy nerozhodne - `Node.js` vypadá přesně jako `app.js` - takže hádání
  jen zúží kandidáty a poslední slovo má disk.
  Jinak by byla podtržená polovina výstupu.
- Dvojtečka není součástí cesty, aby `19:38:31` nebyl soubor s číslem řádku.
  Číslo řádku se čte až za koncem cesty, jako `:224` nebo `:224:9`.
- Kandidát hned za `:` nebo lomítkem se zahodí.
  Bez toho by `http://localhost:5173/index.html` nabídl `/localhost` jako soubor;
  adresa patří do webového panelu.
- Relativní cesta se vztahuje k adresáři, ve kterém shell odstartoval, tedy ke kořeni
  projektu. Přesně tam ji vztahuje i agent, který ji napsal.
- Zalomený řádek se poskládá zpátky, protože v úzkém panelu se cesta láme přes dva
  řádky a jinak by kliknutelná nebyla ani jedna půlka.
- V dokumentu se skáče na blok, ne na řádek.
  Renderovaný řádek a řádek zdroje nejsou totéž, a předstírat to by bylo horší než
  přiznat blok. V panelu s prostým textem se skáče na řádek přesně a označí se.

*Hotovo, když:* soubor, na který agent odkazuje, otevřeš kliknutím.
Jakýkoli soubor v projektu najdeš bez dialogu.

### Mimo vrstvy

**Stav v hlavním panelu Windows** (hotovo). Kontrolka na tabu řekne, co agent dělá, jen
když se na okno koukáš. Když řešíš něco jiného na jiné obrazovce, musí to říct ikona aplikace
v hlavním panelu. Je to třetí kus téhož: dokument ukazuje, co agent přepsal, tab
ukazuje, co dělá, hlavní panel ukazuje, že po tobě něco chce, i když se nekoukáš.

Agreguje se přes všechny taby a vyhrává ten nejnaléhavější stav:
chyba, pak čeká na povolení, pak dokončeno, pak pracuje.
„Aspoň jeden dobehl" je tedy zelená, dokud zároveň někdo jiný nečeká na odpověď nebo
nespadl.

Mechanismus je `win.setProgressBar(hodnota, { mode })`, což na Windows obarví ikonu
v hlavním panelu a přesně pokrývá ty čtyři stavy: `indeterminate` pro pracuje,
`normal` na 1.0 pro dokončeno (plný zelený pruh), `paused` pro čeká na povolení,
`error` pro chybu, `none` pro nic. Nepotřebuje to žádný obrázek, což je podstatné,
protože aplikace dneska nemá ani vlastní ikonu a `setOverlayIcon` by znamenal první
binární assety v repozitáři. K okamžiku přechodu se přidá `flashFrame`, aby si toho
člověk na jiné obrazovce všiml.

Postaveno tak, že se hlásí jen když okno nemá fokus, a „dokončeno" zhasne návratem
k oknu. Obojí je to volba z těch dvou, které tu byly otevřené, a důvod je v decision
logu: „dobehl" musí být přechod, ne stav, jinak by zelená svítila pořád, protože shell
stojící na promptu je trvale dokončený.

*Hotovo, když:* pustíš agenta, přepneš se na jinou obrazovku a poznáš z hlavního
panelu, že dobehl, aniž bys okno hledal.

**Vlastní ikona a číslo na ní** (hotovo). Aplikace do teď běžela pod výchozí ikonou
Electronu, což je potíž právě proto, že stav v hlavním panelu funguje tak, že tu ikonu
mezi ostatními poznáš. K tomu přibývá číslo: kolik tabů na tebe čeká.

Kresba je v `src/shared/icon.ts`, ne v binárce. `npm run icon` ji vyrenderuje do
`build/icon.ico` Chromiem, které je stejně v Electronu — žádná knihovna na obrázky
navíc. `.ico` je commitnuté, aby build nezávisel na tom, jestli si to někdo pustil, ale
zdrojem zůstává to, co jde ukázat v diffu.

Tab se do čísla počítá jednou, ať má důvodů kolik chce: otázka zní „kolik míst musím
obejít", ne „kolik věcí se stalo". Pracující taby se nepočítají — ty chtějí čas, ne tebe.
Barva je nejnaléhavější důvod mezi nimi: zelená hotovo, oranžová ptá se, červená spadl.

*Hotovo, když:* pustíš agenty ve dvou tabech, přepneš se jinam a z hlavního panelu
přečteš číslo, aniž bys okno hledal.

**Jazyk rozhraní** (hotovo). Přepínač EN/CS vedle motivu, tlačítko ukazuje jazyk, na
který přepne. Aplikace se používá česky a tři slova anglicky nejsou překážka, ale
stavový řádek a panel se zkratkami jsou text, který se čte pokaždé znovu.

Zdrojem je angličtina: česká tabulka je typovaná proti jejím klíčům, takže řetězec
přidaný v jednom jazyce a zapomenutý v druhém neproleze přes překladač. Názvy kláves
se nepřekládají - je to to, co je napsané na klávesnici - a stejně tak cesty a výstup
shellu. Volba se pamatuje jako motiv.

*Hotovo, když:* přepneš na češtinu, restartuješ aplikaci a je česky včetně panelu `?`.

**Font terminálu** (hotovo). Velikost a rodina, nic dalšího. V panelu, ve kterém se celý den
čte výstup agenta, je čitelnost základ, a výchozí velikost xtermu sedí každému jinak.

Velikost se mění zkratkou a pamatuje se mezi spuštěními, tedy stejným způsobem jako
téma. Rodina se zadá jednou v souboru vedle `state.json` a čte se při startu; výchozí
hodnota zůstane `--font-mono`, kterou používá zbytek aplikace. Po změně je potřeba
znovu spočítat rozměr panelu, protože na velikosti znaku závisí počet řádků a sloupců,
které se posílají do PTY.

Žádný dialog s náhledem: „UI pro nastavení" je non-goal a zkratka se souborem dají
stejný výsledek za desetinu práce.

*Hotovo, když:* zvětšíš písmo v terminálu, restartuješ aplikaci a zůstane zvětšené,
aniž by se rozsypalo zalomení výstupu.

### L4 — Šuplík (rozdělaný)

Jeden sbalitelný panel per tab, defaultně zavřený, uvnitř přepínač obsahu — takže
základní UI získá přesně jeden prvek, ne pět.

- prompt buffer (hotovo) — složit delší zadání, jednou klávesou poslat do terminálu
- feed změn — kterých souborů se za poslední minuty dotkl
- tail logu

Šuplík dnes existuje, ale bez přepínače: je v něm jedna věc, a přepínač mezi jednou
možností je ovládací prvek pro nic. Přijde s druhým obsahem, ne dřív.

Sedí pod shellem, protože do shellu odesílá, a `Alt+P` ho otevírá i zavírá - je to
panel, takže platí pravidlo „Ctrl na taby, Alt na panely". Otevřít ho v tabu bez
shellu shell rovnou spustí; posílat by jinak nebylo kam. Rozdělaný prompt se pamatuje
u místa a přežije restart, protože je to rozdělaná práce jako draft souboru.

*Hotovo, když:* složíš víceřádkové zadání, jednou klávesou ho pošleš agentovi a nic
z něj se po cestě nerozpadne.

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
2. **Tečka aktivity na tabu** (hotovo) - **stavová kontrolka**, která v každou chvíli
   říká, co agent dělá: tlumená, dokud teče výstup, zelená po dokončení, oranžová když
   se ptá na povolení a dál se nehne, červená při zvonku, chybě nebo spadlém shellu.
   Kde program hlásí svůj stav sám (`OSC 9;4`), je přesná; jinde platí odhad z ticha.
   Svítí jen tam, kde něco mluví samo za sebe — agent nebo program hlásící postup;
   nad holým shellem ne. Pozor: Claude Code `OSC 9;4` neposílá, pozná se podle
   svého rozhraní (viz decision log z 21. 8. 2026).
   Svítí i na tabu, na který se koukáš, protože to, co agent dělá, se pohledem nemění.
   Jediné, co pohled zhasne, je červená, protože chyba je událost, ne stav.
   Zdrojem je shell. Dokument přepsaný na pozadí má svůj vlastní signál, totiž
   zvýraznění změn, viz decision log z 20. 8. 2026.
3. **Prompt buffer** (hotovo) - pole pro složení delšího zadání, odeslané do terminálu
   jednou klávesou. Psát víceřádkové prompty přímo do TUI je otrava, protože první
   Enter je odešle. Do shellu jde jako **bracketed paste**, kde jsou konce řádků text,
   a odesílající Enter se přidá až za ním. Tím je hotová i třetí z těchto funkcí.

Levné drobnosti ve stejném duchu, žádná nestojí trvalý pixel: `Ctrl+F` uvnitř
dokumentu (hotovo) a název větve s počtem změněných souborů v titulku tabu.

## Uzavřený seznam funkcí

Hotový produkt jsou tyhle věci a nic víc:

| Oblast  | Funkce                                                              |
| ------- | ------------------------------------------------------------------- |
| Základ  | taby vázané na adresář, rozdělené panely, ukládání rozložení         |
| Základ  | živý panel s Markdownem (renderovaný náhled, sanitizovaný)           |
| Základ  | terminálový panel                                                    |
| Základ  | tlačítko na spuštění projektu                                        |
| Základ  | webový panel na localhost místo dokumentu                            |
| Základ  | panel s prostým textem a úprava s explicitním uložením               |
| Základ  | `Ctrl+P` nad adresářem projektu, kliknutelné cesty ve výstupu        |
| Šuplík  | feed změn, prompt buffer, tail logu                                  |
| Extra   | usage session a vyčerpání limitů předplatného ve stavovém řádku      |
| Extra   | zvýraznění změn, tečka aktivity, prompt buffer, `Ctrl+F`, paleta     |
| Extra   | stav v hlavním panelu, agregovaný přes všechny taby                  |
| Extra   | velikost a rodina fontu v terminálu                                  |
| Extra   | vlastní jméno tabu                                                   |
| Extra   | jazyk rozhraní CS/EN                                                 |
| Extra   | vlastní ikona a počet čekajících tabů na ní                          |
| Extra   | přehazování tabů tažením, vkládání do shellu                         |
| Extra   | otázka před zavřením tabu, ve kterém se pracuje                     |
| Extra   | „Kde jsme skončili“ — shrnutí posledních commitů od agenta          |

Přidání položky na tenhle seznam je rozhodnutí, ne detail — patří k němu řádek
v decision logu níže.

## Non-goals

Vědomě odmítnuto, protože každá z těch věcí je první krok k tomu, čemu se projekt
chce vyhnout:

- textový editor a k němu strom souborů
- rozšíření nebo pluginy; konfigurace zůstane deklarativní
- parsování chyb z výstupu buildu a proklik na řádek
- git úplně, včetně diffu ke čtení — viz decision log z 19. 8. 2026
- debugger, jazykové servery, hledání symbolů
- AI uvnitř aplikace: agent zůstává externím procesem
- UI pro nastavení; konfigurační soubor stačí
- práce na jiném stroji: SSH, WSL, kontejnery. Tohle je architektonická hranice,
  ne odložený úkol.

Z toho plyne jedna věc, kterou je lepší mít napsanou než ji zjistit provozem:
**tohle není náhrada editoru, je to doplněk.** Psaní kódu a review velkého diffu po
hunkách zůstane v editoru, protože to je přesně to, co dělá dobře a co se tady
vědomě nestaví. Původní srovnání v sekci „Proč ne VS Code nebo Cursor" mluví o volbě
mezi jedním a druhým; ve skutečnosti jde o dělbu práce.

## Rizika a přijaté náklady

- **Nativní modul — vyšlo levněji, než se čekalo.** `node-pty` 1.1 je postavené na
  N-API a veze si předkompilované binárky, takže není potřeba ani Visual Studio, ani
  `electron-rebuild`, a povýšení Electronu nevyžaduje přestavění. Zůstal jen
  `asarUnpack` pro `.node` soubory a vypnutý automatický rebuild v electron-builderu
  (`npmRebuild: false`), který jinak volá node-gyp a bez kompilátoru spadne.
- **Bezpečnostní model se změnil a takhle se drží.** Renderer umí tři věci, které dřív
  neuměl, a každá má svoje pravidlo.
  PTY je z definice kanál pro libovolné spuštění kódu, takže do něj zapisují jen dvě
  místa: klávesy z terminálu a příkaz z tlačítka Run.
  Z vyrenderovaného Markdownu k němu nevede cesta žádná, ani přes odkaz, ani přes
  obrázek.
  Příkaz z projektu je vždycky `npm run <script>` nebo `dotnet run`, nikdy obsah toho
  skriptu, spustí se jen na klik a je vidět na tlačítku i v terminálu.
  Cesta v něm se uvozuje jednoduchými uvozovkami, protože v dvojitých by PowerShell
  vyhodnotil adresář pojmenovaný `$(něco)`.
  Vložená stránka smí být jen z tohohle stroje: adresa se kontroluje proti seznamu
  lokálních hostů a `frame-src` v CSP ten seznam opakuje pro prohlížeč, přičemž soulad
  obou hlídá test.
  Schránka se čte jen při vložení do shellu.
- **Vložená stránka je v cizím procesu, a to bylo potřeba vynutit.** Jako iframe byla
  se aplikací same-site (obojí localhost), takže ji Chromium pustil do našeho procesu.
  Dev server, kterému došla paměť, tím zabil celou konzoli včetně běžících agentů;
  reprodukováno stránkou, která si paměť sežere schválně.
  Teď je to `webview` s vlastní `partition`, což je ta podmínka, kvůli které Chromium
  proces nikdy nesdílí. Zároveň nemá preload, Node ani přístup mimo tenhle stroj.
  Přijatý náklad: `webview` je v Electronu označené jako nestabilní API a jednu ostrou
  hranu má - přiřadit `src` elementu, jehož proces umřel, shodí celou aplikaci
  (`FATAL: Check failed` v hlavním procesu, bez výjimky, kterou by šlo odchytit).
  Proto se mrtvý element zahodí a postaví nový, a adresa se sama znovu nenačítá, dokud
  o to člověk nepožádá - jinak by stránka, která umírá při načtení, umírala pořád.
- **Shelly přežívají okno.** Renderer, který zmizí, si bral všechny PTY s sebou, protože
  jinak by po něm zůstaly bez vlastníka; v developmentu to znamenalo zabitého agenta
  při každém uloženém souboru.
  Vlastnictví se místo toho po přestavění okna obnovuje: panel si řekne o shell podle id
  tabu, dostane k němu i to, co shell mezitím vypsal, a co si nikdo nevyzvedl, se ukončí.
  Přijatý náklad: v paměti hlavního procesu leží posledních 256 kB výstupu na shell,
  a replay může začít uprostřed escape sekvence - celoobrazovkový program se překreslí,
  takže se to nepozná.
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

- **23. 8. 2026** — Otevřené otázky zavřené, každá jinak, protože každá si o jinou odpověď
   říkala.
   **`beforeunload` programový reload nezablokuje** - změřeno na běžící aplikaci: okno se
   přestavělo a neuložený draft zmizel bez hlášky. Po pádu rendereru je navíc pozdě se na
   cokoli ptát, takže jediná cesta je mít draft zapsaný předem. Neuložené úpravy se teď
   ukládají do session jako rozdělaný prompt, a po přestavění okna se vrátí i s hláškou, že
   jsou pořád neuložené. Cena: session soubor nese text úprav, na jeden soubor nejvýš 200 kB;
   delší úprava zůstane jen na obrazovce, protože ztratit její konec je horší než ji neuložit.
   **Globální `Alt+W` a druhá instance** se zavřely konstrukcí, ne měřením: zkratka se ruší
   i ve `hideWindow` a na události `hide`, takže nezáleží na tom, jestli schování vyvolá
   `blur`; a druhá instance okno postaví, když žádné není, takže nezáleží na tom, jestli se
   do toho stavu dá dostat. Zjišťovat odpověď by stálo víc než ji nepotřebovat.
   **`Ctrl+O` shellu nebereme.** `Ctrl+T`, `Ctrl+G` a `Ctrl+P` jsou tři otázky, na které
   tahle aplikace existuje odpovídat - jiné místo, které místo, který soubor. "Otevřít další
   soubor" je ta samá otázka jako `Ctrl+P`, kterou už bereme, takže by se platilo podruhé za
   totéž: v Claude Code je `Ctrl+O` přepínač transcriptu, který se používá. Zůstává
   `Ctrl+Shift+O`.
   **Build teď řekne, co ho blokuje** - vypíše pid a cestu běžících instancí, když nemůže
   přepsat exe na ploše.
- **23. 8. 2026** — Systémové upozornění při schování do traye zrušeno. Jednu větu se dalo
   říct jednou za session, jenže notifikace se musí odkliknout nebo přečkat a zůstane v
   centru oznámení - cena placená pokaždé za informaci, kterou nese ikona v traye, její
   tooltip a panel `?` předem.
- **23. 8. 2026** — Revize kódu na jednu třídu chyb, po zkušenosti s "Claude spadl": stav se
   změnil mezi zahájením operace a jejím dokončením, nebo existovaly dvě pravdy o jedné věci.
   Prošlo se to v pěti nezávislých průchodech (asynchronní pořadí, tiché selhání, rozcházející
   se stav, životní cyklus, terminál a webový panel) a opravilo se všechno nalezené.
   Co z toho stojí za zapamatování jako pravidlo:
   **identita, ne pozice** - tab drží svoje jméno v session, protože podle něj mu patří shell,
   a zavírání pracuje s tím, o co se ptalo, ne s indexem, který mezitím ukazuje jinam;
   **kdo se ptá naposled, ten vyhrává** - čtení dokumentu, palety a spotřeby má ticket, takže
   starší odpověď nepřepíše novější;
   **ticho je chyba** - zahozený vstup, odmítnutá velikost, neuložená session i chyba v okně se
   zapisují do logu, protože přesně tohle stálo den hledání;
   **panel patří svému tabu** - element je jeden pro všechny taby, takže ho smí měnit jen ten,
   na který se právě koukáš.
   Přijatý náklad: víc kódu na hlídání pořadí (tickety, `started`, `restoring`) a jeden nový
   kanál pro uvolnění watcherů. Za to zmizela celá rodina chyb, které se projevovaly jako
   "aplikace se chová divně" a nedaly se reprodukovat.
- **23. 8. 2026** — Panel se po dostartování shellu zobrazí jen tehdy, když jeho tab je pořád
   ten na obrazovce.
   Důvod: tohle byl ten hlášený "Claude spadl" ve své druhé polovině. Spuštění shellu je
   asynchronní a panel se na konci zobrazoval bez ohledu na to, jestli se aktivní tab
   mezitím nezměnil - a při startu se změní vždycky, protože o shell si řekne každý
   obnovený tab a v jednom z nich skončíš. Na obrazovce tak byly dva terminály přes sebe:
   ten z tabu, ve kterém jsi, a ten z tabu, ve kterém nejsi. Navrch byl ten, který
   dostartoval později, takže panel mohl ukazovat agenta z úplně jiného místa - a první
   překreslení, třeba napsaná adresa, tam vrátilo ten správný. Vypadalo to jako pád agenta,
   přičemž agent celou dobu běžel, jen v tabu, na který ses nekoukal.
   Odhalily to výpisy shellů: aktivní tab měl za celou session 309 bajtů, tedy jen prompt,
   zatímco 29 kB s běžícím Claudem patřilo tabu vedle.
- **23. 8. 2026** — Shell startuje ve velikosti panelu, který si o něj řekl, a panel velikost
   po vzniku shellu vždy zopakuje.
   Důvod: tohle byl ten hlášený "Claude spadl". Panel se měří, jakmile je na obrazovce, což
   je dřív, než se stihne nastartovat shell - měření je synchronní, spuštění procesu ne.
   Ta velikost se zahodila, protože nebylo komu ji dát, a panel ji už neposlal znovu, jelikož
   z jeho pohledu poslána byla. Shell tak zůstal na náhradních 80×24, i když terminál kolem
   něj měl 94×40: Claude kreslil rámečky do jiné šířky, než v jaké byly vidět, a první
   pozdější změna velikosti - třeba když se v panelu načetla stránka z jiného portu - ho
   donutila překreslit obrazovku, čímž zmizelo všechno nad ní. Vypadalo to jako pád, přičemž
   žádný proces neumřel; proto o tom log nic neříkal a proto to nešlo reprodukovat, dokud
   nezačal zapisovat velikosti.
   Přijatý náklad: shell založený nad skrytým panelem se pořád rodí v 80×24, protože skrytý
   panel se nemá jak změřit; správnou velikost dostane, jakmile ho někdo poprvé zobrazí.
- **23. 8. 2026** — Aplikace si píše `log.txt` do userData: přestavěné okno, spuštěný,
   převzatý nebo ukončený shell i s důvodem, spadlá stránka v panelu.
   Důvod: "Claude vlevo spadl" je hlášení, ke kterému neexistuje žádný důkaz, a
   zabalená aplikace na Windows nemá konzoli, takže všechno, co se vypíše, se vypíše
   nikomu. Bez záznamu se dá jen hádat, což je přesně to, co se stalo.
   Zároveň se shell identifikuje podle adresáře, o který panel žádal, ne podle toho, kde
   nakonec běží - jinak tab nad smazaným adresářem přišel o shell při každém přestavění
   okna, protože se srovnávalo s náhradním domovským adresářem.
- **23. 8. 2026** — Panel s dev serverem dostal vlastní proces (`webview` s vlastní
   `partition` místo iframe) a shelly přežívají smrt okna.
   Důvod: obojí je jedna a ta samá stížnost - "vpravo jsem přepnul port a Claude spadl".
   Stránka v panelu byla se aplikací same-site, takže běžela v našem procesu a mohla ji
   vzít s sebou; a když renderer zmizel, naše vlastní úklidová rutina zabila všechny
   shelly. Ani jedno nešlo spravit bez toho druhého: izolace zabrání pádu, přežití
   shellů zajistí, že ani pád okna z jiného důvodu nestojí rozdělanou práci.
   Přijatá rizika: `webview` je nestabilní API a přiřazení `src` mrtvému elementu shodí
   celou aplikaci, takže se element po pádu stránky zahazuje; a shell teď může běžet
   o chvíli dýl než okno, které ho ukazovalo, dokud si ho nový renderer nevyzvedne nebo
   neřekne, že ho nechce.
- **21. 8. 2026** — Ve stavovém řádku je i **vyčerpání limitů předplatného** (pětihodinové
   okno a sedmidenní limit), tedy to, co ukazuje `/usage`. Nejdřív jsem tvrdil, že to
   nejde — hledal jsem to na disku a tam opravdu není. Cesta vede přes nezdokumentovaný
   endpoint `api/oauth/usage`, který volá i samo Claude Code, s tokenem z přihlášení
   uživatele; postup pochází ze SessionManageru.
   Přijatá rizika: endpoint se může kdykoli změnit, proto je vše fail-soft — jakýkoli
   problém znamená, že se prostě nic nezobrazí. Token se čte v main procesu, použije se
   na jeden dotaz a nikdy se nikam nezapisuje ani nepředává rendereru, ten dostane jen
   dvě procenta.
- **21. 8. 2026** — Ve stavovém řádku vpravo je spotřeba běžící Claude session: kolik
   měl model minule v kontextu a kolik toho za session napsal. Čte se z transcriptu,
   který si Claude Code stejně vede, takže se session na nic neptáme a nic jí
   neposíláme — sledování ji nemůže rozhodit. Za běžící session se bere nejnovější
   transcript v adresáři projektu; při dvou sessions nad jedním adresářem je to ta,
   která psala naposled.
- **21. 8. 2026** — Horní lišta srovnána do tří skupin: čím něco otevřeš, co okno
   ukazuje, a aplikace sama u pravého okraje. Dlouhý nápovědný řádek zmizel — od toho
   je tlačítko `?` a paleta, a jeho výčet zkratek byl už tak neúplný.
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
- **19. 8. 2026** — Přibyl webový panel, tedy třetí typ obsahu vedle shellu
   a dokumentu. Je to rozšíření uzavřeného seznamu, ale dokončuje původní záměr:
   spustit rozdělanou aplikaci a rovnou ji proklikat, aniž bys šel do prohlížeče.
   Omezení na localhost není dočasné — panel, který by uměl načíst cokoli, je jiná
   aplikace a bezpečnostní model by tím padl.
- **19. 8. 2026** — Otevírání dokumentu do stávajícího tabu odloženo, ne zamítnuto.
   Scénář je konkrétní: sleduješ session Claudea a chceš si na chvíli přečíst jiný
   dokument, aniž bys přišel o výhled na shell. Dnes vznikne nový tab a shell zmizí
   z očí; session sice běží dál a tečka hlásí, co dělá, takže se nic neztratí. Nejdřív
   to chce používat a zjistit, jestli tečka stačí — teprve pak stavět.
- **19. 8. 2026** — Projekt přejmenován z „Markdown Viewer“ na **Project Console**.
   Původní jméno popisovalo techniku jednoho ze tří panelů, ne k čemu je to celé;
   „konzole projektu“ je pojem, kterým se to tady popisuje od začátku. Session se
   z původní složky jednorázově přečte, aby přejmenování nestálo otevřené taby.
- **19. 8. 2026** — Přibyl stav „čeká na povolení“. Nápad i konkrétní řetězce pochází
   z projektu claude-manager, který tentýž problém řeší vzorkováním tmux panelů; my
   stream čteme rovnou, takže to vyšlo na pár řádků. Rozlišení má smysl: dotaz na
   schválení je naléhavější než „doběhlo“, protože se bez tebe nehne z místa.
   Poznává se podle popisků tlačítek dialogu, ne podle otázky — ta se v běžném textu
   vyskytne taky.
- **19. 8. 2026** — Pravá strana umí ukázat dokument a web zároveň, takže v tabu můžou
   být tři sloupce. `Alt+W` z přepínače udělal cyklus dokument → web → obojí; jedna
   klávesa místo dalšího tlačítka. Poměry obou rozdělovačů se pamatují u dokumentu.
- **19. 8. 2026** — Vložená stránka je vlastní proces a po kliknutí do ní si nechává
   všechny klávesy; `before-input-event` v main procesu se pro ni nespustí, což se
   ukázalo až testem. Proto klávesová navigace končí na hranici rámu (`Alt+3` zaostří
   panel, ne stránku) a `Alt+W` navíc drží systémový akcelerátor, dokud má okno fokus —
   jedna klávesa, kterou je vždycky cesta ven.
- **19. 8. 2026** — Shell startuje s `BROWSER=none` a panel se po spuštění otevře sám.
   Obojí vyplynulo z prvního reálného použití: projekt měl ve `vite.config.ts`
   `server.open: true`, takže si otevřel systémový prohlížeč — přesně to jediné místo,
   kam ten panel nechce obsah posílat. `BROWSER=none` je konvence, kterou Vite i CRA
   respektují; vrátit se dá `$env:BROWSER = ''`.
- **19. 8. 2026** — Adresa se čte z výpisu dev serveru, nekonfiguruje se. Stejný
   princip jako u tečky aktivity: co program sám řekne, je přesnější než co bychom
   hádali nebo nutili uživatele opisovat.
- **19. 8. 2026** — L3 se scvrkla z „tasků“ na **jedno tlačítko Run**. Zadání znělo:
   v 99 % nejde o build a test zvlášť, ale o proklikat aktuální stav aplikace. Task je
   navíc jen pojmenovaný příkaz — a shell v tabu už je, takže se pošle do něj a výstup,
   barvy, scrollback i `Ctrl+C` jsou zadarmo. Odpadl vlastní panel i správa procesů.
- **19. 8. 2026** — WPF a jiné desktopové aplikace poběží vždy jako samostatné okno.
   Vložit cizí HWND do rendereru přes `SetParent` jde, ale rozbíjí se na DPI, fokusu
   a z-orderu; hodnota u .NET je stejně v buildu a jeho výstupu, ne ve vykreslení okna.
- **19. 8. 2026** — Shell startuje v kořeni projektu, ne v adresáři dokumentu. Vyplynulo
   z reálného rozložení: dokumentace bydlí v `.claude/docs/` nebo `plans/`, takže by
   `npm run dev` spadl. Je to zároveň kus modelu „tab = adresář“ bez refaktoru.
- **19. 8. 2026** — Git diff v šuplíku vyškrtnut a přesunut mezi non-goals. Původně
   byl označený za druhou nejužitečnější věc po terminálu, ale to byl můj odhad, ne
   jeho potřeba: při skutečném používání se ukázalo, že diff čte jinde. Zůstává tedy
   pravidlo „git se ovládá v terminálu“, nově bez výjimky pro čtení.
- **19. 8. 2026** — Stav tabu se čte primárně z toho, co program sám hlásí — sekvence
   `OSC 9;4`, tedy totéž, co rozsvěcí kroužek v tabu Windows Terminalu — a teprve
   když program nehlásí nic, nastoupí odhad z dvouvteřinového ticha. Původní návrh
   počítal jen s tím odhadem; screenshot z Windows Terminalu ukázal, že „přemýšlí vs.
   čeká na mě“ jde znát přesně, ne hádat.
- **19. 8. 2026** — Uvnitř se drží dvojice stavů: `busy`/`done` je tvrzení programu,
   `working`/`waiting` je náš odhad. Na obrazovce vypadají stejně, ale odhad nesmí
   přebít tvrzení v žádném směru — agent, který tři vteřiny mlčky přemýšlí, nesmí
   zezelenat, a program, který dohlásil konec a pak tiskne výsledek, se nesmí vrátit
   na „pracuje“. Obojí odhalil až test na živé aplikaci.
- **19. 8. 2026** — Do lišty přibylo tlačítko `?` s přehledem zkratek. Je to
  rozšíření uzavřeného seznamu funkcí, ale vědomé: zkratky pro panely se nedají
  uhodnout a jediné místo, kde se o nich šlo dozvědět, bylo README. Panel nestojí
  žádný pixel, dokud se nevyvolá, a jeho obsah je datová struktura, kterou hlídá test
  — binding, který funguje, ale není v seznamu, je chyba.
- **19. 8. 2026** — Klávesy pro panely převzaty z multiplexerů: **Ctrl ovládá taby,
  Alt ovládá panely**, s tmuxími šipkami a `z` pro zoom. Důvod: stavíme v jednom tabu
  víc panelů, takže má smysl sáhnout po konvenci, kterou člověk zná z tmuxu i Windows
  Terminalu, místo vymýšlení vlastní. Alt se šipkami, číslicemi a `z` navíc nic
  v PowerShellu ani v TUI nepoužívá, takže je to jediné, co se shellu bere — obdoba
  tmuxího prefixu. Přibyl tím zoom panelu, což je rozšíření uzavřeného seznamu.
- **19. 8. 2026** — Shell vybírá main proces (pwsh, jinak Windows PowerShell), renderer
  nikdy nepojmenuje spustitelný soubor. Drží to IPC hranici z bezpečnostní sekce.
- **20. 8. 2026** - L3c a L3d jdou před šuplík. Důvod je z prvního reálného používání:
  hlavní workflow je jeden adresář, vlevo agent, vpravo dokument nebo běžící aplikace.
  V tom rozložení chybí dvě věci dřív než cokoli ze L4 - podívat se na soubor, který
  není Markdown, a dostat se k souboru bez dialogu. Šuplík je užitečný, ale je to
  přístavba k něčemu, co ještě neumí otevřít `.log`.
- **20. 8. 2026** - Editace v rozsahu jednoho vloženého klíče, ne editor. Hranice je
  ostrá a je to hranice závislostí: prostá textarea ano, CodeMirror nebo Monaco ne.
  Dvě věci, které to nese s sebou, jsou důležitější než samo psaní - explicitní
  ukládání a odmítnutí reloadu nad neuloženými změnami. Bez nich by první souběh
  s agentem znamenal ztrátu práce, a tím i důvěry v celý panel.
- **20. 8. 2026** - Tečka je **stavová kontrolka, ne odznak nepřečteného**.
  Postavená je jako to druhé: stav se sbírá jen pro tab, na který se nekoukáš
  (`isSeen` v rendereru), takže při jednom tabu se shellem na obrazovce nesvítí vůbec
  a to je zároveň hlavní workflow. Záměr byl od začátku jiný: řekni mi, jestli agent
  pracuje, dopracoval, chce něco po mně, nebo spadl, a to bez ohledu na to, kam se
  koukám.
  Z toho plyne dělící čára, kterou je potřeba držet: „viděno" přestane mazat všechno,
  co je **stav** (pracuje, hotovo, čeká na povolení), a zůstane jen u toho, co je
  **událost** (zvonek, chyba, spadlý shell). Čekání na povolení tedy nezhasne tím, že
  se na tab podíváš, ale až tím, že agent pokračuje - to už stavový automat umí.
  Kontrolka na tabu ale nepomůže, když je celé okno za prohlížečem nebo na jiné
  obrazovce. Proto k ní patří stav v hlavním panelu Windows, agregovaný přes všechny
  taby: jeden signál, který říká „někdo dobehl" nebo „někdo se ptá", i když na
  aplikaci nevidíš. Popis je v sekci Mimo vrstvy.
  Je to rozšíření uzavřeného seznamu o prvek, který nestojí v okně žádný pixel.
- **20. 8. 2026** - Dokument přestal být zdrojem tečky. U stavové kontrolky se to
  nedalo udržet: „přepsal se dokument" je zpráva, kterou pohled vyřídí, kdežto stavy
  se pohledem nemažou, takže by po první změně zůstala zelená natrvalo. Dokument má
  svůj vlastní signál, zvýraznění změn, a ten funguje i po přepnutí na ten tab.
  Kdyby se ukázalo, že u tabu bez shellu chybí, patří to jako vlastní značka, ne jako
  další stav v téhle kontrolce.
- **20. 8. 2026** - Přítomnost dialogu je stav, ne příchod, a hlášení programu ho
  přebíjí. Změna proti 19. 8., kdy se to udělalo obráceně: tehdejší problém byl, že
  doznívající značka v okně čtečky maskovala hlášené `busy`, a řešilo se to hlášením
  jen na příchod. Jenže ve chvíli, kdy pohled na tab přestal mazat stavy, zmizela
  jediná cesta ze stavu „čeká na povolení" a oranžová by tam uvízla natrvalo.
  Správné řešení je pořadí: nejdřív se věří tomu, co program hlásí o sobě (`busy`
  i `done`), a teprve pak textu seškrábanému z obrazovky. Ze stavu „čeká" pak vedou
  dvě cesty, hlášení programu a zmizení dialogu z okna, takže funguje i pro program,
  který o sobě nehlásí nic.
- **20. 8. 2026** - Vývojový běh má vlastní `userData` (`project-console-dev`).
  Vyplynulo z prvního dne používání: nainstalovaná aplikace drží single-instance lock
  a sdílí `state.json`, takže dev vedle ní nenaběhne a testování přepisuje otevřené
  taby skutečné práce. Jedno jméno navíc obojí ruší.
- **20. 8. 2026** - Tab se dá pojmenovat po svém. Vyplynulo z prvního dne s víc
  soubory v tabu: jmenovat místo podle toho, co v něm právě je vidět, je slabší než
  jmenovat ho podle toho, co tam děláš. Přepisuje se v liště, ne dialogem, protože
  Electron nemá `prompt()` a dialog na tři slova by vážil víc než ta věc sama.
  Prázdné jméno je cesta zpátky k pojmenování podle souboru.
- **20. 8. 2026** - Font terminálu se dá nastavit, a přesto zůstává „UI pro nastavení"
  non-goal. Velikost se mění zkratkou a pamatuje se, přesně jako téma, které pro tohle
  slouží jako předloha. Rodinu člověk nastaví jednou za život, takže se čte ze
  souboru, ne z dialogu. Dialog s náhledem fontu je ta věc, kterou tenhle projekt
  nechce stavět, a zkratka plus jeden řádek v souboru dají stejný výsledek.
- **18. 8. 2026** - Testy dělané Node runnerem (`node:test`) nad `.ts` přímo.
  Důvod: nula nových závislostí, což drží pravidlo o závislostech na prstech jedné ruky.
  Pokrývají se jen čisté funkce; DOM se nechává na ruční průchod, protože DOM harness
  by byla první skutečná testovací závislost.
- **18. 8. 2026** - Zvýraznění změn dodáno nad L0, tedy před L1.
  Důvod: ze tří funkcí, které stavbu ospravedlňují, neměla žádná svou vrstvu, takže
  hrozilo, že se odpracují L1 až L3 a zbyde horší VS Code bez toho, proč se to staví.
  Tahle jde postavit bez nových závislostí a bez terminálu, tak jde první.
  Zbývají tečka aktivity na tabu a prompt buffer; ten druhý potřebuje L2.
- **20. 8. 2026** - `Ctrl+P` nabízí otevřené soubory tabu a soubory projektu, ne
  soubory otevřené v jiných tabech.
  Vyplynulo z rozhodnutí, co je vlastně otázka za tou klávesou: „kam chci jít v tomhle
  místě", ne „co je otevřené v celé aplikaci" - na to jsou taby vidět.
  Soubor otevřený jinde se přesto objeví jako soubor projektu a řádek to řekne,
  takže skok do jiného tabu je ohlášený, ne překvapení.
  Hledá se podstrunou, ne fuzzy: skóre a jeho ladění je větší věc než sama paleta.
- **20. 8. 2026** - Kliknutelná cesta se nabídne jen tehdy, když ten soubor existuje.
  Vyplynulo z prvního pokusu poznat cestu podle tvaru: `Node.js` a `app.js` jsou k
  nerozeznání, a zpřísnit tvar znamená přijít o `package.json`, což je přesně to, na co
  chce člověk kliknout. Dotaz na disk stojí jedno IPC při přejetí myší a rozhodne to
  bez hádání. Řádek se čte až za koncem cesty, takže `19:38:31` v logu není soubor.
- **20. 8. 2026** - Čistě zavřený shell (`exit`, kód 0) nezhasne do červené, ale do
  ničeho. Vyplynulo z používání: `onExit` kód ignoroval, takže napsat `exit` vypadalo
  stejně jako spadlý shell, a kontrolka tím lhala v jednom případě z deseti.
  Cokoli jiného než nula zůstává poplach.
- **20. 8. 2026** - `Ctrl+F` hledá i v panelu s prostým textem, ale zásah se hlásí
  slovy do stavové lišty, ne podbarvením. Highlight API pracuje s textovými uzly a
  obsah textarey žádný není; Chromium navíc výběr v polí bez fokusu nekreslí, a fokus
  musí zůstat v hledacím poli, jinak by `Enter` psal do souboru místo skákání na další
  zásah. Ověřeno screenshotem, i s vynuceným `::selection`. Kreslit vlastní překryv nad
  textareou je práce na editor, což je non-goal. `Esc` postaví kurzor na zásah, tam už
  výběr vidět je.
- **20. 8. 2026** - Prompt buffer posílá text jako bracketed paste, ne jako psaní.
  Uvnitř `ESC[200~ ... ESC[201~` jsou konce řádků text, takže víceřádkové zadání
  nedojde k TUI po částech - a přesně tomu se ta funkce vyhýbá. Odesílající `CR` jde
  až za koncem pastu, proto se z bufferu předem odřežou koncové prázdné řádky.
  Šuplík zůstal bez přepínače obsahu: je v něm jedna věc a přepínač mezi jednou
  možností je ovládací prvek pro nic. Přijde s druhým obsahem.
- **21. 8. 2026** - Rozhraní umí česky, ale zdrojem zůstává angličtina a čeština je
  proti ní typovaná. Druhý jazyk je místo, kde se špatně překládá to, co nikdo neviděl:
  řetězec přidaný jen do jedné tabulky by se projevil prázdným místem v okně až při
  použití. `Record<StringKey, string>` z toho dělá chybu překladače, což je jediný
  náklad, který tahle funkce trvale nese. Klávesy, cesty a výstup shellu se
  nepřekládají - nejsou to věty aplikace.
- **21. 8. 2026** - Panel `?` přestal být seznamem zkratek a říká i to, co se děje bez
  klávesy: tečka na tabu, načítání dokumentu, Spustit, dev server, čísla vpravo dole.
  Vyšlo z otázky „je v `?` popsané všechno" - nebylo: půlka aplikace se neovládá
  klávesou, takže tabulka zkratek ji celou zamlčela. Je to zvláštní blok pod mřížkou, ne
  další řádky v ní, aby limit „panel se musí dát přehlédnout jedním pohledem" platil dál.
- **21. 8. 2026** - Řádek panelu se vysází jako klávesy jen tehdy, když opravdu jmenuje
  modifikátor. Vyšlo z pohledu na hotový panel: „přetažení souboru" bylo rozsekané do
  tří kláves, které neexistují. Gesto je věta, takže se sází jako věta; čárka mezi
  klávesami zůstala mimo rámeček. Nadpis sekce navíc cestuje se svou tabulkou v jednom
  bloku, jinak ho mřížka položí vedle cizích kláves.
- **21. 8. 2026** - Badge s počtem se kreslí do ikony, ne přes `setOverlayIcon`.
  Windows má na přesně tuhle věc API, jenže kreslí výhradně do pravého dolního rohu, kde
  na téhle ikoně leží řádky dokumentu. Renderer proto vykreslí celou ikonu na canvas a
  hlavní proces ji pověsí na okno přes `setIcon`. Cena je známá a zapsaná: ze zdrojů
  (`npm run dev`) sdílí všechny Electron aplikace jedno tlačítko na liště, takže tam je
  badge nespolehlivý; v zabalené aplikaci funguje. Ověřeno screenshotem hlavního panelu:
  zelená 3 se překreslila na oranžovou 8.
- **21. 8. 2026** - Ikona je kód, ne asset. První pokus byl položit do repozitáře
  `.ico`, což je soubor, který nikdo neumí přečíst ani porovnat. Místo toho je kresba
  TypeScript modul a `npm run icon` z ní udělá `.ico` — se stejným zdrojem pro badge za
  běhu, takže ikona a badge nemohou vypadat jinak. Skript běží dvakrát, jednou v Node
  kvůli `.ts` a jednou v Electronu kvůli kreslení: Electron má starší Node, který `.ts`
  neumí, a v ESM se v něm `app.whenReady()` nedočká nikdy — proto je kreslící půlka
  CommonJS.
- **21. 8. 2026** - Ukazatele limitů mají barvu pořád, ne až když je zle: do 50 %
  zelená, do 80 % oranžová, výš červená. Je to vědomý ústup od pravidla „barva
  přichází, až když na čísle začne záležet", které tu platí jinde a platí dál —
  důvod je, že tohle není výstraha, ale palivoměr: čte se z něj, kolik zbývá, ne
  jestli hoří. Šedá výplň tu otázku nezodpovídá bez čtení čísla vedle ní.
  Číslo zůstává šedé, dokud je klid, a barví se až od oranžové — důraz má stále
  stupně.
- **21. 8. 2026** - Pořadí tabů se mění tažením, ale na myši, ne přes HTML drag &
  drop. Ta druhá cesta předává tažený prvek operačnímu systému, takže tab jde upustit
  na plochu nebo vytrhnout do vlastního okna — a tab je tady místo s běžícím shellem,
  ne záložka. Sledováním kurzoru zůstává celé gesto uvnitř lišty a vytrhnout nejde nic.
  Cílová pozice se počítá jako počet sousedů, jejichž středem kurzor prošel, ne jako
  „nad kterým tabem kurzor je": to druhé přeskakuje při tažení doprava o pozici navíc,
  protože šířka taženého tabu se vleče za kurzorem. Odhalil to test, ne oko.
- **21. 8. 2026** - `Ctrl+V` v shellu vkládá a právě jednou. Předtím šel do shellu jako
  řídicí znak, který agent běžící v panelu ignoruje — odtud dojem, že vkládání
  nefunguje. `Ctrl+C` zůstává přerušením, kopíruje dál `Ctrl+Shift+C`; právé tlačítko
  dělá to, co ve Windows konzoli — kopíruje při výběru, jinak vkládá. K tomu jedna
  věc, kterou by člověk nečekal a odhalil ji až test: Chromium vloží schránku do
  skryté textarey sám a xterm ji pošle dál, takže bez potlačení toho výchozího chování
  dorazil text dvakrát.
- **21. 8. 2026** - Zavření tabu, ve kterém něco běží, se ptá. Vyšlo z přehazování
  tabů: křížek je pár pixelů od místa, kde se tab chytá, a za ním může být agent v půlce
  práce. Ptá se jen na tři stavy — teče výstup, program hlásí práci, nebo se čeká na
  povolení. „Hotovo", „ticho" a „spadl" se zavírají rovnou: otázka, která se ptá
  pokaždé, se odklikává bez čtení a pak nechrání nic. Zavření ostatních tabů se ptá
  jednou za všechny, ne za každý zvlášť.
  Při té příležitosti dostala překlad i starší otázka na neuložené změny, která zůstala
  anglicky z doby před přepínačem jazyka.
- **21. 8. 2026** - Tečka svítí jen tam, kde něco mluví samo za sebe. Nad shellem
  otevřeným v adresáři se rozsvěcela zelená po každém výpisu, což je odpověď na
  otázku, kterou nikdo nepoložil: ta kontrolka se čte jako „co dělá agent", a tam
  žádný není. Zvonek a spadlý shell se ukazují dál — to je zpráva samého panelu,
  ne dohad o někom.
- **21. 8. 2026** - **Claude Code neposílá `OSC 9;4`.** Roadmapa i README tvrdily
  opak od 19. 8., což byl můj předpoklad z toho, že Windows Terminal umí u agenta
  točit kolečko. Při hledání signálu „běží tu Claude" jsem to konečně ověřil: v jeho
  binárce ta sekvence není ani jednou, pročtením celého souboru, zatímco
  popisky jeho dialogu tam jsou — takže texty jsou čitelné a nulový výsledek něco
  znamená. Právě proto ze stavů, které aplikace umí, u Clauda nikdy nesvítily
  `busy`/`done`, ale jen odhady z ticha. Claude se teď poznává podle vlastního
  rozhraní („Welcome to Claude Code", „? for shortcuts“) — stejně křehký druh
  signálu jako dialog na povolení, se stejným chováním při změně: kontrolka zhasne,
  místo aby lhala. Podpora `OSC 9;4` zůstává pro programy, které ji posílají.
- **21. 8. 2026** - Ukazatele limitů přežijí 429. Endpoint na dotaz jednou za minutu
  začne odmítat, takže čtení platí pět minut, po odmítnutí se čtvrt hodiny mlčí a
  poslední známá hodnota zůstává na obrazovce až hodinu. Zmizet je horší než ukázat
  trochu starší číslo — časy obnovy uvnitř něj zůstávají správné samy od sebe — ale
  jakmile čtení není aktuální, tooltip řekne, kdy vzniklo.
- **21. 8. 2026** - Poslední čtení limitů leží na disku vedle `state.json`. Vyšlo
  z prvního ostrého zásahu do rate limitu: aplikace se restartovala, paměť byla
  prázdná, endpoint odmítal a lišta zůstala prázdná, i když číslo z doby před půl
  hodinou by bylo lepší než nic. Je to jen cache: nečitelná, poškozená i stará
  znamenají to samé co žádná. Čtení zůstává platné pět minut: odmítnutí
  vzniklo z ladění, při kterém se aplikace restartovala každých pár minut, ne z běžného
  používání. Kdyby při práci vadilo, je to jedno číslo.
  Uložený tvar čte vlastní funkce, ne `parsePlanUsage`: ta bere odpověď serveru, ne
  to, co už přes ni prošlo. Chyba, která by se tím zavřela potichu — cache, která se
  nikdy nenačte — je teď pokrytá testem.
- **21. 8. 2026** - Jeden soubor může být otevřený ve víc tabech. Do teď `Ctrl+O`
  nad souborem, který už byl otevřený jinde, přeskočil do toho druhého tabu — z obavy,
  že dvě kopie znamenají dva rozepsané texty a jeden o druhém neví. Jenže to je pravidlo
  z doby, kdy tab byl soubor. Dnes je tab místo a dvě místa nad jedním projektem jsou
  běžná věc; skok do cizího tabu vynucoval jediné „sezínu" tam, kde uživatel chce dvě.
  Rozepsané úpravy drží dál starší pravidlo: kdo má draft, tomu se nic nenačte a stavový
  řádek to řekne. Z toho plynou tři věci, které musely následovat: přepsání na disku
  dojde do všech kopií, sledování se zruší až se zavřením té poslední, a dva taby nad
  týmž souborem si nechají prosté jméno — doplňování cesty je nerozliší a skončilo
  celou cestou v každém tabu. `Ctrl+P` na řádku nadále hlásí, že soubor je otevřený i
  jinde, ale už jako informaci, ne jako slib skoku.
- **21. 8. 2026** - Nový tab jde založit i myší a přichází s otevřeným shellem.
  `Ctrl+T` byla jediná cesta, což je v pořádku pro toho, kdo tu klávesu zná, a
  neviditelné pro všechny ostatní. Nejdřív skončilo jako `+` za posledním tabem, kde ho
  má každé okno s taby, ale hledalo se jinde: patří nahoru vedle otevírání souboru,
  protože to jsou dvě poloviny téže otázky — kde pracovat a na čem. Tlačítko na soubor
  se při té příležitosti přestalo jmenovat „+ Otevřít", což vedle „+ Nový tab" už
  neznamenalo nic. Shell je otevřený rovnou, protože místo se zakládá kvůli práci a nic jiného
  v něm zatím není; startuje v domovském adresáři, dokud tab nepatří žádnému projektu.
  Při tom vylezla chyba, kterou předtím nemělo jak spustit: `render()` se v tabu bez
  dokumentu vracel dřív, než se shell vůbec nastartoval, takže panel byl otevřený a
  prázdný. Prázdný tab se teď jmenuje „Nový tab", ale mezi spuštěními se nepamatuje:
  není v něm co obnovit a jeho shell stejně končí s oknem. Až bude tab pamětlivý na
  svůj adresář nezávisle na souborech, změní se to.
- **21. 8. 2026** - `Ctrl+1` až `Ctrl+9` platí i s fokusem v terminálu. Pravidlo
  „v shellu jen shiftované varianty" chrání klávesy, které tam něco dělají — `Ctrl+W`
  maže slovo, `Ctrl+D` ukončuje vstup. Číslice mezi ně nepatří: terminál z nich dělá
  řídicí znaky, které nikdo nemáčkne záměrně (`Ctrl+2` je NUL, `Ctrl+3` escape), zatímco
  nemožnost odejít z panelu, ve kterém právě píšeš, je cítit pokaždé. Klávesa se
  odmítne uvnitř xtermu a tím doputuje do okna; do shellu se neposílá nic — ověřeno
  tím, že `Ctrl+5` bez pátého tabu nezmění v terminálu ani znak.
- **21. 8. 2026** - Znaky, podle kterých se pozná běžící Claude, jsou širší, než byl
  první odhad — a opět to rozhodlo pozorování, ne úvaha. Původní dvojice „Welcome to
  Claude Code" a „? for shortcuts" v praxi nestačila: session spuštěná v adresáři,
  kterému už věří, žádný banner nevypíše a nápověda pod vstupním polem se hned
  vymění za řádek režimu. Puštěno naostro v aplikaci: Claude běžel, panel kreslil
  „⏵⏵ auto mode on (shift+tab to cycle)" a tečka zůstávala tmavá celých pět minut.
  Sledovaných řetězců je teď víc, včetně řádku režimu a glyfu, kterým začíná; test na
  ně používá text odečtený z opravdové session, ne vymyšlený.
- **21. 8. 2026** - Badge se kreslí přes `setOverlayIcon`, tedy tam, kam ho položí
  systém — a tím padá rozhodnutí z téhož dne o překreslování celé ikony. To fungovalo
  při prvním zkoušení, jenže jen jednou: hlavní panel si drží ikonu, kterou k
  programu přiřadil poprvé, a další ignoruje. Ukázalo se to až při používání —
  číslo nenaskočilo vůbec — a při ověření neprobliklo ani vynucené. Číslo, které
  přestane být pravdivé, je horší než roh, který si nevybereme. (Windows 11 ho ostatně
  kreslí vpravo nahoru, tedy tam, kde byl původně chtěný.) Ověřeno na zabalené
  aplikaci: zelená 1 po doběhnutí práce s minimalizovaným oknem, a překreslení na
  červenou 7.
- **21. 8. 2026** - Tečka „pracuje se" se točí místo blikání. Pulzování vypadalo stejně
  jako „něco se děje" i „něco čeká"; otáčení říká jedině „probíhá“. Na tabu se nic
  jiného nehne, takže to, co se hne, je to, na co se má kouknout.
- **21. 8. 2026** - Zavření okna aplikaci neukončí; schová ji do traye. Tray byl
  dřív odmítnutý s tím, že „běžet na pozadí" samo o sobě nic nepřidává — a to platilo,
  dokud důvodem bylo běhání na pozadí. Důvod je teď jiný: křížek zabíjel agenty
  uprostřed práce, takže úklid plochy stál rozdělanou práci. Není to krok k perzistentním
  session: PTY dál žijí v procesu aplikace, takže ukončení, odhlášení i restart je
  pořád konec. Aby přežily i to, musel by je držet samostatný proces — dny práce a jiný
  program.
  Bez ikony v traye se zavírání chová po starém a aplikace skončí: ztracená session je
  špatná, okno, které nejde vrátit, horší. První schování to řekne bublinou, jinak by
  aplikace zmizela z obrazovky, ale ne ze stroje. Ověřeno na zabalené aplikaci: okno
  zavřeno systémovým způsobem, shelly běžely dál, po opětovném spuštění okno zpátky.
- **21. 8. 2026** - Křížek schovává jen tehdy, když je co chránit: když je v některém
  tabu agent, ať pracuje nebo stojí na promptu. Bez něj ukončí aplikaci jako dřív —
  co tím padne, je shell na promptu, a taby, rozložení i jména jsou v uložené session.
  Cena je známá: chování křížku závisí na stavu, který není vidět na první pohled —
  proto to svítí tečka na tabu, která se řídí týmž příznakem.
  Při ověřování vylezla chyba, kterou by nikdo nečekal: okno se sice zavřelo napevno,
  ale aplikace běžela dál, protože `window-all-closed` ukončoval jen tehdy, když
  neexistovala ikona v traye. Správně se tam nemá ptat na tray vůbec: schované okno
  se nezavírá, takže když se ta událost stane, není pro co běžet dál.
- **21. 8. 2026** - O tom, co udělá křížek okna, rozhodují živé shelly, ne rozpoznaný
  agent. Rozpoznávání podle řetězců, které Claude Code vypisuje, je záměrně křehké a u
  tečky na tabu je to bezpečné selhání: zhasne, nelže. Jenže tentýž příznak začal řídit
  i skrývání okna, a tam má selhání opačný požadavek - přeformulovaný banner by tiše
  ukončil běžící session, přesně to, proti čemu skrývání vzniklo. Rozhodnutí má teď tři
  stavy místo dvou: nic neběží → ukončit, rozpoznaný agent → skrýt, běžící shell, který
  nikdo nerozpoznal → zeptat se. Shelly počítá main proces, kterému patří, takže o tom
  nerozhoduje stav přitékající z rendereru.
- **21. 8. 2026** - Rušení shellů a file watcheru se přesunulo z `before-quit` do
  `will-quit`. `before-quit` běží dřív, než se okno vůbec zeptá na zavření, a neuložené
  úpravy to zavření odmítnou - odmítnutý quit tak nechal okno na obrazovce s
  pozabíjenými agenty a bez live reloadu. `will-quit` je první moment, kdy už quit
  odmítnout nejde, takže tam patří všechno nevratné.
- **21. 8. 2026** - Všechny otázky kreslí aplikace sama, ne systémový message box.
  Důvod není jen vzhled: `window.confirm` i nativní box zastaví renderer, takže zrovna
  ve chvíli, kdy se člověk rozhoduje, jestli něco běží, přestane tečka na tabu svítit a
  výstup shellu se zastaví. Main proces zůstává vlastníkem okna a shellů, takže posílá,
  *která* otázka to je, a okno ji nakreslí a vrátí index tlačítka.
  Systémový box zůstal jako záložní cesta pro renderer, který kreslit nemůže - čeká se
  ale na potvrzení, že je box na obrazovce, ne na odpověď. První verze čekala na
  odpověď a po čtyřech sekundách postavila vedle vlastní otázky ještě systémovou;
  ukázalo se to hned při prvním zavření okna.
- **22. 8. 2026** - Tab se dá otevřít nad adresářem, čímž je model „tab = adresář"
  dokončený. Do teď byl tab vždycky dokument a adresář se z něj odvozoval: `Ctrl+T`
  udělal prázdný tab, jehož shell neměl kde začít a spadl na `USERPROFILE` - takže
  člověk, který si to poprvé otevřel, skončil v domovské složce, ne v projektu.
  Zvolený adresář má přednost před adresářem souboru všude, protože je to volba, ne
  odvození; otevřený soubor tedy místo nepřestěhuje.
  Netriviální bylo jen pamatování: tab bez souborů se zahazoval na dvou místech, při
  čtení session i při obnově v rendereru. Adresář přetažený do okna se rozpozná dotazem
  do main procesu - Windows předává soubor i adresář stejně, a adresář předtím skončil
  jako dokument, který se nedá přečíst.
- **22. 8. 2026** - Kam má tab jít se dá napsat, ne jen vyklikat: `Ctrl+G` a
  `~/source/projekt`. Systémový dialog jsou tři kliknutí a scrollování pro cestu, která
  se napíše za dvě sekundy - a takhle se ty adresáře i pojmenovávají nahlas.
  Doplňuje se `Tab` z výpisu podadresářů toho, co je napsané, a výsledná absolutní cesta
  je vidět dřív, než se stiskne Enter.
  Jednoslovný dotaz jde navíc do `zoxide`, pokud je na stroji - jeho odpovědi jsou
  označené jako často navštěvované. Je to jednosměrné: do jeho databáze se nikdy nic
  nezapisuje, ta patří shellu. Bez zoxide zbyde výpis adresářů, což je celá funkce.
- **22. 8. 2026** - `Ctrl+T` dědí místo aktivního tabu, jako to dělá nový tab
  v terminálu. Tab, který není nikde, měl shell v domovské složce a `Ctrl+P` neměl co
  prohledávat, takže se musel hned poslat dál dalším klikem. Tím zbyla jasná dělba:
  `Ctrl+T` je „další místo tady", `Ctrl+G` je „chci jinam".
- **22. 8. 2026** - `Ctrl+G` je zároveň velmi lehký prohlížeč souborů: šipky po
  seznamu, `Tab` dovnitř vybraného adresáře, `Shift+Tab` o úroveň výš, `Enter` až když
  jsi tam. Existují dvě konvence a rozděluje je, jestli je ta věc navigátor, nebo výběr:
  v Průzkumníkovi, rangeru nebo ido jde `Enter` dovnitř, v doplňování shellu a ve fzf
  bere `Enter` to vybrané a dovnitř se chodí Tabem. Tohle je výběr, takže `Enter`
  znamená to samé jako ve všech ostatních polích aplikace, a nejčastější případ
  (napsat cestu a jít tam) nestojí o klávesu víc.
- **22. 8. 2026** - Otázky se dají odpovědět z klávesnice: šipky mezi odpověďmi, `Enter`
  bere vybranou, `Esc` bezpečnou. Vyplynulo z používání - každá otázka téhle aplikace
  padne ve chvíli, kdy jsou obě ruce na klávesnici, protože tam se tu pracuje.
- **22. 8. 2026** - `Ctrl+P` nabízí soubory podle **místa**, ne podle session tabu.
  Vyplynulo z používání: co je otevřené v tabu zmizí s tabem, takže projekt otevřený
  příště začínal prázdným seznamem a ty tři soubory se hledaly znova.
  Nic se neoznačuje ručně: oblíbený soubor, který se musí označit, je špatně poprvé,
  kdy to někdo zapomene. Pamatuje se, co bylo otevřeno, od naposledy, dvacet souborů
  na místo; smazaný nebo přejmenovaný soubor ze seznamu vypadne, protože nabízet
  neexistující soubor je horší než kratší seznam.
  Je to `places.json` vedle session, ne v ní: session je „co je otevřené teď" a přepisuje
  se při každém pohybu, tohle je „co tu bývá otevřené" a jen roste.
- **23. 8. 2026** - Číslo na ikoně počítá jen běhy, o které někdo požádal, a maže se po
  tabech. Vyplynulo z používání: číslo se po kliknutí na ikonu ztratilo a po minimalizaci
  se do dvou sekund vrátilo, protože heuristika ticha nerozliší doběhlý úkol od
  překreslené obrazovky - TUI si překreslí vstupní pole, prompt se po změně velikosti
  vykreslí znovu, a oba vypadají jako „chvíli teklo a pak bylo ticho".
  Důkazy jsou teď tři, podle toho, kolik váží: vlastní hlášení programu se věří vždycky,
  běhu po odeslaném příkazu taky (Enter v shellu je záměr, který překreslení neumí
  napodobit) a všemu ostatnímu jen tehdy, když to trvalo dýl než překreslení.
  Odeslaný příkaz platí pět minut a nespotřebuje ho běh, který skončil před tvýma očima:
  shell nikdy neřekne, že je hotovo, a jeden příkaz je dva běhy, kdykoli uprostřed mlčí.
  Mazání je po tabech, protože číslo znamená „kolik míst musím obejít": pohled na okno
  dřív odepsal všechny taby, i když jsi se koukl jen na jeden.
- **23. 8. 2026** - `Ctrl+T` a `Ctrl+G` si bere aplikace i za fokusu v shellu, přes to,
  že je Claude Code obsazené. Ověřeno, ne odhadnuto: v jeho binárce sedí `ctrl+g` na
  `chat:externalEditor` a `ctrl+t` na `app:toggleTodos`, a když jsem je do běžící session
  poslal, `Ctrl+G` otevřel Notepad („Save and close editor to continue...") a `Ctrl+T`
  neudělal nic viditelného - nejspíš neměl co přepnout.
  Cena je tedy externí editor v Claudovi a přepínač todo listu. Rozhodnutí je vědomé:
  „jít na jiné místo" je to, k čemu tahle aplikace je, a přepínat kvůli tomu fokus ji
  popírá; prompt buffer (`Alt+P`) navíc pokrývá stejnou potřebu jako ten editor.
  Technicky to nešlo udělat jen v okně: `Ctrl+T` a `Ctrl+G` jsou na drátě řídicí znaky
  0x14 a 0x07, takže je xterm spolkne, pošle do shellu a událost zastaví. `Ctrl+``
  a font fungovaly „samy" jen proto, že pro ně xterm žádné mapování nemá. Musí se tedy
  odmítnout i na straně terminálu, a ta podmínka je v `shared/shortcuts.ts`, aby se obě
  strany nemohly rozejít.
- **23. 8. 2026** - Místo otevřené přes `Ctrl+G`, tlačítko nebo přetažením má shell
  rovnou otevřený, jako tab z `Ctrl+T`. Dvě cesty ke stejné věci se chovaly různě a
  nebylo pro to jiné vysvětlení než že se to zapomnělo dodělat; místo je adresář a shell
  v něm, takže dojít někam a pak si teprve říct o shell jsou dva pohyby na jeden záměr.
- **23. 8. 2026** - `Ctrl+P` si aplikace bere i za fokusu v shellu, tedy stejně jako
  `Ctrl+T` a `Ctrl+G`. Zůstat u „samotné `Ctrl+P` patří shellu" znamenalo, že tři klávesy
  jedné rodiny - který soubor, další místo, kam jít - se chovaly dvěma způsoby.
  Ověřeno, co se tím bere: v Claude Code `Ctrl+P` vytáhne předchozí prompt z historie
  a **zahodí rozepsaný text ve vstupu** - takže dosavadní chování dokázalo sebrat půl
  napsaného promptu tomu, kdo chtěl paletu. Šipka nahoru přitom dělá v Claude Code
  totéž, takže `Ctrl+P` je tam duplikát z emacsu a cena za zabrání je nejmenší ze všech
  tří. Po opravě ověřeno v živé session: paleta se otevře a rozepsaný prompt zůstane.
- **23. 8. 2026** - Otevření souboru si vynutí, aby byl vidět. Do teď se dal otevřít
  dokument do tabu, kde vpravo běžel dev server, a stalo se všechno kromě toho, že by
  ho bylo vidět: tab se přejmenoval, titulek okna se změnil, stavová lišta hlásila
  načteno, a dokument byl schovaný za serverem. Akce, jejíž jediný důkaz je někde jinde,
  než se člověk kouká, se čte jako rozbitá aplikace.
  Server se kvůli tomu nezavírá - pravá strana přejde na „obojí", což je jedno `Alt+W`
  od kterékoli varianty, takže volba zůstane tam, kde ji člověk udělal. Totéž platí pro
  zvětšený panel: zoom na shell nebo server se ruší, na dokument se nechává.
- **23. 8. 2026** - `Alt+1/2/3` panel otevřou, ne jen zaostří. „Jdi na server" je
  otázka, na kterou se nedá odpovědět tím, že se nestane nic - a přesně to se dělo,
  když ten panel nebyl vidět: `focusPane` zkontroloval `visiblePanes()` a mlčky se
  vrátil. Je to ta samá díra jako u otevírání souboru za běžícím serverem, jen z druhé
  strany. Nová klávesa se kvůli tomu nepřidávala: `Alt+3` je teď to jedno „ukaž server",
  `Alt+1` otevře zavřený shell, a nic se za to nezavírá - pravá strana jde na „obojí".
- **24. 8. 2026** — Tlačítko „Kde jsme skončili“: aplikace se smí zeptat agenta, když
  si o to člověk řekne. Vypadá to jako porušení non-goalu „AI uvnitř aplikace", a není:
  žádný model tu není, volá se to samé CLI, které uživatel pouští sám, a nikdy ne samo od
  sebe. Hranice, která z toho plyne a musí držet: **jen na stisk, nikdy na pozadí.**
  Začalo to návrhem feedu změněných souborů, který uživatel odmítl s tím, že ho nezajímá,
  jestli se změnil soubor x nebo y — chce vědět, co se dělo a co dál, byznysově. To je
  jiná otázka a odpovídá na ni jedině agent. Kdyby to bylo jen poslání promptu do shellu,
  je to skill, ne funkce aplikace; funkcí to dělá až to, že odpověď skončí v okně jako
  pět bodů, a ne ve výpisu terminálu mezi buildem a stack trace.
  Tři věci, které se při tom změřily, protože je nebylo možné vyčíst: seznam povolených
  nástrojů nepřežije cestu přes `cmd.exe`, který si rozebere závorky a hvězdičky — místo
  něj stačí `--permission-mode plan`, jedno slovo, které shell nemá jak rozbít, a čte
  všechno a nepíše nic; otázka se musí poslat vstupem, ne argumentem, protože argumenty
  se přes shell nespárují uvozovkami; a print mode čeká tři vteřiny na vstup, který nikdo
  neposílá, dokud se mu vstup nezavře.
