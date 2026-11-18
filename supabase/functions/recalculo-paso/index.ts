// POST /functions/v1/recalculo-paso — ver BRIEF §11.3 y §13.2. Solo administradores.
import { opcionesDesdeEntorno } from '../_shared/entorno.ts';
import { atender } from '../_shared/http.ts';
import { paso } from '../_shared/recalculo_paso.ts';

Deno.serve((peticion) => atender(peticion, opcionesDesdeEntorno(), paso));
