export interface BoardTheme {
  id: string;
  name: string;
  light: string;
  dark: string;
  /** tint for last move / selection, blended over the square colour */
  highlight: string;
  coordLight: string;
  coordDark: string;
}

export const BOARD_THEMES: BoardTheme[] = [
  { id: "floresta", name: "Floresta", light: "#e8ebcf", dark: "#76955a", highlight: "rgba(246, 222, 70, 0.5)", coordLight: "#76955a", coordDark: "#e8ebcf" },
  { id: "madeira", name: "Madeira", light: "#efd8b4", dark: "#b28763", highlight: "rgba(214, 228, 74, 0.5)", coordLight: "#b28763", coordDark: "#efd8b4" },
  { id: "oceano", name: "Oceano", light: "#dde4e8", dark: "#7f9eb1", highlight: "rgba(140, 220, 120, 0.5)", coordLight: "#7f9eb1", coordDark: "#dde4e8" },
  { id: "ardosia", name: "Ardósia", light: "#c6ccd1", dark: "#687784", highlight: "rgba(235, 205, 90, 0.5)", coordLight: "#687784", coordDark: "#c6ccd1" },
  { id: "areia", name: "Areia", light: "#f2e6cf", dark: "#c6a77d", highlight: "rgba(150, 205, 90, 0.5)", coordLight: "#c6a77d", coordDark: "#f2e6cf" },
];

export const PIECE_SETS = [
  { id: "cburnett", name: "Clássico", credit: "Colin M.L. Burnett · GPLv2+" },
  { id: "merida", name: "Mérida", credit: "Armando H. Marroquin · GPLv2+" },
  { id: "chessnut", name: "Chessnut", credit: "Alexis Luengas · Apache 2.0" },
  { id: "fantasy", name: "Fantasia", credit: "Maurizio Monge · MIT" },
];

export function boardTheme(id: string): BoardTheme {
  return BOARD_THEMES.find((t) => t.id === id) ?? BOARD_THEMES[0];
}

export function pieceUrl(set: string, color: "w" | "b", type: string): string {
  return `${import.meta.env.BASE_URL}pieces/${set}/${color}${type.toUpperCase()}.svg`;
}
