// Opening library built from the Lichess "chess-openings" dataset (CC0).
// It contains names and move sequences only — no game statistics — so the app
// never shows win rates or popularity for openings.
export interface Opening {
  eco: string;
  name: string; // original (English) name from the dataset
  namePt: string; // family translated to Portuguese, variation kept
  uci: string[];
  epd: string;
}

export interface Book {
  list: Opening[];
  byEpd: Map<string, Opening>;
  /** children by move-sequence prefix ("" = start position) */
  next(prefix: string[]): { uci: string; count: number; named?: Opening }[];
  lookup(fen: string): Opening | undefined;
}

let cache: Promise<Book> | null = null;

export function loadBook(): Promise<Book> {
  return (cache ??= import("./openings.json").then((mod) => {
    const rows = (mod.default ?? mod) as unknown as [string, string, string, string][];
    const list: Opening[] = rows.map(([eco, name, uci, epd]) => ({ eco, name, namePt: translateName(name), uci: uci.split(" "), epd }));
    const byEpd = new Map<string, Opening>();
    // keep the shortest (most general) name per position
    for (const o of list) {
      const cur = byEpd.get(o.epd);
      if (!cur || o.uci.length < cur.uci.length) byEpd.set(o.epd, o);
    }
    const byKey = new Map<string, Opening>();
    for (const o of list) byKey.set(o.uci.join(" "), o);
    return {
      list,
      byEpd,
      lookup: (fen: string) => byEpd.get(fen.split(" ").slice(0, 4).join(" ")),
      next(prefix: string[]) {
        const counts = new Map<string, number>();
        const n = prefix.length;
        for (const o of list) {
          if (o.uci.length <= n) continue;
          let ok = true;
          for (let i = 0; i < n; i++)
            if (o.uci[i] !== prefix[i]) {
              ok = false;
              break;
            }
          if (!ok) continue;
          counts.set(o.uci[n], (counts.get(o.uci[n]) ?? 0) + 1);
        }
        return [...counts.entries()]
          .map(([uci, count]) => ({ uci, count, named: byKey.get([...prefix, uci].join(" ")) }))
          .sort((a, b) => b.count - a.count);
      },
    };
  }));
}

const FAMILY: Record<string, string> = {
  "Sicilian Defense": "Defesa Siciliana",
  "French Defense": "Defesa Francesa",
  "Caro-Kann Defense": "Defesa Caro-Kann",
  "Ruy Lopez": "Ruy López (Abertura Espanhola)",
  "Italian Game": "Jogo Italiano",
  "Scotch Game": "Jogo Escocês",
  "Four Knights Game": "Jogo dos Quatro Cavalos",
  "Three Knights Opening": "Abertura dos Três Cavalos",
  "Petrov's Defense": "Defesa Petrov (Russa)",
  "Philidor Defense": "Defesa Philidor",
  "King's Gambit": "Gambito do Rei",
  "King's Gambit Accepted": "Gambito do Rei Aceito",
  "King's Gambit Declined": "Gambito do Rei Recusado",
  "Vienna Game": "Jogo Vienense",
  "Bishop's Opening": "Abertura do Bispo",
  "Center Game": "Jogo do Centro",
  "Danish Gambit": "Gambito Dinamarquês",
  "Ponziani Opening": "Abertura Ponziani",
  "Two Knights Defense": "Defesa dos Dois Cavalos",
  "Giuoco Piano": "Giuoco Piano",
  "Evans Gambit": "Gambito Evans",
  "Hungarian Opening": "Abertura Húngara",
  "Latvian Gambit": "Gambito Letão",
  "Elephant Gambit": "Gambito Elefante",
  "Queen's Gambit": "Gambito da Dama",
  "Queen's Gambit Accepted": "Gambito da Dama Aceito",
  "Queen's Gambit Declined": "Gambito da Dama Recusado",
  "Slav Defense": "Defesa Eslava",
  "Semi-Slav Defense": "Defesa Semi-Eslava",
  "King's Indian Defense": "Defesa Índia do Rei",
  "Queen's Indian Defense": "Defesa Índia da Dama",
  "Nimzo-Indian Defense": "Defesa Nimzo-Índia",
  "Grünfeld Defense": "Defesa Grünfeld",
  "Benoni Defense": "Defesa Benoni",
  "Modern Benoni": "Benoni Moderna",
  "Benko Gambit": "Gambito Benko",
  "Dutch Defense": "Defesa Holandesa",
  "Catalan Opening": "Abertura Catalã",
  "English Opening": "Abertura Inglesa",
  "Réti Opening": "Abertura Réti",
  "Zukertort Opening": "Abertura Zukertort",
  "London System": "Sistema Londres",
  "Queen's Pawn Game": "Jogo do Peão da Dama",
  "King's Pawn Game": "Jogo do Peão do Rei",
  "Indian Defense": "Defesa Índia",
  "Pirc Defense": "Defesa Pirc",
  "Modern Defense": "Defesa Moderna",
  "Alekhine Defense": "Defesa Alekhine",
  "Scandinavian Defense": "Defesa Escandinava",
  "Owen Defense": "Defesa Owen",
  "Nimzowitsch Defense": "Defesa Nimzowitsch",
  "Bird Opening": "Abertura Bird",
  "Polish Opening": "Abertura Polonesa",
  "Nimzo-Larsen Attack": "Ataque Nimzo-Larsen",
  "King's Indian Attack": "Ataque Índio do Rei",
  "Trompowsky Attack": "Ataque Trompowsky",
  "Blackmar-Diemer Gambit": "Gambito Blackmar-Diemer",
  "Budapest Defense": "Defesa Budapeste",
  "Old Indian Defense": "Defesa Índia Antiga",
  "Bogo-Indian Defense": "Defesa Bogo-Índia",
  "Van Geet Opening": "Abertura Van Geet",
  "Grob Opening": "Abertura Grob",
  "Saragossa Opening": "Abertura Saragoça",
  "Englund Gambit": "Gambito Englund",
  "Rat Defense": "Defesa do Rato",
  "St. George Defense": "Defesa São Jorge",
  "Tarrasch Defense": "Defesa Tarrasch",
  "Torre Attack": "Ataque Torre",
  "Colle System": "Sistema Colle",
  "Richter-Veresov Attack": "Ataque Richter-Veresov",
  "Rapport-Jobava System": "Sistema Rapport-Jobava",
  "Mieses Opening": "Abertura Mieses",
  "Amar Opening": "Abertura Amar",
  "Anderssen Opening": "Abertura Anderssen",
  "Clemenz Opening": "Abertura Clemenz",
  "Kadas Opening": "Abertura Kadas",
  "Ware Opening": "Abertura Ware",
  "Sodium Attack": "Ataque Sódio",
  "Barnes Opening": "Abertura Barnes",
  "Hippopotamus Defense": "Defesa Hipopótamo",
  "Lion Defense": "Defesa Leão",
  "Robatsch (Modern) Defense": "Defesa Robatsch (Moderna)",
  "Czech Defense": "Defesa Tcheca",
  "Horwitz Defense": "Defesa Horwitz",
  "Mikenas Defense": "Defesa Mikenas",
  "Kangaroo Defense": "Defesa Canguru",
  "Englund Gambit Complex": "Complexo do Gambito Englund",
  "Portuguese Opening": "Abertura Portuguesa",
  "Ponziani Countergambit": "Contragambito Ponziani",
  "Bongcloud Attack": "Ataque Bongcloud",
  "Duras Gambit": "Gambito Duras",
  "Wing Gambit": "Gambito da Ala",
  "Gunderam Defense": "Defesa Gunderam",
  "Rousseau Gambit": "Gambito Rousseau",
  "Blumenfeld Countergambit": "Contragambito Blumenfeld",
  "Semi-Slav Defense Accepted": "Defesa Semi-Eslava Aceita",
  "Slav Indian": "Eslava Índia",
  "Neo-Grünfeld Defense": "Defesa Neo-Grünfeld",
  "Döry Indian": "Índia Döry",
  "Black Mustang Defense": "Defesa Mustang Negro",
  "Formation": "Formação",
};

export function translateName(name: string): string {
  const i = name.indexOf(":");
  const fam = i >= 0 ? name.slice(0, i) : name;
  const rest = i >= 0 ? name.slice(i) : "";
  const t = FAMILY[fam];
  return t ? t + rest : name;
}
