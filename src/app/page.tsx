import { redirect } from "next/navigation";

// Mientras no existe la landing/login (tarea 1.1), la raíz lleva al tablero.
export default function Raiz() {
  redirect("/dashboard");
}
