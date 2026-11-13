/**
 * A milestone as a square picture to share (1080×1080 PNG): a header, the child's name, what they
 * did, its area and date. The texts come in the language on screen; `rtl` draws them right to left.
 */
export async function generateMilestoneCard(params: {
  heading: string;
  childName: string;
  milestoneText: string;
  category: string;
  date: string;
  footer: string;
  rtl: boolean;
}) {
  const size = 1080;
  const margin = 72;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unsupported');

  const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
  ctx.direction = params.rtl ? 'rtl' : 'ltr';
  ctx.textAlign = 'start';
  const x = params.rtl ? size - margin : margin;

  ctx.fillStyle = '#F4F7FF';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#002B5B';
  ctx.fillRect(0, 0, size, 180);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 52px ${font}`;
  ctx.fillText(params.heading, x, 112);

  ctx.fillStyle = '#4A5C78';
  ctx.font = `600 34px ${font}`;
  ctx.fillText(params.category, x, 290);

  ctx.fillStyle = '#1A1C1E';
  ctx.font = `bold 60px ${font}`;
  ctx.fillText(params.childName, x, 380);

  ctx.font = `bold 46px ${font}`;
  wrapText(ctx, params.milestoneText, x, 490, size - margin * 2, 64, 5);

  ctx.fillStyle = '#4A5C78';
  ctx.font = `34px ${font}`;
  ctx.fillText(params.date, x, 900);

  ctx.fillStyle = '#94A3B8';
  ctx.font = `28px ${font}`;
  ctx.fillText(params.footer, x, 1010);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Image generation failed'))), 'image/png');
  });
}

/** Draws the text over up to `maxLines` lines no wider than `maxWidth` (the last one ends in "…"). */
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines) shown[maxLines - 1] = `${shown[maxLines - 1]}…`;
  shown.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
}
