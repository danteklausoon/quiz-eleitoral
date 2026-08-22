import { carregarConteudo } from "@/lib/conteudo";
import QuizCliente from "./quiz-cliente";

export const revalidate = 3600;
export const metadata = { title: "Responder" };

export default async function PaginaQuiz() {
  // O conteúdo vem do servidor (e do cache de borda em produção).
  // A partir daqui, tudo acontece no dispositivo.
  const { conteudo } = await carregarConteudo();
  return (
    <main className="container">
      <QuizCliente conteudo={conteudo} />
    </main>
  );
}
