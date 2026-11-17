import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { dato, sb } from './sb';
import type { Rol } from './util';

export interface Perfil { id: string; usuario: string; nombres: string; apellidos: string; ci?: string; celular?: string; email?: string; foto_path?: string; rol: Rol; activo: boolean; debe_cambiar_clave: boolean }
interface Ctx { sesion: Session | null; perfil: Perfil | null; cargando: boolean; salir: () => Promise<void>; recargar: () => void }
const C = createContext<Ctx>(null as any);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [lista, setLista] = useState(false);
  const qc = useQueryClient();
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => { setSesion(data.session); setLista(true); });
    const { data } = sb.auth.onAuthStateChange((_e, s) => { setSesion(s); if (s) sb.realtime.setAuth(s.access_token); });
    return () => data.subscription.unsubscribe();
  }, []);
  const uid = sesion?.user.id;
  const q = useQuery({
    queryKey: ['perfil', uid], enabled: !!uid, staleTime: 5 * 60e3,
    queryFn: async () => dato(await sb.from('perfiles').select('id,usuario,nombres,apellidos,ci,celular,email,foto_path,rol,activo,debe_cambiar_clave').eq('id', uid!).single()) as Perfil,
  });
  const valor: Ctx = {
    sesion, perfil: q.data ?? null, cargando: !lista || (!!uid && q.isLoading),
    salir: async () => { await sb.auth.signOut(); qc.clear(); },
    recargar: () => qc.invalidateQueries({ queryKey: ['perfil', uid] }),
  };
  return <C.Provider value={valor}>{children}</C.Provider>;
}
export const useSesion = () => useContext(C);
export function usePerfil(): Perfil { return useContext(C).perfil!; }
