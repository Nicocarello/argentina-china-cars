# 🚗 Monitor de Marcas Chinas en Argentina (2018 - 2026) | Microdatos Oficiales DNRPA

[![GitHub Pages](https://img.shields.io/badge/Demo%20Online-GitHub%20Pages-brightgreen.svg)](https://Nicocarello.github.io/argentina-china-cars/)
[![Auto Update](https://github.com/Nicocarello/argentina-china-cars/actions/workflows/monthly_update.yml/badge.svg)](https://github.com/Nicocarello/argentina-china-cars/actions/workflows/monthly_update.yml)
[![HTML5 / Vanilla CSS / JS](https://img.shields.io/badge/Stack-HTML5%20%7C%20Vanilla%20CSS%20%7C%20ES6+-orange.svg)](https://developer.mozilla.org/)
[![Plotly.js](https://img.shields.io/badge/Mapas-Plotly.js%20Dual--Panel-blue.svg)](https://plotly.com/javascript/)
[![Chart.js](https://img.shields.io/badge/Gráficos-Chart.js-purple.svg)](https://www.chartjs.org/)
[![Datos Abiertos](https://img.shields.io/badge/Fuente-DNRPA%20%2F%20datos.gob.ar-red.svg)](https://datos.gob.ar/dataset/inscripciones-iniciales-de-autos)

Aplicación web interactiva y pipeline de actualización mensual sobre la **disrupción histórica de las marcas automotrices chinas en el mercado 0km de Argentina** desde **2018 hasta 2026**, basada en microdatos oficiales abiertos de la **DNRPA (Ministerio de Justicia)**.

---

## 🌟 Características de la Aplicación Web

Construida con **HTML5, Vanilla CSS moderno y JavaScript ES6+**, sin frameworks pesados de backend, con **carga instantánea (< 100 ms)** en cualquier dispositivo:

* 🎨 **Tema Claro Ejecutivo (Lighter Theme) + Modo Oscuro:** Diseño luminoso y moderno de alto contraste por defecto, con botón de alternancia rápida (`☀️ / 🌙`) y persistencia en `localStorage`.
* 📅 **Exploración Histórica Completa (2018 a 2026):** Barra de selector por año (`2018`, `2019`, ..., `2026`) y selector mensual dinámico (`Ene` a `Dic` o `Acumulado Total`).
* 📊 **Gráfico Dual: Mensual vs. Macro Disrupción (2018 - 2026):** Alterna entre la evolución mes a mes del año seleccionado y la curva exponencial de 9 años que muestra el despegue del bloque chino del 0,5% (2023) al 9,41% (2026).
* 🗺️ **Geomapa Coroplético Bipanel (IGN / Georef):**
  * **Mapa nacional (23 provincias):** Escala de calor dinámica adaptada al rango del período seleccionado.
  * **Detalle CABA ampliado:** Tarjeta flotante con zoom exclusivo de la Ciudad de Buenos Aires para una inspección precisa.
* ⚡ **Scorecard de KPIs Dinámicos:** Total de inscripciones 0km, patentamientos chinos, market share y marca líder del período.
* 🔋 **Mix de Propulsión:** Proporción de motorizaciones ecológicas (*HEV*, *PHEV*, *BEV*, *ICE*).
* 🏆 **Rankings en Tiempo Real:** Las 24 jurisdicciones ordenadas por cuota, Top 10 modelos más vendidos y concentración comercial por seccionales DNRPA.
* ▶️ **Evolución Animada:** Reproductor cronológico automático mes a mes.

---

## 🔄 Pipeline de Actualización Mensual (DNRPA / datos.gob.ar)

El monitoreo se actualiza automáticamente cada mes cuando la DNRPA publica nuevas inscripciones iniciales (por ejemplo, en noviembre se publican los resultados consolidados de octubre 2026).

### 1. Actualización Automática con GitHub Actions
El repositorio incluye un workflow en [`.github/workflows/monthly_update.yml`](.github/workflows/monthly_update.yml) configurado para:
* **Ejecutarse automáticamente** los días **5, 10, 15 y 20 de cada mes** a las 12:00 UTC.
* Consultar la API CKAN de `datos.gob.ar` y verificar si hay meses nuevos subidos en el archivo ZIP de 2026.
* Si detecta un nuevo mes (ej. `2026-10`), descarga, procesa incrementalmente, actualiza `data/dashboard_data.json` y realiza un `git push` automático.
* **El sitio público en GitHub Pages se actualiza de forma autónoma sin intervención humana.**

> **Ejecución manual en GitHub:** En la pestaña **Actions** de tu repositorio, haz clic en **Auto Update DNRPA Monthly Data** > **Run workflow**.

### 2. Actualización Local mediante Script
También puedes ejecutar el pipeline directamente desde tu terminal:

```bash
# Sincronizar con el servidor de DNRPA (detecta automáticamente nuevos meses)
python scripts/update_pipeline.py

# Forzar reprocesamiento del año en curso
python scripts/update_pipeline.py --force

# Actualizar usando únicamente archivos CSV locales depositados en data/
python scripts/update_pipeline.py --local-only
```

El script preserva intactos los años históricos consolidados (2018-2025) y procesa el año corriente en menos de 10 segundos.

---

## 🚀 Despliegue en GitHub Pages (Público y Gratuito)

1. **Subir el proyecto a GitHub:**
   ```bash
   git init
   git add .
   git commit -m "feat: Monitor automotor multianual DNRPA 2018-2026"
   git branch -M main
   git remote add origin https://github.com/Nicocarello/argentina-china-cars.git
   git push -u origin main
   ```
2. **Activar GitHub Pages:**
   * Entra al repositorio en GitHub > **Settings** > **Pages**.
   * En **Source**, selecciona **Deploy from a branch**.
   * En **Branch**, selecciona `main` y `/ (root)`. Guarda los cambios.
3. **Acceso público:**
   👉 `https://Nicocarello.github.io/argentina-china-cars/`

---

## 💻 Ejecución en Servidor Local

```bash
# Iniciar servidor local liviano
python -m http.server 3000

# Abrir en el navegador:
# http://localhost:3000
```

---

## 📁 Estructura del Proyecto

```text
├── index.html                 # Interfaz visual de la aplicación web (Light / Dark)
├── style.css                  # Hoja de estilos con tokens para tema claro y oscuro
├── app.js                     # Motor interactivo de datos, selector multianual y mapas
├── data/
│   ├── dashboard_data.json    # Métricas agregadas multianuales (2018 - 2026) (~457 KB)
│   └── argentina-provincias.geojson # Cartografía vectorial oficial IGN/Georef
├── scripts/
│   ├── update_pipeline.py     # Pipeline mensual de sincronización e ingestión incremental
│   ├── download_data.py       # Descargador histórico desde datos.gob.ar
│   └── build_full_historical_data.py # Constructor de la serie histórica 2018-2026
├── .github/
│   └── workflows/
│       └── monthly_update.yml # Automatización GitHub Actions de actualización mensual
├── notebook/
│   └── eda.ipynb              # Notebook analítico con los 9 módulos de investigación
└── .gitignore                 # Excluye CSVs pesados para mantener el repositorio ágil
```

---

## 📄 Licencia y Fuente de Datos
* **Fuente Oficial:** [Dirección Nacional de los Registros Nacionales de la Propiedad del Automotor (DNRPA)](https://datos.gob.ar/dataset/inscripciones-iniciales-de-autos), Ministerio de Justicia de la Nación.
* **Licencia de Datos:** Creative Commons Attribution 4.0 International (CC-BY-4.0).
