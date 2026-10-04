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

  const adminAccessKey = process.env.ADMIN_ACCESS_KEY;

  // Se a chave não for informada ou não corresponder ao process.env.ADMIN_ACCESS_KEY,
  // redireciona imediatamente para a página inicial
  if (!adminAccessKey || chave !== adminAccessKey) {
    redirect("/");
  }

  return <AdminPanel />;
}
