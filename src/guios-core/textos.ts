/**
 * Textos de las recomendaciones, versión de la tesis §6.2.3 (BRIEF §4.4).
 * A = adoptar, C = posponer: las letras del Excel 2021 están invertidas (BRIEF §5.1).
 */

export type CodigoRecomendacion = 'A' | 'B' | 'C';

export interface TextoRecomendacion {
  readonly titulo: string;
  readonly texto: string;
}

export const TEXTOS_RECOMENDACION: Readonly<Record<CodigoRecomendacion, TextoRecomendacion>> = {
  A: {
    titulo: 'Adoptar el software evaluado',
    texto:
      'Todos los factores evaluados son fortalezas u oportunidades; la organización cumple satisfactoriamente los requisitos. Si algún subfactor no cumple el mínimo, se sugiere revisarlo en una segunda evaluación.',
  },
  B: {
    titulo: 'Es posible adoptar, con matices',
    texto:
      'Hay amenazas o debilidades solo en factores de importancia relativa opcional. Se sugiere una segunda evaluación de los subfactores que no cumplen (por ejemplo: formación del personal TIC, consultores externos, documentación en varios formatos, reducir dependencia de proveedores, evitar costes ocultos).',
  },
  C: {
    titulo: 'Analizar la adopción; debería posponerse',
    texto:
      'Hay debilidades o amenazas en factores importantes o fundamentales. La organización debe proporcionar los recursos necesarios: si son internos, mejorar aspectos de la organización (entrenamiento, soporte 24/7/365, desarrolladores, actitud al cambio); si son externos, dedicar recursos de ingeniería a mejorar el software (compatibilidad de hardware o sistemas operativos, personalización sin tocar código, facilidad de despliegue).',
  },
};
