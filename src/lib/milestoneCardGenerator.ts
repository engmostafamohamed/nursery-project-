export async function generateMilestoneCard(params: {
  childName: string;
  milestoneText: string;
  category: string;
  achievedAt: string;
}) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unsupported');

  ctx.fillStyle = '#F4F7FF';
  ctx.fillRect(0, 0, 1080, 1080);
  ctx.fillStyle = '#002B5B';
  ctx.fillRect(0, 0, 1080, 170);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 48px Inter, sans-serif';
  ctx.fillText('XO Nursery Milestone', 60, 100);

  ctx.fillStyle = '#1A1C1E';
  ctx.font = 'bold 54px Inter, sans-serif';
  ctx.fillText(params.childName, 60, 280);
  ctx.font = 'bold 42px Inter, sans-serif';
  wrapText(ctx, params.milestoneText, 60, 390, 960, 56);

  ctx.fillStyle = '#4A5C78';
  ctx.font = '32px Inter, sans-serif';
  ctx.fillText(`Category: ${params.category}`, 60, 760);
  ctx.fillText(`Date: ${params.achievedAt}`, 60, 820);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '28px Inter, sans-serif';
  ctx.fillText('Powered by XO Nursery', 60, 1000);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Image generation failed'))), 'image/png');
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ');
  let line = '';
  let cy = y;
  words.forEach((word) => {
    const test = `${line}${word} `;
    const width = ctx.measureText(test).width;
    if (width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = `${word} `;
      cy += lineHeight;
    } else {
      line = test;
    }
  });
  if (line) ctx.fillText(line, x, cy);
}
