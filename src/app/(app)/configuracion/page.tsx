import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Store, Tags, Users, Warehouse } from "lucide-react";
import { requerirContexto } from "@/lib/auth/contexto";
import { etiquetaRol, puede, puedeEscribir } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { FormWhatsApp } from "./whatsapp";

export const metadata: Metadata = { title: "Configuración" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  const supabase = await crearClienteServidor();
  const { data: org } = await supabase.from("organizaciones").select("telefono_whatsapp, whatsapp_phone_number_id").eq("id", ctx.organizacionId).maybeSingle();
  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <h1 className="text-xl font-semibold">Configuración</h1>
      <div className="rounded-xl border p-4 text-sm">
        <p className="font-medium">{ctx.negocio}</p>
        <p className="text-muted-foreground">
          {ctx.nombre} · {etiquetaRol(ctx.rol)} · {ctx.correo}
        </p>
      </div>
      {ctx.rol === "dueno" || ctx.rol === "admin" ? <FormWhatsApp actual={org?.telefono_whatsapp ?? null} numeroId={org?.whatsapp_phone_number_id ?? null} /> : null}
      {puede(ctx.rol, "usuarios.gestionar") ? (
        <Link
          href="/configuracion/usuarios"
          className="flex min-h-16 items-center gap-3 rounded-xl border p-4 hover:bg-muted"
        >
          <Users className="size-6 text-primary" aria-hidden />
          <span>
            <span className="block font-medium">Usuarios y roles</span>
            <span className="text-sm text-muted-foreground">
              Invita a tu equipo y define qué puede hacer cada uno
            </span>
          </span>
        </Link>
      ) : null}
      {ctx.rol === "dueno" || ctx.rol === "admin" ? (
        <Link href="/configuracion/catalogo" className="flex min-h-16 items-center gap-3 rounded-xl border p-4 hover:bg-muted">
          <Store className="size-6 text-primary" aria-hidden />
          <span>
            <span className="block font-medium">Catálogo web</span>
            <span className="text-sm text-muted-foreground">Un enlace con tus productos para que te pidan por WhatsApp</span>
          </span>
        </Link>
      ) : null}
      {puedeEscribir(ctx.rol, "bodegas") ? (
        <Link href="/configuracion/temporadas" className="flex min-h-16 items-center gap-3 rounded-xl border p-4 hover:bg-muted">
          <CalendarDays className="size-6 text-primary" aria-hidden />
          <span>
            <span className="block font-medium">Temporadas</span>
            <span className="text-sm text-muted-foreground">Navidad, Día de la Madre… para comprar a tiempo</span>
          </span>
        </Link>
      ) : null}
      {puedeEscribir(ctx.rol, "bodegas") ? (
        <Link href="/configuracion/listas" className="flex min-h-16 items-center gap-3 rounded-xl border p-4 hover:bg-muted">
          <Tags className="size-6 text-primary" aria-hidden />
          <span>
            <span className="block font-medium">Listas de precios</span>
            <span className="text-sm text-muted-foreground">Mayorista, constructores… cada cliente con su precio</span>
          </span>
        </Link>
      ) : null}
      {puedeEscribir(ctx.rol, "bodegas") ? (
        <Link href="/configuracion/bodegas" className="flex min-h-16 items-center gap-3 rounded-xl border p-4 hover:bg-muted">
          <Warehouse className="size-6 text-primary" aria-hidden />
          <span>
            <span className="block font-medium">Bodegas y sedes</span>
            <span className="text-sm text-muted-foreground">Varias bodegas, cada una con su stock, y traslados entre ellas</span>
          </span>
        </Link>
      ) : null}
    </section>
  );
}
