import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const adminAccessKey = process.env.ADMIN_ACCESS_KEY;

  // 1. Verifica se já possui o cookie de sessão 'admin_session' válido
  const sessionCookie = request.cookies.get("admin_session")?.value;
  const hasValidCookie = sessionCookie === "true";

  // 2. Verifica se a chave foi informada via query param (?chave=...) ou cabeçalho x-admin-key
  const chaveParam = searchParams.get("chave");
  const chaveHeader = request.headers.get("x-admin-key");
  const chaveInformada = chaveParam || chaveHeader;
  const hasValidKey = Boolean(
    adminAccessKey &&
    chaveInformada &&
    chaveInformada.trim() === adminAccessKey.trim()
  );

  const isAuthenticated = hasValidCookie || hasValidKey;
  const isApiRoute = pathname.startsWith("/api/");

  // CASO 1: Rotas de páginas (/admin, /admin/...)
  if (!isApiRoute) {
    if (!isAuthenticated) {
      // Sem cookie e sem chave correta: redireciona para a página inicial
      return NextResponse.redirect(new URL("/", request.url));
    }

    const response = NextResponse.next();

    // Se o usuário entrou com a chave correta, define o cookie HTTP seguro de sessão
    if (hasValidKey && !hasValidCookie) {
      response.cookies.set("admin_session", "true", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 7 dias
      });
    }

    return response;
  }

  // CASO 2: Rotas de APIs internas do admin ou busca (/api/admin/*, /api/ml/*)
  if (isApiRoute) {
    if (!isAuthenticated) {
      // IMPORTANTE: Nunca redirecionar chamadas de API para '/', responder sempre com JSON 401
      return NextResponse.json(
        {
          success: false,
          error: "Acesso não autorizado. Sessão de administrador necessária.",
        },
        { status: 401 }
      );
    }

    const response = NextResponse.next();

    if (hasValidKey && !hasValidCookie) {
      response.cookies.set("admin_session", "true", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/ml/:path*",
  ],
};
