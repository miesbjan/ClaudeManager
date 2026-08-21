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

Zbývá k modelu „tab = adresář“: tab je pořád dokument a adresář se z něj odvozuje.
Otevřít tab nad adresářem samotným, bez dokumentu, zatím nejde.

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
Povolený je jen tenhle stroj, iframe je v sandboxu a CSP pouští do rámu pouze
localhost. `Alt+W` přepíná.

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
- **Sandbox vloženého rámu je vědomý kompromis.** Rám má `allow-scripts` i
  `allow-same-origin` a Chromium na to vypisuje varování, že z takového sandboxu se dá
  uniknout.
  Bez `allow-same-origin` ale vložená aplikace nemá vlastní origin, takže jí nefunguje
  `localStorage` ani vlastní `fetch`, a panel by byl k ničemu.
  V praxi je stránka jiného originu než tahle, takže na ni nedosáhne.
  Jediná výjimka je `npm run dev`: kdyby panel ukazoval vlastní dev server aplikace na
  portu 5173, je stejného originu a dostane se na `window.api`. Zabalené aplikace se to
  netýká, tam je rodič `file://`.
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
