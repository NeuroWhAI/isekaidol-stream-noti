import * as Sentry from "@sentry/browser";
import { BrowserTracing } from "@sentry/tracing";

import App from './App.svelte';

Sentry.init({
    dsn: "https://95a19ee5d07d46229a256ad808750c1b@o959827.ingest.sentry.io/6362917",
    integrations: [new BrowserTracing()],
    tracesSampleRate: 1.0,
});

const app = new App({
    target: document.body,
});

export default app;