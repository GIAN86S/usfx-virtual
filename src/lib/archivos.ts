import { useQuery } from '@tanstack/react-query';
import { DEMO, mensajeError, sb } from './sb';
import { seguro } from './util';

const LIMITE_DIRECTO = 6 * 1024 * 1024;

// Hasta 6 MB, subida directa. Más grande, subida reanudable: si se corta la señal continúa donde quedó.
export async function subir(bucket: string, carpeta: string, archivo: File | Blob, nombre?: string, progreso?: (p: number) => void): Promise<string> {
  const n = nombre ?? (archivo as File).name ?? 'archivo';
  const ruta = `${carpeta}/${Date.now()}-${seguro(n)}`;
  if (archivo.size <= LIMITE_DIRECTO || DEMO) {
    const { error } = await sb.storage.from(bucket).upload(ruta, archivo, { contentType: archivo.type || undefined, upsert: false });
    if (error) throw new Error(mensajeError(error));
    progreso?.(100);
    return ruta;
  }
  const tus = await import('tus-js-client');
  const { data } = await sb.auth.getSession();
  await new Promise<void>((ok, mal) => {
    const up = new tus.Upload(archivo, {
      endpoint: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 2000, 5000, 15000, 30000],
      headers: { authorization: `Bearer ${data.session?.access_token}`, 'x-upsert': 'false' },
      uploadDataDuringCreation: true, removeFingerprintOnSuccess: true,
      metadata: { bucketName: bucket, objectName: ruta, contentType: archivo.type || 'application/octet-stream', cacheControl: '3600' },
      chunkSize: LIMITE_DIRECTO,
      onError: (e) => mal(new Error(mensajeError(e))),
      onProgress: (a, b) => progreso?.(Math.round((a / b) * 100)),
      onSuccess: () => ok(),
    });
    up.start();
  });
  return ruta;
}

export async function urlFirmada(bucket: string, ruta: string, segundos = 3600): Promise<string> {
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(ruta, segundos);
  if (error) throw new Error(mensajeError(error));
  return data.signedUrl;
}

// Enlaces firmados en caché: no se piden de nuevo al desplazar la lista.
export function useUrl(bucket: string, ruta?: string | null) {
  return useQuery({
    queryKey: ['url', bucket, ruta], enabled: !!ruta, staleTime: 50 * 60e3, gcTime: 55 * 60e3, retry: 1,
    queryFn: () => urlFirmada(bucket, ruta!),
  }).data;
}
