# Lance Certo · Escola de Xadrez

Plataforma web de ensino de xadrez: jogar contra bots de 7 níveis, revisar partidas com o Stockfish, resolver puzzles verificados por motor, estudar lições interativas, explorar aberturas e montar posições.

Tudo roda no navegador (inclusive o motor, em WebAssembly), então o site pode ser hospedado como arquivos estáticos (GitHub Pages).

## Como rodar

Requisitos: Node.js 18+.

```bash
npm install          # instala as dependências
npm run dev          # servidor de desenvolvimento em http://localhost:5173
npm test             # testes automatizados (Vitest)
npm run build        # verificação de tipos + versão de produção na pasta docs/
npm run preview      # serve a versão de produção localmente
```

A versão de produção vai para `docs/`, com caminhos relativos (`base: "./"`). No GitHub: **Settings → Pages → Deploy from a branch → `main` / `/docs`**.

## Tecnologias e arquitetura

React 18 + TypeScript + Vite, chess.js (regras), Stockfish 18 WASM (motor), Lucide (ícones). Sem framework de CSS: um design system próprio em `src/styles` (tokens em variáveis CSS, tema escuro padrão e tema claro).

```
src/
  chess/       regras, validação de FEN, PGN, material (sobre chess.js)
  engine/      integração com o Stockfish (Web Worker) e conversão de avaliações
  bots/        os 7 adversários e a escolha de lances
  analysis/    classificação de lances, precisão, explicações, revisão de partidas
  puzzles/     banco de puzzles (JSON gerado), pontuação, desafio diário
  lessons/     formato das lições, verificação de objetivos, conteúdo (data/*.json)
  positions/   biblioteca de posições (library.json)
  openings/    biblioteca de aberturas (gerada do Lichess)
  storage/     estado persistente (localStorage) atrás de um adaptador
  components/  tabuleiro, barra de avaliação, lista de lances, gráficos, modais…
  pages/       Início, Jogar, Aprender, Puzzles, Analisar, Revisão, Posições, Aberturas, Progresso, Configurações
  hooks/ sound/ styles/ types/
scripts/       geração e verificação de conteúdo (Node + Stockfish nativo)
```

As regras e as avaliações ficam fora dos componentes visuais. A navegação usa rotas com `#` (funciona em hospedagem estática).

## Integração com o motor

- Arquivos: `public/engine/stockfish-18-lite-single.{js,wasm}` (pacote npm `stockfish` 18.0.8, GPLv3). É a versão **single-thread**, que não exige cabeçalhos de isolamento (COOP/COEP) e por isso funciona no GitHub Pages.
- `src/engine/stockfish.ts`: cada `Engine` é um Web Worker que fala UCI. Há uma fila de buscas; `search()` devolve `{promise, cancel}`. Cancelar remove a busca da fila ou envia `stop`. Erros do worker rejeitam as buscas pendentes, e `restart()` recria o motor. O carregamento tem tempo-limite.
- São dois motores independentes: um para os bots (`getPlayEngine`) e outro para análise e revisão (`getAnalysisEngine`). A interface nunca trava durante o cálculo.
- Todas as avaliações são convertidas para o **ponto de vista das brancas** (positivo = brancas melhor). Mates são tratados à parte (`M3`, `-M2`) e posições terminais (mate, afogamento, empates) são resolvidas pelas regras, sem consultar o motor.

## Bots

| Nível | Bot | Como joga |
|---|---|---|
| 1 Iniciante | Pipo | 12 candidatos (MultiPV) a profundidade 2, escolha softmax com temperatura 320 cp |
| 2 Fácil | Lia | 10 candidatos, profundidade 4, temperatura 170 |
| 3 Intermediário | Bruno | 7 candidatos, profundidade 6, temperatura 90 |
| 4 Avançado | Clara | 5 candidatos, profundidade 9, temperatura 40 |
| 5 Especialista | Rafael | 4 candidatos, profundidade 11, temperatura 22 |
| 6 Mestre | Helena | 2 candidatos, profundidade 15, temperatura 6 |
| 7 Força máxima | Stockfish 18 | sem limitação de força, 1,5 s por lance (menos com pouco tempo no relógio) |

O limitador oficial do Stockfish (`UCI_Elo`) foi testado, mas nas partidas de calibração jogou abaixo dos níveis limitados por profundidade, por isso não é usado. Os erros dos bots fracos são sempre lances legais avaliados pelo motor na posição real: quanto menor o nível, maior a perda de avaliação que o bot aceita. A ordem de força é conferida com partidas entre níveis vizinhos (`npx vite-node scripts/bot-match.ts`, mesmo código e mesmo motor WASM do app). Resultado da última calibração, 4 partidas por confronto, com cores alternadas: Lia 4–0 Pipo, Bruno 3,5–0,5 Lia, Clara 4–0 Bruno, Rafael 4–0 Clara, Helena 3,5–0,5 Rafael, Stockfish 3,5–0,5 Helena. Os ratings mostrados são estimativas aproximadas, não ratings oficiais.

## Análise e revisão

- **Classificação**: a perda de *chance de vitória* de quem jogou, usando o modelo logístico publicado pelo Lichess, `50 + 50·(2/(1+e^(−0,00368208·cp)) − 1)`. Isso leva o contexto em conta: um peão pesa muito numa posição igual e pouco numa posição já decidida. Melhor (lance do motor ou mesma avaliação), Excelente (< 2%), Bom (< 5%), Imprecisão (< 10%), Erro (< 20%), Erro grave (≥ 20%), Teórico (posição presente na biblioteca de aberturas), Forçado (único lance legal).
- **Precisão**: fórmula pública do Lichess por lance, `103,1668·e^(−0,04354·perda) − 3,1669`. O resultado da partida é a média entre uma média ponderada pela volatilidade e uma média harmônica. É uma **estimativa do aplicativo**, não uma métrica oficial.
- **Explicações** (`src/analysis/explain.ts`): cada frase só aparece quando sua condição é verificada na posição. Exemplos: peça sem defesa (contagem real de atacantes), garfo (peças realmente atacadas), mate permitido ou perdido (mate encontrado pelo motor), ameaça de mate (todos os lances legais testados), material ganho ao longo da linha principal. Sem confirmação, o texto só descreve a mudança de avaliação.
- A revisão roda em segundo plano, com barra de progresso e botão de cancelar. O resultado fica salvo para não precisar recalcular.

## Puzzles

Gerados e verificados com o Stockfish, sem nenhuma posição escrita à mão:

1. `scripts/mine.mjs`: o Stockfish joga contra si mesmo, a partir de aberturas variadas, com lances imperfeitos ocasionais. Quando um lance perde muita avaliação, a posição seguinte é analisada a fundo. Ela só vira puzzle se, em **todos os passos**, o lance da solução for o único claramente vencedor (MultiPV 2, 2,5 milhões de nós). Puzzles defensivos ("só um lance segura") e de mate em 2–4 seguem a mesma regra.
2. `scripts/endgames.mjs`: finais aleatórios de peões e de torres em que exatamente um lance vence (ou exatamente um lance empata), verificados com 6 milhões de nós.
3. `scripts/tag.mjs`: detecta os temas na própria linha da solução (garfo, cravada, espeto, ataque descoberto, desvio, sobrecarga, sacrifício, mates…), escreve a explicação da ideia e estima a dificuldade.

Conjunto atual: **501 puzzles**:
- por tipo: peça indefesa 167, ganho de material 134, táticas defensivas 63, finais de peões 52, finais de torres 38, mate 32 (mate em 1: 25; mate em 2: 5; mate em 3: 2), ataque duplo 27, combinações avançadas 25, garfo 18, sacrifício 15;
- temas raros: desvio 9, sobrecarga 4, ataque descoberto 3, espeto 2, cravada 2.

Os dados brutos ficam em `data/puzzles-raw/`, e `node scripts/tag.mjs` regenera `src/puzzles/puzzles.json`.

**Fase de conversão** (`src/puzzles/convert.ts`): quando termina a parte de solução única, o jogo continua contra o Stockfish até a ideia se completar:
- finais vencedores: até promover ou dar mate;
- táticas: até a vantagem ficar decisiva (≥ +5 ou mate); se já estiver decisiva, o puzzle termina ali;
- puzzles de empate: segurar o empate por alguns lances.

Nessa fase há vários lances bons, então o motor aceita qualquer lance que mantenha a vantagem: no máximo 10 pontos de chance de vitória perdidos, e a posição precisa continuar claramente ganha. O mesmo vale para as posições da biblioteca e para os exercícios de tática e de finais das lições, conforme o objetivo de cada um ("vencem", "empatam", "dão mate").

No aplicativo, a resposta é conferida com a solução. No lance final de um puzzle de mate, qualquer mate é aceito. Errar não encerra o puzzle: o lance é desfeito e dá para tentar de novo. A pontuação de puzzles (estilo Elo) é separada de qualquer desempenho em partidas, e os pontos premiam acerto e constância, não velocidade.

## Lições e biblioteca de posições

5 módulos (Fundamentos, Tática, Estratégia, Aberturas, Finais), com **37 lições e 128 exercícios**, em `src/lessons/data/*.json`. A biblioteca de posições tem 32 posições (famosas, táticas, estratégicas e finais), em `src/positions/library.json`. Os objetivos dos exercícios são conferidos pelas regras: "dê mate" aceita qualquer mate, "faça o roque" exige roque etc. Respostas exatas são verificadas pelo Stockfish com `node scripts/verify-lessons.mjs` (precisa do Stockfish nativo em `/usr/games/stockfish`). Esse script também recusa exercícios em que outro lance é quase tão bom quanto o esperado.

## Aberturas

Biblioteca de aberturas do Lichess ([lichess-org/chess-openings](https://github.com/lichess-org/chess-openings), CC0). Ela traz nomes e lances, não partidas, então o explorador **não mostra porcentagens de vitória nem popularidade**: os números indicam quantas variantes catalogadas seguem por cada lance. Para regenerar: `node scripts/build-openings.mjs`.

## Persistência

`src/storage/store.ts` guarda tudo em `localStorage` (chave `lance-certo:v1`) por meio de um `StorageAdapter`, que pode ser trocado por um backend real com autenticação. Dados antigos são mesclados com os padrões, então atualizações não apagam o progresso. **Nada é sincronizado entre aparelhos**: para isso existe o backup/restauração em JSON na página Progresso. Uma partida em andamento é salva a cada lance e pode ser retomada.

## O que está implementado e testado

- Testes automatizados (`npm test`, Vitest):
  - regras: xeque, mate, afogamento, roque permitido e proibido, en passant, promoção, repetição, 50 lances, material insuficiente, tempo esgotado contra material insuficiente;
  - FEN e PGN, incluindo ida e volta e recusa de lances ilegais;
  - classificação e precisão, e as explicações (mate em 1, garfo, material);
  - banco de puzzles (todas as soluções legais, mates terminam em mate);
  - pontuação, desafio diário, escolha do lance dos bots, objetivos das lições, migração dos dados salvos.
- Testes de ponta a ponta com Playwright (Chromium), em computador e celular:
  - partida contra bot com clique e com arrastar, relógio com incremento, derrota por tempo, desfazer, desistência, tela de resultado e revisão da partida salva;
  - revisão do "mate do pastor" (Cf6 classificado como erro grave, com a explicação "permite xeque-mate imediato: Dxf7#");
  - promoção pelo seletor e recusa de lance ilegal;
  - puzzle com tentativa errada seguida da solução completa, e persistência do resultado;
  - lição com exercício de roque;
  - todas as páginas sem erros de JavaScript e sem rolagem horizontal no celular;
  - versão de produção servida de uma subpasta, como no GitHub Pages.

## Limitações reais

- O motor do navegador é o Stockfish 18 *lite* single-thread: mais fraco que o Stockfish completo (ainda muito acima de qualquer humano) e mais lento em celulares antigos. A revisão a profundidade 14 leva de alguns segundos a um minuto, conforme a partida e o aparelho.
- Os ratings dos bots, a precisão e a pontuação de puzzles são estimativas próprias, não comparáveis diretamente com outros sites.
- O banco de puzzles é próprio (501) e muito menor que o de grandes sites. Cravada, espeto, ataque descoberto e mate em 2–3 têm poucos exemplos: o gerador exige solução única em todos os passos, e nesses padrões costuma haver mais de uma. Para ampliar, basta rodar `scripts/mine.mjs` por mais tempo e regenerar.
- O explorador de aberturas não tem estatísticas de partidas (não há base de partidas licenciada no projeto).
- Os dados ficam só no navegador: limpar os dados do site apaga o progresso (use o backup).
- Sem contas nem multijogador online.

## Licenças

Projeto sob **GPL-3.0-or-later** (compatível com o Stockfish). Créditos de terceiros:
- Stockfish / stockfish.js — GPLv3.
- chess.js — BSD-2-Clause.
- Peças: cburnett (Colin M.L. Burnett, GPLv2+), merida (Armando H. Marroquin, GPLv2+), chessnut (Alexis Luengas, Apache 2.0), fantasy (Maurizio Monge, MIT), obtidas do repositório do Lichess.
- Aberturas: lichess-org/chess-openings — CC0.
- Ícones: Lucide — ISC.
