/**
 * Client-Side Image Optimization & Privacy Sanitizer
 * - Validates file types and sizes
 * - Resizes images to max 1280px dimension using offscreen Canvas
 * - Strips personal EXIF metadata (camera serial, hardware ID, embedded GPS)
 * - Compresses to JPEG to respect user bandwidth and latency
 */

export interface ProcessedImage {
  dataUri: string;
  base64: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/jpg'];
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

export function validateImageFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase()) && !file.name.match(/\.(jpg|jpeg|png|webp|heic)$/i)) {
    return {
      valid: false,
      error: 'Unsupported file format. Please upload a JPEG, PNG, or WebP photo.',
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max permitted is 15MB.`,
    };
  }

  return { valid: true };
}

export function processAndCompressImage(file: File, maxDimension = 1280, quality = 0.82): Promise<ProcessedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Failed to read image file'));

    reader.onload = e => {
      const img = new Image();
      img.onerror = () => reject(new Error('Corrupted or unreadable image'));

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calculate proportional scale
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context initialization failed'));
          return;
        }

        // Draw image onto canvas (effectively strips all EXIF metadata tags)
        ctx.drawImage(img, 0, 0, width, height);

        const dataUri = canvas.toDataURL('image/jpeg', quality);
        const base64 = dataUri.replace(/^data:image\/jpeg;base64,/, '');
        const sizeBytes = Math.round((base64.length * 3) / 4);

        resolve({
          dataUri,
          base64,
          mimeType: 'image/jpeg',
          sizeBytes,
          width,
          height,
        });
      };

      img.src = e.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}
