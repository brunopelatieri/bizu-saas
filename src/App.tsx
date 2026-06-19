import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { RootLayout } from "@/components/layout/root-layout";
import { AboutPage } from "@/pages/about-page";
import { AuthCallbackPage } from "@/pages/auth-callback-page";
import { ContactPage } from "@/pages/contact-page";
import { HomePage } from "@/pages/home-page";
import { LoginPage } from "@/pages/login-page";
import { ProjectsPage } from "@/pages/projects-page";
import { AuthProvider } from "@/providers/auth-provider";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<RootLayout />}>
            <Route index element={<HomePage />} />
            <Route path="sobre" element={<AboutPage />} />
            <Route path="projetos" element={<ProjectsPage />} />
            <Route path="contato" element={<ContactPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="auth/callback" element={<AuthCallbackPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
