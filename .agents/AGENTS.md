# Project Rules

- **NEVER MODIFY THE PAINEL DE LINKS (`public/painel/` OR `/painel/index.html`, `/painel/style.css`, `/painel/script.js`) UNLESS THE USER EXPLICITLY REQUESTS IT.**
  - All global stylesheets (`theme-command-center.css`, `style.css`, etc.) MUST be strictly scoped so they NEVER leak, mutate, or override styles inside the `public/painel/` sub-application.
