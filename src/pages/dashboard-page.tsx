import { BarChart3, CreditCard, UserCog, Users } from "lucide-react";
import { Link } from "react-router";
import { AccountCard } from "@/components/app/account-card";
import { useCustomers } from "@/components/app/customers/customers-api";
import { useTeam } from "@/components/app/team/team-api";
import { useCan } from "@/components/auth/can";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/providers/auth-provider";

export function DashboardPage() {
  const { user, tenant, billing } = useAuth();
  const can = useCan();
  const team = useTeam();
  const customers = useCustomers({ page: 1 }, can("customer", "read"));

  const firstName = user?.name.split(" ")[0] ?? "usuário";
  const memberCount = team.data?.members.length;
  const customerCount = customers.data?.total;
  const subscriptionHint =
    billing?.state === "trialing"
      ? `Teste: ${billing.trialDaysLeft ?? 0} dia(s) restante(s)`
      : billing?.state === "read_only"
        ? "Somente leitura"
        : "Plano e faturas da sua conta";

  const stats = [
    {
      label: "Clientes",
      value: customerCount === undefined ? "–" : String(customerCount),
      icon: Users,
      href: "/app/clientes",
      description:
        customerCount === 0
          ? "Nenhum cliente cadastrado ainda"
          : "Clientes e leads cadastrados",
      visible: can("customer", "read"),
    },
    {
      label: "Equipe",
      value: memberCount === undefined ? "–" : String(memberCount),
      icon: UserCog,
      href: "/app/equipe",
      description: memberCount === 1 ? "Só você por enquanto" : "Membros ativos",
      visible: true,
    },
    {
      label: "Assinatura",
      value: billing?.plan?.name ?? "–",
      icon: CreditCard,
      href: "/app/assinatura",
      description: subscriptionHint,
      visible: can("billing", "read"),
    },
  ];

  const quickActions = [
    {
      label: "Cadastrar cliente",
      description: "Adicione um cliente ou lead e envie o acesso ao portal.",
      href: "/app/clientes",
      icon: Users,
      visible: can("customer", "create"),
    },
    {
      label: "Convidar equipe",
      description: "Convide colaboradores e defina o papel de cada um.",
      href: "/app/equipe",
      icon: UserCog,
      visible: can("invitation", "create"),
    },
    {
      label: "Escolher plano",
      description: "Veja os planos e pague por Pix, boleto ou cartão.",
      href: "/app/assinatura",
      icon: CreditCard,
      visible: can("billing", "manage"),
    },
  ].filter(({ visible }) => visible);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Olá, {firstName}! 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Você está em {tenant?.name}.
        </p>
      </div>

      <AccountCard />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats
          .filter(({ visible }) => visible)
          .map(({ label, value, icon: Icon, href, description }) => (
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
