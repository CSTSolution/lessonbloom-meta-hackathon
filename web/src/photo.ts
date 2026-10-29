// Photos are made smaller in the browser before upload (JPEG, long side `max` px).
export async function shrink(f: File, max = 1600): Promise<{ data: string; type: string }> {
  const bmp = await createImageBitmap(f);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
  return { data: cv.toDataURL('image/jpeg', 0.85).split(',')[1], type: 'image/jpeg' };
}

// A photo of a book page as a JPEG for the reading (#18): long side `max` px, at most 1.4 MB. HEIC from
// an iPhone opens where the browser can decode it (Safari); elsewhere it throws and the page says so.
export async function photoJpeg(f: File, max = 1600): Promise<Blob> {
  let src: CanvasImageSource & { width: number; height: number };
  try { src = await createImageBitmap(f); } catch {
    const url = URL.createObjectURL(f);
    try { src = await new Promise<HTMLImageElement>((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = url; }); }
    catch { throw new Error('photo'); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  const k = Math.min(1, max / Math.max(src.width, src.height)), cv = document.createElement('canvas');
  cv.width = Math.round(src.width * k); cv.height = Math.round(src.height * k);
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(src, 0, 0, cv.width, cv.height);
  for (const q of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= 1.4e6) return blob;
  }
  throw new Error('photo');
}
