# H000023 Ultimatum Game

HTML/browser preview of the responder-side Ultimatum Game built with `psyflow-web`.
Offer scheduling (`fair/unfair/very_unfair`), accept/reject/timeout decision logic, and cumulative earnings are aligned to local `T000023-ultimatum-game`, with shortened block count for preview.

## Layout

- `main.ts`: task orchestration
- `config/config.yaml`: declarative config
- `src/controller.ts`: offer scheduler and cumulative earning tracker
- `src/run_trial.ts`: trial logic
- `src/utils.ts`: condition parsing and summary helpers

## Run

From `e:\xhmhc\TaskBeacon\psyflow-web`:

```powershell
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:4173/?task=H000023-ultimatum-game
```
