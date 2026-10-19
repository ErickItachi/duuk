# Carrossel 01 — O real merece deixar marca.

Primeiro carrossel institucional da DUUK para o feed do Instagram. Formato 4:5, 1080 × 1350 px, com versão 2x em 2160 × 2700 px.

## Conceito: ponto, linha, plano

A frase não é explicada, é encenada. O laranja aparece só no que fica: a marca.

| Slide | Gesto | Texto |
|---|---|---|
| 01 | **Ponto.** O ponto final de "MARCA." é o único elemento coral: o instante. | O REAL / MERECE / DEIXAR / MARCA. |
| 02 | **Linha.** Uma régua de quadros (24 por segundo) corre no escuro até o mesmo ponto, agora no tempo `00:00:00:01`. Dali nasce o traço. | ACONTECE UMA VEZ. |
| 03 | **Plano.** O traço ocupa o quadro inteiro, com o degradê do site. | E FICA. |
| 04 | **Identidade.** O traço passa no meio da frase: filmar de um lado, ficar do outro. Créditos dos diretores, como num cartaz. | A GENTE FILMA / PRA FICAR. |
| 05 | **Assinatura.** O traço termina sob o logo, na mesma proporção da abertura do site. | O REAL MERECE DEIXAR MARCA. |

O traço fica na mesma altura (905 px) do slide 02 ao 05 e atravessa as emendas. Ao deslizar, o carrossel lê como uma única linha.

## Sistema

- **Cores** (de `src/index.css`): preto `#080808`, branco, coral `#eb4b3f` → `#ed6f4d` → laranja `#f0945b`. Coral no instante, laranja no que permanece.
- **Tipografia** (de `public/fonts/`): Inter Tight 900 em caixa alta, entrelinha 0,84, para títulos; Inter 600 com espaçamento 0,16em para rótulos, no padrão `DUUK® / SÃO PAULO` do site.
- **Logo**: `public/media/duuk-logo-white.png`, sem alteração, apenas recortada a margem transparente para alinhar com o traço.
- **Grão de película** sutil em todos os slides: a marca física que a luz deixa no filme. Também evita faixas no degradê após a compressão do Instagram.
- **Margens** de 80 px, fora do corte 3:4 da grade do perfil.

## Arquivos

- `png/`: slides em 1080 × 1350, prontos para publicar, e `duuk-carrossel-01-sequencia.png` com os cinco lado a lado.
- `png@2x/`: 2160 × 2700.
- `carrossel.html`: fonte. Abra por um servidor local na raiz do projeto para ver a sequência; `?slide=N` mostra um slide.
- `export.mjs`: gera os PNGs com Playwright. `node brand/instagram/carrossel-01/export.mjs` exporta 1x e 2x; passe escalas para outras resoluções, por exemplo `... export.mjs 3`.

O logo original tem 718 × 886 px. Até 2x ele é usado na resolução nativa; para 3x ou mais, use uma versão vetorial do logo.

## Texto alternativo

1. Fundo preto com "O real merece deixar marca." em letras brancas grandes; o ponto final é coral.
2. Uma régua de quadros corre no escuro até um ponto coral marcado 00:00:00:01, de onde sai um traço. Abaixo: "Acontece uma vez."
3. Quadro inteiro em degradê coral e laranja com "E fica." em preto.
4. Um traço laranja divide a frase "A gente filma / pra ficar." Créditos: direção Erick Borborema e Douglas Felix.
5. Logo da DUUK em branco sobre o fim do traço laranja. Abaixo: "O real merece deixar marca."
