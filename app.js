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
    renderPlotlyMap(data);
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

/**
 * Render the dual-panel Plotly Choropleth Map (23 Provincias + CABA Zoom)
 */
function renderPlotlyMap(data) {
    const container = document.getElementById('plotly-map-container');
    if (!container || !geojsonData || !data.provincias) return;

    const isLight = (currentTheme === 'light');
    const cabaName = "Ciudad Autónoma de Buenos Aires";

    const argFeatures = geojsonData.features.filter(f => f.properties.nombre !== cabaName);
    const cabaFeatures = geojsonData.features.filter(f => f.properties.nombre === cabaName);

    const geoArg = { type: "FeatureCollection", features: argFeatures };
    const geoCaba = { type: "FeatureCollection", features: cabaFeatures };

    const provsArg = [];
    const zArg = [];
    const customArg = [];

    const provsCaba = [];
    const zCaba = [];
    const customCaba = [];

    let maxShare = 0;

    argFeatures.forEach(feat => {
        const prov = feat.properties.nombre;
        const item = data.provincias[prov] || { share: 0, chinos: 0, total: 0, ranking: 24 };
        if (item.share > maxShare) maxShare = item.share;

        const row = [
            prov,
            `${item.share.toFixed(2)}%`,
            item.chinos.toLocaleString('es-AR'),
            item.total.toLocaleString('es-AR'),
            item.ranking
        ];

        provsArg.push(prov);
        zArg.push(item.share);
        customArg.push(row);
    });

    cabaFeatures.forEach(feat => {
        const prov = feat.properties.nombre;
        const item = data.provincias[prov] || { share: 0, chinos: 0, total: 0, ranking: 24 };
        if (item.share > maxShare) maxShare = item.share;

        const row = [
            prov,
            `${item.share.toFixed(2)}%`,
            item.chinos.toLocaleString('es-AR'),
            item.total.toLocaleString('es-AR'),
            item.ranking
        ];

        provsCaba.push(prov);
        zCaba.push(item.share);
        customCaba.push(row);
    });

    maxShare = Math.max(maxShare, 2.0);

    const legendMaxEl = document.getElementById('map-legend-max');
    if (legendMaxEl) {
        legendMaxEl.textContent = `${maxShare.toFixed(1)}%`;
    }

    const dividerColor = isLight ? '#cbd5e1' : '#64748b';
    const accentHighlight = isLight ? '#dc2626' : '#ef4444';
    const segLabelShort = SEGMENT_LABELS[currentSegment] || 'Segmento';

    const hoverTemplate = 
        "<b style='font-size: 15px;'>%{customdata[0]}</b><br>" +
        `<span style='color: ${dividerColor};'>━━━━━━━━━━━━━━━━━━━━━━━━</span><br>` +
        `🇨🇳 <b>Cuota Chinos (${segLabelShort}):</b> <span style='color: ${accentHighlight}; font-weight: bold;'>%{customdata[1]}</span> (Puesto #%{customdata[4]} de 24)<br>` +
        "🚗 <b>Patentamientos Chinos:</b> %{customdata[2]} unidades<br>" +
        "📊 <b>Total Inscripciones Segmento:</b> %{customdata[3]} unidades" +
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

    const cabaBoxFill = isLight ? 'rgba(255, 255, 255, 0.88)' : 'rgba(15, 23, 42, 0.85)';
    const cabaBoxBorder = isLight ? 'rgba(203, 213, 225, 0.9)' : 'rgba(255, 255, 255, 0.15)';
    const cabaTitleColor = isLight ? '#0f172a' : '#f8fafc';
    const cabaSubColor = isLight ? '#64748b' : '#94a3b8';

    const cabaItem = data.provincias[cabaName];
    const cabaShareVal = cabaItem ? `${cabaItem.share.toFixed(1)}%` : '--';
    const cabaRankVal = cabaItem ? `#${cabaItem.ranking}` : '';

    const layout = {
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        margin: { t: 15, b: 15, l: 5, r: 5 },
        height: 540,
        dragmode: false,
        geo: {
            domain: { x: [0.0, 0.77], y: [0, 1.0] },
            fitbounds: "locations",
            visible: false,
            projection: { type: "mercator" },
            bgcolor: "rgba(0,0,0,0)"
        },
        geo2: {
            domain: { x: [0.73, 0.98], y: [0.55, 0.86] },
            fitbounds: "locations",
            visible: false,
            projection: { type: "mercator" },
            bgcolor: "rgba(0,0,0,0)"
        },
        shapes: [
            // Connector line from CABA on main map to inset card
            {
                type: "line",
                xref: "paper", yref: "paper",
                x0: 0.525, y0: 0.585,
                x1: 0.72, y1: 0.68,
                line: { color: accentHighlight, width: 1.4, dash: "dot" }
            },
            // Beacon pin on CABA on main map
            {
                type: "circle",
                xref: "paper", yref: "paper",
                x0: 0.518, y0: 0.577,
                x1: 0.532, y1: 0.593,
                fillcolor: accentHighlight,
                line: { color: "#ffffff", width: 1.2 }
            },
            // Sleek floating glass card background for CABA Inset
            {
                type: "rect",
                xref: "paper", yref: "paper",
                x0: 0.72, y0: 0.48,
                x1: 0.99, y1: 0.94,
                line: { color: cabaBoxBorder, width: 1.2 },
                fillcolor: cabaBoxFill
            }
        ],
        annotations: [
            {
                text: `<b>CABA</b> • <span style='color:${accentHighlight}; font-weight:800;'>${cabaShareVal}</span><br><span style='font-size:10px; color:${cabaSubColor};'>Zoom Urbano • Puesto ${cabaRankVal}</span>`,
                xref: "paper", yref: "paper",
                x: 0.855, y: 0.915,
                showarrow: false,
                font: { size: 12, color: cabaTitleColor, family: "Plus Jakarta Sans" }
            },
            {
                text: `<span style='font-size:9.5px; color:${cabaSubColor};'>Pasa el cursor para ver detalle</span>`,
                xref: "paper", yref: "paper",
                x: 0.855, y: 0.505,
                showarrow: false,
                font: { size: 10, color: cabaSubColor, family: "Plus Jakarta Sans" }
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

    const plotPromise = Plotly.react(container, traces, layout, config);

    // Setup Event Listeners for 3D Elevation, Dimming, and Province Matching
    const setup3DMapInteractions = () => {
        // Clear any previous listeners on container to prevent duplicates
        if (typeof container.removeAllListeners === 'function') {
            container.removeAllListeners('plotly_hover');
            container.removeAllListeners('plotly_unhover');
        }

        // Tag every SVG path with its true province name based on feature order
        const geo1Paths = container.querySelectorAll('.geolayer .geo:not(.geo2) path.choroplethlocation');
        geo1Paths.forEach((path, idx) => {
            if (argFeatures[idx]) {
                path.setAttribute('data-province', argFeatures[idx].properties.nombre);
            }
        });

        const geo2Paths = container.querySelectorAll('.geolayer .geo2 path.choroplethlocation');
        geo2Paths.forEach((path, idx) => {
            if (cabaFeatures[idx]) {
                path.setAttribute('data-province', cabaFeatures[idx].properties.nombre);
            }
        });

        const allPaths = container.querySelectorAll('path.choroplethlocation');

        const highlightProvince = (provName, directPath) => {
            let target = directPath;
            if (!target && provName) {
                target = container.querySelector(`path.choroplethlocation[data-province="${CSS.escape(provName)}"]`);
            }
            if (!target) return;

            allPaths.forEach(p => {
                if (p === target) {
                    p.classList.remove('state-dimmed');
                    p.classList.add('state-active-hover');
                } else {
                    p.classList.add('state-dimmed');
                    p.classList.remove('state-active-hover');
                }
            });

            // SVG Z-Index Elevation: Bring path to the top of its parent <g> so borders/shadows don't clip
            const parent = target.parentNode;
            if (parent && parent.lastChild !== target) {
                parent.appendChild(target);
            }
        };

        const resetAllProvinces = () => {
            allPaths.forEach(p => {
                p.classList.remove('state-dimmed', 'state-active-hover');
            });
        };

        // Plotly Hover Handler: matches accurately by point's location string
        container.on('plotly_hover', (eventData) => {
            if (!eventData || !eventData.points || !eventData.points.length) return;
            const pt = eventData.points[0];
            highlightProvince(pt.location, null);
        });

        // Plotly Unhover Handler
        container.on('plotly_unhover', resetAllProvinces);

        // Native pointer listeners on each path (zero-latency physical hit-testing)
        allPaths.forEach(path => {
            path.onpointerenter = function() {
                const name = this.getAttribute('data-province');
                highlightProvince(name, this);
            };
        });

        container.onpointerleave = resetAllProvinces;
    };

    if (plotPromise && typeof plotPromise.then === 'function') {
        plotPromise.then(setup3DMapInteractions);
    } else {
        setTimeout(setup3DMapInteractions, 60);
    }
}

/**
 * Render the sorted provinces ranking table
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
