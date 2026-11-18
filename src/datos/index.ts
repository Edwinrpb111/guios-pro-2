import { supabase } from '../lib/supabase';
import { crearRepositorio } from './repositorio';

/** Repositorio de la aplicación, con el cliente de Supabase configurado en `.env.local`. */
export const repositorio = crearRepositorio(supabase);
