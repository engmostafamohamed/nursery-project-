import imageCompression from 'browser-image-compression';

const COMPRESSIBLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const DEFAULT_OPTIONS = {
  maxSizeMB: 0.5,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
  fileType: 'image/jpeg' as const,
  initialQuality: 0.85,
};

export async function compressImageForUpload(file: File): Promise<File> {
  if (!COMPRESSIBLE_TYPES.has(file.type)) return file;
  try {
    const compressed = await imageCompression(file, DEFAULT_OPTIONS);
    return new File([compressed], replaceExtension(file.name, 'jpg'), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

function replaceExtension(name: string, ext: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? `${name}.${ext}` : `${name.slice(0, dot)}.${ext}`;
}
