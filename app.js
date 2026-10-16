/**
 * ==============================================================================
 * ARGENTINA AUTO MONITOR - JAVASCRIPT APPLICATION LOGIC
 * Multi-Year Analysis (2018 - 2026), Scrubber Controller, Dual Plotly Map,
 * Dynamic Rankings, Macro Evolution Chart, and Dual-Theme Engine (Light/Dark).
 * ==============================================================================
 */

// Application Global State
let dashboardData = null;
let geojsonData = null;
let currentYear = 2026;
let currentPeriod = 'ALL';
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
        currentTheme = 'light'; // Default lighter theme as requested
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
    renderDashboard(); // Re-render Plotly and Chart.js with matching palette
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
 * Load pre-aggregated multi-year JSON metrics and GeoJSON cartography
 */
async function loadInitialData() {
    try {
        const [dashResp, geoResp] = await Promise.all([
            fetch('data/dashboard_data.json'),
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
        const container = document.getElementById('plotly-map-container');
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

    // Attach click handlers
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

    // Attach click handlers
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

    // Update active class on year buttons
    document.querySelectorAll('.year-pill').forEach(btn => {
        const y = parseInt(btn.getAttribute('data-year'), 10);
        if (y === currentYear) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Re-render month buttons for this year
    initializeMonthPills();

    // Update header labels & chart titles
    updateTimelineLabel();
    updateChartEvolutionHeader();

    // Re-render all dashboard components
    renderDashboard();
}

/**
 * Select a period (ALL or specific month) within the current year
 */
function selectPeriod(period) {
    const yearObj = dashboardData?.years[currentYear];
    if (!yearObj || !yearObj.periodos[period]) return;

    currentPeriod = period;

    // Update active class on pills
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
 * Update the period description in the controller
 */
function updateTimelineLabel() {
    const label = document.getElementById('timeline-current-label');
    if (label) {
        label.innerHTML = `Mostrando: <b>${getPeriodLabel(currentPeriod, currentYear)}</b>`;
    }
}

/**
 * Update chart evolution header title and description
 */
function updateChartEvolutionHeader() {
    const titleEl = document.getElementById('chart-evolution-title');
    const descEl = document.getElementById('chart-evolution-desc');

    if (chartViewMode === 'annual') {
        if (titleEl) titleEl.textContent = `Evolución Mensual (${currentYear})`;
        if (descEl) descEl.textContent = `Patentamientos y Market Share mes a mes durante ${currentYear}`;
    } else {
        if (titleEl) titleEl.textContent = `Evolución Macro Multianual (2018 - 2026)`;
        if (descEl) descEl.textContent = `Trayectoria histórica completa y salto de escala del bloque chino`;
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

    // Start from first month if currently on ALL
    let index = periodList.indexOf(currentPeriod);
    if (index <= 0 || index >= periodList.length - 1) {
        index = 1;
        selectPeriod(periodList[index]);
    }

    animationInterval = setInterval(() => {
        index++;
        if (index >= periodList.length) {
            index = 0; // Return to ALL and stop
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
 * Render all dashboard sections for the active year and period
 */
function renderDashboard() {
    if (!dashboardData || !geojsonData) return;

    const yearObj = dashboardData.years[currentYear];
    if (!yearObj) return;

    const data = yearObj.periodos[currentPeriod];
    if (!data) return;

    renderKPIs(data);
    renderPlotlyMap(data);
    renderProvincesTable(data);
    renderEvolutionChart();
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
            ? `${data.marca_lider_u.toLocaleString('es-AR')} unidades patentadas`
            : 'Sin datos disponibles';
    }
}

function animateCounter(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = (target || 0).toLocaleString('es-AR');
}

/**
 * Render the dual-panel Plotly Choropleth Map (23 Provincias + CABA Zoom)
 */
function renderPlotlyMap(data) {
    const container = document.getElementById('plotly-map-container');
    if (!container || !geojsonData || !data.provincias) return;

    const isLight = (currentTheme === 'light');
    const cabaName = "Ciudad Autónoma de Buenos Aires";

    // Split features
    const argFeatures = geojsonData.features.filter(f => f.properties.nombre !== cabaName);
    const cabaFeatures = geojsonData.features.filter(f => f.properties.nombre === cabaName);

    const geoArg = { type: "FeatureCollection", features: argFeatures };
    const geoCaba = { type: "FeatureCollection", features: cabaFeatures };

    // Build data arrays for Plotly
    const provsArg = [];
    const zArg = [];
    const customArg = [];

    const provsCaba = [];
    const zCaba = [];
    const customCaba = [];

    let maxShare = 0;

    Object.keys(data.provincias).forEach(prov => {
        const item = data.provincias[prov];
        if (item.share > maxShare) maxShare = item.share;

        const row = [
            prov,
            `${item.share.toFixed(2)}%`,
            item.chinos.toLocaleString('es-AR'),
            item.total.toLocaleString('es-AR'),
            item.ranking
        ];

        if (prov === cabaName) {
            provsCaba.push(prov);
            zCaba.push(item.share);
            customCaba.push(row);
        } else {
            provsArg.push(prov);
            zArg.push(item.share);
            customArg.push(row);
        }
    });

    maxShare = Math.max(maxShare, 2.0);

    const legendMaxEl = document.getElementById('map-legend-max');
    if (legendMaxEl) {
        legendMaxEl.textContent = `${maxShare.toFixed(1)}%`;
    }

    const dividerColor = isLight ? '#cbd5e1' : '#64748b';
    const accentHighlight = isLight ? '#dc2626' : '#ef4444';

    const hoverTemplate = 
        "<b style='font-size: 15px;'>%{customdata[0]}</b><br>" +
        `<span style='color: ${dividerColor};'>━━━━━━━━━━━━━━━━━━━━━━━━</span><br>` +
        `🇨🇳 <b>Penetración Marcas Chinas:</b> <span style='color: ${accentHighlight}; font-weight: bold;'>%{customdata[1]}</span> (Puesto #%{customdata[4]} de 24)<br>` +
        "🚗 <b>Patentamientos Chinos:</b> %{customdata[2]} unidades<br>" +
        "📊 <b>Total Inscripciones 0km:</b> %{customdata[3]} unidades" +
        "<extra></extra>";

    const provBorderColor = isLight ? '#cbd5e1' : '#1e293b';

    const traces = [
        // Trace 1: 23 Provinces
        {
            type: "choropleth",
            geojson: geoArg,
            locations: provsArg,
            z: zArg,
            featureidkey: "properties.nombre",
            coloraxis: "coloraxis",
            name: "Provincias",
            customdata: customArg,
            hovertemplate: hoverTemplate,
            marker: {
                line: { color: provBorderColor, width: 1.0 }
            },
            geo: "geo"
        },
        // Trace 2: CABA Inset Zoom
        {
            type: "choropleth",
            geojson: geoCaba,
            locations: provsCaba,
            z: zCaba,
            featureidkey: "properties.nombre",
            coloraxis: "coloraxis",
            name: "CABA",
            customdata: customCaba,
            hovertemplate: hoverTemplate,
            marker: {
                line: { color: accentHighlight, width: 2.2 }
            },
            geo: "geo2"
        }
    ];

    const cabaBoxFill = isLight ? 'rgba(255, 255, 255, 0.90)' : 'rgba(18, 24, 38, 0.5)';
    const cabaBoxBorder = isLight ? 'rgba(220, 38, 38, 0.65)' : 'rgba(239, 68, 68, 0.6)';
    const cabaTitleColor = isLight ? '#0f172a' : '#f8fafc';
    const cabaSubColor = isLight ? '#64748b' : '#94a3b8';

    const layout = {
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        margin: { t: 20, b: 20, l: 10, r: 10 },
        height: 520,
        dragmode: false,
        geo: {
            domain: { x: [0, 0.62], y: [0, 1] },
            fitbounds: "locations",
            visible: false,
            projection: { type: "mercator" },
            bgcolor: "rgba(0,0,0,0)"
        },
        geo2: {
            domain: { x: [0.65, 1.0], y: [0.15, 0.85] },
            fitbounds: "locations",
            visible: false,
            projection: { type: "mercator" },
            bgcolor: "rgba(0,0,0,0)"
        },
        shapes: [
            // Connector line from Buenos Aires region to CABA box
            {
                type: "line",
                xref: "paper", yref: "paper",
                x0: 0.50, y0: 0.61,
                x1: 0.65, y1: 0.64,
                line: { color: accentHighlight, width: 1.8, dash: "dot" }
            },
            // Card bounding box for CABA Inset
            {
                type: "rect",
                xref: "paper", yref: "paper",
                x0: 0.65, y0: 0.14,
                x1: 0.99, y1: 0.86,
                line: { color: cabaBoxBorder, width: 1.5 },
                fillcolor: cabaBoxFill
            }
        ],
        annotations: [
            {
                text: `<b>DETALLE CABA</b><br><span style='font-size:10px; color:${cabaSubColor};'>Zoom de inspección</span>`,
                xref: "paper", yref: "paper",
                x: 0.82, y: 0.91,
                showarrow: false,
                font: { size: 12, color: cabaTitleColor, family: "Plus Jakarta Sans" }
            }
        ],
        coloraxis: {
            colorscale: [
                [0.0, "#ffffb2"],
                [0.2, "#fed976"],
                [0.4, "#feb24c"],
                [0.6, "#fd8d3c"],
                [0.8, "#f03b20"],
                [1.0, "#bd0026"]
            ],
            cmin: 0,
            cmax: maxShare,
            showscale: false
        }
    };

    const config = {
        responsive: true,
        displayModeBar: false
    };

    Plotly.react(container, traces, layout, config);
}

/**
 * Render the sorted provinces ranking table
 */
function renderProvincesTable(data) {
    const tbody = document.getElementById('provinces-table-body');
    if (!tbody || !data.provincias) return;

    // Sort provinces descending by share
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
            <tr>
                <td><span class="${badgeClass}">${rank}</span></td>
                <td><b>${item.nombre}</b></td>
                <td><span style="color: var(--accent-red); font-weight: 700;">${item.share.toFixed(2)}%</span></td>
                <td>${item.chinos.toLocaleString('es-AR')}</td>
                <td>${item.total.toLocaleString('es-AR')}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

/**
 * Render Chart 1: Either Annual Monthly Evolution OR Multi-Year Macro Disruption
 */
function renderEvolutionChart() {
    const evoCtx = document.getElementById('chart-evolution');
    if (!evoCtx || !dashboardData) return;

    const isLight = (currentTheme === 'light');

    let labels = [];
    let volumes = [];
    let shares = [];
    let customLeaders = [];
    let y1Max = 15;

    if (chartViewMode === 'annual') {
        const yearObj = dashboardData.years[currentYear];
        const hist = yearObj?.historico_mensual || [];
        labels = hist.map(h => {
            const m = h.mes.split('-')[1];
            return MONTH_ABBR_ES[m] || m;
        });
        volumes = hist.map(h => h.chinos);
        shares = hist.map(h => h.share);

        const maxS = Math.max(...shares, 5);
        y1Max = Math.ceil(maxS * 1.25);
    } else {
        // Macro mode (2018 - 2026)
        const macro = dashboardData.macro_evolution || [];
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
        container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem; padding: 12px;">Sin desglose de modelos disponible para este período.</p>`;
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
        container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem; padding: 12px;">Sin desglose de seccionales disponible para este período.</p>`;
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
