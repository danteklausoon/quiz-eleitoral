import { carregarConteudo } from "@/lib/conteudo";
import ResultadoCliente from "./resultado-cliente";

export const revalidate = 3600;
export const metadata = { title: "Meu resultado" };

export default async function PaginaResultado() {
  const { conteudo } = await carregarConteudo();
  return (
    <main className="container">
      <ResultadoCliente conteudo={conteudo} />
    </main>
  );
}
