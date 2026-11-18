// POST /functions/v1/recalculo-iniciar — ver BRIEF §11.3. Solo administradores.
import { opcionesDesdeEntorno } from '../_shared/entorno.ts';
import { atender } from '../_shared/http.ts';
import { iniciar } from '../_shared/recalculo_iniciar.ts';

Deno.serve((peticion) => atender(peticion, opcionesDesdeEntorno(), iniciar));
