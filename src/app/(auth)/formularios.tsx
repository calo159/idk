"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NICHOS } from "@/lib/validaciones/auth";
import {
  type EstadoForm,
  crearNegocio,
  iniciarSesion,
  recuperarContrasena,
  registrarse,
} from "./acciones";

const vacio: EstadoForm = {};

function Campo({
  nombre,
  etiqueta,
  tipo = "text",
  estado,
  autoComplete,
  placeholder,
  valorInicial,
}: {
  nombre: string;
  etiqueta: string;
  tipo?: string;
  estado: EstadoForm;
  autoComplete?: string;
  placeholder?: string;
  valorInicial?: string;
}) {
  const error = estado.campos?.[nombre];
  return (
    <div className="space-y-1.5">
      <Label htmlFor={nombre}>{etiqueta}</Label>
      <Input
        id={nombre}
        name={nombre}
        type={tipo}
        autoComplete={autoComplete}
        placeholder={placeholder}
        defaultValue={valorInicial}
        aria-invalid={!!error}
        aria-describedby={error ? `${nombre}-error` : undefined}
        className="h-11"
      />
      {error ? (
        <p id={`${nombre}-error`} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SelectorNicho({ estado }: { estado: EstadoForm }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="nicho">¿Qué vendes?</Label>
      <select
        id="nicho"
        name="nicho"
        defaultValue="ferreteria"
        className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
      >
        {NICHOS.map((n) => (
          <option key={n.valor} value={n.valor}>
            {n.etiqueta}
          </option>
        ))}
      </select>
      {estado.campos?.nicho ? (
        <p className="text-xs text-destructive">{estado.campos.nicho}</p>
      ) : null}
    </div>
  );
}

function Mensajes({ estado }: { estado: EstadoForm }) {
  return (
    <>
      {estado.error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {estado.error}
        </p>
      ) : null}
      {estado.mensaje ? (
        <p role="status" className="rounded-lg bg-primary/10 p-3 text-sm text-primary">
          {estado.mensaje}
        </p>
      ) : null}
    </>
  );
}

export function FormLogin({ siguiente }: { siguiente?: string }) {
  const [estado, accion, pendiente] = useActionState(iniciarSesion, vacio);
  return (
    <form action={accion} className="space-y-4" noValidate>
      <input type="hidden" name="siguiente" value={siguiente ?? ""} />
      <Campo nombre="correo" etiqueta="Correo" tipo="email" autoComplete="email" estado={estado} />
      <Campo
        nombre="contrasena"
        etiqueta="Contraseña"
        tipo="password"
        autoComplete="current-password"
        estado={estado}
      />
      <Mensajes estado={estado} />
      <Button type="submit" className="h-11 w-full" disabled={pendiente}>
        {pendiente ? "Entrando…" : "Entrar"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/recuperar" className="underline">
          Olvidé mi contraseña
        </Link>
        {" · "}
        <Link href="/registro" className="underline">
          Crear mi negocio
        </Link>
      </p>
    </form>
  );
}

export function FormRegistro({ referido }: { referido?: string }) {
  const [estado, accion, pendiente] = useActionState(registrarse, vacio);
  return (
    <form action={accion} className="space-y-4" noValidate>
      <Campo nombre="nombre" etiqueta="Tu nombre" autoComplete="name" estado={estado} />
      <Campo
        nombre="negocio"
        etiqueta="Nombre del negocio"
        placeholder="Ferretería El Puerto"
        estado={estado}
      />
      <SelectorNicho estado={estado} />
      <Campo nombre="correo" etiqueta="Correo" tipo="email" autoComplete="email" estado={estado} />
      <Campo
        nombre="contrasena"
        etiqueta="Contraseña (mínimo 8 caracteres)"
        tipo="password"
        autoComplete="new-password"
        estado={estado}
      />
      <Campo nombre="referido" etiqueta="Código de referido (opcional)" placeholder="SURT-XXXXXX" valorInicial={referido} estado={estado} />
      <Mensajes estado={estado} />
      <Button type="submit" className="h-11 w-full" disabled={pendiente}>
        {pendiente ? "Creando…" : "Crear mi negocio"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}

export function FormNegocio({ referido }: { referido?: string }) {
  const [estado, accion, pendiente] = useActionState(crearNegocio, vacio);
  return (
    <form action={accion} className="space-y-4" noValidate>
      <Campo nombre="nombre" etiqueta="Tu nombre" autoComplete="name" estado={estado} />
      <Campo nombre="negocio" etiqueta="Nombre del negocio" estado={estado} />
      <SelectorNicho estado={estado} />
      <Campo nombre="referido" etiqueta="Código de referido (opcional)" placeholder="SURT-XXXXXX" valorInicial={referido} estado={estado} />
      <Mensajes estado={estado} />
      <Button type="submit" className="h-11 w-full" disabled={pendiente}>
        {pendiente ? "Creando…" : "Empezar"}
      </Button>
    </form>
  );
}

export function FormRecuperar() {
  const [estado, accion, pendiente] = useActionState(recuperarContrasena, vacio);
  return (
    <form action={accion} className="space-y-4" noValidate>
      <Campo nombre="correo" etiqueta="Correo" tipo="email" autoComplete="email" estado={estado} />
      <Mensajes estado={estado} />
      <Button type="submit" className="h-11 w-full" disabled={pendiente}>
        {pendiente ? "Enviando…" : "Enviar enlace"}
      </Button>
      <p className="text-center text-sm">
        <Link href="/login" className="text-muted-foreground underline">
          Volver a entrar
        </Link>
      </p>
    </form>
  );
}
