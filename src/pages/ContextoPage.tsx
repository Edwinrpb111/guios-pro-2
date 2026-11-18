import { useId } from 'react';
import { useNavigate } from 'react-router';
import { BottomBar } from '../components/BottomBar';
import type { CalculoImportancia, Catalogo, EvaluacionDetalle } from '../datos/tipos';
import { useEvaluacionCargada, useIdEvaluacion } from '../evaluacion/consultas';
import { derivarFactores } from '../evaluacion/derivar';
import { rutaDeEvaluacion } from '../evaluacion/historial';
import { pasosDeEvaluacion, situacionDePasos } from '../evaluacion/pasos';
import { useContexto } from '../evaluacion/useContexto';
import { EncabezadoEvaluacion } from './EncabezadoEvaluacion';
import { EstadoCarga } from './EstadoCarga';
import { EstadoGuardado } from './EstadoGuardado';
import { MarcoDecisor } from './MarcoDecisor';

const SECTORES = ['Educación', 'Gobierno', 'Salud', 'Comercio', 'Otro'];
const LICENCIAS = ['GPL v3', 'LGPL v3', 'MPL 2.0', 'Apache 2.0', 'MIT', 'BSD', 'AGPL v3', 'Otra'];

/** P-03: contexto de la evaluación, software y organización (HU-02, RF-15). */
export function ContextoPage() {
  const carga = useEvaluacionCargada(useIdEvaluacion());
  if (carga.estado !== 'lista') {
    return (
      <MarcoDecisor>
        <EstadoCarga carga={carga} />
      </MarcoDecisor>
    );
  }
  return (
    <FormularioContexto
      key={carga.evaluacion.id}
      evaluacion={carga.evaluacion}
      calculo={carga.calculo}
      catalogo={carga.catalogo}
    />
  );
}

interface FormularioContextoProps {
  evaluacion: EvaluacionDetalle;
  calculo: CalculoImportancia;
  catalogo: Catalogo;
}

function FormularioContexto({ evaluacion, calculo, catalogo }: FormularioContextoProps) {
  const navegar = useNavigate();
  const { contexto, cambiar, guardarAhora, estado, error } = useContexto(
    evaluacion.id,
    evaluacion.contexto,
  );
  const finalizada = evaluacion.estado === 'finalizada';
  const tieneSoftware = contexto.software.nombre.trim() !== '';
  const filas = derivarFactores(catalogo, calculo, evaluacion.valoraciones);
  const pasos = pasosDeEvaluacion(situacionDePasos(filas, tieneSoftware, finalizada));

  async function continuar() {
    if (finalizada || (await guardarAhora())) {
      void navegar(rutaDeEvaluacion(evaluacion.id, 'factores'));
    }
  }

  const barra = (
    <BottomBar
      {...(finalizada
        ? {}
        : { etiquetaSecundaria: 'Guardar borrador', onSecundaria: () => void guardarAhora() })}
      etiquetaPrincipal="Continuar a factores"
      onPrincipal={() => void continuar()}
      principalDeshabilitado={!tieneSoftware}
    >
      <EstadoGuardado estado={estado} />
    </BottomBar>
  );

  return (
    <MarcoDecisor barraInferior={barra}>
      <EncabezadoEvaluacion
        idEvaluacion={evaluacion.id}
        titulo={contexto.titulo}
        descripcion="Registra qué software se evalúa y para qué organización."
        nombreCalculo={calculo.nombre}
        pasos={pasos}
        actual="contexto"
      />
      {finalizada && (
        <div className="alerta alerta--info">
          Esta evaluación está finalizada y no se puede editar.
        </div>
      )}
      {error && (
        <div role="alert" className="alerta alerta--error">
          No se pudo guardar el borrador: {error}
        </div>
      )}
      <div className="rejilla rejilla--2">
        <section className="tarjeta tarjeta--relleno" aria-labelledby="titulo-software">
          <h2 id="titulo-software">Software evaluado</h2>
          <Campo
            etiqueta="Título de la evaluación"
            valor={contexto.titulo}
            ejemplo="Ej.: Adopción de suite ofimática"
            deshabilitado={finalizada}
            onCambiar={(valor) => cambiar((c) => ({ ...c, titulo: valor }))}
          />
          <div className="rejilla--campos">
            <Campo
              etiqueta="Nombre del software"
              valor={contexto.software.nombre}
              ejemplo="Ej.: LibreOffice"
              deshabilitado={finalizada}
              onCambiar={(valor) =>
                cambiar((c) => ({ ...c, software: { ...c.software, nombre: valor } }))
              }
            />
            <Campo
              etiqueta="Versión"
              valor={contexto.software.version}
              ejemplo="Ej.: 7.6"
              deshabilitado={finalizada}
              onCambiar={(valor) =>
                cambiar((c) => ({ ...c, software: { ...c.software, version: valor } }))
              }
            />
          </div>
          <Lista
            etiqueta="Tipo de licencia"
            valor={contexto.software.licencia}
            opciones={LICENCIAS}
            deshabilitado={finalizada}
            onCambiar={(valor) =>
              cambiar((c) => ({ ...c, software: { ...c.software, licencia: valor } }))
            }
          />
        </section>
        <section className="tarjeta tarjeta--relleno" aria-labelledby="titulo-organizacion">
          <h2 id="titulo-organizacion">Organización</h2>
          <Campo
            etiqueta="Organización"
            valor={contexto.organizacion.nombre}
            ejemplo="Ej.: Universidad Estatal de Milagro"
            deshabilitado={finalizada}
            onCambiar={(valor) =>
              cambiar((c) => ({ ...c, organizacion: { ...c.organizacion, nombre: valor } }))
            }
          />
          <div className="rejilla--campos">
            <Lista
              etiqueta="Sector"
              valor={contexto.organizacion.sector}
              opciones={SECTORES}
              deshabilitado={finalizada}
              onCambiar={(valor) =>
                cambiar((c) => ({ ...c, organizacion: { ...c.organizacion, sector: valor } }))
              }
            />
            <Campo
              etiqueta="País"
              valor={contexto.organizacion.pais}
              ejemplo="Ej.: Ecuador"
              deshabilitado={finalizada}
              onCambiar={(valor) =>
                cambiar((c) => ({ ...c, organizacion: { ...c.organizacion, pais: valor } }))
              }
            />
          </div>
          <div className="alerta alerta--info">
            <span aria-hidden="true">
              <b>i</b>
            </span>
            <div>
              Se usará la <b>importancia sugerida vigente</b> ({calculo.nombre}). La evaluación
              queda asociada a ese cálculo para su trazabilidad.
            </div>
          </div>
        </section>
      </div>
    </MarcoDecisor>
  );
}

interface CampoProps {
  etiqueta: string;
  valor: string;
  ejemplo?: string;
  deshabilitado: boolean;
  onCambiar: (valor: string) => void;
}

function Campo({ etiqueta, valor, ejemplo, deshabilitado, onCambiar }: CampoProps) {
  const id = useId();
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <input
        id={id}
        value={valor}
        placeholder={ejemplo}
        disabled={deshabilitado}
        onChange={(evento) => onCambiar(evento.target.value)}
      />
    </div>
  );
}

interface ListaProps {
  etiqueta: string;
  valor: string;
  opciones: readonly string[];
  deshabilitado: boolean;
  onCambiar: (valor: string) => void;
}

function Lista({ etiqueta, valor, opciones, deshabilitado, onCambiar }: ListaProps) {
  const id = useId();
  // Un valor guardado que no esté en la lista (p. ej. otra licencia) se conserva como opción.
  const todas = valor !== '' && !opciones.includes(valor) ? [...opciones, valor] : opciones;
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <select
        id={id}
        value={valor}
        disabled={deshabilitado}
        onChange={(evento) => onCambiar(evento.target.value)}
      >
        <option value="" />
        {todas.map((opcion) => (
          <option key={opcion} value={opcion}>
            {opcion}
          </option>
        ))}
      </select>
    </div>
  );
}
