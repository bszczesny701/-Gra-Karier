# Gra Kariery — Zawodnik

Przeglądarkowy symulator kariery piłkarza (PWA) z decyzjami tygodniowymi, meczami i transferami.

## Uruchomienie lokalne

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## GitHub Pages

1. Utwórz repozytorium o nazwie **`Gra-Karier`** (lub zmień `REPO_NAME` w `vite.config.ts`).
2. Włącz Pages: **Settings → Pages → Source: GitHub Actions**.
3. Wypchnij kod na `main` / `master` — workflow `.github/workflows/deploy.yml` zbuduje i wdroży stronę.

Adres: `https://<twoj-user>.github.io/Gra-Karier/`

## Rozgrywka

- Tworzysz zawodnika (pozycja + imię)
- Każdy tydzień: decyzja → mecz kolejki
- Sezon ma 12 kolejek; na koniec awans / spadek / oferta
- Zapis automatyczny w `localStorage`
