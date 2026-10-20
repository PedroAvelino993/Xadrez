// Builds src/openings/openings.json from the Lichess chess-openings TSV files
// (https://github.com/lichess-org/chess-openings, CC0 1.0).
// Each entry: [eco, name, "uci uci ...", epd-of-final-position]
import { Chess } from "chess.js";
import fs from "node:fs";

const rows = [];
for (const f of ["a", "b", "c", "d", "e"]) {
  const lines = fs.readFileSync(new URL(`../data/openings/${f}.tsv`, import.meta.url), "utf8").trim().split("\n").slice(1);
  for (const l of lines) {
    const [eco, name, pgn] = l.split("\t");
    const c = new Chess();
    c.loadPgn(pgn);
    const uci = c.history({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? "")).join(" ");
    const epd = c.fen().split(" ").slice(0, 4).join(" ");
    rows.push([eco, name, uci, epd]);
  }
}
fs.writeFileSync(new URL("../src/openings/openings.json", import.meta.url), JSON.stringify(rows));
console.log(rows.length, "openings");
