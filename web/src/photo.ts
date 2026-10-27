// Photos are made smaller in the browser before upload (JPEG, long side `max` px).
export async function shrink(f: File, max = 1600): Promise<{ data: string; type: string }> {
  const bmp = await createImageBitmap(f);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
  return { data: cv.toDataURL('image/jpeg', 0.85).split(',')[1], type: 'image/jpeg' };
}
