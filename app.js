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
        const container = document.getElementById('map-3d-wrap') || document.getElementById('plotly-map-container');
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
// 3D ARGENTINA CHOROPLETH ENGINE (HTML5 CANVAS 2.5D ISOMETRIC EXTRUSION)
// ==============================================================================
const KX = Math.cos(38 * Math.PI / 180); // Latitudinal projection factor (~0.788)
const TY = 0.55; // Dimetric/Isometric latitude compression tilt
const HMAX = 2.4; // Max extrusion height in 3D projection units

const HEATMAP_STOPS = [
    [255, 255, 178], // 0.0: Pale gold (#ffffb2)
    [254, 217, 118], // 0.2: Gold (#fed976)
    [254, 178, 76],  // 0.4: Amber (#feb24c)
    [253, 141, 60],  // 0.6: Tangerine (#fd8d3c)
    [240, 59, 32],   // 0.8: Vermilion (#f03b20)
    [189, 0, 38]     // 1.0: Deep crimson (#bd0026)
];

function getHeatmapRgb(t) {
    t = Math.max(0, Math.min(1, t));
    const n = HEATMAP_STOPS.length - 1;
    const pos = t * n;
    const idx = Math.min(Math.floor(pos), n - 1);
    const frac = pos - idx;
    const c1 = HEATMAP_STOPS[idx];
    const c2 = HEATMAP_STOPS[idx + 1];
    return [
        Math.round(c1[0] + (c2[0] - c1[0]) * frac),
        Math.round(c1[1] + (c2[1] - c1[1]) * frac),
        Math.round(c1[2] + (c2[2] - c1[2]) * frac)
    ];
}

function rgbStr(c, factor = 1, alpha = 1) {
    const r = Math.max(0, Math.min(255, Math.round(c[0] * factor)));
    const g = Math.max(0, Math.min(255, Math.round(c[1] * factor)));
    const b = Math.max(0, Math.min(255, Math.round(c[2] * factor)));
    return alpha < 1 ? `rgba(${r},${g},${b},${alpha})` : `rgb(${r},${g},${b})`;
}

let map3DProvinces = null;
let map3DOrder = [];
let map3DView = { x: 0, y: 0, z: 1 };
let map3DHovIndex = -1;
let map3DSelIndex = -1;
let map3DHits = [];
let map3DAnimProgress = 1.0;
let map3DAnimRaf = null;
let map3DListenersAttached = false;
let map3DMaxShare = 2.0;
let map3DFit = 30;

/**
 * Process official GeoJSON polygon features into 2.5D coordinates once
 */
function build3DMapGeometry() {
    if (map3DProvinces || !geojsonData) return;
    map3DProvinces = geojsonData.features.map(feat => {
        const name = feat.properties.nombre;
        const isCaba = name.includes("Ciudad");
        let rawPolys = [];
        if (feat.geometry.type === 'Polygon') {
            rawPolys = [feat.geometry.coordinates[0]];
        } else {
            const sorted = [...feat.geometry.coordinates].sort((a, b) => b[0].length - a[0].length);
            rawPolys = sorted.filter(p => p[0].length >= 25).map(p => p[0]);
            if (!rawPolys.length && sorted.length) rawPolys = [sorted[0][0]];
        }

        let origCentroid = null;
        if (isCaba) {
            const rawPts = rawPolys[0].map(([lon, lat]) => [ (lon + 64.0) * KX, -(lat + 38.4) * TY ]);
            origCentroid = [
                rawPts.reduce((a, b) => a + b[0], 0) / rawPts.length,
                rawPts.reduce((a, b) => a + b[1], 0) / rawPts.length
            ];
        }

        const targetCabaCx = 8.6;
        const targetCabaCy = -3.8;
        const cabaScale = 7.2;

        const rings = rawPolys.map(poly => {
            let pts = poly.map(([lon, lat]) => [ (lon + 64.0) * KX, -(lat + 38.4) * TY ]);
            if (isCaba && origCentroid) {
                // Separate CABA from the mainland and place it next to it on the right as an enlarged 3D pillar
                pts = pts.map(([x, y]) => [
                    targetCabaCx + (x - origCentroid[0]) * cabaScale,
                    targetCabaCy + (y - origCentroid[1]) * cabaScale
                ]);
            }
            return pts;
        });

        const allPts = rings.flat();
        const centroid = [
            allPts.reduce((a, b) => a + b[0], 0) / allPts.length,
            allPts.reduce((a, b) => a + b[1], 0) / allPts.length
        ];

        // Mean latitude for North-to-South painter's order (CABA -99 drawn on top)
        const meanLat = isCaba ? -99 : rawPolys.flat().reduce((a, b) => a + b[1], 0) / rawPolys.flat().length;

        return {
            name,
            isCaba,
            rings,
            centroid,
            origCentroid: isCaba ? origCentroid : null,
            meanLat,
            share: 0,
            chinos: 0,
            total: 0,
            ranking: 24,
            currentH: 0,
            targetH: 0
        };
    });

    // North-to-South painter's algorithm order
    map3DOrder = map3DProvinces.map((_, i) => i).sort((a, b) => map3DProvinces[b].meanLat - map3DProvinces[a].meanLat);
}

/**
 * Main render function for 3D Map
 */
function render3DMap(data) {
    const wrap = document.getElementById('map-3d-wrap');
    const canvas = document.getElementById('map-3d-canvas');
    if (!wrap || !canvas || !geojsonData || !data.provincias) return;

    build3DMapGeometry();

    const spinner = document.getElementById('map-spinner');
    if (spinner) spinner.style.display = 'none';

    let maxShare = 0;
    Object.values(data.provincias).forEach(item => {
        if (item.share > maxShare) maxShare = item.share;
    });
    map3DMaxShare = Math.max(maxShare, 2.0);

    const legendMaxEl = document.getElementById('map-legend-max');
    if (legendMaxEl) {
        legendMaxEl.textContent = `${map3DMaxShare.toFixed(1)}%`;
    }

    // Update province metrics and target 3D prism heights
    map3DProvinces.forEach(p => {
        const item = data.provincias[p.name] || { share: 0, chinos: 0, total: 0, ranking: 24 };
        p.share = item.share;
        p.chinos = item.chinos;
        p.total = item.total;
        p.ranking = item.ranking;
        p.targetH = (p.share / map3DMaxShare) * HMAX;
    });

    setup3DCanvasEvents(wrap, canvas);

    // Smoothly animate height changes
    start3DMapAnimation();
}

function start3DMapAnimation() {
    if (map3DAnimRaf) cancelAnimationFrame(map3DAnimRaf);
    map3DAnimProgress = 0;
    const t0 = performance.now();
    const duration = 900;

    function animate(t) {
        const elapsed = t - t0;
        map3DAnimProgress = Math.min(1.0, elapsed / duration);
        draw3DMap();
        if (map3DAnimProgress < 1.0) {
            map3DAnimRaf = requestAnimationFrame(animate);
        } else {
            map3DAnimRaf = null;
        }
    }
    map3DAnimRaf = requestAnimationFrame(animate);
}

function draw3DMap() {
    const canvas = document.getElementById('map-3d-canvas');
    const wrap = document.getElementById('map-3d-wrap');
    if (!canvas || !wrap || !map3DProvinces) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.width;
    const h = canvas.height;
    if (w === 0 || h === 0) return;

    const isDark = (currentTheme === 'dark');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const k = map3DFit * map3DView.z;
    const cx = w / 2 + map3DView.x;
    const cy = h / 2 + map3DView.y;
    const e = 1 - Math.pow(1 - map3DAnimProgress, 3); // Cubic ease-out

    // 3D Isometric projection coordinate converter
    // Centered horizontally accounting for mainland and CABA on the right
    const sc = (q, elev) => [
        cx + (q[0] - 0.70) * k,
        cy + (q[1] - elev + 0.6) * k
    ];

    // Directional light vector (top-left)
    const lx = -0.65;
    const ly = -0.75;

    map3DHits = [];

    // 1. Draw Ground Depth Shadow
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy + 3.0 * k, 7.8 * k, 9.4 * k, 0, 0, Math.PI * 2);
    ctx.fillStyle = isDark ? 'rgba(0, 0, 0, 0.40)' : 'rgba(15, 23, 42, 0.08)';
    ctx.filter = `blur(${Math.round(20 * dpr)}px)`;
    ctx.fill();
    ctx.restore();

    // 2. Render each province column in North-to-South painter's order
    map3DOrder.forEach(idx => {
        const p = map3DProvinces[idx];
        const elev = (p.targetH * e);
        const isHovered = (idx === map3DHovIndex || idx === map3DSelIndex);
        const hasAnyHover = (map3DHovIndex >= 0);
        const dim = (hasAnyHover && !isHovered) ? 0.55 : 1.0;
        const pop = isHovered ? 1.30 : 1.0;

        const ratio = (map3DMaxShare > 0) ? (p.share / map3DMaxShare) : 0;
        const baseColor = getHeatmapRgb(ratio);

        // CABA floating pedestal and mainland connector line
        if (p.isCaba && p.origCentroid) {
            const mainlandPt = sc(p.origCentroid, 0);
            const cabaBasePt = sc(p.centroid, 0);

            // Dotted connector from real geographic location on mainland to floating 3D pedestal
            ctx.save();
            ctx.beginPath();
            ctx.setLineDash([4 * dpr, 4 * dpr]);
            ctx.moveTo(mainlandPt[0], mainlandPt[1]);
            ctx.lineTo(cabaBasePt[0], cabaBasePt[1]);
            ctx.strokeStyle = isDark ? 'rgba(239, 68, 68, 0.70)' : 'rgba(220, 38, 38, 0.60)';
            ctx.lineWidth = 1.4 * dpr;
            ctx.stroke();
            ctx.restore();

            // Mainland geographic beacon pin
            ctx.beginPath();
            ctx.arc(mainlandPt[0], mainlandPt[1], 4.0 * dpr, 0, Math.PI * 2);
            ctx.fillStyle = '#ef4444';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.4 * dpr;
            ctx.stroke();

            // Floating 3D glass pedestal floor under CABA
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(cabaBasePt[0], cabaBasePt[1] + 3 * dpr, 1.35 * k, 1.05 * k, 0, 0, Math.PI * 2);
            ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.90)';
            ctx.shadowColor = isDark ? 'rgba(0, 0, 0, 0.65)' : 'rgba(15, 23, 42, 0.15)';
            ctx.shadowBlur = 12 * dpr;
            ctx.fill();
            ctx.strokeStyle = isDark ? 'rgba(239, 68, 68, 0.50)' : 'rgba(220, 38, 38, 0.40)';
            ctx.lineWidth = 1.2 * dpr;
            ctx.stroke();
            ctx.restore();
        }

        // Lateral 3D Prism Walls
        p.rings.forEach(ring => {
            const B = ring.map(q => sc(q, 0));
            const T = ring.map(q => sc(q, elev));

            for (let j = 0; j < B.length; j++) {
                const m = (j + 1) % B.length;
                const b1 = B[j], b2 = B[m], t2 = T[m], t1 = T[j];

                const dx = b2[0] - b1[0];
                const dy = b2[1] - b1[1];
                const len = Math.hypot(dx, dy);
                let shade = 0.52;
                if (len > 0.001) {
                    const nx = dy / len;
                    const ny = -dx / len;
                    const dot = nx * lx + ny * ly;
                    shade = 0.42 + 0.38 * Math.max(0, dot);
                }

                ctx.fillStyle = rgbStr(baseColor, shade * pop * dim);
                ctx.strokeStyle = rgbStr(baseColor, (shade - 0.1) * pop * dim);
                ctx.lineWidth = 0.75 * dpr;

                ctx.beginPath();
                ctx.moveTo(b1[0], b1[1]);
                ctx.lineTo(b2[0], b2[1]);
                ctx.lineTo(t2[0], t2[1]);
                ctx.lineTo(t1[0], t1[1]);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
        });

        // Top Face
        const topPath = new Path2D();
        p.rings.forEach(ring => {
            const T = ring.map(q => sc(q, elev));
            T.forEach((pt, j) => {
                if (j === 0) topPath.moveTo(pt[0], pt[1]);
                else topPath.lineTo(pt[0], pt[1]);
            });
            topPath.closePath();
        });

        map3DHits[idx] = topPath;

        ctx.fillStyle = rgbStr(baseColor, (isHovered ? 1.32 : 1.0) * dim);
        ctx.fill(topPath);

        // Highlight Border & Edge Stroke
        if (isHovered) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.8 * dpr;
            ctx.shadowColor = isDark ? 'rgba(255, 255, 255, 0.75)' : 'rgba(220, 38, 38, 0.45)';
            ctx.shadowBlur = 12 * dpr;
            ctx.stroke(topPath);
            ctx.shadowBlur = 0;
        } else {
            ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(15, 23, 42, 0.45)';
            ctx.lineWidth = 0.8 * dpr;
            ctx.stroke(topPath);
        }

        // CABA Beacon Tower Pin & Elevated Badge
        if (p.isCaba) {
            const cabaTop = sc(p.centroid, elev);
            
            // Beacon pin on top of the 3D pillar
            ctx.beginPath();
            ctx.arc(cabaTop[0], cabaTop[1], 5 * dpr, 0, Math.PI * 2);
            ctx.fillStyle = '#dc2626';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.8 * dpr;
            ctx.stroke();

            // Floating badge card above CABA pillar
            ctx.save();
            const tagTitle = `CABA • ${p.share.toFixed(1)}%`;
            const tagSub = 'Zoom Urbano (Líder #1)';
            ctx.font = `bold ${Math.round(11 * dpr)}px "Plus Jakarta Sans", system-ui, sans-serif`;
            const tw1 = ctx.measureText(tagTitle).width;
            ctx.font = `${Math.round(8.5 * dpr)}px "Plus Jakarta Sans", system-ui, sans-serif`;
            const tw2 = ctx.measureText(tagSub).width;
            const tw = Math.max(tw1, tw2);

            const bx = cabaTop[0];
            const by = cabaTop[1] - 22 * dpr;
            const padX = 10 * dpr;
            const boxW = tw + padX * 2;
            const boxH = 26 * dpr;
            const boxX = bx - boxW / 2;
            const boxY = by - 14 * dpr;

            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
                ctx.roundRect(boxX, boxY, boxW, boxH, 6 * dpr);
            } else {
                ctx.rect(boxX, boxY, boxW, boxH);
            }
            ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.96)';
            ctx.shadowColor = isDark ? 'rgba(0, 0, 0, 0.65)' : 'rgba(15, 23, 42, 0.15)';
            ctx.shadowBlur = 8 * dpr;
            ctx.fill();
            ctx.strokeStyle = isDark ? 'rgba(239, 68, 68, 0.75)' : 'rgba(220, 38, 38, 0.65)';
            ctx.lineWidth = 1.2 * dpr;
            ctx.stroke();

            // Downward pointer arrow towards cabaTop
            ctx.beginPath();
            ctx.moveTo(bx - 4 * dpr, boxY + boxH);
            ctx.lineTo(bx + 4 * dpr, boxY + boxH);
            ctx.lineTo(bx, boxY + boxH + 4 * dpr);
            ctx.closePath();
            ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.96)';
            ctx.fill();

            // Text rendering
            ctx.textAlign = 'center';
            ctx.font = `bold ${Math.round(11 * dpr)}px "Plus Jakarta Sans", system-ui, sans-serif`;
            ctx.fillStyle = isDark ? '#ffffff' : '#0f172a';
            ctx.fillText(tagTitle, bx, by - 1 * dpr);

            ctx.font = `${Math.round(8.5 * dpr)}px "Plus Jakarta Sans", system-ui, sans-serif`;
            ctx.fillStyle = isDark ? '#f87171' : '#dc2626';
            ctx.fillText(tagSub, bx, by + 9 * dpr);
            ctx.restore();
        }
    });
}

function hit3DMap(clientX, clientY) {
    const canvas = document.getElementById('map-3d-canvas');
    if (!canvas || !map3DHits || !map3DOrder.length) return -1;
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = (clientX - r.left) * dpr;
    const py = (clientY - r.top) * dpr;
    const ctx = canvas.getContext('2d');
    for (let j = map3DOrder.length; j--;) {
        const idx = map3DOrder[j];
        if (map3DHits[idx] && ctx.isPointInPath(map3DHits[idx], px, py)) {
            return idx;
        }
    }
    return -1;
}

function setup3DCanvasEvents(wrap, canvas) {
    if (map3DListenersAttached) return;
    map3DListenersAttached = true;

    const tip = document.getElementById('map-3d-tip');
    const ptr = new Map();
    let pd = 0;
    let moved = 0;

    const two = () => {
        const [a, b] = [...ptr.values()];
        return {
            d: Math.hypot(a[0] - b[0], a[1] - b[1]),
            x: (a[0] + b[0]) / 2,
            y: (a[1] + b[1]) / 2
        };
    };

    function zoom(factor, cx0, cy0) {
        const r = canvas.getBoundingClientRect();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const px = (cx0 - r.left) * dpr - canvas.width / 2;
        const py = (cy0 - r.top) * dpr - canvas.height / 2;
        const z = Math.min(5.0, Math.max(0.85, map3DView.z * factor));
        const q = z / map3DView.z;
        map3DView.x = px - (px - map3DView.x) * q;
        map3DView.y = py - (py - map3DView.y) * q;
        map3DView.z = z;
        if (z <= 1.0) {
            map3DView.x = 0;
            map3DView.y = 0;
        }
    }

    function showTooltip(idx, e) {
        if (!tip || idx < 0) {
            if (tip) tip.style.display = 'none';
            return;
        }
        const p = map3DProvinces[idx];
        const segShort = SEGMENT_LABELS[currentSegment] || 'Segmento';
        const ratio = (map3DMaxShare > 0) ? (p.share / map3DMaxShare * 100) : 0;

        tip.innerHTML = `
            <div class="map-tip-header">
                <span class="map-tip-title">🇦🇷 ${p.name}</span>
                <span class="map-tip-badge">Puesto #${p.ranking}</span>
            </div>
            <div class="map-tip-divider"></div>
            <div class="map-tip-metric">
                <span class="map-tip-share">${p.share.toFixed(2)}%</span>
                <span class="map-tip-desc">penetración china</span>
            </div>
            <div class="map-tip-details">
                <span>🚗 <b>Patentamientos chinos:</b> ${p.chinos.toLocaleString('es-AR')} u</span>
                <span>📊 <b>Inscripciones ${segShort}:</b> ${p.total.toLocaleString('es-AR')} u</span>
            </div>
            <div class="map-tip-bar-wrap">
                <div class="map-tip-bar-fill" style="width: ${Math.min(100, ratio)}%;"></div>
            </div>
        `;

        tip.style.display = 'block';
        const r = wrap.getBoundingClientRect();
        const tipW = tip.offsetWidth || 230;
        const tipH = tip.offsetHeight || 120;
        const left = Math.max(8, Math.min(e.clientX - r.left + 15, r.width - tipW - 10));
        const top = Math.max(8, Math.min(e.clientY - r.top - tipH - 10, r.height - tipH - 10));
        tip.style.left = `${left}px`;
        tip.style.top = `${top}px`;
    }

    canvas.addEventListener('pointerdown', e => {
        canvas.setPointerCapture(e.pointerId);
        ptr.set(e.pointerId, [e.clientX, e.clientY]);
        moved = 0;
        if (ptr.size === 2) pd = two().d;
    });

    canvas.addEventListener('pointermove', e => {
        const p = ptr.get(e.pointerId);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (!p) {
            // Hover inspection
            const idx = hit3DMap(e.clientX, e.clientY);
            if (idx !== map3DHovIndex) {
                map3DHovIndex = idx;
                draw3DMap();
            }
            canvas.style.cursor = (idx < 0) ? 'grab' : 'pointer';
            if (idx >= 0) {
                showTooltip(idx, e);
            } else {
                if (tip) tip.style.display = 'none';
            }
            return;
        }

        if (ptr.size === 1) {
            map3DView.x += (e.clientX - p[0]) * dpr;
            map3DView.y += (e.clientY - p[1]) * dpr;
            moved += Math.abs(e.clientX - p[0]) + Math.abs(e.clientY - p[1]);
            if (tip) tip.style.display = 'none';
        }
        ptr.set(e.pointerId, [e.clientX, e.clientY]);
        if (ptr.size === 2) {
            const t = two();
            zoom(t.d / pd, t.x, t.y);
            pd = t.d;
            moved = 99;
        }
        draw3DMap();
    });

    const end = e => {
        const was = ptr.has(e.pointerId);
        ptr.delete(e.pointerId);
        if (was && e.type === 'pointerup' && !ptr.size && moved < 6) {
            const idx = hit3DMap(e.clientX, e.clientY);
            map3DSelIndex = (map3DSelIndex === idx) ? -1 : idx;
            draw3DMap();
        }
    };

    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    canvas.addEventListener('pointerleave', () => {
        if (!ptr.size) {
            if (tip) tip.style.display = 'none';
            if (map3DHovIndex >= 0) {
                map3DHovIndex = -1;
                draw3DMap();
            }
        }
    });

    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        zoom(Math.exp(-e.deltaY * 0.002), e.clientX, e.clientY);
        draw3DMap();
    }, { passive: false });

    // Center reset button
    const resetBtn = document.getElementById('btn-reset-map');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            map3DView = { x: 0, y: 0, z: 1 };
            map3DHovIndex = -1;
            map3DSelIndex = -1;
            draw3DMap();
        });
    }

    // Responsive Canvas Resize Observer
    const ro = new ResizeObserver(() => {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(wrap.clientWidth * dpr);
        canvas.height = Math.round(wrap.clientHeight * dpr);
        map3DFit = Math.min(canvas.width / 18, canvas.height / 21);
        draw3DMap();
    });
    ro.observe(wrap);
}

/**
 * Render the sorted provinces ranking table with 3D map bidirectional hover
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

        html += `
            <tr data-prov="${item.nombre}" style="cursor: pointer;">
                <td><span class="${badgeClass}">${rank}</span></td>
                <td><b>${item.nombre}</b></td>
                <td><span style="color: var(--accent-red); font-weight: 700;">${item.share.toFixed(2)}%</span></td>
                <td>${item.chinos.toLocaleString('es-AR')}</td>
                <td>${item.total.toLocaleString('es-AR')}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;

    // Bidirectional hover between Table rows and 3D Map pillars
    tbody.querySelectorAll('tr[data-prov]').forEach(row => {
        const provName = row.getAttribute('data-prov');
        row.addEventListener('mouseenter', () => {
            if (map3DProvinces) {
                map3DHovIndex = map3DProvinces.findIndex(p => p.name === provName);
                draw3DMap();
            }
        });
        row.addEventListener('mouseleave', () => {
            if (map3DProvinces) {
                map3DHovIndex = -1;
                draw3DMap();
            }
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
