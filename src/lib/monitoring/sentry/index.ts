import * as Sentry from "@sentry/node";
import type { MonitoringModule } from "@/lib/observability";

/**
 * Módulo opcional de erros em produção. Só é carregado com `SENTRY_DSN`; apague a pasta
 * e a variável para removê-lo (`README.md` desta pasta, `npm run check:module-removal -- sentry`).
 * Nada de dado pessoal sai daqui: sem IP, cabeçalhos, corpo nem usuário.
 */
const sentryModule: MonitoringModule = {
  id: "sentry",

  init({ dsn, environment }) {
    Sentry.init({
      dsn,
      environment,
      // Sentry 11: `dataCollection` substitui `sendDefaultPii`. Nada de usuário, cookie,
      // cabeçalho, corpo, query de URL nem parâmetros de SQL.
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        databaseQueryData: false,
      },
      tracesSampleRate: 0,
      beforeSend(event) {
        delete event.request;
        delete event.user;
        return event;
      },
    });
  },

  capture(error, context) {
    Sentry.withScope((scope) => {
      scope.setTag("context", context);
      Sentry.captureException(error);
    });
  },

  flush: (timeoutMs) => Sentry.flush(timeoutMs).then(() => undefined),
};

export default sentryModule;
