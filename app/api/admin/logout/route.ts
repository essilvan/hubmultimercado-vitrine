import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({
    success: true,
    message: "Sessão admin encerrada com sucesso.",
  });
  response.cookies.delete("admin_session");
  return response;
}

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.delete("admin_session");
  return response;
}
