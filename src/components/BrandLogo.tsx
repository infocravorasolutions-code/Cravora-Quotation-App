import { useEffect, useState, type CSSProperties } from 'react';

function useClearLogo(src: string) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const data = pixels.data;
      let minX = canvas.width;
      let minY = canvas.height;
      let maxX = 0;
      let maxY = 0;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const index = (y * canvas.width + x) * 4;
          if (data[index] < 28 && data[index + 1] < 28 && data[index + 2] < 28) {
            data[index + 3] = 0;
          } else if (data[index + 3] > 12) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }
      context.putImageData(pixels, 0, 0);
      const pad = 4;
      const sx = Math.max(0, minX - pad);
      const sy = Math.max(0, minY - pad);
      const sw = Math.max(1, Math.min(canvas.width - sx, maxX - minX + 1 + pad * 2));
      const sh = Math.max(1, Math.min(canvas.height - sy, maxY - minY + 1 + pad * 2));
      const cropped = document.createElement('canvas');
      cropped.width = sw;
      cropped.height = sh;
      cropped.getContext('2d')?.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
      if (!cancelled) setUrl(cropped.toDataURL('image/png'));
    };
    image.src = src;
    return () => { cancelled = true; };
  }, [src]);
  return url;
}

export default function BrandLogo({ className, style }: { className?: string; style?: CSSProperties }) {
  const src = useClearLogo('/logo-header.png');
  if (!src) return <div className={className} style={style} />;
  return <img src={src} alt="Cravora Solutions" className={className} style={style} />;
}
