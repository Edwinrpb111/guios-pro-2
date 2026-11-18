// Todo lo que necesitan los manejadores de las Edge Functions, agrupado para poder
// reemplazarlo por falsos en las pruebas.
import type { VerificadorAdmin } from './auth.ts';
import type { Configuracion } from './configuracion.ts';
import type { ContextoSubfactores } from './contexto.ts';
import type { Repositorio } from './repositorio.ts';
import type { Clasificador, NombreBase, ProveedorBusqueda } from './tipos.ts';

export interface Dependencias {
  verificador: VerificadorAdmin;
  repositorio: Repositorio;
  contexto: ContextoSubfactores;
  configuracion: Configuracion;
  /** Un proveedor por fuente pedida, en el mismo orden. */
  proveedores(fuentes: NombreBase[]): ProveedorBusqueda[];
  clasificador(modelo: string): Clasificador;
}
