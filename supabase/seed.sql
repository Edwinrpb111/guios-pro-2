-- Generado por scripts/generar-semilla.ts (npm run db:semilla). No editar a mano.
-- Catálogo GUIOS (3 dimensiones, 18 factores, 61 subfactores) y cálculo de IS de la tesis (BRIEF §10.4).

insert into public.dimension (nombre)
values
  ('Tecnológica'),
  ('Organizacional'),
  ('Económica');

insert into public.factor (id_dimension, nombre, importancia_experto, alcance, orden)
select d.id_dimension, v.nombre, 3, v.alcance, v.orden
from (values
  ('Compatibilidad', 'Tecnológica', 'Externo', 1),
  ('Personalización', 'Tecnológica', 'Externo', 2),
  ('Prueba', 'Tecnológica', 'Externo', 3),
  ('Fiabilidad', 'Tecnológica', 'Externo', 4),
  ('Reusabilidad', 'Tecnológica', 'Externo', 5),
  ('Usabilidad', 'Tecnológica', 'Externo', 6),
  ('Mantenibilidad', 'Tecnológica', 'Externo', 7),
  ('Portabilidad', 'Tecnológica', 'Externo', 8),
  ('Documentación', 'Tecnológica', 'Externo', 9),
  ('Formación', 'Organizacional', 'Interno', 10),
  ('Tiempo de adopción', 'Organizacional', 'Interno', 11),
  ('Casos de estudio de adopción FLOSS', 'Organizacional', 'Externo', 12),
  ('Centralidad de la tecnología de la información', 'Organizacional', 'Interno', 13),
  ('Apoyo de la alta dirección', 'Organizacional', 'Interno', 14),
  ('Bloqueo de proveedores', 'Organizacional', 'Externo', 15),
  ('Soporte', 'Organizacional', 'Ambos', 16),
  ('Actitud hacia el cambio', 'Organizacional', 'Interno', 17),
  ('Coste total de propiedad', 'Económica', 'Interno', 18)
) as v (nombre, dimension, alcance, orden)
join public.dimension d on d.nombre = v.dimension;

insert into public.subfactor (id_factor, enunciado, orden)
select f.id_factor, v.enunciado, v.orden
from (values
  ('Compatibilidad', 'Una empresa proporciona una infraestructura de nube lista para usar para este software', 1),
  ('Compatibilidad', 'Los programas informáticos pueden exportar formatos propietarios', 2),
  ('Compatibilidad', 'El software interactúa y se integra con el software propietario existente', 3),
  ('Compatibilidad', 'El software está certificado para operar en su nicho de mercado', 4),
  ('Compatibilidad', 'El software es compatible con los casos de uso y las funcionalidades más comunes', 5),
  ('Compatibilidad', 'El software es compatible con múltiples componentes de hardware', 6),
  ('Compatibilidad', 'El software utiliza formatos estándar', 7),
  ('Compatibilidad', 'El software es compatible con varios sistemas operativos diferentes (el software es multiplataforma)', 8),
  ('Personalización', 'El acceso al código fuente es un incentivo para la organización', 1),
  ('Personalización', 'El software se puede ampliar fácilmente para satisfacer las necesidades de la organización modificando el código fuente', 2),
  ('Personalización', 'Las innovaciones se introducen en el software a un ritmo rápido', 3),
  ('Personalización', 'El software es fácil de personalizar sin necesidad de modificar el código fuente', 4),
  ('Personalización', 'El software soporta nuevas funciones a través de módulos (el software es modular)', 5),
  ('Personalización', 'Hay un repositorio público de extensiones para este software', 6),
  ('Prueba', 'El software es fácil de desplegar y de probar', 1),
  ('Fiabilidad', 'El software es fiable y estable', 1),
  ('Fiabilidad', 'El software tiene un buen historial en cuanto a errores de seguridad (el software es seguro)', 2),
  ('Fiabilidad', 'El software es más flexible que la solución propietaria', 3),
  ('Fiabilidad', 'El software es más confiable que la solución propietaria', 4),
  ('Fiabilidad', 'El programa proporciona una amplia variedad de funciones de control de acceso', 5),
  ('Reusabilidad', 'La licencia permite extensiones propietarias', 1),
  ('Reusabilidad', 'El software se ofrece como una biblioteca / marco de trabajo', 2),
  ('Usabilidad', 'El software proporciona una interfaz gráfica de usuario (GUI)', 1),
  ('Usabilidad', 'El software es más fácil de usar que la alternativa propietaria', 2),
  ('Usabilidad', 'El software es fácil de aprender', 3),
  ('Usabilidad', 'El usuario está descontento con el software propietario', 4),
  ('Mantenibilidad', 'El software es mantenido activamente por los desarrolladores', 1),
  ('Portabilidad', 'Una versión de aplicación móvil de este software está disponible', 1),
  ('Portabilidad', 'El software es un sistema de administración de base de datos independiente', 2),
  ('Documentación', 'El software está bien documentado', 1),
  ('Documentación', 'La documentación de desarrollo cubre todas las características', 2),
  ('Documentación', 'La documentación está disponible en múltiples formatos', 3),
  ('Documentación', 'La documentación es fácil de entender', 4),
  ('Documentación', 'La documentación está actualizada', 5),
  ('Documentación', 'La documentación está escrita por escritores especializados (no desarrolladores)', 6),
  ('Documentación', 'La documentación del software es de alta calidad', 7),
  ('Documentación', 'El software viene con documentación de desarrollo', 8),
  ('Documentación', 'El software viene con documentación de usuario', 9),
  ('Documentación', 'La documentación del usuario cubre todas las características', 10),
  ('Documentación', 'Los formatos de datos están bien documentados', 11),
  ('Formación', 'La adopción de este software permite a los usuarios mejorar las habilidades técnicas de TI', 1),
  ('Formación', 'El personal de la organización puede aprender fácilmente por sí mismo a utilizar este software', 2),
  ('Formación', 'El personal de la organización está capacitado para resolver problemas tecnológicos', 3),
  ('Formación', 'Los planes de entrenamiento de este software están disponibles', 4),
  ('Tiempo de adopción', 'Los requisitos de instalación y despliegue del software son fáciles de cumplir', 1),
  ('Tiempo de adopción', 'El tiempo requerido para adoptar este software es bajo', 2),
  ('Casos de estudio de adopción FLOSS', 'Hay informes públicos disponibles en Internet que describen el éxito de la adopción de este software', 1),
  ('Centralidad de la tecnología de la información', 'La adopción de este software mejora el entorno de trabajo de los usuarios', 1),
  ('Centralidad de la tecnología de la información', 'Centralizar la infraestructura de TI ayuda a acelerar la adopción de este software', 2),
  ('Apoyo de la alta dirección', 'La alta dirección apoya la adopción exitosa de este software', 1),
  ('Bloqueo de proveedores', 'El software reduce las dependencias de los proveedores en su entorno', 1),
  ('Soporte', 'El soporte de la comunidad para este software está disponible', 1),
  ('Soporte', 'Soporte de expertos y consultores externos para consultas específicas está disponible', 2),
  ('Soporte', 'El soporte comercial de este software está disponible 24/7/365', 3),
  ('Soporte', 'Hay desarrolladores en su organización que saben cómo desarrollar este software', 4),
  ('Soporte', 'Soporte comercial para la personalización de software está disponible', 5),
  ('Soporte', 'Es fácil contratar personal informático en la comunidad que conozca este software', 6),
  ('Actitud hacia el cambio', 'El personal de la organización muestra poca resistencia al cambio tecnológico', 1),
  ('Actitud hacia el cambio', 'El personal técnico encargado del despliegue y soporte en la organización respalda la adopción de este software', 2),
  ('Coste total de propiedad', 'Es poco probable que haya costos ocultos al adoptar este software', 1),
  ('Coste total de propiedad', 'La adopción de este software es menos costosa que la alternativa patentada', 2)
) as v (factor, enunciado, orden)
join public.factor f on f.nombre = v.factor;

insert into public.calculo_sugerida (origen, etiqueta_rango, bases_datos, estado, vigente, progreso)
values ('tesis', 'RSL de la tesis', 'IEEE, ACM, Scopus, WoS', 'publicado', true, 18);

insert into public.sugerida_factor (
  id_calculo, id_factor, num_subfactores, total_citas, razon_citas,
  importancia_experto, importancia_literatura, importancia_sugerida)
select c.id_calculo, f.id_factor, v.ns, v.tc, v.razon, v.ie, v.il, v.isug
from (values
  ('Compatibilidad', 8, 33, 4.1250, 3, 3, 3),
  ('Personalización', 6, 30, 5.0000, 3, 4, 3),
  ('Prueba', 1, 4, 4.0000, 3, 3, 3),
  ('Fiabilidad', 5, 19, 3.8000, 3, 3, 3),
  ('Reusabilidad', 2, 5, 2.5000, 3, 2, 2),
  ('Usabilidad', 4, 14, 3.5000, 3, 2, 2),
  ('Mantenibilidad', 1, 4, 4.0000, 3, 3, 3),
  ('Portabilidad', 2, 4, 2.0000, 3, 2, 2),
  ('Documentación', 11, 20, 1.8182, 3, 1, 2),
  ('Formación', 4, 27, 6.7500, 3, 4, 3),
  ('Tiempo de adopción', 2, 2, 1.0000, 3, 1, 2),
  ('Casos de estudio de adopción FLOSS', 1, 1, 1.0000, 3, 1, 2),
  ('Centralidad de la tecnología de la información', 2, 2, 1.0000, 3, 1, 2),
  ('Apoyo de la alta dirección', 1, 5, 5.0000, 3, 4, 3),
  ('Bloqueo de proveedores', 1, 3, 3.0000, 3, 2, 2),
  ('Soporte', 6, 43, 7.1667, 3, 4, 3),
  ('Actitud hacia el cambio', 2, 3, 1.5000, 3, 1, 2),
  ('Coste total de propiedad', 2, 24, 12.0000, 3, 4, 3)
) as v (factor, ns, tc, razon, ie, il, isug)
join public.factor f on f.nombre = v.factor
cross join (select id_calculo from public.calculo_sugerida where origen = 'tesis') c;
