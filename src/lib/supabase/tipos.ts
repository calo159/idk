// ⚠ ARCHIVO AUTOGENERADO — no editar a mano. Regenerar con: npm run db:tipos

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      abonos_cliente: {
        Row: {
          id: string;
          organizacion_id: string;
          cliente_id: string;
          turno_id: string | null;
          metodo: Database["public"]["Enums"]["metodo_pago"];
          monto: number;
          comprobante_id: string | null;
          usuario_id: string | null;
          creado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          cliente_id: string;
          turno_id?: string | null;
          metodo: Database["public"]["Enums"]["metodo_pago"];
          monto: number;
          comprobante_id?: string | null;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          cliente_id?: string;
          turno_id?: string | null;
          metodo?: Database["public"]["Enums"]["metodo_pago"];
          monto?: number;
          comprobante_id?: string | null;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "abonos_cliente_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "abonos_cliente_comprobante_id_fkey";
            columns: ["comprobante_id"];
            isOneToOne: false;
            referencedRelation: "comprobantes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "abonos_cliente_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "abonos_cliente_turno_id_fkey";
            columns: ["turno_id"];
            isOneToOne: false;
            referencedRelation: "turnos_caja";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "abonos_cliente_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      abonos_separado: {
        Row: {
          id: string;
          organizacion_id: string;
          separado_id: string;
          turno_id: string | null;
          metodo: Database["public"]["Enums"]["metodo_pago"];
          monto: number;
          usuario_id: string | null;
          creado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          separado_id: string;
          turno_id?: string | null;
          metodo: Database["public"]["Enums"]["metodo_pago"];
          monto: number;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          separado_id?: string;
          turno_id?: string | null;
          metodo?: Database["public"]["Enums"]["metodo_pago"];
          monto?: number;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "abonos_separado_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "abonos_separado_separado_id_fkey";
            columns: ["separado_id"];
            isOneToOne: false;
            referencedRelation: "separados";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "abonos_separado_turno_id_fkey";
            columns: ["turno_id"];
            isOneToOne: false;
            referencedRelation: "turnos_caja";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "abonos_separado_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      ajustes_cartera: {
        Row: {
          id: string;
          organizacion_id: string;
          cliente_id: string;
          monto: number;
          motivo: string;
          documento_ia_id: string | null;
          usuario_id: string | null;
          creado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          cliente_id: string;
          monto: number;
          motivo: string;
          documento_ia_id?: string | null;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          cliente_id?: string;
          monto?: number;
          motivo?: string;
          documento_ia_id?: string | null;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ajustes_cartera_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ajustes_cartera_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ajustes_cartera_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      alertas: {
        Row: {
          id: string;
          organizacion_id: string;
          tipo: string;
          severidad: string;
          mensaje: string;
          datos: Json | null;
          leida: boolean;
          creado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          tipo: string;
          severidad?: string;
          mensaje: string;
          datos?: Json | null;
          leida?: boolean;
          creado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          tipo?: string;
          severidad?: string;
          mensaje?: string;
          datos?: Json | null;
          leida?: boolean;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "alertas_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
        ];
      };
      auditoria: {
        Row: {
          id: number;
          organizacion_id: string;
          tabla: string;
          registro_id: string;
          accion: string;
          antes: Json | null;
          despues: Json | null;
          usuario_id: string | null;
          creado_en: string;
        };
        Insert: {
          id?: never;
          organizacion_id: string;
          tabla: string;
          registro_id: string;
          accion: string;
          antes?: Json | null;
          despues?: Json | null;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Update: {
          id?: never;
          organizacion_id?: string;
          tabla?: string;
          registro_id?: string;
          accion?: string;
          antes?: Json | null;
          despues?: Json | null;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "auditoria_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
        ];
      };
      bodegas: {
        Row: {
          id: string;
          organizacion_id: string;
          nombre: string;
          es_principal: boolean;
          activa: boolean;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          nombre: string;
          es_principal?: boolean;
          activa?: boolean;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          nombre?: string;
          es_principal?: boolean;
          activa?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "bodegas_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
        ];
      };
      bot_mensajes: {
        Row: {
          mensaje_id: string;
          organizacion_id: string | null;
          creado_en: string;
        };
        Insert: {
          mensaje_id: string;
          organizacion_id?: string | null;
          creado_en?: string;
        };
        Update: {
          mensaje_id?: string;
          organizacion_id?: string | null;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bot_mensajes_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
        ];
      };
      bot_pendientes: {
        Row: {
          telefono: string;
          organizacion_id: string;
          usuario_id: string;
          accion: Json;
          expira_en: string;
        };
        Insert: {
          telefono: string;
          organizacion_id: string;
          usuario_id: string;
          accion: Json;
          expira_en?: string;
        };
        Update: {
          telefono?: string;
          organizacion_id?: string;
          usuario_id?: string;
          accion?: Json;
          expira_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bot_pendientes_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bot_pendientes_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      categorias: {
        Row: {
          id: string;
          organizacion_id: string;
          nombre: string;
          padre_id: string | null;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          nombre: string;
          padre_id?: string | null;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          nombre?: string;
          padre_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "categorias_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "categorias_padre_id_fkey";
            columns: ["padre_id"];
            isOneToOne: false;
            referencedRelation: "categorias";
            referencedColumns: ["id"];
          },
        ];
      };
      clientes: {
        Row: {
          id: string;
          organizacion_id: string;
          nombre: string;
          documento: string | null;
          telefono: string | null;
          fecha_nacimiento: string | null;
          cupo_credito: number;
          saldo: number;
          acepta_mensajes: boolean;
          activo: boolean;
          creado_en: string;
          lista_precios_id: string | null;
          direccion: string | null;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          nombre: string;
          documento?: string | null;
          telefono?: string | null;
          fecha_nacimiento?: string | null;
          cupo_credito?: number;
          saldo?: number;
          acepta_mensajes?: boolean;
          activo?: boolean;
          creado_en?: string;
          lista_precios_id?: string | null;
          direccion?: string | null;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          nombre?: string;
          documento?: string | null;
          telefono?: string | null;
          fecha_nacimiento?: string | null;
          cupo_credito?: number;
          saldo?: number;
          acepta_mensajes?: boolean;
          activo?: boolean;
          creado_en?: string;
          lista_precios_id?: string | null;
          direccion?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "clientes_lista_precios_id_fkey";
            columns: ["lista_precios_id"];
            isOneToOne: false;
            referencedRelation: "listas_precios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clientes_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
        ];
      };
      compras: {
        Row: {
          id: string;
          organizacion_id: string;
          proveedor_id: string | null;
          bodega_id: string;
          numero_factura: string | null;
          fecha: string;
          estado: Database["public"]["Enums"]["estado_documento"];
          total: number;
          documento_ia_id: string | null;
          usuario_id: string | null;
          motivo_anulacion: string | null;
          creado_en: string;
          orden_compra_id: string | null;
          condicion_pago: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          proveedor_id?: string | null;
          bodega_id: string;
          numero_factura?: string | null;
          fecha?: string;
          estado?: Database["public"]["Enums"]["estado_documento"];
          total?: number;
          documento_ia_id?: string | null;
          usuario_id?: string | null;
          motivo_anulacion?: string | null;
          creado_en?: string;
          orden_compra_id?: string | null;
          condicion_pago?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          proveedor_id?: string | null;
          bodega_id?: string;
          numero_factura?: string | null;
          fecha?: string;
          estado?: Database["public"]["Enums"]["estado_documento"];
          total?: number;
          documento_ia_id?: string | null;
          usuario_id?: string | null;
          motivo_anulacion?: string | null;
          creado_en?: string;
          orden_compra_id?: string | null;
          condicion_pago?: string;
        };
        Relationships: [
          {
            foreignKeyName: "compras_bodega_id_fkey";
            columns: ["bodega_id"];
            isOneToOne: false;
            referencedRelation: "bodegas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compras_orden_fk";
            columns: ["orden_compra_id"];
            isOneToOne: false;
            referencedRelation: "ordenes_compra";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compras_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compras_proveedor_id_fkey";
            columns: ["proveedor_id"];
            isOneToOne: false;
            referencedRelation: "proveedores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compras_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      compras_detalle: {
        Row: {
          id: string;
          organizacion_id: string;
          compra_id: string;
          producto_id: string;
          presentacion_id: string | null;
          cantidad: number;
          costo_unitario: number;
          subtotal: number | null;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          compra_id: string;
          producto_id: string;
          presentacion_id?: string | null;
          cantidad: number;
          costo_unitario: number;
          subtotal?: never;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          compra_id?: string;
          producto_id?: string;
          presentacion_id?: string | null;
          cantidad?: number;
          costo_unitario?: number;
          subtotal?: never;
        };
        Relationships: [
          {
            foreignKeyName: "compras_detalle_compra_id_fkey";
            columns: ["compra_id"];
            isOneToOne: false;
            referencedRelation: "compras";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compras_detalle_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compras_detalle_presentacion_id_fkey";
            columns: ["presentacion_id"];
            isOneToOne: false;
            referencedRelation: "presentaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compras_detalle_producto_id_fkey";
            columns: ["producto_id"];
            isOneToOne: false;
            referencedRelation: "productos";
            referencedColumns: ["id"];
          },
        ];
      };
      comprobantes: {
        Row: {
          id: string;
          organizacion_id: string;
          imagen_url: string;
          hash_imagen: string | null;
          referencia: string | null;
          entidad: string | null;
          monto_leido: number | null;
          fecha_leida: string | null;
          nombre_leido: string | null;
          confianza: number | null;
          creado_en: string;
          hash_perceptual: unknown | null;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          imagen_url: string;
          hash_imagen?: string | null;
          referencia?: string | null;
          entidad?: string | null;
          monto_leido?: number | null;
          fecha_leida?: string | null;
          nombre_leido?: string | null;
          confianza?: number | null;
          creado_en?: string;
          hash_perceptual?: unknown | null;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          imagen_url?: string;
          hash_imagen?: string | null;
          referencia?: string | null;
          entidad?: string | null;
          monto_leido?: number | null;
          fecha_leida?: string | null;
          nombre_leido?: string | null;
          confianza?: number | null;
          creado_en?: string;
          hash_perceptual?: unknown | null;
        };
        Relationships: [
          {
            foreignKeyName: "comprobantes_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
        ];
      };
      config_comisiones: {
        Row: {
          id: string;
          organizacion_id: string;
          usuario_id: string | null;
          base: string;
          porcentaje: number;
          bono_meta: number;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          usuario_id?: string | null;
          base?: string;
          porcentaje: number;
          bono_meta?: number;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          usuario_id?: string | null;
          base?: string;
          porcentaje?: number;
          bono_meta?: number;
        };
        Relationships: [
          {
            foreignKeyName: "config_comisiones_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: true;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "config_comisiones_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      consecutivos: {
        Row: {
          organizacion_id: string;
          documento: string;
          ultimo: number;
        };
        Insert: {
          organizacion_id: string;
          documento: string;
          ultimo?: number;
        };
        Update: {
          organizacion_id?: string;
          documento?: string;
          ultimo?: number;
        };
        Relationships: [
          {
            foreignKeyName: "consecutivos_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
        ];
      };
      contactos_fidelizacion: {
        Row: {
          id: string;
          organizacion_id: string;
          cliente_id: string;
          tipo: string;
          enviado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          cliente_id: string;
          tipo: string;
          enviado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          cliente_id?: string;
          tipo?: string;
          enviado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contactos_fidelizacion_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contactos_fidelizacion_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
        ];
      };
      conteos: {
        Row: {
          id: string;
          organizacion_id: string;
          bodega_id: string;
          nombre: string;
          categoria_id: string | null;
          estado: string;
          ajustes_aplicados: boolean;
          usuario_id: string | null;
          creado_en: string;
          cerrado_en: string | null;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          bodega_id: string;
          nombre: string;
          categoria_id?: string | null;
          estado?: string;
          ajustes_aplicados?: boolean;
          usuario_id?: string | null;
          creado_en?: string;
          cerrado_en?: string | null;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          bodega_id?: string;
          nombre?: string;
          categoria_id?: string | null;
          estado?: string;
          ajustes_aplicados?: boolean;
          usuario_id?: string | null;
          creado_en?: string;
          cerrado_en?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conteos_bodega_id_fkey";
            columns: ["bodega_id"];
            isOneToOne: false;
            referencedRelation: "bodegas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conteos_categoria_id_fkey";
            columns: ["categoria_id"];
            isOneToOne: false;
            referencedRelation: "categorias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conteos_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conteos_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      conteos_detalle: {
        Row: {
          id: string;
          organizacion_id: string;
          conteo_id: string;
          producto_id: string;
          cantidad_contada: number | null;
          cantidad_sistema: number | null;
          costo_unitario: number | null;
          contado_por: string | null;
          contado_en: string | null;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          conteo_id: string;
          producto_id: string;
          cantidad_contada?: number | null;
          cantidad_sistema?: number | null;
          costo_unitario?: number | null;
          contado_por?: string | null;
          contado_en?: string | null;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          conteo_id?: string;
          producto_id?: string;
          cantidad_contada?: number | null;
          cantidad_sistema?: number | null;
          costo_unitario?: number | null;
          contado_por?: string | null;
          contado_en?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conteos_detalle_contado_por_fkey";
            columns: ["contado_por"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conteos_detalle_conteo_id_fkey";
            columns: ["conteo_id"];
            isOneToOne: false;
            referencedRelation: "conteos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conteos_detalle_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conteos_detalle_producto_id_fkey";
            columns: ["producto_id"];
            isOneToOne: false;
            referencedRelation: "productos";
            referencedColumns: ["id"];
          },
        ];
      };
      cotizaciones: {
        Row: {
          id: string;
          organizacion_id: string;
          cliente_id: string | null;
          numero: number | null;
          estado: string;
          vigencia_hasta: string;
          nota: string | null;
          venta_id: string | null;
          usuario_id: string | null;
          creado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          cliente_id?: string | null;
          numero?: number | null;
          estado?: string;
          vigencia_hasta: string;
          nota?: string | null;
          venta_id?: string | null;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          cliente_id?: string | null;
          numero?: number | null;
          estado?: string;
          vigencia_hasta?: string;
          nota?: string | null;
          venta_id?: string | null;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cotizaciones_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cotizaciones_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cotizaciones_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cotizaciones_venta_id_fkey";
            columns: ["venta_id"];
            isOneToOne: false;
            referencedRelation: "ventas";
            referencedColumns: ["id"];
          },
        ];
      };
      cotizaciones_detalle: {
        Row: {
          id: string;
          organizacion_id: string;
          cotizacion_id: string;
          producto_id: string;
          presentacion_id: string | null;
          cantidad: number;
          precio_unitario: number;
          descuento: number;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          cotizacion_id: string;
          producto_id: string;
          presentacion_id?: string | null;
          cantidad: number;
          precio_unitario: number;
          descuento?: number;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          cotizacion_id?: string;
          producto_id?: string;
          presentacion_id?: string | null;
          cantidad?: number;
          precio_unitario?: number;
          descuento?: number;
        };
        Relationships: [
          {
            foreignKeyName: "cotizaciones_detalle_cotizacion_id_fkey";
            columns: ["cotizacion_id"];
            isOneToOne: false;
            referencedRelation: "cotizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cotizaciones_detalle_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cotizaciones_detalle_presentacion_id_fkey";
            columns: ["presentacion_id"];
            isOneToOne: false;
            referencedRelation: "presentaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cotizaciones_detalle_producto_id_fkey";
            columns: ["producto_id"];
            isOneToOne: false;
            referencedRelation: "productos";
            referencedColumns: ["id"];
          },
        ];
      };
      cuentas_por_pagar: {
        Row: {
          id: string;
          organizacion_id: string;
          proveedor_id: string;
          compra_id: string;
          monto: number;
          saldo: number;
          vence: string;
          estado: string;
          creado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          proveedor_id: string;
          compra_id: string;
          monto: number;
          saldo: number;
          vence: string;
          estado?: string;
          creado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          proveedor_id?: string;
          compra_id?: string;
          monto?: number;
          saldo?: number;
          vence?: string;
          estado?: string;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cuentas_por_pagar_compra_id_fkey";
            columns: ["compra_id"];
            isOneToOne: true;
            referencedRelation: "compras";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cuentas_por_pagar_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cuentas_por_pagar_proveedor_id_fkey";
            columns: ["proveedor_id"];
            isOneToOne: false;
            referencedRelation: "proveedores";
            referencedColumns: ["id"];
          },
        ];
      };
      devoluciones_cliente: {
        Row: {
          id: string;
          organizacion_id: string;
          venta_id: string;
          turno_id: string | null;
          numero: number | null;
          motivo: string;
          total: number;
          costo_total: number;
          reembolso: string;
          usuario_id: string | null;
          creado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          venta_id: string;
          turno_id?: string | null;
          numero?: number | null;
          motivo: string;
          total?: number;
          costo_total?: number;
          reembolso: string;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          venta_id?: string;
          turno_id?: string | null;
          numero?: number | null;
          motivo?: string;
          total?: number;
          costo_total?: number;
          reembolso?: string;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "devoluciones_cliente_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "devoluciones_cliente_turno_id_fkey";
            columns: ["turno_id"];
            isOneToOne: false;
            referencedRelation: "turnos_caja";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "devoluciones_cliente_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "devoluciones_cliente_venta_id_fkey";
            columns: ["venta_id"];
            isOneToOne: false;
            referencedRelation: "ventas";
            referencedColumns: ["id"];
          },
        ];
      };
      devoluciones_cliente_detalle: {
        Row: {
          id: string;
          organizacion_id: string;
          devolucion_id: string;
          venta_detalle_id: string;
          producto_id: string;
          cantidad: number;
          valor: number;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          devolucion_id: string;
          venta_detalle_id: string;
          producto_id: string;
          cantidad: number;
          valor: number;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          devolucion_id?: string;
          venta_detalle_id?: string;
          producto_id?: string;
          cantidad?: number;
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "devoluciones_cliente_detalle_devolucion_id_fkey";
            columns: ["devolucion_id"];
            isOneToOne: false;
            referencedRelation: "devoluciones_cliente";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "devoluciones_cliente_detalle_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "devoluciones_cliente_detalle_producto_id_fkey";
            columns: ["producto_id"];
            isOneToOne: false;
            referencedRelation: "productos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "devoluciones_cliente_detalle_venta_detalle_id_fkey";
            columns: ["venta_detalle_id"];
            isOneToOne: false;
            referencedRelation: "ventas_detalle";
            referencedColumns: ["id"];
          },
        ];
      };
      devoluciones_proveedor: {
        Row: {
          id: string;
          organizacion_id: string;
          proveedor_id: string;
          bodega_id: string;
          compra_id: string | null;
          numero: number | null;
          motivo: string;
          total: number;
          usuario_id: string | null;
          creado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          proveedor_id: string;
          bodega_id: string;
          compra_id?: string | null;
          numero?: number | null;
          motivo: string;
          total?: number;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          proveedor_id?: string;
          bodega_id?: string;
          compra_id?: string | null;
          numero?: number | null;
          motivo?: string;
          total?: number;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "devoluciones_proveedor_bodega_id_fkey";
            columns: ["bodega_id"];
            isOneToOne: false;
            referencedRelation: "bodegas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "devoluciones_proveedor_compra_id_fkey";
            columns: ["compra_id"];
            isOneToOne: false;
            referencedRelation: "compras";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "devoluciones_proveedor_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "devoluciones_proveedor_proveedor_id_fkey";
            columns: ["proveedor_id"];
            isOneToOne: false;
            referencedRelation: "proveedores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "devoluciones_proveedor_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      devoluciones_proveedor_detalle: {
        Row: {
          id: string;
          organizacion_id: string;
          devolucion_id: string;
          producto_id: string;
          cantidad: number;
          costo_unitario: number;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          devolucion_id: string;
          producto_id: string;
          cantidad: number;
          costo_unitario: number;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          devolucion_id?: string;
          producto_id?: string;
          cantidad?: number;
          costo_unitario?: number;
        };
        Relationships: [
          {
            foreignKeyName: "devoluciones_proveedor_detalle_devolucion_id_fkey";
            columns: ["devolucion_id"];
            isOneToOne: false;
            referencedRelation: "devoluciones_proveedor";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "devoluciones_proveedor_detalle_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "devoluciones_proveedor_detalle_producto_id_fkey";
            columns: ["producto_id"];
            isOneToOne: false;
            referencedRelation: "productos";
            referencedColumns: ["id"];
          },
        ];
      };
      documentos_ia: {
        Row: {
          id: string;
          organizacion_id: string;
          tipo: string;
          archivo_url: string | null;
          resultado: Json | null;
          confianza: number | null;
          estado: string;
          usuario_id: string | null;
          creado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          tipo: string;
          archivo_url?: string | null;
          resultado?: Json | null;
          confianza?: number | null;
          estado?: string;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          tipo?: string;
          archivo_url?: string | null;
          resultado?: Json | null;
          confianza?: number | null;
          estado?: string;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "documentos_ia_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documentos_ia_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      eventos_outbox: {
        Row: {
          id: number;
          organizacion_id: string;
          tipo: string;
          payload: Json;
          intentos: number;
          procesado_en: string | null;
          creado_en: string;
          error: string | null;
          bloqueado_hasta: string | null;
        };
        Insert: {
          id?: never;
          organizacion_id: string;
          tipo: string;
          payload?: Json;
          intentos?: number;
          procesado_en?: string | null;
          creado_en?: string;
          error?: string | null;
          bloqueado_hasta?: string | null;
        };
        Update: {
          id?: never;
          organizacion_id?: string;
          tipo?: string;
          payload?: Json;
          intentos?: number;
          procesado_en?: string | null;
          creado_en?: string;
          error?: string | null;
          bloqueado_hasta?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "eventos_outbox_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
        ];
      };
      existencias: {
        Row: {
          organizacion_id: string;
          producto_id: string;
          bodega_id: string;
          cantidad: number;
          costo_promedio: number;
          actualizado_en: string;
        };
        Insert: {
          organizacion_id: string;
          producto_id: string;
          bodega_id: string;
          cantidad?: number;
          costo_promedio?: number;
          actualizado_en?: string;
        };
        Update: {
          organizacion_id?: string;
          producto_id?: string;
          bodega_id?: string;
          cantidad?: number;
          costo_promedio?: number;
          actualizado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "existencias_bodega_id_fkey";
            columns: ["bodega_id"];
            isOneToOne: false;
            referencedRelation: "bodegas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "existencias_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "existencias_producto_id_fkey";
            columns: ["producto_id"];
            isOneToOne: false;
            referencedRelation: "productos";
            referencedColumns: ["id"];
          },
        ];
      };
      gastos: {
        Row: {
          id: string;
          organizacion_id: string;
          turno_id: string | null;
          categoria: string;
          descripcion: string;
          monto: number;
          metodo: Database["public"]["Enums"]["metodo_pago"];
          soporte_url: string | null;
          fecha: string;
          estado: string;
          motivo_anulacion: string | null;
          usuario_id: string | null;
          creado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          turno_id?: string | null;
          categoria: string;
          descripcion: string;
          monto: number;
          metodo?: Database["public"]["Enums"]["metodo_pago"];
          soporte_url?: string | null;
          fecha?: string;
          estado?: string;
          motivo_anulacion?: string | null;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          turno_id?: string | null;
          categoria?: string;
          descripcion?: string;
          monto?: number;
          metodo?: Database["public"]["Enums"]["metodo_pago"];
          soporte_url?: string | null;
          fecha?: string;
          estado?: string;
          motivo_anulacion?: string | null;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "gastos_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gastos_turno_id_fkey";
            columns: ["turno_id"];
            isOneToOne: false;
            referencedRelation: "turnos_caja";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gastos_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      historial_precios: {
        Row: {
          id: number;
          organizacion_id: string;
          producto_id: string;
          precio_anterior: number;
          precio_nuevo: number;
          motivo: string;
          usuario_id: string | null;
          creado_en: string;
        };
        Insert: {
          id?: never;
          organizacion_id: string;
          producto_id: string;
          precio_anterior: number;
          precio_nuevo: number;
          motivo: string;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Update: {
          id?: never;
          organizacion_id?: string;
          producto_id?: string;
          precio_anterior?: number;
          precio_nuevo?: number;
          motivo?: string;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "historial_precios_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "historial_precios_producto_id_fkey";
            columns: ["producto_id"];
            isOneToOne: false;
            referencedRelation: "productos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "historial_precios_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      invitaciones: {
        Row: {
          id: string;
          organizacion_id: string;
          correo: string;
          rol: Database["public"]["Enums"]["rol_miembro"];
          nombre: string | null;
          token: string;
          creado_por: string | null;
          expira_en: string;
          aceptada_en: string | null;
          creado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          correo: string;
          rol: Database["public"]["Enums"]["rol_miembro"];
          nombre?: string | null;
          token?: string;
          creado_por?: string | null;
          expira_en?: string;
          aceptada_en?: string | null;
          creado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          correo?: string;
          rol?: Database["public"]["Enums"]["rol_miembro"];
          nombre?: string | null;
          token?: string;
          creado_por?: string | null;
          expira_en?: string;
          aceptada_en?: string | null;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invitaciones_creado_por_fkey";
            columns: ["creado_por"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitaciones_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
        ];
      };
      listas_precios: {
        Row: {
          id: string;
          organizacion_id: string;
          nombre: string;
          descripcion: string | null;
          activa: boolean;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          nombre: string;
          descripcion?: string | null;
          activa?: boolean;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          nombre?: string;
          descripcion?: string | null;
          activa?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "listas_precios_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
        ];
      };
      lotes: {
        Row: {
          id: string;
          organizacion_id: string;
          producto_id: string;
          bodega_id: string;
          codigo: string;
          vence: string | null;
          cantidad: number;
          compra_id: string | null;
          usuario_id: string | null;
          creado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          producto_id: string;
          bodega_id: string;
          codigo: string;
          vence?: string | null;
          cantidad: number;
          compra_id?: string | null;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          producto_id?: string;
          bodega_id?: string;
          codigo?: string;
          vence?: string | null;
          cantidad?: number;
          compra_id?: string | null;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lotes_bodega_id_fkey";
            columns: ["bodega_id"];
            isOneToOne: false;
            referencedRelation: "bodegas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lotes_compra_id_fkey";
            columns: ["compra_id"];
            isOneToOne: false;
            referencedRelation: "compras";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lotes_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lotes_producto_id_fkey";
            columns: ["producto_id"];
            isOneToOne: false;
            referencedRelation: "productos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lotes_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      metas_vendedor: {
        Row: {
          id: string;
          organizacion_id: string;
          usuario_id: string;
          mes: string;
          meta_ventas: number;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          usuario_id: string;
          mes: string;
          meta_ventas: number;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          usuario_id?: string;
          mes?: string;
          meta_ventas?: number;
        };
        Relationships: [
          {
            foreignKeyName: "metas_vendedor_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "metas_vendedor_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      miembros: {
        Row: {
          organizacion_id: string;
          usuario_id: string;
          rol: Database["public"]["Enums"]["rol_miembro"];
          nombre: string;
          telefono: string | null;
          activo: boolean;
          creado_en: string;
        };
        Insert: {
          organizacion_id: string;
          usuario_id: string;
          rol: Database["public"]["Enums"]["rol_miembro"];
          nombre: string;
          telefono?: string | null;
          activo?: boolean;
          creado_en?: string;
        };
        Update: {
          organizacion_id?: string;
          usuario_id?: string;
          rol?: Database["public"]["Enums"]["rol_miembro"];
          nombre?: string;
          telefono?: string | null;
          activo?: boolean;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "miembros_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "miembros_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      movimientos_caja: {
        Row: {
          id: string;
          organizacion_id: string;
          turno_id: string;
          tipo: string;
          monto: number;
          motivo: string;
          usuario_id: string | null;
          creado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          turno_id: string;
          tipo: string;
          monto: number;
          motivo: string;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          turno_id?: string;
          tipo?: string;
          monto?: number;
          motivo?: string;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "movimientos_caja_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "movimientos_caja_turno_id_fkey";
            columns: ["turno_id"];
            isOneToOne: false;
            referencedRelation: "turnos_caja";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "movimientos_caja_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      movimientos_inventario: {
        Row: {
          id: number;
          organizacion_id: string;
          producto_id: string;
          bodega_id: string;
          tipo: Database["public"]["Enums"]["tipo_movimiento"];
          cantidad: number;
          costo_unitario: number;
          saldo_cantidad: number | null;
          saldo_costo_promedio: number | null;
          documento_tipo: string | null;
          documento_id: string | null;
          motivo: string | null;
          usuario_id: string | null;
          offline_id: string | null;
          creado_en: string;
        };
        Insert: {
          id?: never;
          organizacion_id: string;
          producto_id: string;
          bodega_id: string;
          tipo: Database["public"]["Enums"]["tipo_movimiento"];
          cantidad: number;
          costo_unitario?: number;
          saldo_cantidad?: number | null;
          saldo_costo_promedio?: number | null;
          documento_tipo?: string | null;
          documento_id?: string | null;
          motivo?: string | null;
          usuario_id?: string | null;
          offline_id?: string | null;
          creado_en?: string;
        };
        Update: {
          id?: never;
          organizacion_id?: string;
          producto_id?: string;
          bodega_id?: string;
          tipo?: Database["public"]["Enums"]["tipo_movimiento"];
          cantidad?: number;
          costo_unitario?: number;
          saldo_cantidad?: number | null;
          saldo_costo_promedio?: number | null;
          documento_tipo?: string | null;
          documento_id?: string | null;
          motivo?: string | null;
          usuario_id?: string | null;
          offline_id?: string | null;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "movimientos_inventario_bodega_id_fkey";
            columns: ["bodega_id"];
            isOneToOne: false;
            referencedRelation: "bodegas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "movimientos_inventario_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey";
            columns: ["producto_id"];
            isOneToOne: false;
            referencedRelation: "productos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "movimientos_inventario_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      ordenes_compra: {
        Row: {
          id: string;
          organizacion_id: string;
          proveedor_id: string;
          bodega_id: string;
          numero: number | null;
          estado: string;
          fecha_esperada: string | null;
          nota: string | null;
          usuario_id: string | null;
          creado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          proveedor_id: string;
          bodega_id: string;
          numero?: number | null;
          estado?: string;
          fecha_esperada?: string | null;
          nota?: string | null;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          proveedor_id?: string;
          bodega_id?: string;
          numero?: number | null;
          estado?: string;
          fecha_esperada?: string | null;
          nota?: string | null;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ordenes_compra_bodega_id_fkey";
            columns: ["bodega_id"];
            isOneToOne: false;
            referencedRelation: "bodegas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ordenes_compra_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ordenes_compra_proveedor_id_fkey";
            columns: ["proveedor_id"];
            isOneToOne: false;
            referencedRelation: "proveedores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ordenes_compra_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      ordenes_compra_detalle: {
        Row: {
          id: string;
          organizacion_id: string;
          orden_id: string;
          producto_id: string;
          presentacion_id: string | null;
          cantidad_pedida: number;
          cantidad_recibida: number;
          costo_unitario: number;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          orden_id: string;
          producto_id: string;
          presentacion_id?: string | null;
          cantidad_pedida: number;
          cantidad_recibida?: number;
          costo_unitario: number;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          orden_id?: string;
          producto_id?: string;
          presentacion_id?: string | null;
          cantidad_pedida?: number;
          cantidad_recibida?: number;
          costo_unitario?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ordenes_compra_detalle_orden_id_fkey";
            columns: ["orden_id"];
            isOneToOne: false;
            referencedRelation: "ordenes_compra";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ordenes_compra_detalle_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ordenes_compra_detalle_presentacion_id_fkey";
            columns: ["presentacion_id"];
            isOneToOne: false;
            referencedRelation: "presentaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ordenes_compra_detalle_producto_id_fkey";
            columns: ["producto_id"];
            isOneToOne: false;
            referencedRelation: "productos";
            referencedColumns: ["id"];
          },
        ];
      };
      organizaciones: {
        Row: {
          id: string;
          nombre: string;
          nit: string | null;
          nicho: string;
          telefono_whatsapp: string | null;
          ciudad: string | null;
          permite_stock_negativo: boolean;
          umbral_ajuste_alerta: number;
          plan: string;
          creado_en: string;
          dias_credito: number;
          whatsapp_phone_number_id: string | null;
          precios_automaticos: boolean;
          fidelizacion_activa: boolean;
          pesos_por_punto: number;
          valor_punto: number;
          puntos_cumpleanos: number;
          catalogo_activo: boolean;
          catalogo_slug: string | null;
          catalogo_telefono: string | null;
          catalogo_mensaje: string | null;
        };
        Insert: {
          id?: string;
          nombre: string;
          nit?: string | null;
          nicho?: string;
          telefono_whatsapp?: string | null;
          ciudad?: string | null;
          permite_stock_negativo?: boolean;
          umbral_ajuste_alerta?: number;
          plan?: string;
          creado_en?: string;
          dias_credito?: number;
          whatsapp_phone_number_id?: string | null;
          precios_automaticos?: boolean;
          fidelizacion_activa?: boolean;
          pesos_por_punto?: number;
          valor_punto?: number;
          puntos_cumpleanos?: number;
          catalogo_activo?: boolean;
          catalogo_slug?: string | null;
          catalogo_telefono?: string | null;
          catalogo_mensaje?: string | null;
        };
        Update: {
          id?: string;
          nombre?: string;
          nit?: string | null;
          nicho?: string;
          telefono_whatsapp?: string | null;
          ciudad?: string | null;
          permite_stock_negativo?: boolean;
          umbral_ajuste_alerta?: number;
          plan?: string;
          creado_en?: string;
          dias_credito?: number;
          whatsapp_phone_number_id?: string | null;
          precios_automaticos?: boolean;
          fidelizacion_activa?: boolean;
          pesos_por_punto?: number;
          valor_punto?: number;
          puntos_cumpleanos?: number;
          catalogo_activo?: boolean;
          catalogo_slug?: string | null;
          catalogo_telefono?: string | null;
          catalogo_mensaje?: string | null;
        };
        Relationships: [];
      };
      pagos_proveedor: {
        Row: {
          id: string;
          organizacion_id: string;
          cxp_id: string;
          monto: number;
          metodo: Database["public"]["Enums"]["metodo_pago"];
          referencia: string | null;
          tipo: string;
          usuario_id: string | null;
          creado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          cxp_id: string;
          monto: number;
          metodo: Database["public"]["Enums"]["metodo_pago"];
          referencia?: string | null;
          tipo?: string;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          cxp_id?: string;
          monto?: number;
          metodo?: Database["public"]["Enums"]["metodo_pago"];
          referencia?: string | null;
          tipo?: string;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pagos_proveedor_cxp_id_fkey";
            columns: ["cxp_id"];
            isOneToOne: false;
            referencedRelation: "cuentas_por_pagar";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pagos_proveedor_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pagos_proveedor_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      pagos_venta: {
        Row: {
          id: string;
          organizacion_id: string;
          venta_id: string;
          metodo: Database["public"]["Enums"]["metodo_pago"];
          monto: number;
          comprobante_id: string | null;
          verificacion: Database["public"]["Enums"]["estado_verificacion"];
          creado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          venta_id: string;
          metodo: Database["public"]["Enums"]["metodo_pago"];
          monto: number;
          comprobante_id?: string | null;
          verificacion?: Database["public"]["Enums"]["estado_verificacion"];
          creado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          venta_id?: string;
          metodo?: Database["public"]["Enums"]["metodo_pago"];
          monto?: number;
          comprobante_id?: string | null;
          verificacion?: Database["public"]["Enums"]["estado_verificacion"];
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pagos_venta_comprobante_id_fkey";
            columns: ["comprobante_id"];
            isOneToOne: false;
            referencedRelation: "comprobantes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pagos_venta_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pagos_venta_venta_id_fkey";
            columns: ["venta_id"];
            isOneToOne: false;
            referencedRelation: "ventas";
            referencedColumns: ["id"];
          },
        ];
      };
      pedidos_whatsapp: {
        Row: {
          id: string;
          organizacion_id: string;
          mensaje_id: string;
          telefono: string;
          cliente_id: string | null;
          texto: string;
          lineas: Json;
          no_encontrados: Json;
          estado: string;
          venta_id: string | null;
          motivo: string | null;
          creado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          mensaje_id: string;
          telefono: string;
          cliente_id?: string | null;
          texto: string;
          lineas?: Json;
          no_encontrados?: Json;
          estado?: string;
          venta_id?: string | null;
          motivo?: string | null;
          creado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          mensaje_id?: string;
          telefono?: string;
          cliente_id?: string | null;
          texto?: string;
          lineas?: Json;
          no_encontrados?: Json;
          estado?: string;
          venta_id?: string | null;
          motivo?: string | null;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pedidos_whatsapp_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pedidos_whatsapp_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pedidos_whatsapp_venta_id_fkey";
            columns: ["venta_id"];
            isOneToOne: false;
            referencedRelation: "ventas";
            referencedColumns: ["id"];
          },
        ];
      };
      precios_lista: {
        Row: {
          id: string;
          organizacion_id: string;
          lista_id: string;
          producto_id: string;
          presentacion_id: string | null;
          precio: number;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          lista_id: string;
          producto_id: string;
          presentacion_id?: string | null;
          precio: number;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          lista_id?: string;
          producto_id?: string;
          presentacion_id?: string | null;
          precio?: number;
        };
        Relationships: [
          {
            foreignKeyName: "precios_lista_lista_id_fkey";
            columns: ["lista_id"];
            isOneToOne: false;
            referencedRelation: "listas_precios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "precios_lista_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "precios_lista_presentacion_id_fkey";
            columns: ["presentacion_id"];
            isOneToOne: false;
            referencedRelation: "presentaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "precios_lista_producto_id_fkey";
            columns: ["producto_id"];
            isOneToOne: false;
            referencedRelation: "productos";
            referencedColumns: ["id"];
          },
        ];
      };
      precios_proveedor: {
        Row: {
          id: number;
          organizacion_id: string;
          proveedor_id: string;
          producto_id: string;
          costo_unitario_base: number;
          compra_id: string | null;
          fecha: string;
        };
        Insert: {
          id?: never;
          organizacion_id: string;
          proveedor_id: string;
          producto_id: string;
          costo_unitario_base: number;
          compra_id?: string | null;
          fecha: string;
        };
        Update: {
          id?: never;
          organizacion_id?: string;
          proveedor_id?: string;
          producto_id?: string;
          costo_unitario_base?: number;
          compra_id?: string | null;
          fecha?: string;
        };
        Relationships: [
          {
            foreignKeyName: "precios_proveedor_compra_id_fkey";
            columns: ["compra_id"];
            isOneToOne: false;
            referencedRelation: "compras";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "precios_proveedor_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "precios_proveedor_producto_id_fkey";
            columns: ["producto_id"];
            isOneToOne: false;
            referencedRelation: "productos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "precios_proveedor_proveedor_id_fkey";
            columns: ["proveedor_id"];
            isOneToOne: false;
            referencedRelation: "proveedores";
            referencedColumns: ["id"];
          },
        ];
      };
      presentaciones: {
        Row: {
          id: string;
          organizacion_id: string;
          producto_id: string;
          nombre: string;
          factor: number;
          codigo_barras: string | null;
          precio_venta: number;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          producto_id: string;
          nombre: string;
          factor: number;
          codigo_barras?: string | null;
          precio_venta: number;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          producto_id?: string;
          nombre?: string;
          factor?: number;
          codigo_barras?: string | null;
          precio_venta?: number;
        };
        Relationships: [
          {
            foreignKeyName: "presentaciones_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "presentaciones_producto_id_fkey";
            columns: ["producto_id"];
            isOneToOne: false;
            referencedRelation: "productos";
            referencedColumns: ["id"];
          },
        ];
      };
      productos: {
        Row: {
          id: string;
          organizacion_id: string;
          categoria_id: string | null;
          sku: string | null;
          codigo_barras: string | null;
          nombre: string;
          descripcion: string | null;
          unidad_base: string;
          precio_venta: number;
          margen_objetivo: number | null;
          stock_minimo: number;
          maneja_inventario: boolean;
          foto_url: string | null;
          activo: boolean;
          creado_en: string;
          variante_de: string | null;
          atributos: Json | null;
          maneja_lotes: boolean;
          maneja_seriales: boolean;
          garantia_dias: number | null;
          en_catalogo: boolean;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          categoria_id?: string | null;
          sku?: string | null;
          codigo_barras?: string | null;
          nombre: string;
          descripcion?: string | null;
          unidad_base?: string;
          precio_venta?: number;
          margen_objetivo?: number | null;
          stock_minimo?: number;
          maneja_inventario?: boolean;
          foto_url?: string | null;
          activo?: boolean;
          creado_en?: string;
          variante_de?: string | null;
          atributos?: Json | null;
          maneja_lotes?: boolean;
          maneja_seriales?: boolean;
          garantia_dias?: number | null;
          en_catalogo?: boolean;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          categoria_id?: string | null;
          sku?: string | null;
          codigo_barras?: string | null;
          nombre?: string;
          descripcion?: string | null;
          unidad_base?: string;
          precio_venta?: number;
          margen_objetivo?: number | null;
          stock_minimo?: number;
          maneja_inventario?: boolean;
          foto_url?: string | null;
          activo?: boolean;
          creado_en?: string;
          variante_de?: string | null;
          atributos?: Json | null;
          maneja_lotes?: boolean;
          maneja_seriales?: boolean;
          garantia_dias?: number | null;
          en_catalogo?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "productos_categoria_id_fkey";
            columns: ["categoria_id"];
            isOneToOne: false;
            referencedRelation: "categorias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "productos_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "productos_variante_de_fkey";
            columns: ["variante_de"];
            isOneToOne: false;
            referencedRelation: "productos";
            referencedColumns: ["id"];
          },
        ];
      };
      promociones: {
        Row: {
          id: string;
          organizacion_id: string;
          nombre: string;
          desde: string;
          hasta: string;
          activa: boolean;
          usuario_id: string | null;
          creado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          nombre: string;
          desde: string;
          hasta: string;
          activa?: boolean;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          nombre?: string;
          desde?: string;
          hasta?: string;
          activa?: boolean;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "promociones_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "promociones_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      promociones_productos: {
        Row: {
          id: string;
          organizacion_id: string;
          promocion_id: string;
          producto_id: string;
          precio_normal: number;
          precio_promocional: number;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          promocion_id: string;
          producto_id: string;
          precio_normal: number;
          precio_promocional: number;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          promocion_id?: string;
          producto_id?: string;
          precio_normal?: number;
          precio_promocional?: number;
        };
        Relationships: [
          {
            foreignKeyName: "promociones_productos_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "promociones_productos_producto_id_fkey";
            columns: ["producto_id"];
            isOneToOne: false;
            referencedRelation: "productos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "promociones_productos_promocion_id_fkey";
            columns: ["promocion_id"];
            isOneToOne: false;
            referencedRelation: "promociones";
            referencedColumns: ["id"];
          },
        ];
      };
      proveedores: {
        Row: {
          id: string;
          organizacion_id: string;
          nombre: string;
          nit: string | null;
          telefono: string | null;
          contacto: string | null;
          activo: boolean;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          nombre: string;
          nit?: string | null;
          telefono?: string | null;
          contacto?: string | null;
          activo?: boolean;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          nombre?: string;
          nit?: string | null;
          telefono?: string | null;
          contacto?: string | null;
          activo?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "proveedores_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
        ];
      };
      puntos_movimientos: {
        Row: {
          id: string;
          organizacion_id: string;
          cliente_id: string;
          puntos: number;
          motivo: string;
          venta_id: string | null;
          usuario_id: string | null;
          creado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          cliente_id: string;
          puntos: number;
          motivo: string;
          venta_id?: string | null;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          cliente_id?: string;
          puntos?: number;
          motivo?: string;
          venta_id?: string | null;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "puntos_movimientos_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "puntos_movimientos_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "puntos_movimientos_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "puntos_movimientos_venta_id_fkey";
            columns: ["venta_id"];
            isOneToOne: false;
            referencedRelation: "ventas";
            referencedColumns: ["id"];
          },
        ];
      };
      recordatorios_cobro: {
        Row: {
          id: string;
          organizacion_id: string;
          cliente_id: string;
          nivel: number;
          saldo: number;
          enviado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          cliente_id: string;
          nivel: number;
          saldo: number;
          enviado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          cliente_id?: string;
          nivel?: number;
          saldo?: number;
          enviado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recordatorios_cobro_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recordatorios_cobro_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
        ];
      };
      ruta_clientes: {
        Row: {
          id: string;
          organizacion_id: string;
          usuario_id: string;
          cliente_id: string;
          dia_semana: number;
          orden: number;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          usuario_id: string;
          cliente_id: string;
          dia_semana: number;
          orden: number;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          usuario_id?: string;
          cliente_id?: string;
          dia_semana?: number;
          orden?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ruta_clientes_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ruta_clientes_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ruta_clientes_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      salud_historial: {
        Row: {
          id: string;
          organizacion_id: string;
          fecha: string;
          metricas: Json;
          creado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          fecha: string;
          metricas: Json;
          creado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          fecha?: string;
          metricas?: Json;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "salud_historial_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
        ];
      };
      separados: {
        Row: {
          id: string;
          organizacion_id: string;
          cliente_id: string;
          bodega_id: string;
          numero: number | null;
          estado: string;
          total: number;
          abonado: number;
          fecha_limite: string | null;
          nota: string | null;
          venta_id: string | null;
          motivo_cancelacion: string | null;
          usuario_id: string | null;
          creado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          cliente_id: string;
          bodega_id: string;
          numero?: number | null;
          estado?: string;
          total?: number;
          abonado?: number;
          fecha_limite?: string | null;
          nota?: string | null;
          venta_id?: string | null;
          motivo_cancelacion?: string | null;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          cliente_id?: string;
          bodega_id?: string;
          numero?: number | null;
          estado?: string;
          total?: number;
          abonado?: number;
          fecha_limite?: string | null;
          nota?: string | null;
          venta_id?: string | null;
          motivo_cancelacion?: string | null;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "separados_bodega_id_fkey";
            columns: ["bodega_id"];
            isOneToOne: false;
            referencedRelation: "bodegas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "separados_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "separados_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "separados_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "separados_venta_id_fkey";
            columns: ["venta_id"];
            isOneToOne: false;
            referencedRelation: "ventas";
            referencedColumns: ["id"];
          },
        ];
      };
      separados_detalle: {
        Row: {
          id: string;
          organizacion_id: string;
          separado_id: string;
          producto_id: string;
          presentacion_id: string | null;
          cantidad: number;
          precio_unitario: number;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          separado_id: string;
          producto_id: string;
          presentacion_id?: string | null;
          cantidad: number;
          precio_unitario: number;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          separado_id?: string;
          producto_id?: string;
          presentacion_id?: string | null;
          cantidad?: number;
          precio_unitario?: number;
        };
        Relationships: [
          {
            foreignKeyName: "separados_detalle_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "separados_detalle_presentacion_id_fkey";
            columns: ["presentacion_id"];
            isOneToOne: false;
            referencedRelation: "presentaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "separados_detalle_producto_id_fkey";
            columns: ["producto_id"];
            isOneToOne: false;
            referencedRelation: "productos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "separados_detalle_separado_id_fkey";
            columns: ["separado_id"];
            isOneToOne: false;
            referencedRelation: "separados";
            referencedColumns: ["id"];
          },
        ];
      };
      seriales: {
        Row: {
          id: string;
          organizacion_id: string;
          producto_id: string;
          bodega_id: string;
          serial: string;
          estado: string;
          compra_id: string | null;
          venta_id: string | null;
          vendido_en: string | null;
          garantia_hasta: string | null;
          creado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          producto_id: string;
          bodega_id: string;
          serial: string;
          estado?: string;
          compra_id?: string | null;
          venta_id?: string | null;
          vendido_en?: string | null;
          garantia_hasta?: string | null;
          creado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          producto_id?: string;
          bodega_id?: string;
          serial?: string;
          estado?: string;
          compra_id?: string | null;
          venta_id?: string | null;
          vendido_en?: string | null;
          garantia_hasta?: string | null;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seriales_bodega_id_fkey";
            columns: ["bodega_id"];
            isOneToOne: false;
            referencedRelation: "bodegas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seriales_compra_id_fkey";
            columns: ["compra_id"];
            isOneToOne: false;
            referencedRelation: "compras";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seriales_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seriales_producto_id_fkey";
            columns: ["producto_id"];
            isOneToOne: false;
            referencedRelation: "productos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seriales_venta_id_fkey";
            columns: ["venta_id"];
            isOneToOne: false;
            referencedRelation: "ventas";
            referencedColumns: ["id"];
          },
        ];
      };
      temporadas: {
        Row: {
          id: string;
          organizacion_id: string;
          nombre: string;
          mes_inicio: number;
          dia_inicio: number;
          mes_fin: number;
          dia_fin: number;
          factor: number;
          categoria_id: string | null;
          activa: boolean;
          creado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          nombre: string;
          mes_inicio: number;
          dia_inicio: number;
          mes_fin: number;
          dia_fin: number;
          factor: number;
          categoria_id?: string | null;
          activa?: boolean;
          creado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          nombre?: string;
          mes_inicio?: number;
          dia_inicio?: number;
          mes_fin?: number;
          dia_fin?: number;
          factor?: number;
          categoria_id?: string | null;
          activa?: boolean;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "temporadas_categoria_id_fkey";
            columns: ["categoria_id"];
            isOneToOne: false;
            referencedRelation: "categorias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "temporadas_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
        ];
      };
      traslados: {
        Row: {
          id: string;
          organizacion_id: string;
          bodega_origen_id: string;
          bodega_destino_id: string;
          numero: number | null;
          nota: string | null;
          estado: string;
          motivo_anulacion: string | null;
          usuario_id: string | null;
          creado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          bodega_origen_id: string;
          bodega_destino_id: string;
          numero?: number | null;
          nota?: string | null;
          estado?: string;
          motivo_anulacion?: string | null;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          bodega_origen_id?: string;
          bodega_destino_id?: string;
          numero?: number | null;
          nota?: string | null;
          estado?: string;
          motivo_anulacion?: string | null;
          usuario_id?: string | null;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "traslados_bodega_destino_id_fkey";
            columns: ["bodega_destino_id"];
            isOneToOne: false;
            referencedRelation: "bodegas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "traslados_bodega_origen_id_fkey";
            columns: ["bodega_origen_id"];
            isOneToOne: false;
            referencedRelation: "bodegas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "traslados_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "traslados_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      traslados_detalle: {
        Row: {
          id: string;
          organizacion_id: string;
          traslado_id: string;
          producto_id: string;
          cantidad: number;
          costo_unitario: number;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          traslado_id: string;
          producto_id: string;
          cantidad: number;
          costo_unitario?: number;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          traslado_id?: string;
          producto_id?: string;
          cantidad?: number;
          costo_unitario?: number;
        };
        Relationships: [
          {
            foreignKeyName: "traslados_detalle_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "traslados_detalle_producto_id_fkey";
            columns: ["producto_id"];
            isOneToOne: false;
            referencedRelation: "productos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "traslados_detalle_traslado_id_fkey";
            columns: ["traslado_id"];
            isOneToOne: false;
            referencedRelation: "traslados";
            referencedColumns: ["id"];
          },
        ];
      };
      turnos_caja: {
        Row: {
          id: string;
          organizacion_id: string;
          bodega_id: string;
          usuario_id: string;
          estado: Database["public"]["Enums"]["estado_turno"];
          base_inicial: number;
          efectivo_esperado: number | null;
          efectivo_contado: number | null;
          diferencia: number | null;
          conteo_denominaciones: Json | null;
          abierto_en: string;
          cerrado_en: string | null;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          bodega_id: string;
          usuario_id: string;
          estado?: Database["public"]["Enums"]["estado_turno"];
          base_inicial?: number;
          efectivo_esperado?: number | null;
          efectivo_contado?: number | null;
          diferencia?: number | null;
          conteo_denominaciones?: Json | null;
          abierto_en?: string;
          cerrado_en?: string | null;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          bodega_id?: string;
          usuario_id?: string;
          estado?: Database["public"]["Enums"]["estado_turno"];
          base_inicial?: number;
          efectivo_esperado?: number | null;
          efectivo_contado?: number | null;
          diferencia?: number | null;
          conteo_denominaciones?: Json | null;
          abierto_en?: string;
          cerrado_en?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "turnos_caja_bodega_id_fkey";
            columns: ["bodega_id"];
            isOneToOne: false;
            referencedRelation: "bodegas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "turnos_caja_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "turnos_caja_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      ventas: {
        Row: {
          id: string;
          organizacion_id: string;
          bodega_id: string;
          cliente_id: string | null;
          turno_id: string | null;
          numero: number | null;
          estado: Database["public"]["Enums"]["estado_documento"];
          subtotal: number;
          descuento: number;
          total: number;
          costo_total: number;
          origen: string;
          usuario_id: string | null;
          offline_id: string | null;
          motivo_anulacion: string | null;
          anulada_por: string | null;
          anulada_en: string | null;
          creado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          bodega_id: string;
          cliente_id?: string | null;
          turno_id?: string | null;
          numero?: number | null;
          estado?: Database["public"]["Enums"]["estado_documento"];
          subtotal?: number;
          descuento?: number;
          total?: number;
          costo_total?: number;
          origen?: string;
          usuario_id?: string | null;
          offline_id?: string | null;
          motivo_anulacion?: string | null;
          anulada_por?: string | null;
          anulada_en?: string | null;
          creado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          bodega_id?: string;
          cliente_id?: string | null;
          turno_id?: string | null;
          numero?: number | null;
          estado?: Database["public"]["Enums"]["estado_documento"];
          subtotal?: number;
          descuento?: number;
          total?: number;
          costo_total?: number;
          origen?: string;
          usuario_id?: string | null;
          offline_id?: string | null;
          motivo_anulacion?: string | null;
          anulada_por?: string | null;
          anulada_en?: string | null;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ventas_anulada_por_fkey";
            columns: ["anulada_por"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ventas_bodega_id_fkey";
            columns: ["bodega_id"];
            isOneToOne: false;
            referencedRelation: "bodegas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ventas_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ventas_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ventas_turno_id_fkey";
            columns: ["turno_id"];
            isOneToOne: false;
            referencedRelation: "turnos_caja";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ventas_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      ventas_detalle: {
        Row: {
          id: string;
          organizacion_id: string;
          venta_id: string;
          producto_id: string;
          presentacion_id: string | null;
          cantidad: number;
          precio_unitario: number;
          descuento: number;
          costo_unitario: number | null;
          subtotal: number | null;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          venta_id: string;
          producto_id: string;
          presentacion_id?: string | null;
          cantidad: number;
          precio_unitario: number;
          descuento?: number;
          costo_unitario?: number | null;
          subtotal?: never;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          venta_id?: string;
          producto_id?: string;
          presentacion_id?: string | null;
          cantidad?: number;
          precio_unitario?: number;
          descuento?: number;
          costo_unitario?: number | null;
          subtotal?: never;
        };
        Relationships: [
          {
            foreignKeyName: "ventas_detalle_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ventas_detalle_presentacion_id_fkey";
            columns: ["presentacion_id"];
            isOneToOne: false;
            referencedRelation: "presentaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ventas_detalle_producto_id_fkey";
            columns: ["producto_id"];
            isOneToOne: false;
            referencedRelation: "productos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ventas_detalle_venta_id_fkey";
            columns: ["venta_id"];
            isOneToOne: false;
            referencedRelation: "ventas";
            referencedColumns: ["id"];
          },
        ];
      };
      visitas: {
        Row: {
          id: string;
          organizacion_id: string;
          usuario_id: string;
          cliente_id: string;
          resultado: string;
          nota: string | null;
          lat: number | null;
          lng: number | null;
          precision_m: number | null;
          offline_id: string;
          visitado_en: string;
          creado_en: string;
        };
        Insert: {
          id?: string;
          organizacion_id: string;
          usuario_id: string;
          cliente_id: string;
          resultado: string;
          nota?: string | null;
          lat?: number | null;
          lng?: number | null;
          precision_m?: number | null;
          offline_id: string;
          visitado_en?: string;
          creado_en?: string;
        };
        Update: {
          id?: string;
          organizacion_id?: string;
          usuario_id?: string;
          cliente_id?: string;
          resultado?: string;
          nota?: string | null;
          lat?: number | null;
          lng?: number | null;
          precision_m?: number | null;
          offline_id?: string;
          visitado_en?: string;
          creado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "visitas_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visitas_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visitas_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      v_plata_dormida: {
        Row: {
          organizacion_id: string | null;
          producto_id: string | null;
          nombre: string | null;
          bodega_id: string | null;
          cantidad: number | null;
          valor_atrapado: number | null;
          ultima_venta: string | null;
        };
        Relationships: [];
      };
      v_ventas_dia: {
        Row: {
          organizacion_id: string | null;
          dia: string | null;
          numero_ventas: number | null;
          total: number | null;
          utilidad: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      abonar_separado: {
        Args: {
          p_separado: string;
          p_monto: number;
          p_metodo: Database["public"]["Enums"]["metodo_pago"];
          p_turno?: string;
        };
        Returns: string;
      };
      aceptar_invitacion: {
        Args: {
          p_token: string;
          p_nombre?: string;
        };
        Returns: string;
      };
      activar_temporada: {
        Args: {
          p_id: string;
          p_activa: boolean;
        };
        Returns: undefined;
      };
      actualizar_precios_automaticos: {
        Args: {
          p_org: string;
        };
        Returns: number;
      };
      ajustar_inventario: {
        Args: {
          p_org: string;
          p_producto: string;
          p_bodega: string;
          p_cantidad: number;
          p_motivo: string;
          p_costo?: number;
        };
        Returns: undefined;
      };
      alzas_de_precio: {
        Args: {
          p_org: string;
          p_dias?: number;
          p_umbral?: number;
        };
        Returns: { producto_id: string; producto: string; proveedor_id: string; proveedor: string; costo_anterior: number; costo_nuevo: number; pct: number; fecha: string }[];
      };
      anular_compra: {
        Args: {
          p_compra_id: string;
          p_motivo: string;
        };
        Returns: undefined;
      };
      anular_gasto: {
        Args: {
          p_gasto: string;
          p_motivo: string;
        };
        Returns: undefined;
      };
      anular_traslado: {
        Args: {
          p_traslado: string;
          p_motivo: string;
        };
        Returns: undefined;
      };
      anular_venta: {
        Args: {
          p_venta_id: string;
          p_motivo: string;
        };
        Returns: undefined;
      };
      aplicar_plantilla_nicho: {
        Args: {
          p_org: string;
          p_nicho: string;
        };
        Returns: undefined;
      };
      aplicar_precios: {
        Args: {
          p_org: string;
          p_items: Json;
          p_motivo?: string;
        };
        Returns: number;
      };
      asignar_lista_cliente: {
        Args: {
          p_cliente: string;
          p_lista: string;
        };
        Returns: undefined;
      };
      bot_guardar_pendiente: {
        Args: {
          p_telefono: string;
          p_org: string;
          p_usuario: string;
          p_accion: Json;
        };
        Returns: undefined;
      };
      bot_registrar_mensaje: {
        Args: {
          p_mensaje: string;
          p_org: string;
        };
        Returns: boolean;
      };
      bot_resolver: {
        Args: {
          p_telefono: string;
        };
        Returns: { organizacion_id: string; organizacion: string; usuario_id: string; nombre: string; rol: Database["public"]["Enums"]["rol_miembro"] }[];
      };
      bot_tomar_pendiente: {
        Args: {
          p_telefono: string;
        };
        Returns: { organizacion_id: string; usuario_id: string; accion: Json }[];
      };
      calcular_avance_mes: {
        Args: {
          p_org: string;
          p_mes: string;
        };
        Returns: { usuario_id: string; nombre: string; ventas: number; ventas_netas: number; utilidad_neta: number; meta: number; cumplimiento: number; base: string; porcentaje: number; comision: number }[];
      };
      calcular_cartera: {
        Args: {
          p_org: string;
          p_cliente?: string;
        };
        Returns: { cliente_id: string; nombre: string; telefono: string; acepta_mensajes: boolean; saldo: number; cupo: number; vencido: number; dias_mora: number; dias_deuda: number; ultimo_abono: string; puntaje: number; categoria: string }[];
      };
      calcular_contactos_fidelizacion: {
        Args: {
          p_org: string;
          p_dias_inactivo?: number;
        };
        Returns: { cliente_id: string; nombre: string; telefono: string; tipo: string; dato: number; puntos: number }[];
      };
      calcular_metricas_salud: {
        Args: {
          p_org: string;
          p_hasta: string;
        };
        Returns: Json;
      };
      calcular_precios_sugeridos: {
        Args: {
          p_org: string;
        };
        Returns: { producto_id: string; producto: string; categoria: string; costo: number; precio_actual: number; margen_objetivo: number; margen_actual: number; precio_sugerido: number; cambio_pct: number; unidades_30d: number }[];
      };
      calcular_riesgo_turno: {
        Args: {
          p_turno: string;
        };
        Returns: Json;
      };
      calcular_sugerencia: {
        Args: {
          p_org: string;
          p_cobertura?: number;
          p_entrega?: number;
        };
        Returns: { producto_id: string; producto: string; unidad: string; stock: number; stock_minimo: number; venta_diaria: number; dias_restantes: number; sugerida: number; urgencia: string; proveedor_id: string; proveedor: string; costo_estimado: number; valor_estimado: number; factor: number }[];
      };
      cambiar_estado_cotizacion: {
        Args: {
          p_cot: string;
          p_estado: string;
          p_venta?: string;
        };
        Returns: undefined;
      };
      cambiar_estado_orden: {
        Args: {
          p_orden: string;
          p_estado: string;
        };
        Returns: undefined;
      };
      cancelar_conteo: {
        Args: {
          p_conteo: string;
        };
        Returns: undefined;
      };
      cancelar_separado: {
        Args: {
          p_separado: string;
          p_motivo: string;
          p_turno?: string;
        };
        Returns: undefined;
      };
      canjear_puntos: {
        Args: {
          p_org: string;
          p_cliente: string;
          p_puntos: number;
        };
        Returns: number;
      };
      canjear_puntos_venta: {
        Args: {
          p_venta: string;
          p_puntos: number;
        };
        Returns: boolean;
      };
      cargar_inventario_inicial: {
        Args: {
          p_org: string;
          p_bodega: string;
          p_lineas: Json;
        };
        Returns: number;
      };
      cargar_temporadas_base: {
        Args: {
          p_org: string;
        };
        Returns: number;
      };
      cartera_clientes: {
        Args: {
          p_org: string;
        };
        Returns: { cliente_id: string; nombre: string; telefono: string; saldo: number; cupo: number; vencido: number; dias_mora: number; dias_deuda: number; ultimo_abono: string; puntaje: number; categoria: string }[];
      };
      catalogo_productos: {
        Args: {
          p_slug: string;
        };
        Returns: { id: string; nombre: string; descripcion: string; categoria: string; unidad: string; precio: number; precio_antes: number; disponible: boolean }[];
      };
      catalogo_publico: {
        Args: {
          p_slug: string;
        };
        Returns: { nombre: string; telefono: string; mensaje: string }[];
      };
      cerrar_conteo: {
        Args: {
          p_conteo: string;
          p_aplicar?: boolean;
        };
        Returns: number;
      };
      cerrar_turno: {
        Args: {
          p_turno: string;
          p_contado: number;
          p_denominaciones: Json;
        };
        Returns: number;
      };
      comparar_proveedores: {
        Args: {
          p_org: string;
          p_producto: string;
        };
        Returns: { proveedor_id: string; proveedor: string; ultimo_costo: number; fecha: string; compras: number; costo_minimo: number; costo_maximo: number; diferencia_vs_mejor: number; pct_vs_mejor: number }[];
      };
      configurar_catalogo: {
        Args: {
          p_org: string;
          p_activo: boolean;
          p_slug: string;
          p_telefono: string;
          p_mensaje: string;
        };
        Returns: undefined;
      };
      configurar_fidelizacion: {
        Args: {
          p_org: string;
          p_activa: boolean;
          p_pesos_por_punto: number;
          p_valor_punto: number;
          p_puntos_cumple: number;
        };
        Returns: undefined;
      };
      configurar_precios_automaticos: {
        Args: {
          p_org: string;
          p_activo: boolean;
        };
        Returns: undefined;
      };
      confirmar_compra: {
        Args: {
          p_compra_id: string;
        };
        Returns: undefined;
      };
      confirmar_venta: {
        Args: {
          p_venta_id: string;
        };
        Returns: number;
      };
      consultar_serial: {
        Args: {
          p_org: string;
          p_serial: string;
        };
        Returns: { producto: string; estado: string; bodega: string; comprado: string; proveedor: string; vendido: string; cliente: string; venta_numero: number; garantia_hasta: string; en_garantia: boolean }[];
      };
      crear_alerta_unica: {
        Args: {
          p_org: string;
          p_tipo: string;
          p_clave: string;
          p_severidad: string;
          p_mensaje: string;
          p_datos?: Json;
        };
        Returns: undefined;
      };
      crear_cotizacion: {
        Args: {
          p_org: string;
          p_cliente: string;
          p_lineas: Json;
          p_vigencia?: string;
          p_nota?: string;
        };
        Returns: string;
      };
      crear_lista_precios: {
        Args: {
          p_org: string;
          p_nombre: string;
          p_descripcion?: string;
        };
        Returns: string;
      };
      crear_orden_compra: {
        Args: {
          p_org: string;
          p_proveedor: string;
          p_bodega: string;
          p_lineas: Json;
          p_fecha_esperada?: string;
          p_nota?: string;
        };
        Returns: string;
      };
      crear_organizacion: {
        Args: {
          p_nombre: string;
          p_nicho: string;
          p_nombre_dueno: string;
        };
        Returns: string;
      };
      crear_promocion: {
        Args: {
          p_org: string;
          p_nombre: string;
          p_desde: string;
          p_hasta: string;
          p_items: Json;
        };
        Returns: string;
      };
      crear_separado: {
        Args: {
          p_org: string;
          p_cliente: string;
          p_bodega: string;
          p_lineas: Json;
          p_fecha_limite?: string;
          p_nota?: string;
          p_abono?: number;
          p_metodo?: Database["public"]["Enums"]["metodo_pago"];
          p_turno?: string;
        };
        Returns: string;
      };
      crear_variantes: {
        Args: {
          p_base: string;
          p_combinaciones: Json;
        };
        Returns: number;
      };
      desactivar_promocion: {
        Args: {
          p_id: string;
        };
        Returns: undefined;
      };
      desde_funcion: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      dia_en_temporada: {
        Args: {
          d: string;
          mi: number;
          di: number;
          mf: number;
          df: number;
        };
        Returns: boolean;
      };
      efectivo_esperado_turno: {
        Args: {
          p_turno: string;
        };
        Returns: number;
      };
      entregar_separado: {
        Args: {
          p_separado: string;
          p_pagos: Json;
          p_turno: string;
        };
        Returns: string;
      };
      factor_temporada: {
        Args: {
          p_org: string;
          p_categoria: string;
          p_desde: string;
          p_dias: number;
        };
        Returns: number;
      };
      fidelizacion_para_n8n: {
        Args: Record<PropertyKey, never>;
        Returns: { organizacion_id: string; organizacion: string; cliente_id: string; cliente: string; telefono: string; tipo: string; dato: number; puntos: number; puntos_bono: number; valor_punto: number }[];
      };
      fidelizacion_pendiente: {
        Args: {
          p_org: string;
        };
        Returns: { cliente_id: string; nombre: string; telefono: string; tipo: string; dato: number; puntos: number }[];
      };
      fijar_comision: {
        Args: {
          p_org: string;
          p_usuario: string;
          p_base: string;
          p_porcentaje: number;
          p_bono?: number;
        };
        Returns: undefined;
      };
      fijar_meta: {
        Args: {
          p_org: string;
          p_usuario: string;
          p_mes: string;
          p_meta: number;
        };
        Returns: undefined;
      };
      fijar_precio_lista: {
        Args: {
          p_lista: string;
          p_producto: string;
          p_precio: number;
          p_presentacion?: string;
        };
        Returns: undefined;
      };
      finalizar_evento: {
        Args: {
          p_id: number;
          p_ok: boolean;
          p_error?: string;
        };
        Returns: undefined;
      };
      guardar_ruta: {
        Args: {
          p_org: string;
          p_usuario: string;
          p_dia: number;
          p_clientes: string[];
        };
        Returns: number;
      };
      guardar_temporada: {
        Args: {
          p_org: string;
          p_nombre: string;
          p_mes_ini: number;
          p_dia_ini: number;
          p_mes_fin: number;
          p_dia_fin: number;
          p_factor: number;
          p_categoria?: string;
          p_id?: string;
        };
        Returns: string;
      };
      iniciar_conteo: {
        Args: {
          p_org: string;
          p_bodega: string;
          p_nombre: string;
          p_categoria?: string;
        };
        Returns: string;
      };
      lotes_con_saldo: {
        Args: {
          p_org: string;
          p_producto?: string;
          p_bodega?: string;
        };
        Returns: { lote_id: string; producto_id: string; producto: string; bodega_id: string; codigo: string; vence: string; cantidad_recibida: number; saldo: number; dias_para_vencer: number }[];
      };
      marcar_contacto_fidelizacion: {
        Args: {
          p_org: string;
          p_cliente: string;
          p_tipo: string;
        };
        Returns: undefined;
      };
      marcar_verificacion_pago: {
        Args: {
          p_pago: string;
          p_estado: Database["public"]["Enums"]["estado_verificacion"];
        };
        Returns: undefined;
      };
      metricas_salud: {
        Args: {
          p_org: string;
        };
        Returns: Json;
      };
      mi_avance_mes: {
        Args: {
          p_org: string;
          p_mes: string;
        };
        Returns: { usuario_id: string; nombre: string; ventas: number; ventas_netas: number; utilidad_neta: number; meta: number; cumplimiento: number; base: string; porcentaje: number; comision: number }[];
      };
      mis_organizaciones: {
        Args: Record<PropertyKey, never>;
        Returns: string[];
      };
      org_por_numero_whatsapp: {
        Args: {
          p_phone_number_id: string;
        };
        Returns: { organizacion_id: string; organizacion: string }[];
      };
      organizaciones_para_resumen: {
        Args: Record<PropertyKey, never>;
        Returns: { id: string; nombre: string; telefono_whatsapp: string }[];
      };
      precios_sugeridos: {
        Args: {
          p_org: string;
        };
        Returns: { producto_id: string; producto: string; categoria: string; costo: number; precio_actual: number; margen_objetivo: number; margen_actual: number; precio_sugerido: number; cambio_pct: number; unidades_30d: number }[];
      };
      promociones_vigentes: {
        Args: {
          p_org: string;
        };
        Returns: { producto_id: string; precio: number; promocion: string }[];
      };
      publicar_en_catalogo: {
        Args: {
          p_org: string;
          p_ids: string[];
          p_publicar: boolean;
        };
        Returns: number;
      };
      puntaje_cliente: {
        Args: {
          p_cliente: string;
        };
        Returns: { puntaje: number; categoria: string; saldo: number; vencido: number; dias_mora: number }[];
      };
      recibir_orden_compra: {
        Args: {
          p_orden: string;
          p_lineas: Json;
          p_factura?: string;
          p_condicion?: string;
          p_dias_credito?: number;
        };
        Returns: string;
      };
      reclamar_eventos: {
        Args: {
          p_limite?: number;
        };
        Returns: { id: number; organizacion_id: string; organizacion: string; telefono_whatsapp: string; tipo: string; payload: Json; intentos: number; creado_en: string }[];
      };
      recordatorios_pendientes: {
        Args: Record<PropertyKey, never>;
        Returns: { organizacion_id: string; organizacion: string; cliente_id: string; cliente: string; telefono: string; saldo: number; vencido: number; dias_mora: number; nivel: number }[];
      };
      redondeo_precio: {
        Args: {
          n: number;
        };
        Returns: number;
      };
      registrar_abono: {
        Args: {
          p_cliente: string;
          p_monto: number;
          p_metodo: Database["public"]["Enums"]["metodo_pago"];
          p_turno?: string;
        };
        Returns: string;
      };
      registrar_cambio_precio: {
        Args: {
          p_venta: string;
          p_cambios: Json;
        };
        Returns: undefined;
      };
      registrar_contacto_fidelizacion: {
        Args: {
          p_cliente: string;
          p_tipo: string;
        };
        Returns: undefined;
      };
      registrar_contacto_fidelizacion_interno: {
        Args: {
          p_org: string;
          p_cliente: string;
          p_tipo: string;
        };
        Returns: undefined;
      };
      registrar_conteo_producto: {
        Args: {
          p_conteo: string;
          p_producto: string;
          p_cantidad: number;
        };
        Returns: number;
      };
      registrar_cuenta_por_pagar: {
        Args: {
          p_compra: string;
          p_dias?: number;
        };
        Returns: string;
      };
      registrar_deuda_inicial: {
        Args: {
          p_cliente: string;
          p_monto: number;
          p_motivo?: string;
          p_documento_ia?: string;
        };
        Returns: string;
      };
      registrar_devolucion_cliente: {
        Args: {
          p_venta: string;
          p_lineas: Json;
          p_motivo: string;
          p_reembolso: string;
          p_turno?: string;
        };
        Returns: string;
      };
      registrar_devolucion_proveedor: {
        Args: {
          p_org: string;
          p_proveedor: string;
          p_bodega: string;
          p_lineas: Json;
          p_motivo: string;
          p_compra?: string;
        };
        Returns: string;
      };
      registrar_gasto: {
        Args: {
          p_org: string;
          p_categoria: string;
          p_descripcion: string;
          p_monto: number;
          p_metodo?: Database["public"]["Enums"]["metodo_pago"];
          p_soporte?: string;
          p_fecha?: string;
          p_turno?: string;
        };
        Returns: string;
      };
      registrar_gasto_bot: {
        Args: {
          p_org: string;
          p_usuario: string;
          p_categoria: string;
          p_descripcion: string;
          p_monto: number;
          p_metodo: Database["public"]["Enums"]["metodo_pago"];
        };
        Returns: string;
      };
      registrar_lote: {
        Args: {
          p_org: string;
          p_producto: string;
          p_bodega: string;
          p_codigo: string;
          p_vence: string;
          p_cantidad: number;
          p_compra?: string;
        };
        Returns: string;
      };
      registrar_movimiento_caja: {
        Args: {
          p_turno: string;
          p_tipo: string;
          p_monto: number;
          p_motivo: string;
        };
        Returns: string;
      };
      registrar_pago_proveedor: {
        Args: {
          p_cxp: string;
          p_monto: number;
          p_metodo: Database["public"]["Enums"]["metodo_pago"];
          p_referencia?: string;
        };
        Returns: string;
      };
      registrar_pedido_whatsapp: {
        Args: {
          p_org: string;
          p_mensaje_id: string;
          p_telefono: string;
          p_texto: string;
          p_lineas: Json;
          p_no_encontrados: Json;
        };
        Returns: { pedido_id: string; nuevo: boolean; cliente_id: string }[];
      };
      registrar_recordatorio: {
        Args: {
          p_cliente: string;
          p_nivel: number;
          p_saldo: number;
        };
        Returns: undefined;
      };
      registrar_seriales: {
        Args: {
          p_org: string;
          p_producto: string;
          p_bodega: string;
          p_seriales: string[];
          p_compra?: string;
        };
        Returns: number;
      };
      registrar_visita: {
        Args: {
          p_org: string;
          p_cliente: string;
          p_resultado: string;
          p_nota: string;
          p_lat: number;
          p_lng: number;
          p_precision: number;
          p_offline_id: string;
          p_visitado_en?: string;
        };
        Returns: string;
      };
      reporte_abc: {
        Args: {
          p_org: string;
          p_desde: string;
          p_hasta: string;
        };
        Returns: { producto_id: string; nombre: string; ingreso: number; participacion: number; acumulado: number; clase: string }[];
      };
      reporte_comisiones: {
        Args: {
          p_org: string;
          p_mes: string;
        };
        Returns: { usuario_id: string; nombre: string; ventas: number; ventas_netas: number; utilidad_neta: number; meta: number; cumplimiento: number; base: string; porcentaje: number; comision: number }[];
      };
      reporte_inventario_valorizado: {
        Args: {
          p_org: string;
        };
        Returns: { producto_id: string; nombre: string; categoria: string; cantidad: number; costo_promedio: number; valor: number }[];
      };
      reporte_plata_dormida: {
        Args: {
          p_org: string;
          p_dias?: number;
        };
        Returns: { producto_id: string; nombre: string; cantidad: number; valor: number; ultima_venta: string; dias_sin_vender: number }[];
      };
      reporte_plata_dormida_interno: {
        Args: {
          p_org: string;
          p_dias: number;
        };
        Returns: { producto_id: string; nombre: string; cantidad: number; valor: number; ultima_venta: string; dias_sin_vender: number }[];
      };
      reporte_rotacion: {
        Args: {
          p_org: string;
          p_desde: string;
          p_hasta: string;
        };
        Returns: { producto_id: string; nombre: string; vendido: number; stock: number; venta_diaria: number; dias_de_inventario: number }[];
      };
      reporte_ventas_diarias: {
        Args: {
          p_org: string;
          p_desde: string;
          p_hasta: string;
        };
        Returns: { dia: string; ventas: number; total: number; costo: number; utilidad: number }[];
      };
      reporte_ventas_por_metodo: {
        Args: {
          p_org: string;
          p_desde: string;
          p_hasta: string;
        };
        Returns: { metodo: string; pagos: number; total: number }[];
      };
      reporte_ventas_por_producto: {
        Args: {
          p_org: string;
          p_desde: string;
          p_hasta: string;
          p_limite?: number;
        };
        Returns: { producto_id: string; nombre: string; cantidad: number; ingreso: number; costo: number; utilidad: number }[];
      };
      reporte_ventas_por_vendedor: {
        Args: {
          p_org: string;
          p_desde: string;
          p_hasta: string;
        };
        Returns: { usuario_id: string; nombre: string; ventas: number; total: number; utilidad: number }[];
      };
      reportes_validar: {
        Args: {
          p_org: string;
          p_desde: string;
          p_hasta: string;
        };
        Returns: undefined;
      };
      reposicion_para_resumen: {
        Args: Record<PropertyKey, never>;
        Returns: { organizacion_id: string; organizacion: string; telefono_whatsapp: string; criticos: number; total: number; valor: number; top: Json }[];
      };
      resolver_pedido_whatsapp: {
        Args: {
          p_pedido: string;
          p_estado: string;
          p_venta?: string;
          p_motivo?: string;
        };
        Returns: undefined;
      };
      resumen_periodo: {
        Args: {
          p_org: string;
          p_desde: string;
          p_hasta: string;
        };
        Returns: Json;
      };
      resumen_rutas: {
        Args: {
          p_org: string;
          p_fecha?: string;
        };
        Returns: { usuario_id: string; nombre: string; planificadas: number; visitadas: number; pedidos: number; cobros: number; sin_pedido: number; cerrados: number; ventas: number }[];
      };
      riesgo_turno: {
        Args: {
          p_turno: string;
        };
        Returns: Json;
      };
      roles_escritura: {
        Args: {
          tabla: string;
        };
        Returns: Database["public"]["Enums"]["rol_miembro"][];
      };
      ruta_del_dia: {
        Args: {
          p_org: string;
          p_fecha?: string;
        };
        Returns: { cliente_id: string; nombre: string; telefono: string; direccion: string; saldo: number; vencido: number; dias_mora: number; orden: number; visitado: boolean; resultado: string; ultima_visita: string; ultima_compra: string }[];
      };
      saldo_puntos: {
        Args: {
          p_cliente: string;
        };
        Returns: number;
      };
      saldos_puntos: {
        Args: {
          p_org: string;
        };
        Returns: { cliente_id: string; puntos: number }[];
      };
      signo_movimiento: {
        Args: {
          t: Database["public"]["Enums"]["tipo_movimiento"];
        };
        Returns: number;
      };
      siguiente_consecutivo: {
        Args: {
          org: string;
          doc: string;
        };
        Returns: number;
      };
      stock_reservado: {
        Args: {
          p_org: string;
        };
        Returns: { producto_id: string; bodega_id: string; reservado: number }[];
      };
      sugerencia_compras: {
        Args: {
          p_org: string;
          p_cobertura?: number;
          p_entrega?: number;
        };
        Returns: { producto_id: string; producto: string; unidad: string; stock: number; stock_minimo: number; venta_diaria: number; dias_restantes: number; sugerida: number; urgencia: string; proveedor_id: string; proveedor: string; costo_estimado: number; valor_estimado: number; factor: number }[];
      };
      sugerir_promociones: {
        Args: {
          p_org: string;
          p_dias?: number;
        };
        Returns: { producto_id: string; producto: string; cantidad: number; costo: number; precio_normal: number; dias_sin_vender: number; descuento_pct: number; precio_sugerido: number; valor_inmovilizado: number }[];
      };
      tiene_rol: {
        Args: {
          org: string;
          roles: Database["public"]["Enums"]["rol_miembro"][];
        };
        Returns: boolean;
      };
      trasladar_inventario: {
        Args: {
          p_org: string;
          p_origen: string;
          p_destino: string;
          p_lineas: Json;
          p_nota?: string;
        };
        Returns: string;
      };
      vencimientos_proximos: {
        Args: {
          p_org: string;
          p_dias?: number;
        };
        Returns: { lote_id: string; producto: string; bodega_id: string; codigo: string; vence: string; saldo: number; dias_para_vencer: number; valor_en_riesgo: number }[];
      };
      vender_serial: {
        Args: {
          p_venta: string;
          p_serial: string;
        };
        Returns: string;
      };
      verificar_comprobante: {
        Args: {
          p_comprobante: string;
          p_monto_esperado: number;
          p_pago?: string;
        };
        Returns: Database["public"]["Enums"]["estado_verificacion"];
      };
      visitas_del_dia: {
        Args: {
          p_org: string;
          p_fecha?: string;
        };
        Returns: { id: string; usuario: string; cliente: string; resultado: string; nota: string; lat: number; lng: number; precision_m: number; visitado_en: string }[];
      };
    };
    Enums: {
      estado_documento: "borrador" | "confirmado" | "anulado";
      estado_turno: "abierto" | "cerrado";
      estado_verificacion: "no_aplica" | "sin_verificar" | "verificado_ia" | "verificado_manual" | "sospechoso";
      metodo_pago: "efectivo" | "nequi" | "daviplata" | "transferencia" | "tarjeta" | "credito" | "otro";
      rol_miembro: "dueno" | "admin" | "vendedor" | "bodeguero" | "contador" | "ruta";
      tipo_movimiento: "inicial" | "compra" | "venta" | "ajuste_entrada" | "ajuste_salida" | "traslado_entrada" | "traslado_salida" | "devolucion_cliente" | "devolucion_proveedor" | "anulacion_entrada" | "anulacion_salida";
    };
    CompositeTypes: Record<string, never>;
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
