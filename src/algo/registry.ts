/** Seznam modulů pro navigaci, úvodní stránku a hledání. Cesty jsou relativní k HashRouteru. */

/** Úroveň: Bc. = Průvodce labyrintem algoritmů (ADS), Mgr. = přednáška Datové struktury I. */
export type Level = "bc" | "mgr";

export const LEVEL_LABEL: Record<Level, string> = { bc: "Bc.", mgr: "Mgr." };
export const LEVEL_TITLE: Record<Level, string> = {
  bc: "Bakalářská látka (Průvodce labyrintem algoritmů)",
  mgr: "Magisterská přednáška Datové struktury I",
};

export interface ModuleLink {
  path: string;
  title: string;
  /** jedna věta: co modul ukazuje a jakou má operace složitost */
  desc: string;
  level: Level;
  /** další slova pro hledání (synonyma, anglické názvy) */
  tags?: string[];
  /** odkud látka je – zobrazí se u nadpisu modulu (formatSource) */
  source: ModuleSource;
}

/**
 * Zdroj modulu: oddíl a tištěná strana Průvodce labyrintem algoritmů (docs/pruvodce.pdf) a/nebo magisterská
 * přednáška Datové struktury I („DS I, přednáška 2“ = handout L02 v docs/, „DS I, skripta 6.2“ = oddíl
 * skript M. Mareše, docs/ds.pdf). Bc. moduly mají vždy kapitolu i stranu, Mgr. přednášku.
 */
export interface ModuleSource {
  /** oddíl knihy, např. „9.5“ */
  chapter?: string;
  /** tištěná strana začátku oddílu (nebo místa s algoritmem) */
  page?: number;
  lecture?: string;
}

/** Zdroj jedním řádkem: „Průvodce 9.5, str. 230 · DS I, přednáška 2“; bez zdroje prázdný řetězec. */
export function formatSource(source: ModuleSource | undefined): string {
  if (!source) return "";
  const parts: string[] = [];
  if (source.chapter !== undefined)
    parts.push(
      `Průvodce ${source.chapter}` +
        (source.page !== undefined ? `, str. ${source.page}` : ""),
    );
  if (source.lecture) parts.push(source.lecture);
  return parts.join(" · ");
}
export interface Category {
  title: string;
  /** krátké uvedení skupiny na úvodní stránce */
  intro?: string;
  modules: ModuleLink[];
}

export const CATEGORIES: Category[] = [
  {
    title: "Třídění",
    intro:
      "Stejný vstup, různé strategie – sledujte počet porovnání a prohození.",
    modules: [
      {
        path: "/sort/bubble",
        title: "Bubblesort",
        desc: "Opakovaně prohazuje sousední prvky ve špatném pořadí; Θ(n²) porovnání, stabilní.",
        level: "bc",
        source: { chapter: "3.1", page: 61 },
        tags: ["bublinkové třídění", "řazení", "sorting"],
      },
      {
        path: "/sort/select",
        title: "Selectsort",
        desc: "V každém kroku najde minimum nesetříděné části a přesune ho na její začátek; vždy Θ(n²) porovnání.",
        level: "bc",
        source: { chapter: "3.1", page: 61 },
        tags: ["třídění výběrem", "selection sort", "řazení"],
      },
      {
        path: "/sort/insert",
        title: "Insertsort",
        desc: "Postupně zatřiďuje prvky do setříděného začátku pole; Θ(n²), na skoro setříděném vstupu rychlý.",
        level: "bc",
        source: { chapter: "3.1", page: 61 },
        tags: ["třídění vkládáním", "insertion sort", "řazení"],
      },
      {
        path: "/sort/merge",
        title: "Mergesort",
        desc: "Slévá sousední setříděné běhy délky 1, 2, 4, … (zdola nahoru); Θ(n log n), stabilní, s pomocným polem.",
        level: "bc",
        source: { chapter: "3.2", page: 64 },
        tags: ["slévání", "merge sort", "rozděl a panuj", "řazení"],
      },
      {
        path: "/sort/quick",
        title: "Quicksort",
        desc: "Rozdělí pole podle pivota na menší a větší prvky a obě části setřídí rekurzivně; průměrně Θ(n log n), v nejhorším Θ(n²).",
        level: "bc",
        source: { chapter: "10.7", page: 259 },
        tags: ["pivot", "quick sort", "rozděl a panuj", "řazení"],
      },
      {
        path: "/sort/heap",
        title: "Heapsort",
        desc: "Z pole postaví maximovou haldu a opakovaně přesouvá její kořen na konec; Θ(n log n) i v nejhorším případě, na místě.",
        level: "bc",
        source: { chapter: "4.2", page: 90 },
        tags: ["halda", "heap sort", "řazení"],
      },
      {
        path: "/sort/counting",
        title: "Counting sort",
        desc: "Spočítá výskyty každé hodnoty z malého rozsahu 1 … r a vypíše je v pořadí; Θ(n + r), bez porovnávání.",
        level: "bc",
        source: { chapter: "3.4", page: 72 },
        tags: ["třídění počítáním", "přihrádky", "řazení"],
      },
    ],
  },
  {
    title: "Datové struktury",
    intro:
      "Základní struktury, amortizovaná složitost jejich operací a stránkování v cache.",
    modules: [
      {
        path: "/ds/stack",
        title: "Zásobník",
        desc: "LIFO: Push i Pop pracují s vrcholem zásobníku v konstantním čase.",
        level: "bc",
        source: { chapter: "4.1", page: 81 },
        tags: ["stack", "lifo"],
      },
      {
        path: "/ds/queue",
        title: "Fronta",
        desc: "FIFO: Enqueue přidává na konec, Dequeue odebírá ze začátku, obojí v O(1).",
        level: "bc",
        source: { chapter: "4.1", page: 81 },
        tags: ["queue", "fifo"],
      },
      {
        path: "/ds/list",
        title: "Spojový seznam",
        desc: "Prvky propojené ukazateli: vložení a smazání za známým prvkem v O(1), hledání v O(n).",
        level: "bc",
        source: { chapter: "4.1", page: 81 },
        tags: ["linked list", "ukazatel"],
      },
      {
        path: "/ds/heap",
        title: "Binární halda",
        desc: "Strom uložený v poli, kde otec není větší než synové; Insert i ExtractMin v O(log n).",
        level: "bc",
        source: { chapter: "4.2", page: 84 },
        tags: ["heap", "prioritní fronta", "priority queue", "minimová halda"],
      },
      {
        path: "/ds/segtree",
        title: "Intervalový strom",
        desc: "Úplný binární strom nad polem s minimy podstromů; dotaz na minimum intervalu i změna prvku v O(log n).",
        level: "bc",
        source: { chapter: "4.5", page: 98 },
        tags: [
          "segment tree",
          "minimum intervalu",
          "range minimum",
          "RMQ",
          "rozsahový dotaz",
          "range query",
        ],
      },
      {
        path: "/ds2/array",
        title: "Amortizace: nafukovací pole",
        desc: "Pole, které se při zaplnění zdvojnásobí a při čtvrtinovém zaplnění zmenší; amortizovaně O(1) na operaci.",
        level: "mgr",
        source: { chapter: "9.1", page: 219, lecture: "DS I, přednáška 1" },
        tags: [
          "amortizace",
          "amortizovaná složitost",
          "potenciál",
          "dynamické pole",
          "realokace",
        ],
      },
      {
        path: "/ds2/counter",
        title: "Amortizace: binární počítadlo",
        desc: "Jedno Increment může přepsat mnoho bitů, posloupnost operací ale stojí amortizovaně O(1) na operaci.",
        level: "mgr",
        source: { chapter: "9.2", page: 222, lecture: "DS I, přednáška 1" },
        tags: ["amortizace", "amortizovaná složitost", "potenciál", "bity"],
      },
      {
        path: "/cache/paging",
        title: "Stránkování: LRU, FIFO a OPT",
        desc: "Porovná strategie výměny stránek v cache (LRU, FIFO a optimální OPT) na zadané posloupnosti požadavků.",
        level: "mgr",
        source: { lecture: "DS I, přednáška 4" },
        tags: ["cache", "paging", "fifo", "kompetitivní", "výpadek"],
      },
    ],
  },
  {
    title: "Vyhledávací stromy",
    intro:
      "Find, Insert a Delete ve stromu – s vyvažováním, bez něj i amortizovaně.",
    modules: [
      {
        path: "/tree/bst",
        title: "Binární vyhledávací strom",
        desc: "Strom bez vyvažování: Find, Insert a Delete trvají úměrně hloubce, která může být až n.",
        level: "bc",
        source: { chapter: "8.1", page: 185 },
        tags: ["bst", "binary search tree", "binární vyhledávání"],
      },
      {
        path: "/tree/avl",
        title: "AVL strom",
        desc: "Vyvážený strom, kde se hloubky podstromů každého vrcholu liší nejvýš o 1; rotace drží hloubku O(log n).",
        level: "bc",
        source: { chapter: "8.2", page: 191 },
        tags: ["rotace", "vyvážený strom", "balanced"],
      },
      {
        path: "/tree/llrb",
        title: "Červeno-černý strom (LLRB)",
        desc: "Překlad (2,4)-stromu: červené hrany vedou jen doleva; Insert a Delete s rotacemi a přebarvováním, hloubka Θ(log n).",
        level: "bc",
        source: { chapter: "8.4", page: 206 },
        tags: [
          "LLRB",
          "left-leaning red-black tree",
          "červeno-černý",
          "červeno-černé stromy",
          "RB strom",
          "rotace",
          "přebarvení",
          "MoveRedLeft",
          "MoveRedRight",
          "(2,4)-strom",
          "2-3-4 strom",
          "vyvážený strom",
          "balanced",
        ],
      },
      {
        path: "/tree/bb",
        title: "BB[α]-strom (líná přestavba)",
        desc: "Strom vyvážený podle velikostí podstromů; porušený podstrom se celý přestaví, amortizovaně O(log n).",
        level: "mgr",
        source: { chapter: "9.4", page: 228, lecture: "DS I, přednáška 1" },
        tags: [
          "bb alfa",
          "váhově vyvážený",
          "přestavba",
          "amortizace",
          "amortizovaná složitost",
        ],
      },
      {
        path: "/tree/splay",
        title: "Splay strom",
        desc: "Každý přístup vytáhne prvek rotacemi do kořene; amortizovaně O(log n) na operaci.",
        level: "mgr",
        source: { chapter: "9.5", page: 230, lecture: "DS I, přednáška 2" },
        tags: [
          "samoupravující",
          "rotace",
          "zig zag",
          "amortizace",
          "amortizovaná složitost",
        ],
      },
      {
        path: "/tree/ab",
        title: "(a,b)-strom / B-strom",
        desc: "Vrcholy mají a až b synů a všechny listy leží ve stejné hloubce; Insert dělí přeplněné vrcholy, Delete je slučuje.",
        level: "mgr",
        source: { chapter: "8.3", page: 198, lecture: "DS I, přednáška 3" },
        tags: ["b-strom", "btree", "2-3 strom", "vícecestný"],
      },
    ],
  },
  {
    title: "Hešování",
    intro:
      "Tabulky s hešovací funkcí: kolize, přehešování a pravděpodobnostní struktury.",
    modules: [
      {
        path: "/hash/chaining",
        title: "Hešování: separované řetězce",
        desc: "Každá přihrádka drží spojový seznam klíčů; s univerzální hešovací funkcí očekávaně O(1) na operaci.",
        level: "mgr",
        source: { chapter: "11.3", page: 276, lecture: "DS I, skripta 6.1" },
        tags: ["hash", "hešovací tabulka", "univerzální hešování", "řetízky"],
      },
      {
        path: "/hash/probing",
        title: "Hešování: otevřená adresace",
        desc: "Lineární přidávání: kolidující klíč zkouší další buňky, mazání nechává náhrobky.",
        level: "mgr",
        source: { chapter: "11.4", page: 279, lecture: "DS I, skripta 6.3" },
        tags: ["hash", "linear probing", "náhrobek", "shluky"],
      },
      {
        path: "/hash/cuckoo",
        title: "Kukaččí hešování",
        desc: "Klíč smí ležet jen v jedné ze dvou buněk; Insert vyhazuje obsazené buňky jako kukačka, Find stojí nejvýš dva přístupy.",
        level: "mgr",
        source: { lecture: "DS I, skripta 6.2" },
        tags: ["cuckoo hashing", "hash", "přehešování"],
      },
      {
        path: "/hash/bloom",
        title: "Bloomův filtr",
        desc: "Bitové pole a k hešovacích funkcí: vložený prvek najde vždy, u nevloženého se občas splete.",
        level: "mgr",
        source: { lecture: "DS I, skripta 6.4" },
        tags: ["bloom filter", "pravděpodobnostní", "false positive", "hash"],
      },
    ],
  },
  {
    title: "Grafy",
    intro:
      "Prohledávání, mosty a komponenty, nejkratší cesty a minimální kostry na vlastním grafu.",
    modules: [
      {
        path: "/graph/bfs",
        title: "Prohledávání do šířky (BFS)",
        desc: "Prochází graf po vrstvách pomocí fronty a najde nejkratší cesty v počtu hran; O(n + m).",
        level: "bc",
        source: { chapter: "5.2", page: 110 },
        tags: ["breadth first search", "fronta", "vrstvy"],
      },
      {
        path: "/graph/dfs",
        title: "Prohledávání do hloubky (DFS)",
        desc: "Prochází do hloubky, zapisuje časy otevření a uzavření a třídí hrany na stromové, zpětné, dopředné a příčné; O(n + m).",
        level: "bc",
        source: { chapter: "5.6", page: 119 },
        tags: ["depth first search", "klasifikace hran", "zásobník"],
      },
      {
        path: "/graph/bridges",
        title: "Mosty a artikulace",
        desc: "Jedno prohledání do hloubky spočítá in(v) a low(v) a najde hrany i vrcholy, jejichž odebrání graf rozpojí; O(n + m).",
        level: "bc",
        source: { chapter: "5.7", page: 123 },
        tags: [
          "most",
          "mosty",
          "bridges",
          "artikulace",
          "articulation point",
          "cut vertex",
          "2-souvislost",
          "low",
          "souvislost",
          "prohledávání do hloubky",
        ],
      },
      {
        path: "/graph/topo",
        title: "Topologické uspořádání",
        desc: "Seřadí vrcholy orientovaného acyklického grafu tak, aby hrany vedly jen dopředu, nebo najde cyklus.",
        level: "bc",
        source: { chapter: "5.8", page: 127 },
        tags: ["dag", "topological sort", "toposort", "cyklus"],
      },
      {
        path: "/graph/scc",
        title: "Komponenty silné souvislosti",
        desc: "Tarjan: jedno DFS se zásobníkem a esc(v) rozloží orientovaný graf na komponenty; varianta dvě DFS přes Gᵀ (5.9); O(n + m).",
        level: "bc",
        source: { chapter: "5.10", page: 134 },
        tags: [
          "silná souvislost",
          "silně souvislé komponenty",
          "komponenty silné souvislosti",
          "strongly connected components",
          "SCC",
          "Tarjan",
          "Tarjanův algoritmus",
          "graf komponent",
          "kondenzace",
          "transponovaný graf",
          "zásobník",
        ],
      },
      {
        path: "/graph/dijkstra",
        title: "Dijkstrův algoritmus",
        desc: "Nejkratší cesty z jednoho vrcholu při nezáporných délkách hran; vrcholy uzavírá v pořadí podle vzdálenosti.",
        level: "bc",
        source: { chapter: "6.2", page: 146 },
        tags: ["nejkratší cesta", "shortest path", "halda"],
      },
      {
        path: "/graph/bellman-ford",
        title: "Bellmanův–Fordův algoritmus",
        desc: "Nejkratší cesty i se zápornými délkami hran: relaxuje otevřené vrcholy z fronty po fázích a pozná záporný cyklus; O(nm).",
        level: "bc",
        source: { chapter: "6.3", page: 149 },
        tags: [
          "Bellman-Ford",
          "relaxace",
          "relaxační algoritmus",
          "nejkratší cesta",
          "shortest path",
          "záporné hrany",
          "záporný cyklus",
          "negative cycle",
          "fronta",
          "fáze",
        ],
      },
      {
        path: "/graph/jarnik",
        title: "Jarníkův (Primův) algoritmus",
        desc: "Minimální kostra rostoucí z jednoho vrcholu: vždy přidá nejlehčí hranu vedoucí ven ze stromu.",
        level: "bc",
        source: { chapter: "7.2", page: 168 },
        tags: ["prim", "minimální kostra", "mst", "spanning tree"],
      },
      {
        path: "/graph/boruvka",
        title: "Borůvkův algoritmus",
        desc: "Minimální kostra po fázích: každá komponenta lesa naráz přidá svou nejlehčí hranu ven, komponent ubude aspoň o polovinu.",
        level: "bc",
        source: { chapter: "7.3", page: 173 },
        tags: [
          "Borůvka",
          "minimální kostra",
          "mst",
          "spanning tree",
          "les",
          "komponenty",
          "fáze",
        ],
      },
      {
        path: "/graph/kruskal",
        title: "Kruskal + Union-Find",
        desc: "Minimální kostra: bere hrany od nejlehčí a přidá ty, které nespojují vrcholy téže komponenty.",
        level: "bc",
        source: { chapter: "7.4", page: 174 },
        tags: [
          "minimální kostra",
          "mst",
          "union find",
          "dfu",
          "sjednocení",
          "komponenty",
        ],
      },
    ],
  },
  {
    title: "Dynamické programování",
    intro:
      "Úlohu rozložíme na podúlohy, jejich výsledky ukládáme do tabulky a skládáme zdola nahoru; řešení pak přečteme zpětně.",
    modules: [
      {
        path: "/dp/lis",
        title: "Nejdelší rostoucí podposloupnost",
        desc: "Pro každý začátek i spočítá délku T[i] nejdelší rostoucí podposloupnosti a z odkazů P[i] ji vypíše; Θ(n²).",
        level: "bc",
        source: { chapter: "12.2", page: 302 },
        tags: [
          "NRP",
          "LIS",
          "longest increasing subsequence",
          "rostoucí podposloupnost",
          "posloupnost",
          "dynamické programování",
          "DP",
          "tabulka",
        ],
      },
      {
        path: "/dp/edit",
        title: "Editační vzdálenost",
        desc: "Nejmenší počet vložení, smazání a záměn písmen mezi dvěma slovy: tabulka T[i, j] zdola nahoru a zpětná cesta úprav; Θ(nm).",
        level: "bc",
        source: { chapter: "12.3", page: 306 },
        tags: [
          "edit distance",
          "Levenshtein",
          "Levenštejnova vzdálenost",
          "dynamické programování",
          "DP",
          "tabulka",
          "slova",
          "překlepy",
        ],
      },
    ],
  },
  {
    title: "Textové algoritmy",
    intro:
      "Hledání vzorku v textu: vyhledávací automaty, hešování a sufixové struktury.",
    modules: [
      {
        path: "/string/kmp",
        title: "Knuth–Morris–Pratt (KMP)",
        desc: "Z jehly postaví vyhledávací automat se zpětnými hranami a seno projde jednou; Θ(J + S).",
        level: "bc",
        source: { chapter: "13.2", page: 320 },
        tags: [
          "KMP",
          "Knuth-Morris-Pratt",
          "automat",
          "zpětná funkce",
          "prefixová funkce",
          "hledání vzorku",
          "jehla v kupce sena",
          "string matching",
          "řetězce",
          "řetězec",
          "text",
          "vyhledávání v textu",
        ],
      },
      {
        path: "/string/aho-corasick",
        title: "Aho–Corasicková",
        desc: "Hledá najednou všechna slova slovníku: trie jehel se zpětnými hranami a zkratkami; Θ(ΣJᵢ + S + V).",
        level: "bc",
        source: { chapter: "13.3", page: 324 },
        tags: [
          "Aho-Corasick",
          "Aho-Corasicková",
          "slovník",
          "automat",
          "trie",
          "písmenkový strom",
          "zkratky",
          "více vzorků",
          "dictionary matching",
          "řetězce",
          "řetězec",
          "text",
          "vyhledávání v textu",
        ],
      },
      {
        path: "/string/rabin-karp",
        title: "Rabin–Karp",
        desc: "Porovnává heše okének sena s hešem jehly a heš posouvá v konstantním čase; při shodě heší ověří znaky.",
        level: "bc",
        source: { chapter: "13.4", page: 330 },
        tags: [
          "Rabin-Karp",
          "otisk",
          "fingerprint",
          "rolling hash",
          "posuvný heš",
          "hešování",
          "falešná shoda",
          "kolize",
          "hledání vzorku",
          "řetězce",
          "řetězec",
          "text",
          "vyhledávání v textu",
        ],
      },
      {
        path: "/string/suffix",
        title: "Sufixové pole + LCP",
        desc: "Sufixové pole zdvojováním délky prefixů, LCP pole Kasaiovým algoritmem a hledání vzorku.",
        level: "mgr",
        source: { chapter: "13.5", page: 332, lecture: "DS I, přednáška 5" },
        tags: [
          "suffix array",
          "kasai",
          "řetězce",
          "řetězec",
          "text",
          "vyhledávání v textu",
          "binární vyhledávání",
          "vzorek",
        ],
      },
    ],
  },
  {
    title: "Toky v sítích",
    intro:
      "Maximální tok ze zdroje do stoku: zlepšující cesty v síti rezerv, vrstevnatá síť a blokující tok, vlna s výškami a přebytky; párování jako tok.",
    modules: [
      {
        path: "/flow/ford-fulkerson",
        title: "Fordův–Fulkersonův algoritmus",
        desc: "Zlepšuje tok po nenasycených cestách v síti rezerv, dokud nějaká vede ze zdroje do stoku; největší párování jako tok.",
        level: "bc",
        source: { chapter: "14.2", page: 353 },
        tags: [
          "Ford-Fulkerson",
          "maximální tok",
          "max flow",
          "tok v síti",
          "síť rezerv",
          "rezerva",
          "nenasycená cesta",
          "zlepšující cesta",
          "augmenting path",
          "řez",
          "minimální řez",
          "párování",
          "bipartitní graf",
          "matching",
        ],
      },
      {
        path: "/flow/dinic",
        title: "Dinicův algoritmus",
        desc: "Tok zlepšuje po fázích: síť rezerv rozdělí na vrstvy, pročistí ji a najde v ní blokující tok; O(n²m).",
        level: "bc",
        source: { chapter: "14.4", page: 361 },
        tags: [
          "Dinic",
          "maximální tok",
          "max flow",
          "tok v síti",
          "síť rezerv",
          "vrstevnatá síť",
          "čištění sítě",
          "blokující tok",
          "blocking flow",
        ],
      },
      {
        path: "/flow/goldberg",
        title: "Goldbergův algoritmus",
        desc: "Začne vlnou ze zdroje a přebytky převádí z vyšších vrcholů do nižších; vrchol bez cesty dolů zvedne. Varianta s nejvyšším vrcholem z 14.6.",
        level: "bc",
        source: { chapter: "14.5", page: 368 },
        tags: [
          "Goldberg",
          "push-relabel",
          "preflow-push",
          "maximální tok",
          "max flow",
          "tok v síti",
          "vlna",
          "preflow",
          "přebytek",
          "výška vrcholu",
          "převedení přebytku",
          "zvednutí vrcholu",
          "relabel",
          "nejvyšší vrchol",
        ],
      },
    ],
  },
  {
    title: "Paralelní algoritmy",
    intro:
      "Hradlové a třídicí sítě počítají po vrstvách naráz; bezzámkový zásobník sdílí data mezi vlákny.",
    modules: [
      {
        path: "/parallel/gates",
        title: "Hradlové sítě",
        desc: "Nakreslete síť z hradel AND, OR, NOT, XOR… a sledujte výpočet po vrstvách; čas = hloubka, velikost = počet hradel.",
        level: "bc",
        source: { chapter: "15.1", page: 381 },
        tags: [
          "hradla",
          "hradlo",
          "logický obvod",
          "booleovský obvod",
          "circuit",
          "logic gates",
          "and or not",
          "nand",
          "nor",
          "xor",
          "majorita",
          "pravdivostní tabulka",
          "kombinační obvod",
          "editor",
          "paralelní",
        ],
      },
      {
        path: "/parallel/adder",
        title: "Sčítačka (školní a paralelní)",
        desc: "Sečte dvě n-bitová čísla školním řetězem přenosů v čase Θ(n), nebo paralelně přes bloky v čase Θ(log n).",
        level: "bc",
        source: { chapter: "15.2", page: 386 },
        tags: [
          "sčítačka",
          "sčítání",
          "přenos",
          "carry lookahead",
          "carry-lookahead",
          "adder",
          "binární čísla",
          "hradlová síť",
          "paralelní",
        ],
      },
      {
        path: "/parallel/sortnet",
        title: "Třídicí sítě",
        desc: "Komparátory zapojené do vrstev třídí všech n čísel naráz; bitonické třídění má hloubku Θ(log² n).",
        level: "bc",
        source: { chapter: "15.3", page: 392 },
        tags: [
          "třídicí síť",
          "komparátor",
          "comparator network",
          "sorting network",
          "bitonic",
          "bitonické třídění",
          "Batcher",
          "separátor",
          "slévačka",
          "0-1 princip",
          "nula-jedničkový princip",
          "paralelní",
          "řazení",
        ],
      },
      {
        path: "/parallel/lockfree",
        title: "Bezzámkový zásobník (CAS, ABA)",
        desc: "Zásobník bez zámků pomocí operace CAS: prokládání dvou vláken a problém ABA.",
        level: "mgr",
        source: { lecture: "DS I, skripta 9.4" },
        tags: ["lock-free", "compare and swap", "paralelní", "vlákna", "aba"],
      },
    ],
  },
  {
    title: "Geometrie",
    intro: "Body v rovině: konvexní obal a dotazy na obdélníkové oblasti.",
    modules: [
      {
        path: "/geom/hull",
        title: "Konvexní obal",
        desc: "Zametání zleva doprava: body setříděné podle x přidává do horní a dolní obálky a ruší body, kde obálka zatáčí špatně; O(n log n).",
        level: "bc",
        source: { chapter: "16.1", page: 401 },
        tags: [
          "convex hull",
          "obal",
          "zametání",
          "sweep",
          "horní obálka",
          "dolní obálka",
          "provázkový algoritmus",
          "gift wrapping",
          "Jarvis",
          "orientace",
          "body v rovině",
        ],
      },
      {
        path: "/geom/kdtree",
        title: "k-d strom (intervalové dotazy)",
        desc: "Strom střídavě dělící rovinu podle x a y; obdélníkový dotaz navštíví jen oblasti, které obdélník protíná.",
        level: "mgr",
        source: { lecture: "DS I, skripta 7.2" },
        tags: [
          "kd strom",
          "geometrie",
          "range query",
          "rozsahový dotaz",
          "obdélník",
        ],
      },
    ],
  },
  {
    title: "Fourierova transformace",
    intro:
      "Polynom z koeficientů na hodnoty v odmocninách z jedničky a zpět; rychlé násobení polynomů.",
    modules: [
      {
        path: "/fft/fft",
        title: "Rychlá Fourierova transformace (FFT)",
        desc: "Rozdělí koeficienty na sudé a liché, rekurzivně vyhodnotí a složí; násobení polynomů v Θ(n log n).",
        level: "bc",
        source: { chapter: "17.3", page: 430 },
        tags: [
          "FFT",
          "Fourier",
          "Fourierova transformace",
          "DFT",
          "polynomy",
          "násobení polynomů",
          "komplexní čísla",
          "odmocniny z jedničky",
          "jednotková kružnice",
          "inverzní FFT",
          "rozděl a panuj",
        ],
      },
      {
        path: "/fft/net",
        title: "FFT jako hradlová síť (FFT2)",
        desc: "Nerekurzivní FFT po vrstvách: bitově zrcadlený vstup a log₂ n vrstev motýlků, síť hloubky Θ(log n).",
        level: "bc",
        source: { chapter: "17.5", page: 438 },
        tags: [
          "FFT",
          "FFT2",
          "Fourier",
          "motýlek",
          "motýlková síť",
          "butterfly",
          "bit reversal",
          "bitové zrcadlení",
          "bitově zrcadlený",
          "nerekurzivní",
          "hradlová síť",
        ],
      },
    ],
  },
];

/** Všechny moduly v pořadí menu. */
export const MODULES: ModuleLink[] = CATEGORIES.flatMap((c) => c.modules);

/** Doporučené první moduly („Kde začít“ na úvodní stránce). */
export const START_HERE: string[] = [
  "/sort/bubble",
  "/tree/bst",
  "/graph/bfs",
  "/ds/heap",
];

/**
 * Vzory cest v App.tsx. Každá cesta z registru musí odpovídat některému vzoru (kontroluje registry.test.ts);
 * App.tsx má pro každý vzor stránku (typ PagePattern).
 */
export const ROUTE_PATTERNS = [
  "/sort/:id",
  "/ds/heap",
  "/ds/segtree",
  "/ds/:id",
  "/tree/ab",
  "/tree/llrb",
  "/tree/:id",
  "/ds2/:id",
  "/cache/paging",
  "/string/suffix",
  "/string/kmp",
  "/string/aho-corasick",
  "/string/rabin-karp",
  "/hash/cuckoo",
  "/hash/bloom",
  "/hash/:id",
  "/geom/kdtree",
  "/geom/hull",
  "/flow/ford-fulkerson",
  "/flow/dinic",
  "/flow/goldberg",
  "/dp/edit",
  "/dp/lis",
  "/parallel/lockfree",
  "/parallel/gates",
  "/parallel/adder",
  "/parallel/sortnet",
  "/fft/fft",
  "/fft/net",
  "/graph/:id",
] as const;
export type RoutePattern = (typeof ROUTE_PATTERNS)[number];

/** Cesta bez koncového lomítka („/sort/quick/“ → „/sort/quick“), kořen zůstává „/“. */
export function normalizePath(path: string): string {
  const p = path.replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

const BY_PATH = new Map(MODULES.map((m) => [m.path, m]));

/** Modul podle cesty (i s koncovým lomítkem), jinak undefined. */
export function moduleByPath(path: string): ModuleLink | undefined {
  return BY_PATH.get(normalizePath(path));
}

/**
 * Existuje stránka pro tuto cestu? Stránky s parametrem (:id) samy neznámé id nehlídají – App.tsx proto
 * každou cestu, která není v registru, přesměruje na přehled. Stránky to mohou ověřit i samy:
 * `if (!isKnownPath(`/sort/${id}`)) return <Navigate to="/" replace />`.
 */
export function isKnownPath(path: string): boolean {
  const p = normalizePath(path);
  return p === "/" || BY_PATH.has(p);
}

/** Text pro hledání bez diakritiky a velikosti písmen („Jarník“ = „jarnik“). */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

interface Hay {
  /** celý text (hledání uvnitř slov) */
  text: string;
  /** jednotlivá slova (hledání od začátku slova) */
  words: string[];
}

/** Prohledávaný text modulu: název, popis, štítky, kategorie, úroveň, cesta a zdroj („Průvodce 13.2, str. 320“). */
function haystack(m: ModuleLink, category: string): Hay {
  const text = normalizeSearch(
    [
      m.title,
      m.desc,
      ...(m.tags ?? []),
      category,
      LEVEL_LABEL[m.level],
      m.path,
      formatSource(m.source),
    ].join(" "),
  );
  return { text, words: text.split(/[^\p{L}\p{N}]+/u).filter(Boolean) };
}
const HAY = new Map(
  CATEGORIES.flatMap((c) =>
    c.modules.map((m) => [m.path, haystack(m, c.title)] as const),
  ),
);

/** slova úrovně – jen celé slovo nebo jeho začátek, jinak by „bc“ našlo „abc…“ */
const LEVEL_WORDS = new Set(["bc", "mgr"]);

/**
 * Odpovídá jedno slovo dotazu textu modulu? Slova od 4 znaků se hledají kdekoli (sort ⊂ Heapsort),
 * trojice a „bc“ / „mgr“ jen od začátku slova (aho ⊄ váhově), kratší jen jako celé slovo – kromě
 * posledního slova dotazu, které uživatel ještě píše (tam stačí začátek slova).
 */
function wordMatches(hay: Hay, w: string, last: boolean): boolean {
  // „0-1“, „13.2“, „k-d“: složený výraz se hledá v celém textu
  if (/[^\p{L}\p{N}]/u.test(w)) return hay.text.includes(w);
  if (w.length >= 4 && !LEVEL_WORDS.has(w)) return hay.text.includes(w);
  if (w.length >= 3 || last || LEVEL_WORDS.has(w))
    return hay.words.some((x) => x.startsWith(w));
  return hay.words.includes(w);
}

/** Odpovídá modul dotazu? Všechna slova dotazu musí být v textu modulu (na pořadí nezáleží). */
export function matchesQuery(m: ModuleLink, query: string): boolean {
  const words = normalizeSearch(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const hay = HAY.get(m.path) ?? haystack(m, "");
  return words.every((w, i) => wordMatches(hay, w, i === words.length - 1));
}

/** Kategorie jen s moduly odpovídajícími dotazu (prázdné kategorie vynechá). */
export function filterCategories(
  query: string,
  categories: Category[] = CATEGORIES,
): Category[] {
  return categories
    .map((c) => ({
      ...c,
      modules: c.modules.filter((m) => matchesQuery(m, query)),
    }))
    .filter((c) => c.modules.length > 0);
}
