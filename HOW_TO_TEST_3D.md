# 2D vs 3D

Сжатые модели лежат в `public/models/` (~0.5–2.6 МБ). Исходные тяжёлые GLB (~30–39 МБ) остаются в `public/fish/` и **не попадают в dist**.

## Локально

```bash
npm run dev
```

- Сравнение: http://localhost:5173/test-3d.html
- Обе версии в воде: http://localhost:5173/aquarium.html?compare=1

## Netlify

Деплой из git (`npm run build`) или папки `dist/` после `npm run build`. Не загружайте `public/fish/*.glb` — они слишком большие для деплоя.
