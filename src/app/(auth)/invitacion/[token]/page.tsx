import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { obtenerSesion } from "@/lib/auth/contexto";
import { aceptarInvitacion } from "../../acciones";

export const metadata: Metadata = { title: "Invitación" };

export default async function Pagina({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = await obtenerSesion();
  const destino = encodeURIComponent(`/invitacion/${token}`);

  if (s.estado === "anonimo") {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-xl font-semibold">Te invitaron a un negocio en Surtix</h1>
        <p className="text-sm text-muted-foreground">
          Entra (o crea tu cuenta) con el mismo correo al que llegó la invitación.
        </p>
        <Link
          href={`/login?siguiente=${destino}`}
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground"
        >
          Entrar
        </Link>
        <Link href="/registro" className="block text-sm text-muted-foreground underline">
          Crear cuenta
        </Link>
      </div>
    );
  }
  return (
    <form
      action={async () => {
        "use server";
        await aceptarInvitacion(token);
      }}
      className="space-y-4 text-center"
    >
      <h1 className="text-xl font-semibold">Unirte al negocio</h1>
      <p className="text-sm text-muted-foreground">Vas a entrar con tu cuenta actual.</p>
      <Button type="submit" className="h-11 w-full">
        Aceptar invitación
      </Button>
    </form>
  );
}
