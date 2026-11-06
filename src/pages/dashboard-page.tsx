import { BarChart3, CreditCard, UserCog, Users } from "lucide-react";
import { Link } from "react-router";
import { AccountCard } from "@/components/dashboard/account-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/providers/auth-provider";

const stats = [
  {
    label: "Clientes",
    value: "0",
    icon: Users,
    href: "/app/clientes",
    description: "Nenhum cliente cadastrado ainda",
  },
  {
    label: "Equipe",
    value: "1",
    icon: UserCog,
    href: "/app/equipe",
    description: "Só você por enquanto",
  },
  {
    label: "Assinatura",
    value: "Trial",
    icon: CreditCard,
    href: "/app/assinatura",
    description: "Plano e faturas da sua conta",
  },
];

const quickActions = [
  {
    label: "Cadastrar cliente",
    description: "Adicione um cliente ou lead e envie o acesso ao portal.",
    href: "/app/clientes",
    icon: Users,
  },
  {
    label: "Convidar equipe",
    description: "Convide colaboradores e defina o papel de cada um.",
    href: "/app/equipe",
    icon: UserCog,
  },
  {
    label: "Escolher plano",
    description: "Veja os planos e pague por Pix, boleto ou cartão.",
    href: "/app/assinatura",
    icon: CreditCard,
  },
];

export function DashboardPage() {
  const { user } = useAuth();

  const firstName = user?.name.split(" ")[0] ?? "usuário";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Olá, {firstName}! 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bem-vindo à sua conta. Comece cadastrando clientes ou convidando a
          equipe.
        </p>
      </div>

      <AccountCard />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(({ label, value, icon: Icon, href, description }) => (
          <Link key={label} to={href}>
            <Card className="group cursor-pointer transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {label}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {description}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="mb-4 text-base font-semibold text-foreground">
          Por onde começar
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {quickActions.map(({ label, description, href, icon: Icon }) => (
            <Card
              key={label}
              className="flex flex-col border-dashed border-border/80"
            >
              <CardHeader>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-base">{label}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4">
                <p className="text-sm text-muted-foreground">{description}</p>
                <Link to={href}>
                  <Button variant="outline" size="sm" className="w-full">
                    {label}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-base font-semibold text-foreground">
          Atividade recente
        </h2>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <BarChart3 className="mb-4 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">
              Nenhuma atividade ainda
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              As ações da sua conta aparecerão aqui.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
