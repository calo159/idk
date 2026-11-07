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
        };
        Relationships: [
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
        };
        Insert: {
          id?: never;
          organizacion_id: string;
          tipo: string;
          payload?: Json;
          intentos?: number;
          procesado_en?: string | null;
          creado_en?: string;
        };
        Update: {
          id?: never;
          organizacion_id?: string;
          tipo?: string;
          payload?: Json;
          intentos?: number;
          procesado_en?: string | null;
          creado_en?: string;
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
        };
        Relationships: [];
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
      aceptar_invitacion: {
        Args: {
          p_token: string;
          p_nombre?: string;
        };
        Returns: string;
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
      anular_compra: {
        Args: {
          p_compra_id: string;
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
      cargar_inventario_inicial: {
        Args: {
          p_org: string;
          p_bodega: string;
          p_lineas: Json;
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
      crear_organizacion: {
        Args: {
          p_nombre: string;
          p_nicho: string;
          p_nombre_dueno: string;
        };
        Returns: string;
      };
      desde_funcion: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      marcar_verificacion_pago: {
        Args: {
          p_pago: string;
          p_estado: Database["public"]["Enums"]["estado_verificacion"];
        };
        Returns: undefined;
      };
      mis_organizaciones: {
        Args: Record<PropertyKey, never>;
        Returns: string[];
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
      roles_escritura: {
        Args: {
          tabla: string;
        };
        Returns: Database["public"]["Enums"]["rol_miembro"][];
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
      tiene_rol: {
        Args: {
          org: string;
          roles: Database["public"]["Enums"]["rol_miembro"][];
        };
        Returns: boolean;
      };
      verificar_comprobante: {
        Args: {
          p_comprobante: string;
          p_monto_esperado: number;
          p_pago?: string;
        };
        Returns: Database["public"]["Enums"]["estado_verificacion"];
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
