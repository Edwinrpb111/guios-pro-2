import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL;
const claveAnonima = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !claveAnonima) {
  throw new Error(
    'Falta configurar Supabase: define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local ' +
      '(ver docs/variables-entorno.md).',
  );
}

/** Cliente de Supabase tipado con el esquema de la base (solo usa la clave pública `anon`). */
export const supabase = createClient<Database>(url, claveAnonima);
