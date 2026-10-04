import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminPanel from "./AdminPanel";

export { type AdminProduct } from "./AdminPanel";

interface AdminPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = await searchParams;
  const chave =
    typeof params?.chave === "string"
      ? params.chave
      : Array.isArray(params?.chave)
      ? params.chave[0]
      : undefined;

  // 1. Verifica se já existe cookie de sessão 'admin_session'
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("admin_session")?.value;
  const hasValidCookie = sessionCookie === "true";

  // 2. Verifica se a chave informada confere com a chave do ambiente
  const adminAccessKey = process.env.ADMIN_ACCESS_KEY;
  const hasValidKey = Boolean(
    adminAccessKey &&
    chave &&
    chave.trim() === adminAccessKey.trim()
  );

  // Se não possuir o cookie de sessão nem a chave correta, redireciona para a página inicial
  if (!hasValidCookie && !hasValidKey) {
    redirect("/");
  }

  return <AdminPanel />;
}
