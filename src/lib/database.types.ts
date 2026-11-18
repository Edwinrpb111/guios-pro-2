export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      calculo_sugerida: {
        Row: {
          anio_fin: number | null;
          anio_inicio: number | null;
          bases_datos: string | null;
          creado_por: string | null;
          estado: string;
          etiqueta_rango: string | null;
          fecha_calculo: string;
          id_calculo: number;
          mensaje_error: string | null;
          origen: string;
          parametros: Json | null;
          progreso: number;
          vigente: boolean;
        };
        ComputedFields: never;
        Insert: {
          anio_fin?: number | null;
          anio_inicio?: number | null;
          bases_datos?: string | null;
          creado_por?: string | null;
          estado?: string;
          etiqueta_rango?: string | null;
          fecha_calculo?: string;
          id_calculo?: never;
          mensaje_error?: string | null;
          origen: string;
          parametros?: Json | null;
          progreso?: number;
          vigente?: boolean;
        };
        Update: {
          anio_fin?: number | null;
          anio_inicio?: number | null;
          bases_datos?: string | null;
          creado_por?: string | null;
          estado?: string;
          etiqueta_rango?: string | null;
          fecha_calculo?: string;
          id_calculo?: never;
          mensaje_error?: string | null;
          origen?: string;
          parametros?: Json | null;
          progreso?: number;
          vigente?: boolean;
        };
        Relationships: [];
      };
      dimension: {
        Row: {
          id_dimension: number;
          nombre: string;
        };
        ComputedFields: never;
        Insert: {
          id_dimension?: never;
          nombre: string;
        };
        Update: {
          id_dimension?: never;
          nombre?: string;
        };
        Relationships: [];
      };
      evaluacion: {
        Row: {
          causas: Json | null;
          codigo_recomendacion: string | null;
          estado: string;
          fecha_actualizacion: string;
          fecha_creacion: string;
          id_calculo: number;
          id_evaluacion: number;
          id_software: number | null;
          id_usuario: string;
          texto_recomendacion: string | null;
          titulo: string | null;
        };
        ComputedFields: never;
        Insert: {
          causas?: Json | null;
          codigo_recomendacion?: string | null;
          estado?: string;
          fecha_actualizacion?: string;
          fecha_creacion?: string;
          id_calculo: number;
          id_evaluacion?: never;
          id_software?: number | null;
          id_usuario?: string;
          texto_recomendacion?: string | null;
          titulo?: string | null;
        };
        Update: {
          causas?: Json | null;
          codigo_recomendacion?: string | null;
          estado?: string;
          fecha_actualizacion?: string;
          fecha_creacion?: string;
          id_calculo?: number;
          id_evaluacion?: never;
          id_software?: number | null;
          id_usuario?: string;
          texto_recomendacion?: string | null;
          titulo?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'evaluacion_id_calculo_fkey';
            columns: ['id_calculo'];
            isOneToOne: false;
            referencedRelation: 'calculo_sugerida';
            referencedColumns: ['id_calculo'];
          },
          {
            foreignKeyName: 'evaluacion_id_software_fkey';
            columns: ['id_software'];
            isOneToOne: false;
            referencedRelation: 'software_evaluado';
            referencedColumns: ['id_software'];
          },
          {
            foreignKeyName: 'evaluacion_id_usuario_fkey';
            columns: ['id_usuario'];
            isOneToOne: false;
            referencedRelation: 'perfil';
            referencedColumns: ['id'];
          },
        ];
      };
      factor: {
        Row: {
          alcance: string;
          id_dimension: number;
          id_factor: number;
          importancia_experto: number;
          nombre: string;
          orden: number;
        };
        ComputedFields: never;
        Insert: {
          alcance: string;
          id_dimension: number;
          id_factor?: never;
          importancia_experto?: number;
          nombre: string;
          orden: number;
        };
        Update: {
          alcance?: string;
          id_dimension?: number;
          id_factor?: never;
          importancia_experto?: number;
          nombre?: string;
          orden?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'factor_id_dimension_fkey';
            columns: ['id_dimension'];
            isOneToOne: false;
            referencedRelation: 'dimension';
            referencedColumns: ['id_dimension'];
          },
        ];
      };
      organizacion: {
        Row: {
          creado_por: string;
          id_organizacion: number;
          nombre: string;
          pais: string | null;
          sector: string | null;
        };
        ComputedFields: never;
        Insert: {
          creado_por?: string;
          id_organizacion?: never;
          nombre: string;
          pais?: string | null;
          sector?: string | null;
        };
        Update: {
          creado_por?: string;
          id_organizacion?: never;
          nombre?: string;
          pais?: string | null;
          sector?: string | null;
        };
        Relationships: [];
      };
      perfil: {
        Row: {
          fecha_registro: string;
          id: string;
          id_organizacion: number | null;
          nombre_completo: string;
          rol: string;
        };
        ComputedFields: never;
        Insert: {
          fecha_registro?: string;
          id: string;
          id_organizacion?: number | null;
          nombre_completo: string;
          rol?: string;
        };
        Update: {
          fecha_registro?: string;
          id?: string;
          id_organizacion?: number | null;
          nombre_completo?: string;
          rol?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'perfil_id_organizacion_fkey';
            columns: ['id_organizacion'];
            isOneToOne: false;
            referencedRelation: 'organizacion';
            referencedColumns: ['id_organizacion'];
          },
        ];
      };
      recalculo_paso: {
        Row: {
          aceptados: number;
          candidatos: number;
          detalle: string | null;
          estado: string;
          id_calculo: number;
          id_subfactor: number;
        };
        ComputedFields: never;
        Insert: {
          aceptados?: number;
          candidatos?: number;
          detalle?: string | null;
          estado?: string;
          id_calculo: number;
          id_subfactor: number;
        };
        Update: {
          aceptados?: number;
          candidatos?: number;
          detalle?: string | null;
          estado?: string;
          id_calculo?: number;
          id_subfactor?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'recalculo_paso_id_calculo_fkey';
            columns: ['id_calculo'];
            isOneToOne: false;
            referencedRelation: 'calculo_sugerida';
            referencedColumns: ['id_calculo'];
          },
          {
            foreignKeyName: 'recalculo_paso_id_subfactor_fkey';
            columns: ['id_subfactor'];
            isOneToOne: false;
            referencedRelation: 'subfactor';
            referencedColumns: ['id_subfactor'];
          },
        ];
      };
      referencia: {
        Row: {
          anio: number;
          base_datos: string | null;
          doi: string;
          id_calculo: number;
          id_referencia: number;
          id_subfactor: number;
          titulo: string;
        };
        ComputedFields: never;
        Insert: {
          anio: number;
          base_datos?: string | null;
          doi: string;
          id_calculo: number;
          id_referencia?: never;
          id_subfactor: number;
          titulo: string;
        };
        Update: {
          anio?: number;
          base_datos?: string | null;
          doi?: string;
          id_calculo?: number;
          id_referencia?: never;
          id_subfactor?: number;
          titulo?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'referencia_id_calculo_fkey';
            columns: ['id_calculo'];
            isOneToOne: false;
            referencedRelation: 'calculo_sugerida';
            referencedColumns: ['id_calculo'];
          },
          {
            foreignKeyName: 'referencia_id_subfactor_fkey';
            columns: ['id_subfactor'];
            isOneToOne: false;
            referencedRelation: 'subfactor';
            referencedColumns: ['id_subfactor'];
          },
        ];
      };
      software_evaluado: {
        Row: {
          creado_por: string;
          descripcion: string | null;
          id_organizacion: number | null;
          id_software: number;
          nombre: string;
          tipo_licencia: string | null;
          version: string | null;
        };
        ComputedFields: never;
        Insert: {
          creado_por?: string;
          descripcion?: string | null;
          id_organizacion?: number | null;
          id_software?: never;
          nombre: string;
          tipo_licencia?: string | null;
          version?: string | null;
        };
        Update: {
          creado_por?: string;
          descripcion?: string | null;
          id_organizacion?: number | null;
          id_software?: never;
          nombre?: string;
          tipo_licencia?: string | null;
          version?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'software_evaluado_id_organizacion_fkey';
            columns: ['id_organizacion'];
            isOneToOne: false;
            referencedRelation: 'organizacion';
            referencedColumns: ['id_organizacion'];
          },
        ];
      };
      subfactor: {
        Row: {
          enunciado: string;
          id_factor: number;
          id_subfactor: number;
          orden: number;
        };
        ComputedFields: never;
        Insert: {
          enunciado: string;
          id_factor: number;
          id_subfactor?: never;
          orden: number;
        };
        Update: {
          enunciado?: string;
          id_factor?: number;
          id_subfactor?: never;
          orden?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'subfactor_id_factor_fkey';
            columns: ['id_factor'];
            isOneToOne: false;
            referencedRelation: 'factor';
            referencedColumns: ['id_factor'];
          },
        ];
      };
      sugerida_factor: {
        Row: {
          id_calculo: number;
          id_factor: number;
          id_sugerida: number;
          importancia_experto: number;
          importancia_literatura: number;
          importancia_sugerida: number;
          num_subfactores: number;
          razon_citas: number;
          total_citas: number;
        };
        ComputedFields: never;
        Insert: {
          id_calculo: number;
          id_factor: number;
          id_sugerida?: never;
          importancia_experto: number;
          importancia_literatura: number;
          importancia_sugerida: number;
          num_subfactores: number;
          razon_citas: number;
          total_citas: number;
        };
        Update: {
          id_calculo?: number;
          id_factor?: number;
          id_sugerida?: never;
          importancia_experto?: number;
          importancia_literatura?: number;
          importancia_sugerida?: number;
          num_subfactores?: number;
          razon_citas?: number;
          total_citas?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'sugerida_factor_id_calculo_fkey';
            columns: ['id_calculo'];
            isOneToOne: false;
            referencedRelation: 'calculo_sugerida';
            referencedColumns: ['id_calculo'];
          },
          {
            foreignKeyName: 'sugerida_factor_id_factor_fkey';
            columns: ['id_factor'];
            isOneToOne: false;
            referencedRelation: 'factor';
            referencedColumns: ['id_factor'];
          },
        ];
      };
      valoracion_factor: {
        Row: {
          alcance_aplicado: string;
          clasificacion_foda: string | null;
          es_relevante: boolean;
          id_evaluacion: number;
          id_factor: number;
          id_val_factor: number;
          importancia_decisor: number;
          importancia_relativa: number | null;
          ponderacion_global: number | null;
        };
        ComputedFields: never;
        Insert: {
          alcance_aplicado?: string;
          clasificacion_foda?: string | null;
          es_relevante?: boolean;
          id_evaluacion: number;
          id_factor: number;
          id_val_factor?: never;
          importancia_decisor?: number;
          importancia_relativa?: number | null;
          ponderacion_global?: number | null;
        };
        Update: {
          alcance_aplicado?: string;
          clasificacion_foda?: string | null;
          es_relevante?: boolean;
          id_evaluacion?: number;
          id_factor?: number;
          id_val_factor?: never;
          importancia_decisor?: number;
          importancia_relativa?: number | null;
          ponderacion_global?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'valoracion_factor_id_evaluacion_fkey';
            columns: ['id_evaluacion'];
            isOneToOne: false;
            referencedRelation: 'evaluacion';
            referencedColumns: ['id_evaluacion'];
          },
          {
            foreignKeyName: 'valoracion_factor_id_factor_fkey';
            columns: ['id_factor'];
            isOneToOne: false;
            referencedRelation: 'factor';
            referencedColumns: ['id_factor'];
          },
        ];
      };
      valoracion_subfactor: {
        Row: {
          id_subfactor: number;
          id_val_factor: number;
          id_val_subfactor: number;
          nivel_cumplimiento: number;
        };
        ComputedFields: never;
        Insert: {
          id_subfactor: number;
          id_val_factor: number;
          id_val_subfactor?: never;
          nivel_cumplimiento?: number;
        };
        Update: {
          id_subfactor?: number;
          id_val_factor?: number;
          id_val_subfactor?: never;
          nivel_cumplimiento?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'valoracion_subfactor_id_subfactor_fkey';
            columns: ['id_subfactor'];
            isOneToOne: false;
            referencedRelation: 'subfactor';
            referencedColumns: ['id_subfactor'];
          },
          {
            foreignKeyName: 'valoracion_subfactor_id_val_factor_fkey';
            columns: ['id_val_factor'];
            isOneToOne: false;
            referencedRelation: 'valoracion_factor';
            referencedColumns: ['id_val_factor'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      conteo_citas: {
        Args: { p_id_calculo: number };
        Returns: {
          id_factor: number;
          num_subfactores: number;
          total_citas: number;
        }[];
      };
      descartar_calculo: { Args: { p_id_calculo: number }; Returns: undefined };
      es_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      es_evaluacion_propia: {
        Args: { p_id_evaluacion: number; p_solo_en_curso: boolean };
        Returns: boolean;
      };
      es_valoracion_propia: {
        Args: { p_id_val_factor: number; p_solo_en_curso: boolean };
        Returns: boolean;
      };
      exigir_admin: { Args: Record<PropertyKey, never>; Returns: undefined };
      guardar_resultado_calculo: {
        Args: { p_filas: Json; p_id_calculo: number };
        Returns: undefined;
      };
      publicar_calculo: { Args: { p_id_calculo: number }; Returns: undefined };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
