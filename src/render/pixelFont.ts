/** A 3×5 pixel font for the low-resolution cab screens. Each glyph is 15 bits, row by row. */
const GLYPHS: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001111',
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  $: '011110010011110', ',': '000000000010100', ':': '000010000010000', '%': '101001010100101',
  '.': '000000000000010', '-': '000000111000000', ' ': '000000000000000',
  '▲': '010111000000000', '▼': '000000111010000',
};

export const GLYPH_ADVANCE = 4;

export function pixelTextWidth(text: string): number {
  return Math.max(0, text.length * GLYPH_ADVANCE - 1);
}

/** Draw upper-case text with its top-left at (x, y). Returns the x after the last glyph. */
export function drawPixelText(c: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): number {
  c.fillStyle = color;
  for (const ch of text.toUpperCase()) {
    const g = GLYPHS[ch] ?? GLYPHS[' '];
    for (let i = 0; i < 15; i++) if (g[i] === '1') c.fillRect(x + (i % 3), y + Math.floor(i / 3), 1, 1);
    x += GLYPH_ADVANCE;
  }
  return x;
}
