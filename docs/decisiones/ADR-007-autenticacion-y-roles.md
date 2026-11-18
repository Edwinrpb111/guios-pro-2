# ADR-007: Autenticación, rol y guardas de rutas

- **Estado**: aceptada
- **Fecha**: 18/11/2026
- **Issue**: #5

## Contexto

RNF-05 pide contraseñas gestionadas por un servicio probado, evaluaciones visibles solo para su dueño y recálculo solo para administradores. El navegador es un entorno no confiable: cualquier comprobación de rol en el cliente es solo comodidad de interfaz.

## Decisión

- **Supabase Auth con correo y contraseña**; no hay código propio de contraseñas. El registro envía `nombre_completo` en los metadatos y un trigger crea el `perfil` con rol `decisor` (ADR-003). Si el proyecto exige confirmar el correo, P-01 avisa al usuario («Revisa tu correo…»); en local la confirmación está desactivada.
- **El rol vive en `perfil.rol`** y el cliente lo lee con la sesión. `ProveedorAuth` expone `sesion`, `usuario`, `rol` y `cargando`, y no declara la sesión lista hasta resolver el rol del usuario actual.
- **Falla cerrado.** Si el rol no se puede leer (error, valor desconocido, sin red), queda en `null`, es decir, sin privilegios, pero la aplicación no queda «cargando» para siempre. Al cerrar sesión se olvida el rol, de modo que otra persona que entre después no hereda el anterior.
- **Dos guardas**: `RutaProtegida` (todo exige sesión salvo `/login`; guarda la ruta de origen para volver tras ingresar) y `RutaAdmin` (`/admin/*` exige `administrador`; el resto vuelve a `/`).
- **La seguridad real no está en las guardas.** La imponen la base (RLS y funciones con `es_admin()`) y las Edge Functions (403 a un decisor). El rol no se puede cambiar desde el cliente por el privilegio por columna de ADR-003; por eso la promoción del primer administrador es un `UPDATE` manual con rol de base de datos (README, «Administrador inicial»).
- **Solo la clave pública**: el cliente usa `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Si faltan, `src/lib/supabase.ts` falla al arrancar con un mensaje que remite a `docs/variables-entorno.md`.

## Consecuencias

- Una prueba de integración (`src/lib/auth.integracion.test.ts`) registra un usuario, lee su perfil y reingresa contra Supabase local; se omite sin variables y por eso la CI no la ejecuta.
- La política de contraseñas del proyecto hospedado (longitud mínima, confirmación de correo) se configura en Supabase, no en el repositorio: queda como paso de la publicación (#13). El cliente exige al registrar un mínimo de 8 caracteres.
- Pendientes menores heredados de la revisión del issue #5: `LoginPage.enviar` no captura una excepción inesperada y no hay reintento de lectura del rol.
