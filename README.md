# TheftGuard AI frontend

React + Tailwind CSS + Recharts preview of the TheftGuard AI workspace. It is a **frontend only**: no backend, database, sign-in or ML service is connected. Everything that looks like data is either computed in the browser from a file you select, or is clearly labelled demonstration data.

## Run it

Node.js 18 or newer (the project owner uses Node v24.19.0 and npm 11.17.0). Run inside this folder only; nothing outside it, and no Python environment, is touched.

```bat
npm install
npm run dev
npm run build
```

### Packages (all installed into `frontend/node_modules`)

| Package | Why |
| --- | --- |
| react, react-dom 18.3 | UI |
| react-router-dom 6 | Routes |
| recharts 2.15 | Charts |
| vite 5, @vitejs/plugin-react | Dev server and build |
| tailwindcss 3.4, postcss, autoprefixer | Styling |

No icon, UI-kit or state library. Icons are inline SVG in `src/components/Icon.jsx`.

## Pages

| Route | Purpose | Real or demonstration |
| --- | --- | --- |
| `/` | Landing page | Rows in the preview table are invented; test metrics are the documented ones |
| `/signin` | Sign-in preview | Disabled; no authentication |
| `/app/dashboard` | Overview and charts | Demonstration customers and scores |
| `/app/screening` | Choose a CSV with the 13 model columns and check it in the browser | The file check is real; scoring is not connected |
| `/app/results` | Searchable table, drawer, display bands, CSV export | Demonstration scores, or your rows shown as "Not scored" |
| `/app/comparison` | Historical-versus-current kWh, ₹ tariff estimate, charts | Computed in the browser from your file or demo data; does not use the model |
| `/app/investigations` | Queue, inspection checklist, notes, evidence names | Held in the tab only; nothing is saved, assigned or sent |
| `/app/reports` | Report preview, CSV download, print or save as PDF | Built from the loaded data |
| `/app/model` | Verified metrics, limitations, unconfirmed facts | Documented results only |

## Honesty rules built into the interface

- The output is called **Model Score** and is never a probability. Wording is "Potentially Suspicious" and "Review Recommended"; no screen states or implies theft.
- ML screening and consumption comparison are separate pages with separate numbers.
- Money is in ₹ from a tariff field, labelled as an estimate with its assumptions. The default 7 is an example, not a utility rate.
- Display bands (Elevated from 0.30, Review Recommended from 0.50) are display aids; 0.50 is the saved model's own default threshold.
- Unknown dataset facts (source, licence, FLAG meaning, units) are shown as "Unconfirmed".

## Where to connect real services

All state lives in `src/state/AppState.jsx`; the pages only read from it.

| Need | Replace or extend |
| --- | --- |
| Sign-in | `pages/SignIn.jsx`, then guard the `/app` routes in `App.jsx` |
| Screening | `Screening.jsx` builds `customers` rows (`id`, `features`, `score: null`). Send the rows to the backend and put the returned Model Score and warnings in `score` |
| Results store | Replace the `customers` value in `AppState.jsx` with data fetched from the API |
| Investigations | `addInvestigation`, `updateInvestigation`, `toggleChecklist`, `removeInvestigation` in `AppState.jsx` |
| Model facts | `src/data/modelFacts.js` (or fetch the model-metadata endpoint) |
| Feature list | `src/data/features.js` (13 names in model order) |

The `/v1` ML service in `ml-service/service` returns `predicted_label`, `label_name`, `model_score`, `warnings` per row and 422 `error.issues` for invalid rows; the table already shows `model_score` and maps it to categories in `src/lib/risk.js`.

## Design notes

- **Palette:** ink `#0F0F0F`, gold `#F4C430`, white, pale gold `#FFF6D5`, light grey `#F2F3F5`, plus a hairline grey and a muted text grey. Gold marks selection and the review band and is never used as text on white; red appears only for errors, so a suspicious flag does not read as a verdict.
- **Type:** Bricolage Grotesque for headings and large numbers, IBM Plex Sans for the interface, tabular numerals throughout. Both load from Google Fonts with system fallbacks.
- **Signature element:** the score scale in `components/ui.jsx`, a thin track with the review band in gold and a black marker. It appears in the landing preview, tables and the detail drawer.
- **Layout:** a black navigation rail on desktop, a menu drawer on mobile, flat white working surfaces on light grey with hairline borders, tables before cards, and one radius.
- **Accessibility:** skip link, visible focus (black on light, gold on dark), labelled controls, semantic tables with captions, chart summaries for screen readers, reduced-motion support, print styles for reports.

## Verification status

Checked in the build sandbox: every `.js` and `.jsx` file parses; all relative imports and named exports resolve; every JSX component is imported or defined; the CSV, comparison, risk and demo-data modules pass logic checks in Node. **`npm install` and `npm run build` have not been run**, because the sandbox has no network access. Run them first and report any error. Nothing has been checked in a browser.
