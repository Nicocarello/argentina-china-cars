/**
 * ==============================================================================
 * ARGENTINA AUTO MONITOR - JAVASCRIPT APPLICATION LOGIC
 * Multi-Year Analysis (2018 - 2026), Segment Filter (Autos/SUVs/Pickups),
 * Scrubber Controller, Dual Plotly Map, Dynamic Rankings, Macro Evolution Chart,
 * and Dual-Theme Engine (Light/Dark).
 * ==============================================================================
 */

// Application Global State
let dashboardData = null;
let geojsonData = null;
let currentYear = 2026;
let currentPeriod = 'ALL';
let currentSegment = 'TOTAL'; // 'TOTAL' | 'GENTE' | 'SUVS_AUTOS' | 'PICKUPS'
let chartViewMode = 'annual'; // 'annual' | 'macro'
let isPlaying = false;
let animationInterval = null;
let currentTheme = 'light'; // default lighter theme

// Chart Instances
let chartEvolution = null;
let chartBrands = null;

// Month dictionary helpers
const MONTH_NAMES_ES = {
    '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
    '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
    '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre'
};

const MONTH_ABBR_ES = {
    '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
    '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
    '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic'
};

const SEGMENT_LABELS = {
    'TOTAL': 'Todo el Mercado',
    'GENTE': 'Autos de la Gente (Autos + SUVs + Pick-ups)',
    'SUVS_AUTOS': 'Solo Autos y SUVs Familiares',
    'PICKUPS': 'Pick-ups y Camionetas'
};

function getPeriodLabel(period, year) {
    if (period === 'ALL') {
        return `Año ${year} • Acumulado Total`;
    }
    const parts = period.split('-');
    if (parts.length === 2 && MONTH_NAMES_ES[parts[1]]) {
        return `${MONTH_NAMES_ES[parts[1]]} ${year}`;
    }
    return period;
}

// Initialize App upon DOM ready
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    setupStaticEventListeners();
    init3DMap();
    await loadInitialData();
    initializeYearPills();
    initializeMonthPills();
    renderDashboard();
});

/**
 * Initialize and sync Theme state
 */
function initTheme() {
    const savedTheme = localStorage.getItem('argentina_auto_theme');
    if (savedTheme) {
        currentTheme = savedTheme;
    } else {
        currentTheme = 'light';
    }
    applyTheme(currentTheme);
}

function applyTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('argentina_auto_theme', theme);

    const themeIcon = document.getElementById('theme-icon');
    const themeText = document.getElementById('theme-text');

    if (theme === 'light') {
        if (themeIcon) themeIcon.textContent = '🌙';
        if (themeText) themeText.textContent = 'Modo Oscuro';
    } else {
        if (themeIcon) themeIcon.textContent = '☀️';
        if (themeText) themeText.textContent = 'Modo Claro';
    }
}

function toggleTheme() {
    const nextTheme = (currentTheme === 'light') ? 'dark' : 'light';
    applyTheme(nextTheme);
    renderDashboard();
}

/**
 * Configure UI event listeners that do not depend on dynamic pills
 */
function setupStaticEventListeners() {
    // Theme toggle button
    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', toggleTheme);
    }

    // Vehicle Segment Filter Pills
    const segPills = document.querySelectorAll('.segment-pill');
    segPills.forEach(pill => {
        pill.addEventListener('click', (e) => {
            const seg = e.currentTarget.getAttribute('data-segment');
            selectSegment(seg);
        });
    });

    // Playback animation button
    const playBtn = document.getElementById('btn-play-animation');
    if (playBtn) {
        playBtn.addEventListener('click', toggleAnimation);
    }

    // Chart mode toggle buttons (Mensual vs Macro Multianual)
    const btnAnnual = document.getElementById('btn-toggle-annual');
    const btnMacro = document.getElementById('btn-toggle-macro');

    if (btnAnnual && btnMacro) {
        btnAnnual.addEventListener('click', () => {
            if (chartViewMode === 'annual') return;
            chartViewMode = 'annual';
            btnAnnual.classList.add('active');
            btnMacro.classList.remove('active');
            updateChartEvolutionHeader();
            renderEvolutionChart();
        });

        btnMacro.addEventListener('click', () => {
            if (chartViewMode === 'macro') return;
            chartViewMode = 'macro';
            btnMacro.classList.add('active');
            btnAnnual.classList.remove('active');
            updateChartEvolutionHeader();
            renderEvolutionChart();
        });
    }
}

/**
 * Handle vehicle segment filter change
 */
function selectSegment(segment) {
    if (segment === currentSegment) return;
    currentSegment = segment;

    document.querySelectorAll('.segment-pill').forEach(pill => {
        if (pill.getAttribute('data-segment') === segment) {
            pill.classList.add('active');
        } else {
            pill.classList.remove('active');
        }
    });

    updateTimelineLabel();
    updateChartEvolutionHeader();
    renderDashboard();
}

/**
 * Load pre-aggregated multi-year JSON metrics and GeoJSON cartography
 */
async function loadInitialData() {
    try {
        const [dashResp, geoResp] = await Promise.all([
            fetch('data/dashboard_data.json?v=' + Date.now()),
            fetch('data/argentina-provincias.geojson')
        ]);

        if (!dashResp.ok || !geoResp.ok) {
            throw new Error(`Error cargando archivos: ${dashResp.statusText} / ${geoResp.statusText}`);
        }

        dashboardData = await dashResp.json();
        geojsonData = await geoResp.json();

        // Build official high-resolution geometry from GeoJSON
        buildProvincesFromGeoJSON(geojsonData);

        // Establish default year
        if (dashboardData.current_year) {
            currentYear = dashboardData.current_year;
        } else if (dashboardData.available_years && dashboardData.available_years.length > 0) {
            currentYear = dashboardData.available_years[dashboardData.available_years.length - 1];
        }

        // Update nav badge with latest official month
        const navBadge = document.getElementById('nav-badge-text');
        if (navBadge) {
            let latestStr = '';
            if (dashboardData.latest_month) {
                const parts = dashboardData.latest_month.split('-');
                if (parts.length === 2 && MONTH_NAMES_ES[parts[1]]) {
                    latestStr = `${MONTH_NAMES_ES[parts[1]].toUpperCase()} ${parts[0]}`;
                }
            } else if (dashboardData.years && dashboardData.years[currentYear]) {
                const meses = dashboardData.years[currentYear].meses;
                if (meses && meses.length > 0) {
                    const lastM = meses[meses.length - 1];
                    const parts = lastM.split('-');
                    if (parts.length === 2 && MONTH_NAMES_ES[parts[1]]) {
                        latestStr = `${MONTH_NAMES_ES[parts[1]].toUpperCase()} ${parts[0]}`;
                    }
                }
            }
            if (latestStr) {
                navBadge.textContent = `OFICIAL DNRPA • ACTUALIZADO: ${latestStr}`;
            }
        }

        // Remove spinner
        const spinner = document.getElementById('map-spinner');
        if (spinner) spinner.style.display = 'none';

    } catch (err) {
        console.error("Fallo de inicialización de datos:", err);
        const container = document.getElementById('canvas-wrapper') || document.getElementById('map-3d-wrap') || document.getElementById('plotly-map-container');
        if (container) {
            container.innerHTML = `
                <div style="padding: 40px; text-align: center; color: #ef4444;">
                    <h4>⚠️ Error al cargar datos</h4>
                    <p style="color: #64748b; font-size: 0.9rem; margin-top: 8px;">${err.message}</p>
                </div>
            `;
        }
    }
}

/**
 * Render year pills dynamically (2018 to 2026)
 */
function initializeYearPills() {
    const container = document.getElementById('year-pills-container');
    if (!container || !dashboardData || !dashboardData.available_years) return;

    let html = '';
    dashboardData.available_years.forEach(year => {
        const isActive = (year === currentYear);
        html += `
            <button class="year-pill ${isActive ? 'active' : ''}" data-year="${year}">
                ${year}
            </button>
        `;
    });

    container.innerHTML = html;

    container.querySelectorAll('.year-pill').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (isPlaying) stopAnimation();
            const y = parseInt(e.currentTarget.getAttribute('data-year'), 10);
            selectYear(y);
        });
    });
}

/**
 * Render month pills dynamically for the currently active year
 */
function initializeMonthPills() {
    const container = document.getElementById('month-pills-container');
    if (!container || !dashboardData || !dashboardData.years[currentYear]) return;

    const yearData = dashboardData.years[currentYear];
    const meses = yearData.meses || [];

    let html = `
        <button class="pill ${currentPeriod === 'ALL' ? 'active' : ''}" data-period="ALL">
            Todo el Año
        </button>
    `;

    meses.forEach(m => {
        const parts = m.split('-');
        const monthNum = parts[1];
        const abbr = MONTH_ABBR_ES[monthNum] || monthNum;
        const isActive = (currentPeriod === m);

        html += `
            <button class="pill ${isActive ? 'active' : ''}" data-period="${m}">
                ${abbr}
            </button>
        `;
    });

    container.innerHTML = html;

    container.querySelectorAll('.pill').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (isPlaying) stopAnimation();
            const p = e.currentTarget.getAttribute('data-period');
            selectPeriod(p);
        });
    });
}

/**
 * Select a different year
 */
function selectYear(year) {
    if (year === currentYear) return;
    currentYear = year;
    currentPeriod = 'ALL';

    document.querySelectorAll('.year-pill').forEach(btn => {
        const y = parseInt(btn.getAttribute('data-year'), 10);
        if (y === currentYear) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    initializeMonthPills();
    updateTimelineLabel();
    updateChartEvolutionHeader();
    renderDashboard();
}

/**
 * Select a period (ALL or specific month) within the current year
 */
function selectPeriod(period) {
    currentPeriod = period;

    document.querySelectorAll('.month-pills .pill').forEach(pill => {
        if (pill.getAttribute('data-period') === period) {
            pill.classList.add('active');
        } else {
            pill.classList.remove('active');
        }
    });

    updateTimelineLabel();
    renderDashboard();
}

/**
 * Update the period & segment description in the controller
 */
function updateTimelineLabel() {
    const label = document.getElementById('timeline-current-label');
    if (label) {
        const segName = SEGMENT_LABELS[currentSegment] || 'Todo el Mercado';
        label.innerHTML = `Mostrando: <b>${getPeriodLabel(currentPeriod, currentYear)}</b> • <span style="color: var(--accent-cyan); font-weight: 700;">${segName}</span>`;
    }
}

/**
 * Update chart evolution header title and description
 */
function updateChartEvolutionHeader() {
    const titleEl = document.getElementById('chart-evolution-title');
    const descEl = document.getElementById('chart-evolution-desc');
    const segName = SEGMENT_LABELS[currentSegment] || 'Mercado';

    if (chartViewMode === 'annual') {
        if (titleEl) titleEl.textContent = `Evolución Mensual (${currentYear}) - ${segName}`;
        if (descEl) descEl.textContent = `Patentamientos y Market Share mes a mes durante ${currentYear}`;
    } else {
        if (titleEl) titleEl.textContent = `Evolución Macro Multianual (2018 - 2026) - ${segName}`;
        if (descEl) descEl.textContent = `Trayectoria histórica completa y salto de escala en este segmento`;
    }
}

/**
 * Toggle animated timeline playback
 */
function toggleAnimation() {
    if (isPlaying) {
        stopAnimation();
    } else {
        startAnimation();
    }
}

function startAnimation() {
    const yearObj = dashboardData?.years[currentYear];
    if (!yearObj) return;

    const periodList = ['ALL', ...(yearObj.meses || [])];
    if (periodList.length <= 1) return;

    isPlaying = true;
    const playIcon = document.getElementById('play-icon');
    const playText = document.getElementById('play-text');
    if (playIcon) playIcon.textContent = '⏸';
    if (playText) playText.textContent = 'Pausar';

    let index = periodList.indexOf(currentPeriod);
    if (index <= 0 || index >= periodList.length - 1) {
        index = 1;
        selectPeriod(periodList[index]);
    }

    animationInterval = setInterval(() => {
        index++;
        if (index >= periodList.length) {
            index = 0;
            selectPeriod(periodList[index]);
            stopAnimation();
            return;
        }
        selectPeriod(periodList[index]);
    }, 1300);
}

function stopAnimation() {
    isPlaying = false;
    clearInterval(animationInterval);
    const playIcon = document.getElementById('play-icon');
    const playText = document.getElementById('play-text');
    if (playIcon) playIcon.textContent = '▶';
    if (playText) playText.textContent = 'Evolución Animada';
}

/**
 * Helper to obtain the active slice based on segment and year
 */
function getActiveSlice() {
    if (!dashboardData) return null;
    const yearObj = dashboardData.years[currentYear];
    if (!yearObj) return null;

    if (yearObj.segmentos && yearObj.segmentos[currentSegment]) {
        return yearObj.segmentos[currentSegment];
    }
    return yearObj;
}

/**
 * Render all dashboard sections for the active year, period, and segment
 */
function renderDashboard() {
    if (!dashboardData || !geojsonData) return;

    const slice = getActiveSlice();
    if (!slice || !slice.periodos) return;

    const data = slice.periodos[currentPeriod] || slice.periodos['ALL'];
    if (!data) return;

    renderKPIs(data);
    render3DMap(data);
    renderProvincesTable(data);
    renderEvolutionChart(slice);
    renderBrandsChart(data);
    renderModelsList(data);
    renderSeccionalesList(data);
}

/**
 * Update KPI cards with formatting
 */
function renderKPIs(data) {
    animateCounter('kpi-total-val', data.total_pat);
    animateCounter('kpi-chinos-val', data.chinos_pat);

    const shareEl = document.getElementById('kpi-share-val');
    if (shareEl) shareEl.textContent = `${data.share_pct.toFixed(2)}%`;

    const leaderEl = document.getElementById('kpi-leader-val');
    if (leaderEl) leaderEl.textContent = data.marca_lider || '--';

    const leaderSub = document.getElementById('kpi-leader-sub');
    if (leaderSub) {
        leaderSub.textContent = data.marca_lider_u
            ? `${data.marca_lider_u.toLocaleString('es-AR')} unidades en el segmento`
            : 'Sin datos disponibles';
    }
}

function animateCounter(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = (target || 0).toLocaleString('es-AR');
}

// ==============================================================================
// 3D ARGENTINA TOPOGRAPHIC ENGINE (HTML5 CANVAS 3D RELIEF & CABA ZOOM-UP)
// ==============================================================================

const FALLBACK_PROVINCES = [
    { name: "Jujuy", rings: [[[-67.2,-22.9],[-66.5,-22.3],[-66.1,-21.8],[-65.2,-22.1],[-64.9,-22.3],[-64.3,-23.5],[-64.8,-24.2],[-65.4,-24.4],[-66.2,-24.1],[-67.1,-23.6]]] },
    { name: "Salta", rings: [[[-68.5,-25.2],[-67.6,-24.1],[-67.1,-23.6],[-66.2,-24.1],[-65.4,-24.4],[-64.8,-24.2],[-64.3,-23.5],[-64.9,-22.3],[-64.2,-22.6],[-63.6,-22.0],[-62.6,-22.2],[-62.3,-24.1],[-62.3,-25.7],[-63.5,-25.7],[-64.4,-26.3],[-65.8,-26.3],[-66.5,-26.1]]] },
    { name: "Formosa", rings: [[[-62.6,-22.2],[-61.5,-23.4],[-60.2,-24.1],[-58.8,-25.0],[-57.6,-25.3],[-57.9,-26.1],[-58.4,-26.9],[-59.6,-26.4],[-61.2,-25.5],[-62.3,-24.1]]] },
    { name: "Chaco", rings: [[[-62.3,-24.1],[-61.2,-25.5],[-59.6,-26.4],[-58.4,-26.9],[-58.6,-27.4],[-58.9,-28.0],[-61.7,-28.0],[-61.7,-26.8],[-62.3,-25.7]]] },
    { name: "Misiones", rings: [[[-56.0,-27.4],[-55.1,-26.7],[-54.6,-25.6],[-53.9,-25.6],[-53.6,-26.2],[-54.1,-27.2],[-55.1,-27.9],[-55.7,-28.1]]] },
    { name: "Corrientes", rings: [[[-58.6,-27.4],[-57.5,-27.3],[-56.7,-27.5],[-56.0,-27.4],[-55.7,-28.1],[-56.4,-29.2],[-57.6,-30.2],[-58.0,-30.5],[-59.6,-30.3],[-59.3,-29.0],[-58.9,-28.0]]] },
    { name: "Tucumán", rings: [[[-66.1,-26.2],[-65.8,-26.3],[-64.8,-26.2],[-64.8,-27.6],[-65.6,-28.0],[-66.0,-27.3]]] },
    { name: "Santiago del Estero", rings: [[[-64.4,-26.3],[-63.5,-25.7],[-62.3,-25.7],[-61.7,-26.8],[-61.7,-28.0],[-62.1,-30.0],[-63.4,-29.8],[-64.9,-29.6],[-65.2,-28.1],[-64.8,-27.6],[-64.8,-26.2]]] },
    { name: "Catamarca", rings: [[[-68.5,-25.2],[-66.5,-26.1],[-66.1,-26.2],[-66.0,-27.3],[-65.6,-28.0],[-65.2,-28.1],[-64.9,-29.6],[-65.4,-30.1],[-66.3,-29.2],[-67.8,-28.2],[-69.1,-27.8],[-68.8,-26.5]]] },
    { name: "La Rioja", rings: [[[-69.1,-27.8],[-67.8,-28.2],[-66.3,-29.2],[-65.4,-30.1],[-65.5,-31.4],[-66.6,-31.9],[-67.5,-31.1],[-68.6,-29.7],[-69.5,-28.7]]] },
    { name: "San Juan", rings: [[[-69.5,-28.7],[-68.6,-29.7],[-67.5,-31.1],[-66.6,-31.9],[-67.3,-32.4],[-68.8,-32.5],[-70.1,-32.1],[-70.4,-30.7],[-69.9,-29.5]]] },
    { name: "Santa Fe", rings: [[[-61.7,-28.0],[-58.9,-28.0],[-59.3,-29.0],[-59.6,-30.3],[-60.5,-31.7],[-60.7,-32.9],[-60.3,-33.3],[-61.7,-34.4],[-62.7,-34.4],[-62.1,-31.8],[-62.1,-30.0]]] },
    { name: "Entre Ríos", rings: [[[-59.6,-30.3],[-58.0,-30.5],[-57.9,-31.4],[-58.2,-32.5],[-58.4,-33.5],[-58.6,-34.0],[-59.8,-33.6],[-60.3,-33.3],[-60.7,-32.9],[-60.5,-31.7]]] },
    { name: "Córdoba", rings: [[[-64.9,-29.6],[-63.4,-29.8],[-62.1,-30.0],[-62.1,-31.8],[-62.7,-34.4],[-63.4,-35.0],[-65.1,-35.0],[-65.2,-32.0],[-65.5,-31.4],[-65.4,-30.1]]] },
    { name: "San Luis", rings: [[[-66.6,-31.9],[-65.5,-31.4],[-65.2,-32.0],[-65.1,-35.0],[-65.1,-36.0],[-66.6,-36.0],[-67.2,-33.5],[-67.3,-32.4]]] },
    { name: "Mendoza", rings: [[[-70.1,-32.1],[-68.8,-32.5],[-67.3,-32.4],[-67.2,-33.5],[-66.6,-36.0],[-68.2,-36.0],[-68.3,-37.5],[-70.4,-37.5],[-70.4,-35.2],[-69.8,-33.8]]] },
    { name: "Ciudad Autónoma de Buenos Aires", rings: [[[-58.53,-34.53],[-58.34,-34.54],[-58.33,-34.70],[-58.53,-34.70]]] },
    { name: "Buenos Aires", rings: [[[-60.3,-33.3],[-59.8,-33.6],[-58.6,-34.0],[-58.4,-34.5],[-57.9,-34.9],[-57.1,-35.5],[-57.4,-36.0],[-56.7,-36.3],[-56.7,-37.0],[-57.5,-38.0],[-58.7,-38.6],[-60.5,-38.9],[-62.1,-38.9],[-62.3,-39.5],[-62.1,-40.5],[-62.8,-41.0],[-63.4,-40.7],[-63.4,-35.0],[-62.7,-34.4],[-61.7,-34.4]]] },
    { name: "La Pampa", rings: [[[-68.2,-36.0],[-66.6,-36.0],[-65.1,-36.0],[-63.4,-35.0],[-63.4,-39.0],[-64.2,-39.0],[-65.8,-38.8],[-67.7,-38.0],[-68.3,-37.5]]] },
    { name: "Neuquén", rings: [[[-70.4,-37.5],[-68.3,-37.5],[-67.7,-38.0],[-68.0,-39.0],[-69.6,-39.8],[-71.1,-41.0],[-71.8,-40.8],[-71.5,-39.0],[-71.1,-37.8]]] },
    { name: "Río Negro", rings: [[[-67.7,-38.0],[-65.8,-38.8],[-64.2,-39.0],[-63.4,-39.0],[-63.4,-40.7],[-62.8,-41.0],[-64.2,-41.2],[-65.1,-40.8],[-65.0,-42.0],[-71.6,-42.0],[-71.8,-40.8],[-71.1,-41.0],[-69.6,-39.8],[-68.0,-39.0]]] },
    { name: "Chubut", rings: [[[-71.6,-42.0],[-65.0,-42.0],[-64.4,-42.1],[-64.3,-42.6],[-63.6,-42.1],[-63.6,-42.8],[-64.3,-42.9],[-65.0,-42.7],[-65.2,-43.5],[-65.4,-44.6],[-66.5,-45.1],[-67.5,-45.8],[-67.5,-46.0],[-71.7,-46.0],[-72.1,-44.5],[-71.8,-43.2]]] },
    { name: "Santa Cruz", rings: [[[-71.7,-46.0],[-67.5,-46.0],[-67.6,-46.6],[-65.7,-47.1],[-65.9,-48.1],[-67.6,-49.2],[-68.5,-50.1],[-68.9,-51.5],[-68.4,-52.4],[-71.9,-52.0],[-72.4,-51.3],[-73.3,-50.2],[-73.1,-48.9],[-72.4,-47.5]]] },
    { name: "Tierra del Fuego", rings: [[[-68.6,-52.6],[-68.1,-53.2],[-67.7,-53.8],[-66.4,-54.4],[-65.1,-54.7],[-66.5,-55.0],[-68.6,-54.9]]] }
];

// Paleta térmica 3D (Azul Marino -> Cian -> Ámbar -> Rojo Coral)
const COLOR_STOPS = [
    { pos: 0.0, rgb: [30, 58, 138] },
    { pos: 0.35, rgb: [14, 165, 233] },
    { pos: 0.7, rgb: [245, 158, 11] },
    { pos: 1.0, rgb: [239, 68, 68] }
];

function getColorForValue(val) {
    const t = Math.max(0, Math.min(1, val / 100));
    for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
        const a = COLOR_STOPS[i];
        const b = COLOR_STOPS[i + 1];
        if (t >= a.pos && t <= b.pos) {
            const localT = (t - a.pos) / (b.pos - a.pos);
            return [
                Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * localT),
                Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * localT),
                Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * localT)
            ];
        }
    }
    return [239, 68, 68];
}

function rgbStr(rgb, mult = 1, alpha = 1) {
    const r = Math.min(255, Math.max(0, Math.round(rgb[0] * mult)));
    const g = Math.min(255, Math.max(0, Math.round(rgb[1] * mult)));
    const b = Math.min(255, Math.max(0, Math.round(rgb[2] * mult)));
    return alpha < 1 ? `rgba(${r},${g},${b},${alpha})` : `rgb(${r},${g},${b})`;
}

// Estado del motor 3D
let provinces = [];          // 23 Provincias continentales (ordenadas Norte a Sur)
let cabaProvince = null;     // Objeto 3D independiente para CABA (Zoom superior derecho)
let allProvinces = [];       // Lista completa de las 24 jurisdicciones para sincronización
let dpr = 1;
let baseScale = 1;
let cam = { x: 0, y: 0, zoom: 1, tilt: 0.65, extrudeScale: 1.0 };
let targetTilt = 0.65;
let hoveredIdx = -1;
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let animLoopRunning = false;
let mapListenersAttached = false;
let mapMaxShare = 17.7;
let cabaPinX = 0;
let cabaPinY = 0;

function simplifyRing(ring, maxPoints = 160) {
    if (ring.length <= maxPoints) return ring;
    const step = ring.length / maxPoints;
    const result = [];
    for (let i = 0; i < maxPoints; i++) {
        result.push(ring[Math.floor(i * step)]);
    }
    return result;
}

function buildProvincesData(rawList) {
    const cosLat = Math.cos(-38 * Math.PI / 180);
    const parsed = [];
    let cabaItem = null;

    rawList.forEach((item, idx) => {
        const name = item.name;
        const isCaba = name.includes("Ciudad") || name.includes("Capital");
        let latSum = 0, lonSum = 0, ptCount = 0;
        const projectedRings = [];

        item.rings.forEach(outerRing => {
            const simplified = simplifyRing(outerRing, 160);
            const ringPts = [];
            simplified.forEach(([lon, lat]) => {
                if (lat < -55.5 || lon > -52 || lon < -74.5) return;
                const px = (lon + 64.2) * cosLat;
                const py = -(lat + 38.4);
                ringPts.push([px, py]);
                latSum += lat;
                lonSum += lon;
                ptCount++;
            });
            if (ringPts.length >= 3) projectedRings.push(ringPts);
        });

        if (projectedRings.length === 0) return;

        const avgLat = ptCount > 0 ? latSum / ptCount : -38;
        const avgLon = ptCount > 0 ? lonSum / ptCount : -64;
        const centroid = [ (avgLon + 64.2) * cosLat, -(avgLat + 38.4) ];

        const provObj = {
            name,
            isCaba,
            rings: projectedRings,
            centroid,
            avgLat,
            metric: 0,
            share: 0,
            chinos: 0,
            total: 0,
            ranking: 24,
            color: [30, 58, 138],
            currentLift: 0,
            targetLift: 0,
            paths2D: []
        };

        if (isCaba) {
            cabaItem = provObj;
        } else {
            parsed.push(provObj);
        }
    });

    // Orden del Pintor: Norte a Sur para oclusión 3D perfecta
    parsed.sort((a, b) => b.avgLat - a.avgLat);

    provinces = parsed;
    cabaProvince = cabaItem || {
        name: "Ciudad Autónoma de Buenos Aires",
        isCaba: true,
        rings: [[[4.46, -3.75], [4.62, -3.75], [4.62, -3.85], [4.46, -3.85]]],
        centroid: [4.54, -3.80],
        avgLat: -34.6,
        metric: 0, share: 0, chinos: 0, total: 0, ranking: 1,
        color: [239, 68, 68],
        currentLift: 0, targetLift: 0, paths2D: []
    };

    allProvinces = [...provinces, cabaProvince];
    syncProvinceMetrics();
    renderScene();
}

function buildProvincesFromGeoJSON(geojson) {
    if (!geojson || !geojson.features) return;
    const parsed = [];
    geojson.features.forEach(feat => {
        const name = feat.properties.nombre || feat.properties.name || "Provincia";
        if (!feat.geometry) return;
        const rawPolys = feat.geometry.type === 'Polygon'
            ? [feat.geometry.coordinates[0]]
            : feat.geometry.coordinates.map(p => p[0]);

        const isCaba = name.includes("Ciudad") || name.includes("Capital");
        const rings = rawPolys.filter(r => isCaba || r.length >= 25);
        if (rings.length > 0) {
            parsed.push({ name, rings });
        }
    });

    if (parsed.length >= 20) {
        buildProvincesData(parsed);
        const geoStatus = document.getElementById('geo-status');
        if (geoStatus) geoStatus.textContent = "Cartografía IGN Oficial";
    }
}

function syncProvinceMetrics() {
    if (!dashboardData || !allProvinces.length) return;
    const activeSlice = getActiveSlice();
    const provMetrics = activeSlice?.provincias || {};

    let maxS = 0;
    Object.values(provMetrics).forEach(v => {
        if (v.share > maxS) maxS = v.share;
    });
    mapMaxShare = Math.max(maxS, 1.0);

    const legendMax = document.getElementById('map-legend-max');
    if (legendMax) {
        legendMax.textContent = `${mapMaxShare.toFixed(1)}%`;
    }

    allProvinces.forEach(p => {
        const d = provMetrics[p.name] || { share: 0, chinos: 0, total: 0, ranking: 24 };
        p.share = d.share;
        p.chinos = d.chinos;
        p.total = d.total;
        p.ranking = d.ranking;
        p.metric = mapMaxShare > 0 ? (p.share / mapMaxShare) * 100 : 0;
        p.color = getColorForValue(p.metric);
    });
}

function projectPoint([wx, wy], zHeight) {
    const k = baseScale * cam.zoom;
    const cx = canvas.width / 2 + cam.x;
    const cy = canvas.height / 2 + cam.y;
    const sx = cx + wx * k;
    const sy = cy + (wy * cam.tilt - zHeight) * k;
    return [sx, sy];
}

function renderScene() {
    const canvas = document.getElementById('mapCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const isDark = (currentTheme === 'dark');
    const hasHover = (hoveredIdx !== -1);

    // =========================================================================
    // 1. RENDERIZADO DEL MAPA CONTINENTAL (23 PROVINCIAS EN PERSPECTIVA 3D)
    // =========================================================================
    provinces.forEach(prov => {
        const isHovered = (allProvinces[hoveredIdx] === prov);
        const baseZ = (prov.metric / 100) * 1.15 * cam.extrudeScale;
        const totalZ = baseZ + prov.currentLift;
        const dimFactor = hasHover && !isHovered ? 0.60 : (isHovered ? 1.25 : 1.0);
        const alpha = hasHover && !isHovered ? 0.82 : 1.0;

        prov.paths2D = [];

        prov.rings.forEach(ring => {
            const basePts = ring.map(pt => projectPoint(pt, 0));
            const topPts = ring.map(pt => projectPoint(pt, totalZ));

            // Sombra proyectada por elevación física
            if (prov.currentLift > 0.02) {
                ctx.save();
                ctx.beginPath();
                basePts.forEach((p, j) => j === 0 ? ctx.moveTo(p[0], p[1] + 9 * dpr) : ctx.lineTo(p[0], p[1] + 9 * dpr));
                ctx.closePath();
                ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.65, prov.currentLift * 0.5)})`;
                ctx.shadowColor = 'rgba(56, 189, 248, 0.55)';
                ctx.shadowBlur = 20 * dpr;
                ctx.fill();
                ctx.restore();
            }

            // Paredes laterales 3D con sombreado direccional
            for (let j = 0; j < basePts.length; j++) {
                const next = (j + 1) % basePts.length;
                const b1 = basePts[j], b2 = basePts[next];
                const t1 = topPts[j], t2 = topPts[next];

                const dx = b2[0] - b1[0];
                const dy = b2[1] - b1[1];
                const len = Math.hypot(dx, dy);
                if (len < 0.4) continue;

                const nx = -dy / len;
                const ny = dx / len;
                const lightDot = (nx * -0.6 + ny * 0.8);
                const wallShade = (0.42 + (lightDot + 1) * 0.22) * dimFactor;

                ctx.beginPath();
                ctx.moveTo(b1[0], b1[1]);
                ctx.lineTo(b2[0], b2[1]);
                ctx.lineTo(t2[0], t2[1]);
                ctx.lineTo(t1[0], t1[1]);
                ctx.closePath();

                const wallColor = rgbStr(prov.color, wallShade, alpha);
                ctx.fillStyle = wallColor;
                ctx.strokeStyle = wallColor;
                ctx.lineWidth = 0.8 * dpr;
                ctx.fill();
                ctx.stroke();
            }

            // Superficie superior de la provincia
            const topPath = new Path2D();
            topPts.forEach((p, j) => j === 0 ? topPath.moveTo(p[0], p[1]) : topPath.lineTo(p[0], p[1]));
            topPath.closePath();
            prov.paths2D.push(topPath);

            ctx.save();
            if (isHovered) {
                ctx.shadowColor = 'rgba(56, 189, 248, 0.85)';
                ctx.shadowBlur = 20 * dpr;
            }
            ctx.fillStyle = rgbStr(prov.color, dimFactor, alpha);
            ctx.fill(topPath);
            ctx.restore();

            // Límites interprovinciales
            ctx.strokeStyle = isHovered ? '#ffffff' : (isDark ? 'rgba(226, 232, 240, 0.65)' : 'rgba(15, 23, 42, 0.55)');
            ctx.lineWidth = (isHovered ? 2.8 : 1.25) * dpr;
            ctx.stroke(topPath);
        });
    });

    // =========================================================================
    // 2. PIN Y BALIZA RADAR DE CABA EN SU UBICACIÓN GEOGRÁFICA CONTINENTAL
    // =========================================================================
    cabaPinX = 0;
    cabaPinY = 0;
    if (cabaProvince && cabaProvince.centroid) {
        const [pinSx, pinSy] = projectPoint(cabaProvince.centroid, 0);
        cabaPinX = pinSx;
        cabaPinY = pinSy;
        const isCabaHovered = (allProvinces[hoveredIdx] === cabaProvince);

        if (pinSx >= -40 && pinSx <= canvas.width + 40 && pinSy >= -40 && pinSy <= canvas.height + 40) {
            // Onda expansiva de radar
            const pulse = (performance.now() % 1800) / 1800;
            ctx.beginPath();
            ctx.arc(pinSx, pinSy, (5 + pulse * 14) * dpr, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(56, 189, 248, ${0.75 * (1 - pulse)})`;
            ctx.lineWidth = 1.6 * dpr;
            ctx.stroke();

            // Núcleo del pin
            ctx.beginPath();
            ctx.arc(pinSx, pinSy, (isCabaHovered ? 6 : 4.5) * dpr, 0, Math.PI * 2);
            ctx.fillStyle = isCabaHovered ? '#38bdf8' : '#ef4444';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5 * dpr;
            ctx.stroke();

            // Etiqueta del pin
            ctx.font = `bold ${Math.round(10.5 * dpr)}px "Plus Jakarta Sans", system-ui, sans-serif`;
            ctx.fillStyle = isDark ? '#ffffff' : '#0f172a';
            ctx.fillText('📍 CABA', pinSx + 8 * dpr, pinSy - 4 * dpr);
        }
    }

    // =========================================================================
    // 3. TARJETA FLOTANTE DE ZOOM 3D DE CABA (SUPERIOR DERECHA)
    // =========================================================================
    if (cabaProvince) {
        const isCabaHovered = (allProvinces[hoveredIdx] === cabaProvince);
        const cardW = Math.min(230 * dpr, canvas.width * 0.32);
        const cardH = 175 * dpr;
        const cardX = canvas.width - cardW - 20 * dpr;
        const cardY = 20 * dpr;

        // Línea conectora punteada curva entre el pin continental y la tarjeta de zoom
        if (cabaPinX > 0 && cabaPinX < canvas.width && cabaPinY > 0 && cabaPinY < canvas.height) {
            const anchorX = cardX + 16 * dpr;
            const anchorY = cardY + cardH - 14 * dpr;
            ctx.save();
            ctx.setLineDash([4 * dpr, 4 * dpr]);
            ctx.beginPath();
            ctx.moveTo(cabaPinX, cabaPinY);
            ctx.bezierCurveTo(
                cabaPinX + 40 * dpr, (cabaPinY + anchorY) / 2,
                anchorX - 50 * dpr, (cabaPinY + anchorY) / 2,
                anchorX, anchorY
            );
            ctx.strokeStyle = isCabaHovered ? 'rgba(56, 189, 248, 0.85)' : 'rgba(56, 189, 248, 0.40)';
            ctx.lineWidth = (isCabaHovered ? 2.0 : 1.4) * dpr;
            ctx.stroke();
            ctx.restore();
        }

        // Fondo glassmorphic de la tarjeta de zoom
        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(cardX, cardY, cardW, cardH, 16 * dpr);
        } else {
            ctx.rect(cardX, cardY, cardW, cardH);
        }
        ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.90)';
        ctx.strokeStyle = isCabaHovered ? 'rgba(56, 189, 248, 0.85)' : (isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)');
        ctx.lineWidth = (isCabaHovered ? 2.0 : 1.0) * dpr;
        ctx.shadowColor = isCabaHovered ? 'rgba(56, 189, 248, 0.35)' : 'rgba(0, 0, 0, 0.25)';
        ctx.shadowBlur = 18 * dpr;
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Encabezado de la tarjeta
        ctx.font = `800 ${Math.round(10 * dpr)}px "Plus Jakarta Sans", system-ui, sans-serif`;
        ctx.fillStyle = '#38bdf8';
        ctx.fillText('🔍 ZOOM CABA • 3D', cardX + 16 * dpr, cardY + 22 * dpr);

        ctx.font = `600 ${Math.round(8.5 * dpr)}px "Plus Jakarta Sans", system-ui, sans-serif`;
        ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
        ctx.fillText('CAPITAL FEDERAL', cardX + 16 * dpr, cardY + 35 * dpr);

        // Badge pill con porcentaje
        const badgeText = `${cabaProvince.share.toFixed(1)}%`;
        ctx.font = `800 ${Math.round(10 * dpr)}px "Plus Jakarta Sans", system-ui, sans-serif`;
        const bWidth = ctx.measureText(badgeText).width + 12 * dpr;
        const bx = cardX + cardW - bWidth - 14 * dpr;
        const by = cardY + 14 * dpr;
        ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, by, bWidth, 18 * dpr, 9 * dpr);
        else ctx.rect(bx, by, bWidth, 18 * dpr);
        ctx.fill();
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(badgeText, bx + 6 * dpr, by + 13 * dpr);

        // Extrusión 3D de CABA dentro del Zoom
        const zoomCenterX = cardX + cardW / 2;
        const zoomCenterY = cardY + cardH * 0.64;

        const allCabaPts = cabaProvince.rings.flat();
        const xs = allCabaPts.map(p => p[0]);
        const ys = allCabaPts.map(p => p[1]);
        const dx = (Math.max(...xs) - Math.min(...xs)) || 0.18;
        const dy = (Math.max(...ys) - Math.min(...ys)) || 0.18;
        const span = Math.max(dx, dy);
        const cabaScale = (cardW * 0.48) / span;

        const projectCaba = ([wx, wy], zHeight) => {
            const relX = wx - cabaProvince.centroid[0];
            const relY = wy - cabaProvince.centroid[1];
            const sx = zoomCenterX + relX * cabaScale;
            const sy = zoomCenterY + (relY * cam.tilt - zHeight) * cabaScale;
            return [sx, sy];
        };

        const baseZ = (cabaProvince.metric / 100) * 0.045;
        const totalZ = baseZ + cabaProvince.currentLift * 0.035;
        const dimFactor = hasHover && !isCabaHovered ? 0.60 : (isCabaHovered ? 1.25 : 1.0);
        const alpha = hasHover && !isCabaHovered ? 0.82 : 1.0;

        cabaProvince.paths2D = [];

        cabaProvince.rings.forEach(ring => {
            const basePts = ring.map(pt => projectCaba(pt, 0));
            const topPts = ring.map(pt => projectCaba(pt, totalZ));

            // Sombra bajo CABA
            if (cabaProvince.currentLift > 0.02) {
                ctx.save();
                ctx.beginPath();
                basePts.forEach((p, j) => j === 0 ? ctx.moveTo(p[0], p[1] + 6 * dpr) : ctx.lineTo(p[0], p[1] + 6 * dpr));
                ctx.closePath();
                ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.5, cabaProvince.currentLift * 0.4)})`;
                ctx.shadowColor = 'rgba(56, 189, 248, 0.65)';
                ctx.shadowBlur = 16 * dpr;
                ctx.fill();
                ctx.restore();
            }

            // Paredes 3D de CABA
            for (let j = 0; j < basePts.length; j++) {
                const next = (j + 1) % basePts.length;
                const b1 = basePts[j], b2 = basePts[next];
                const t1 = topPts[j], t2 = topPts[next];

                const dx = b2[0] - b1[0];
                const dy = b2[1] - b1[1];
                const len = Math.hypot(dx, dy);
                if (len < 0.4) continue;

                const nx = -dy / len;
                const ny = dx / len;
                const lightDot = (nx * -0.6 + ny * 0.8);
                const wallShade = (0.42 + (lightDot + 1) * 0.22) * dimFactor;

                ctx.beginPath();
                ctx.moveTo(b1[0], b1[1]);
                ctx.lineTo(b2[0], b2[1]);
                ctx.lineTo(t2[0], t2[1]);
                ctx.lineTo(t1[0], t1[1]);
                ctx.closePath();

                const wallColor = rgbStr(cabaProvince.color, wallShade, alpha);
                ctx.fillStyle = wallColor;
                ctx.strokeStyle = wallColor;
                ctx.lineWidth = 0.8 * dpr;
                ctx.fill();
                ctx.stroke();
            }

            // Superficie superior de CABA
            const topPath = new Path2D();
            topPts.forEach((p, j) => j === 0 ? topPath.moveTo(p[0], p[1]) : topPath.lineTo(p[0], p[1]));
            topPath.closePath();
            cabaProvince.paths2D.push(topPath);

            ctx.save();
            if (isCabaHovered) {
                ctx.shadowColor = 'rgba(56, 189, 248, 0.9)';
                ctx.shadowBlur = 18 * dpr;
            }
            ctx.fillStyle = rgbStr(cabaProvince.color, dimFactor, alpha);
            ctx.fill(topPath);
            ctx.restore();

            ctx.strokeStyle = isCabaHovered ? '#ffffff' : (isDark ? 'rgba(226, 232, 240, 0.75)' : 'rgba(15, 23, 42, 0.65)');
            ctx.lineWidth = (isCabaHovered ? 2.5 : 1.2) * dpr;
            ctx.stroke(topPath);
        });
    }
}

function animateLoop() {
    let needsRedraw = false;

    // Interpolación suave del ángulo 3D de cámara
    if (Math.abs(cam.tilt - targetTilt) > 0.002) {
        cam.tilt += (targetTilt - cam.tilt) * 0.12;
        needsRedraw = true;
    }

    // Interpolación suave de elevación interactiva de provincias
    allProvinces.forEach((p, idx) => {
        p.targetLift = (idx === hoveredIdx) ? 0.95 : 0.0;
        const diff = p.targetLift - p.currentLift;
        if (Math.abs(diff) > 0.003) {
            p.currentLift += diff * 0.18;
            needsRedraw = true;
        } else {
            p.currentLift = p.targetLift;
        }
    });

    // Redibujar baliza animada continuamente
    if (cabaPinX > 0) {
        needsRedraw = true;
    }

    if (needsRedraw) renderScene();
    requestAnimationFrame(animateLoop);
}

function getProvinceAtCursor(clientX, clientY) {
    const canvas = document.getElementById('mapCanvas');
    if (!canvas) return -1;
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * dpr;
    const py = (clientY - rect.top) * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return -1;

    // 1. Probar primero CABA en su tarjeta de zoom superior derecha
    if (cabaProvince && cabaProvince.paths2D) {
        for (let k = 0; k < cabaProvince.paths2D.length; k++) {
            if (ctx.isPointInPath(cabaProvince.paths2D[k], px, py)) {
                return allProvinces.indexOf(cabaProvince);
            }
        }
        // O si el cursor está sobre la baliza continental de CABA
        if (cabaPinX > 0 && Math.hypot(px - cabaPinX, py - cabaPinY) < 14 * dpr) {
            return allProvinces.indexOf(cabaProvince);
        }
    }

    // 2. Probar provincias continentales en orden inverso (Sur a Norte)
    for (let i = provinces.length - 1; i >= 0; i--) {
        const prov = provinces[i];
        for (let k = 0; k < prov.paths2D.length; k++) {
            if (ctx.isPointInPath(prov.paths2D[k], px, py)) {
                return allProvinces.indexOf(prov);
            }
        }
    }
    return -1;
}

function setupMapEvents() {
    if (mapListenersAttached) return;
    mapListenersAttached = true;

    const canvas = document.getElementById('mapCanvas');
    if (!canvas) return;
    const hudCard = document.getElementById('hud-card');
    const hudName = document.getElementById('hud-name');
    const hudVal = document.getElementById('hud-val');
    const hudChinos = document.getElementById('hud-chinos');
    const hudRank = document.getElementById('hud-rank');
    const hudBar = document.getElementById('hud-bar');

    canvas.addEventListener('pointerdown', e => {
        isDragging = true;
        dragStart = { x: e.clientX, y: e.clientY };
        canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', e => {
        if (isDragging) {
            cam.x += (e.clientX - dragStart.x) * dpr;
            cam.y += (e.clientY - dragStart.y) * dpr;
            dragStart = { x: e.clientX, y: e.clientY };
            renderScene();
            return;
        }

        const hitIdx = getProvinceAtCursor(e.clientX, e.clientY);
        if (hitIdx !== hoveredIdx) {
            hoveredIdx = hitIdx;
            canvas.style.cursor = hitIdx !== -1 ? 'pointer' : 'grab';

            if (hitIdx !== -1) {
                const p = allProvinces[hitIdx];
                if (hudName) hudName.textContent = p.name;
                if (hudVal) hudVal.textContent = `${p.share.toFixed(2)}%`;
                if (hudChinos) hudChinos.textContent = `🚗 ${p.chinos.toLocaleString('es-AR')} u chinas`;
                if (hudRank) hudRank.textContent = `📊 Puesto #${p.ranking} de 24`;
                if (hudBar) hudBar.style.width = `${Math.min(100, (p.share / mapMaxShare) * 100)}%`;
                if (hudCard) hudCard.classList.add('visible');

                // Sincronizar fila activa en la tabla
                document.querySelectorAll('#provinces-table-body tr').forEach(r => {
                    r.classList.toggle('row-active', r.getAttribute('data-prov') === p.name);
                });
            } else {
                if (hudCard) hudCard.classList.remove('visible');
                document.querySelectorAll('#provinces-table-body tr.row-active').forEach(r => {
                    r.classList.remove('row-active');
                });
            }
            renderScene();
        }
    });

    window.addEventListener('pointerup', () => { isDragging = false; });

    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.0012);
        const rect = canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) * dpr - canvas.width / 2;
        const my = (e.clientY - rect.top) * dpr - canvas.height / 2;

        const newZoom = Math.min(5, Math.max(0.75, cam.zoom * factor));
        const ratio = newZoom / cam.zoom;
        cam.x = mx - (mx - cam.x) * ratio;
        cam.y = my - (my - cam.y) * ratio;
        cam.zoom = newZoom;
        renderScene();
    }, { passive: false });

    const btnTilt = document.getElementById('btn-tilt');
    if (btnTilt) {
        btnTilt.addEventListener('click', () => {
            targetTilt = targetTilt < 0.7 ? 0.88 : 0.55;
        });
    }

    const btnReset = document.getElementById('btn-reset');
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            cam.x = 0;
            cam.y = 0;
            cam.zoom = 1;
            targetTilt = 0.65;
            renderScene();
        });
    }
}

function resizeCanvas() {
    const wrapper = document.getElementById('canvas-wrapper');
    const canvas = document.getElementById('mapCanvas');
    if (!wrapper || !canvas) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(wrapper.clientWidth * dpr);
    canvas.height = Math.round(wrapper.clientHeight * dpr);
    baseScale = Math.min(canvas.width / 19, canvas.height / 23.5);
    renderScene();
}

function init3DMap() {
    const wrapper = document.getElementById('canvas-wrapper');
    if (!wrapper) return;
    new ResizeObserver(resizeCanvas).observe(wrapper);
    buildProvincesData(FALLBACK_PROVINCES);
    setupMapEvents();
    resizeCanvas();
    if (!animLoopRunning) {
        animLoopRunning = true;
        requestAnimationFrame(animateLoop);
    }
}

/**
 * Función principal llamada al actualizar datos o filtros
 */
function render3DMap(data) {
    const canvas = document.getElementById('mapCanvas');
    if (!canvas) return;

    const spinner = document.getElementById('map-spinner');
    if (spinner) spinner.style.display = 'none';

    syncProvinceMetrics();
    renderScene();
}

/**
 * Renderizado de la tabla de ranking provincial sincronizada bidireccionalmente con el mapa 3D
 */
function renderProvincesTable(data) {
    const tbody = document.getElementById('provinces-table-body');
    if (!tbody || !data.provincias) return;

    const sorted = Object.entries(data.provincias)
        .map(([nombre, val]) => ({ nombre, ...val }))
        .sort((a, b) => b.share - a.share);

    let html = '';
    sorted.forEach((item, idx) => {
        const rank = idx + 1;
        let badgeClass = 'rank-badge';
        if (rank === 1) badgeClass += ' rank-top-1';
        else if (rank === 2) badgeClass += ' rank-top-2';
        else if (rank === 3) badgeClass += ' rank-top-3';

        const isCaba = item.nombre.includes("Ciudad") || item.nombre.includes("Capital");
        const provDisplay = isCaba ? `📍 ${item.nombre} <span style="font-size:0.75rem; color:#38bdf8;">(Zoom ↗)</span>` : item.nombre;

        html += `
            <tr data-prov="${item.nombre}" style="cursor: pointer;">
                <td><span class="${badgeClass}">${rank}</span></td>
                <td><b>${provDisplay}</b></td>
                <td><span style="color: var(--accent-red); font-weight: 700;">${item.share.toFixed(2)}%</span></td>
                <td>${item.chinos.toLocaleString('es-AR')}</td>
                <td>${item.total.toLocaleString('es-AR')}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;

    // Sincronización al pasar el cursor sobre las filas de la tabla
    tbody.querySelectorAll('tr[data-prov]').forEach(row => {
        const provName = row.getAttribute('data-prov');
        row.addEventListener('mouseenter', () => {
            if (allProvinces && allProvinces.length) {
                hoveredIdx = allProvinces.findIndex(p => p.name === provName);
                if (hoveredIdx !== -1) {
                    const p = allProvinces[hoveredIdx];
                    const hudName = document.getElementById('hud-name');
                    const hudVal = document.getElementById('hud-val');
                    const hudChinos = document.getElementById('hud-chinos');
                    const hudRank = document.getElementById('hud-rank');
                    const hudBar = document.getElementById('hud-bar');
                    const hudCard = document.getElementById('hud-card');
                    if (hudName) hudName.textContent = p.name;
                    if (hudVal) hudVal.textContent = `${p.share.toFixed(2)}%`;
                    if (hudChinos) hudChinos.textContent = `🚗 ${p.chinos.toLocaleString('es-AR')} u chinas`;
                    if (hudRank) hudRank.textContent = `📊 Puesto #${p.ranking} de 24`;
                    if (hudBar) hudBar.style.width = `${Math.min(100, (p.share / mapMaxShare) * 100)}%`;
                    if (hudCard) hudCard.classList.add('visible');
                    row.classList.add('row-active');
                    renderScene();
                }
            }
        });
        row.addEventListener('mouseleave', () => {
            hoveredIdx = -1;
            const hudCard = document.getElementById('hud-card');
            if (hudCard) hudCard.classList.remove('visible');
            row.classList.remove('row-active');
            renderScene();
        });
    });
}

/**
 * Render Chart 1: Either Annual Monthly Evolution OR Multi-Year Macro Disruption
 */
function renderEvolutionChart(slice) {
    const evoCtx = document.getElementById('chart-evolution');
    if (!evoCtx || !dashboardData) return;

    const isLight = (currentTheme === 'light');

    let labels = [];
    let volumes = [];
    let shares = [];
    let customLeaders = [];
    let y1Max = 15;

    if (chartViewMode === 'annual') {
        const currentSlice = slice || getActiveSlice();
        const hist = currentSlice?.historico_mensual || [];
        labels = hist.map(h => {
            const m = h.mes.split('-')[1];
            return MONTH_ABBR_ES[m] || m;
        });
        volumes = hist.map(h => h.chinos);
        shares = hist.map(h => h.share);

        const maxS = Math.max(...shares, 5);
        y1Max = Math.ceil(maxS * 1.25);
    } else {
        // Macro mode (2018 - 2026) for the active segment
        let macro = [];
        if (dashboardData.macro_evolution) {
            if (Array.isArray(dashboardData.macro_evolution)) {
                macro = dashboardData.macro_evolution;
            } else if (dashboardData.macro_evolution[currentSegment]) {
                macro = dashboardData.macro_evolution[currentSegment];
            } else if (dashboardData.macro_evolution['TOTAL']) {
                macro = dashboardData.macro_evolution['TOTAL'];
            }
        }

        labels = macro.map(m => `${m.year}`);
        volumes = macro.map(m => m.chinos);
        shares = macro.map(m => m.share);
        customLeaders = macro.map(m => m.lider || '');

        const maxS = Math.max(...shares, 5);
        y1Max = Math.ceil(maxS * 1.25);
    }

    if (chartEvolution) {
        chartEvolution.destroy();
    }

    const highlightRed = isLight ? '#dc2626' : '#ef4444';
    const mutedRed = isLight ? 'rgba(220, 38, 38, 0.35)' : 'rgba(239, 68, 68, 0.45)';
    const regularBar = isLight ? 'rgba(220, 38, 38, 0.75)' : 'rgba(239, 68, 68, 0.7)';

    const barColors = chartViewMode === 'macro'
        ? labels.map(lbl => (parseInt(lbl, 10) === currentYear ? highlightRed : mutedRed))
        : regularBar;

    const tickColor = isLight ? '#475569' : '#94a3b8';
    const gridColor = isLight ? 'rgba(15, 23, 42, 0.06)' : 'rgba(255, 255, 255, 0.05)';
    const tooltipBg = isLight ? '#0f172a' : '#1e293b';

    chartEvolution = new Chart(evoCtx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    type: 'line',
                    label: 'Market Share (%)',
                    data: shares,
                    borderColor: '#ea580c',
                    backgroundColor: 'transparent',
                    borderWidth: 3,
                    pointBackgroundColor: '#ea580c',
                    pointRadius: 5,
                    yAxisID: 'y1',
                    tension: 0.3
                },
                {
                    type: 'bar',
                    label: 'Patentamientos Chinos',
                    data: volumes,
                    backgroundColor: barColors,
                    borderColor: highlightRed,
                    borderWidth: 1,
                    borderRadius: 6,
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: tickColor, font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' } }
                },
                tooltip: {
                    backgroundColor: tooltipBg,
                    titleColor: '#f8fafc',
                    bodyColor: '#cbd5e1',
                    padding: 10,
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    callbacks: {
                        afterBody: (context) => {
                            if (chartViewMode === 'macro' && customLeaders.length > 0) {
                                const idx = context[0].dataIndex;
                                return `Líder del Bloque: ${customLeaders[idx]}`;
                            }
                            return '';
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: tickColor, font: { size: 11, weight: '600' } }
                },
                y: {
                    type: 'linear',
                    position: 'left',
                    grid: { color: gridColor },
                    ticks: { color: tickColor, font: { size: 11 } }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    grid: { display: false },
                    ticks: { 
                        color: '#ea580c',
                        font: { size: 11, weight: '600' },
                        callback: v => `${v}%`
                    },
                    min: 0,
                    max: y1Max
                }
            }
        }
    });
}

/**
 * Render Chart 2: Top Brands Distribution Donut
 */
function renderBrandsChart(data) {
    const brandsCtx = document.getElementById('chart-brands');
    if (!brandsCtx || !data.top_marcas) return;

    const isLight = (currentTheme === 'light');
    const brandNames = data.top_marcas.map(b => b.marca);
    const brandUnits = data.top_marcas.map(b => b.unidades);

    if (chartBrands) {
        chartBrands.destroy();
    }

    const donutBorder = isLight ? '#ffffff' : '#0b0f19';
    const tickColor = isLight ? '#475569' : '#94a3b8';
    const tooltipBg = isLight ? '#0f172a' : '#1e293b';

    chartBrands = new Chart(brandsCtx, {
        type: 'doughnut',
        data: {
            labels: brandNames,
            datasets: [{
                data: brandUnits,
                backgroundColor: [
                    '#dc2626',
                    '#ea580c',
                    '#d97706',
                    '#059669',
                    '#0284c7',
                    '#2563eb',
                    '#7c3aed',
                    '#64748b'
                ],
                borderColor: donutBorder,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: tickColor, font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' } }
                },
                tooltip: {
                    backgroundColor: tooltipBg,
                    padding: 10
                }
            },
            cutout: '62%'
        }
    });
}

/**
 * Render Top 10 Models list with technology tags
 */
function renderModelsList(data) {
    const container = document.getElementById('models-list-container');
    if (!container) return;

    if (!data.top_modelos || data.top_modelos.length === 0) {
        container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem; padding: 12px;">Sin modelos chinos en este segmento para el período seleccionado.</p>`;
        return;
    }

    let html = '';
    data.top_modelos.forEach(m => {
        let tagClass = 'tag-ice';
        let ptShort = 'ICE Combustión';
        if (m.powertrain && m.powertrain.includes('BEV')) {
            tagClass = 'tag-bev';
            ptShort = '⚡ 100% Eléctrico';
        } else if (m.powertrain && m.powertrain.includes('PHEV')) {
            tagClass = 'tag-phev';
            ptShort = '🔌 Híbrido Enchufable';
        } else if (m.powertrain && m.powertrain.includes('HEV')) {
            tagClass = 'tag-hev';
            ptShort = '🔋 Híbrido';
        }

        html += `
            <div class="model-item">
                <div class="model-info">
                    <span class="model-name">${m.modelo}</span>
                    <span class="model-pt-tag ${tagClass}">${ptShort}</span>
                </div>
                <div class="model-count">${m.unidades.toLocaleString('es-AR')} u.</div>
            </div>
        `;
    });

    container.innerHTML = html;
}

/**
 * Render Top Seccionales Concentration list
 */
function renderSeccionalesList(data) {
    const container = document.getElementById('seccionales-list-container');
    if (!container) return;

    if (!data.top_seccionales || data.top_seccionales.length === 0) {
        container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem; padding: 12px;">Sin registros seccionales en este segmento para el período seleccionado.</p>`;
        return;
    }

    let html = '';
    data.top_seccionales.forEach(s => {
        html += `
            <div class="secc-item">
                <div class="secc-info">
                    <span class="model-name">${s.nombre}</span>
                    <span style="font-size: 0.75rem; color: var(--text-muted);">(${s.provincia})</span>
                    <span class="secc-share-badge">${s.share.toFixed(1)}% cuota</span>
                </div>
                <div class="secc-count">${s.chinos.toLocaleString('es-AR')} u.</div>
            </div>
        `;
    });

    container.innerHTML = html;
}
