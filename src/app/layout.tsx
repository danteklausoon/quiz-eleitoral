import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Meu Voto — descubra quais propostas combinam com as suas respostas",
    template: "%s · Meu Voto",
  },
  description:
    "Responda perguntas simples sobre os temas que importam para você e veja quais propostas documentadas correspondem às suas respostas. O aplicativo não diz em quem votar.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1117" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="topo">
          <div className="topo-inner">
            <Link href="/" className="marca">
              Meu Voto
            </Link>
            <nav>
              <Link href="/quiz">Responder</Link>
              <Link href="/participacao">Participação</Link>
            </nav>
          </div>
        </header>

        {children}

        <div className="container">
          <footer className="rodape">
            <p>
              <strong>O aplicativo não diz em quem você deve votar.</strong> Ele organiza
              informações públicas e compara as suas respostas com o que está documentado sobre
              as candidaturas. Você decide.
            </p>
            <p>
              Suas respostas ficam no seu aparelho. O resultado é calculado localmente e nada é
              enviado sem que você peça.
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
