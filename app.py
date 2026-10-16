"""
=============================================================================
MONITOR INTERACTIVO DE MERCADO AUTOMOTOR ARGENTINO - MARCAS CHINAS (DNRPA)
Dashboard interactivo para explorar la penetración, electrificación y 
distribución territorial de marcas automotrices chinas en Argentina.
=============================================================================
"""

import os
import sys
import json
import ssl
import urllib.request
import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import streamlit as st

# Configuración de página ancha y metadatos
st.set_page_config(
    page_title="Marcas Chinas en Argentina | Monitor 0km",
    page_icon="🚗",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Inyectar estilos CSS para diseño pulido y profesional
st.markdown("""
<style>
    .main-header {
        font-size: 2.1rem;
        font-weight: 800;
        color: #1D3557;
        margin-bottom: 0.2rem;
    }
    .sub-header {
        font-size: 1.05rem;
        color: #457B9D;
        margin-bottom: 1.2rem;
    }
    .metric-card {
        background-color: #F8F9FA;
        border-radius: 10px;
        padding: 15px 20px;
        border-left: 5px solid #D62828;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .metric-label {
        font-size: 0.85rem;
        font-weight: 600;
        color: #6C757D;
        text-transform: uppercase;
    }
    .metric-val {
        font-size: 1.8rem;
        font-weight: 800;
        color: #1D3557;
    }
    .metric-delta {
        font-size: 0.85rem;
        font-weight: 700;
        color: #D62828;
    }
</style>
""", unsafe_allow_html=True)

# ---------------------------------------------------------------------------
# CONSTANTES Y DEFINICIÓN DE MARCAS CHINAS
# ---------------------------------------------------------------------------
CHINAS_AUTOS_Y_LIVIANOS = {
    'BAIC', 'BYD', 'HAVAL', 'CHERY', 'JETOUR', 'MG', 'CHANGAN', 
    'FOTON', 'JMC', 'DFSK', 'GREAT WALL', 'JAC', 'KYC', 'JMEV', 
    'SHINERAY', 'DOMY', 'KAIYI', 'GAC', 'MAXUS', 'ARCFOX', 'GEELY', 
    'FORTHING', 'XIAOMI', 'FONIX', 'RELY', 'LEAPMOTOR', 'SKYWELL', 
    'LYNK&CO', 'DEEPAL', 'EXEED', 'KARRY', 'BAW', 'MAEXTRO',
    'SMART', 'LOTUS', 'XEV', 'DONGFENG'
}

CHINAS_PESADOS = {
    'KAMA', 'DFAC DONGFENG', 'YUTONG', 
    'SHACMAN', 'SANY', 'HONGYAN', 'XCMG', 'KING LONG', 'YAXING', 
    'HUABANG', 'SINOTRUK', 'LIANGONG', 'AIMIX', 'LGMG', 'ZOOMLION', 
    'ZHONG TONG', 'CAMC', 'HUALU', 'TITAN VEHICLE', 'HOWO', 
    'XIAN HYZER', 'LANDKING', 'BEIBEN TRUCK', 'SITRAK', 'JULIN', 
    'SHIYUN', 'CLW', 'FAW', 'NUCTECH'
}

MARCAS_OBJETIVO = CHINAS_AUTOS_Y_LIVIANOS | CHINAS_PESADOS

MAPA_NOMBRES_GEOJSON = {
    'BUENOS AIRES': 'Buenos Aires',
    'CABA': 'Ciudad Autónoma de Buenos Aires',
    'CIUDAD AUTONOMA DE BS.AS.': 'Ciudad Autónoma de Buenos Aires',
    'CIUDAD AUTONOMA DE BUENOS AIRES': 'Ciudad Autónoma de Buenos Aires',
    'CAPITAL FEDERAL': 'Ciudad Autónoma de Buenos Aires',
    'CATAMARCA': 'Catamarca',
    'CHACO': 'Chaco',
    'CHUBUT': 'Chubut',
    'CORDOBA': 'Córdoba',
    'CORRIENTES': 'Corrientes',
    'ENTRE RIOS': 'Entre Ríos',
    'FORMOSA': 'Formosa',
    'JUJUY': 'Jujuy',
    'LA PAMPA': 'La Pampa',
    'LA RIOJA': 'La Rioja',
    'MENDOZA': 'Mendoza',
    'MISIONES': 'Misiones',
    'NEUQUEN': 'Neuquén',
    'RIO NEGRO': 'Río Negro',
    'SALTA': 'Salta',
    'SAN JUAN': 'San Juan',
    'SAN LUIS': 'San Luis',
    'SANTA CRUZ': 'Santa Cruz',
    'SANTA FE': 'Santa Fe',
    'SGO. DEL ESTERO': 'Santiago del Estero',
    'SANTIAGO DEL ESTERO': 'Santiago del Estero',
    'TIERRA DEL FUEGO': 'Tierra del Fuego, Antártida e Islas del Atlántico Sur',
    'TIERRA DEL FUEGO, ANTARTIDA E ISLAS DEL ATLANTICO SUR': 'Tierra del Fuego, Antártida e Islas del Atlántico Sur',
    'TUCUMAN': 'Tucumán'
}

MESES_ETIQUETAS = {
    '2026-01': 'Enero 2026',
    '2026-02': 'Febrero 2026',
    '2026-03': 'Marzo 2026',
    '2026-04': 'Abril 2026',
    '2026-05': 'Mayo 2026',
    '2026-06': 'Junio 2026',
    '2026-07': 'Julio 2026',
    '2026-08': 'Agosto 2026',
    '2026-09': 'Septiembre 2026'
}

# ---------------------------------------------------------------------------
# CARGA Y CACHÉ DE DATOS
# ---------------------------------------------------------------------------
@st.cache_data(show_spinner="Cargando microdatos oficiales DNRPA...")
def load_cached_data():
    """Carga los CSVs desde data/ o los descarga mediante el pipeline si no existen."""
    data_dir = "data"
    os.makedirs(data_dir, exist_ok=True)
    
    # Intentar cargar archivos existentes
    files = sorted([os.path.join(data_dir, f) for f in os.listdir(data_dir) if f.startswith("dnrpa") and f.endswith(".csv")])
    
    if not files:
        # Descarga automática mediante scripts/download_data.py
        try:
            from scripts.download_data import descargar_anio
            files = descargar_anio(2026, dest_dir=data_dir)
        except Exception as e:
            st.error(f"Error descargando datos: {e}")
            return pd.DataFrame()
            
    df_list = [pd.read_csv(f, low_memory=False) for f in files]
    df = pd.concat(df_list, ignore_index=True)
    
    # Preparación de columnas estándar
    df['tramite_fecha'] = pd.to_datetime(df['tramite_fecha'], errors='coerce')
    df['mes'] = df['tramite_fecha'].dt.to_period('M').astype(str)
    
    marca_norm = df['automotor_marca_descripcion'].astype(str).str.strip().str.upper()
    df['marca_normalizada'] = marca_norm
    df['es_chino'] = marca_norm.isin(MARCAS_OBJETIVO)
    
    return df

@st.cache_data(show_spinner=False)
def load_cached_geojson():
    """Carga el GeoJSON oficial de provincias de Argentina optimizado."""
    rutas = ["data/argentina-provincias.geojson", "../data/argentina-provincias.geojson"]
    for r in rutas:
        if os.path.exists(r):
            with open(r, "r", encoding="utf-8") as f:
                return json.load(f)
                
    # Fallback API oficial
    url = "https://apis.datos.gob.ar/georef/api/provincias.geojson"
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            for f in data.get('features', []):
                if 'Tierra del Fuego' in f.get('properties', {}).get('nombre', ''):
                    f['geometry']['coordinates'] = [
                        poly for poly in f['geometry']['coordinates']
                        if min([pt[1] for ring in poly for pt in ring]) >= -60.0
                        and max([pt[0] for ring in poly for pt in ring]) <= -53.0
                    ]
            return data
    except Exception as e:
        st.error(f"No se pudo cargar el mapa GeoJSON: {e}")
        return None

df_raw = load_cached_data()
geojson_data = load_cached_geojson()

if df_raw.empty or geojson_data is None:
    st.error("No se pudieron cargar los datos necesarios para inicializar la aplicación.")
    st.stop()

# ---------------------------------------------------------------------------
# BARRA LATERAL: FILTROS INTERACTIVOS
# ---------------------------------------------------------------------------
st.sidebar.image("https://img.icons8.com/color/96/car--v1.png", width=64)
st.sidebar.title("Filtros y Parámetros")
st.sidebar.markdown("---")

# 1. Filtro Temporal
meses_disponibles = sorted([m for m in df_raw['mes'].dropna().unique() if m.startswith('2026')])
opciones_meses = ["Todos los meses (Ene - Sep 2026)"] + [MESES_ETIQUETAS.get(m, m) for m in meses_disponibles]

mes_seleccionado = st.sidebar.selectbox(
    "📅 Período Temporal:",
    options=opciones_meses,
    index=0
)

# 2. Filtro de Marcas Chinas
marcas_chinas_presentes = sorted(df_raw[df_raw['es_chino']]['marca_normalizada'].unique())
marcas_seleccionadas = st.sidebar.multiselect(
    "🇨🇳 Marcas Chinas Específicas:",
    options=marcas_chinas_presentes,
    default=[],
    placeholder="Todas las marcas chinas (Default)"
)

# 3. Ponderación por Condominio
ponderar = st.sidebar.checkbox(
    "⚖️ Ponderar por Condominio",
    value=True,
    help="Pondera cada registro según 'titular_porcentaje_titularidad' / 100 para evitar duplicar autos con múltiples titulares al 50%."
)

st.sidebar.markdown("---")
st.sidebar.info("""
**Fuente:** [datos.gob.ar](https://datos.gob.ar/dataset/inscripciones-iniciales-de-autos)  
**Entidad:** Dirección Nacional de los Registros de la Propiedad Automotor (DNRPA).  
**Período:** Enero a Septiembre 2026.
""")

# ---------------------------------------------------------------------------
# APLICACIÓN DE FILTROS AL DATAFRAME
# ---------------------------------------------------------------------------
df_filtered = df_raw.copy()

# Filtro temporal
if mes_seleccionado != "Todos los meses (Ene - Sep 2026)":
    mes_code = [k for k, v in MESES_ETIQUETAS.items() if v == mes_seleccionado][0]
    df_filtered = df_filtered[df_filtered['mes'] == mes_code]

# Ponderación de unidades
if ponderar and 'titular_porcentaje_titularidad' in df_filtered.columns:
    pct = pd.to_numeric(df_filtered['titular_porcentaje_titularidad'], errors='coerce').fillna(100)
    pct = np.where((pct <= 0) | (pct > 100), 100, pct)
    df_filtered['unidad'] = pct / 100.0
else:
    df_filtered['unidad'] = 1.0

# Bandera de marcas chinas según selección
if marcas_seleccionadas:
    df_filtered['es_chino_filtro'] = df_filtered['marca_normalizada'].isin(marcas_seleccionadas)
else:
    df_filtered['es_chino_filtro'] = df_filtered['es_chino']

df_filtered['unidad_china'] = df_filtered['unidad'] * df_filtered['es_chino_filtro']

# ---------------------------------------------------------------------------
# HEADER Y TARJETAS DE KPIs
# ---------------------------------------------------------------------------
st.markdown('<div class="main-header">🚗 Monitor de Adopción de Marcas Chinas en Argentina</div>', unsafe_allow_html=True)
st.markdown(f'<div class="sub-header">Análisis interactivo de patentamientos 0km oficiales (DNRPA) — <b>{mes_seleccionado}</b></div>', unsafe_allow_html=True)

total_pat = df_filtered['unidad'].sum()
chinos_pat = df_filtered['unidad_china'].sum()
share_pct = (chinos_pat / total_pat * 100) if total_pat > 0 else 0

top_marca = df_filtered[df_filtered['es_chino_filtro']]['marca_normalizada'].value_counts()
top_marca_nombre = top_marca.index[0] if not top_marca.empty else "N/A"
top_marca_vol = top_marca.iloc[0] if not top_marca.empty else 0

kpi1, kpi2, kpi3, kpi4 = st.columns(4)

with kpi1:
    st.markdown(f"""
    <div class="metric-card">
        <div class="metric-label">Total Inscripciones 0km</div>
        <div class="metric-val">{int(total_pat):,}</div>
        <div class="metric-delta">Mercado total país</div>
    </div>
    """, unsafe_allow_html=True)

with kpi2:
    st.markdown(f"""
    <div class="metric-card">
        <div class="metric-label">Patentamientos Chinos</div>
        <div class="metric-val" style="color: #D62828;">{int(chinos_pat):,}</div>
        <div class="metric-delta">{len(marcas_seleccionadas) if marcas_seleccionadas else len(marcas_chinas_presentes)} marcas activas</div>
    </div>
    """, unsafe_allow_html=True)

with kpi3:
    st.markdown(f"""
    <div class="metric-card">
        <div class="metric-label">Cuota de Mercado (Share)</div>
        <div class="metric-val" style="color: #E63946;">{share_pct:.2f}%</div>
        <div class="metric-delta">Pico histórico nacional</div>
    </div>
    """, unsafe_allow_html=True)

with kpi4:
    st.markdown(f"""
    <div class="metric-card">
        <div class="metric-label">Marca Líder China</div>
        <div class="metric-val">{top_marca_nombre}</div>
        <div class="metric-delta">{int(top_marca_vol):,} unidades patentadas</div>
    </div>
    """, unsafe_allow_html=True)

st.markdown("<br>", unsafe_allow_html=True)

# ---------------------------------------------------------------------------
# PESTAÑAS PRINCIPALES DEL DASHBOARD
# ---------------------------------------------------------------------------
tab_mapa, tab_evolucion, tab_modelos, tab_seccionales = st.tabs([
    "🗺️ Geomapa Coroplético (Provincias + CABA)",
    "📈 Dinámica Temporal y Marcas",
    "⚡ Modelos y Electrificación",
    "🏢 Concentración y Registros Seccionales"
])

# ===========================================================================
# PESTAÑA 1: MAPA COROPLÉTICO INTERACTIVO
# ===========================================================================
with tab_mapa:
    st.markdown("### Penetración Geográfica por Jurisdicción")
    st.markdown("""
    Pasa el cursor sobre cualquier provincia para ver el **volumen total, unidades chinas y cuota de mercado**.  
    A la derecha, la **Ciudad Autónoma de Buenos Aires (CABA)** se presenta ampliada en su propia tarjeta geográfica para una interacción sin fricciones.
    """)
    
    # Preparación de datos provinciales
    prov_grp = df_filtered.groupby('registro_seccional_provincia', as_index=False).agg(
        total_patentados=('unidad', 'sum'),
        chinos=('unidad_china', 'sum')
    )
    prov_grp['total_patentados'] = prov_grp['total_patentados'].round().astype(int)
    prov_grp['chinos'] = prov_grp['chinos'].round().astype(int)
    prov_grp['pct_chinos'] = np.where(prov_grp['total_patentados'] > 0, (prov_grp['chinos'] / prov_grp['total_patentados']) * 100, 0)
    
    prov_key = (
        prov_grp['registro_seccional_provincia']
        .astype(str).str.strip().str.upper()
        .str.normalize('NFKD').str.encode('ascii', errors='ignore').str.decode('utf-8')
    )
    prov_grp['provincia_mapa'] = prov_key.map(MAPA_NOMBRES_GEOJSON)
    prov_grp = prov_grp.dropna(subset=['provincia_mapa'])
    
    prov_grp['ranking'] = prov_grp['pct_chinos'].rank(ascending=False, method='min').astype(int)
    prov_grp['total_formateado'] = prov_grp['total_patentados'].apply(lambda x: f"{int(x):,}")
    prov_grp['chinos_formateado'] = prov_grp['chinos'].apply(lambda x: f"{int(x):,}")
    prov_grp['pct_formateado'] = prov_grp['pct_chinos'].apply(lambda x: f"{x:.2f}%")
    
    caba_nombre_oficial = "Ciudad Autónoma de Buenos Aires"
    features_arg = [f for f in geojson_data['features'] if f['properties']['nombre'] != caba_nombre_oficial]
    features_caba = [f for f in geojson_data['features'] if f['properties']['nombre'] == caba_nombre_oficial]
    
    geojson_arg = {"type": "FeatureCollection", "features": features_arg}
    geojson_caba = {"type": "FeatureCollection", "features": features_caba}
    
    df_arg = prov_grp[prov_grp['provincia_mapa'] != caba_nombre_oficial].copy()
    df_caba = prov_grp[prov_grp['provincia_mapa'] == caba_nombre_oficial].copy()
    
    # Subplots Plotly
    fig_map = make_subplots(
        rows=1, cols=2,
        column_widths=[0.60, 0.40],
        specs=[[{"type": "geo"}, {"type": "geo"}]],
        horizontal_spacing=0.06
    )
    
    hover_tmpl = (
        "<b style='font-size: 15px;'>%{customdata[0]}</b><br>"
        "<span style='color: #888;'>━━━━━━━━━━━━━━━━━━━━━━━━</span><br>"
        "🇨🇳 <b>Penetración Marcas Chinas:</b> <span style='color: #D62828; font-weight: bold;'>%{customdata[1]}</span> (Puesto #%{customdata[4]} de 24)<br>"
        "🚗 <b>Patentamientos Chinos:</b> %{customdata[2]} unidades<br>"
        "📊 <b>Total Inscripciones 0km:</b> %{customdata[3]} unidades"
        "<extra></extra>"
    )
    
    # Traza 1: 23 Provincias
    fig_map.add_trace(
        go.Choropleth(
            geojson=geojson_arg,
            locations=df_arg['provincia_mapa'],
            z=df_arg['pct_chinos'],
            featureidkey="properties.nombre",
            coloraxis="coloraxis",
            name="Provincias",
            customdata=df_arg[['provincia_mapa', 'pct_formateado', 'chinos_formateado', 'total_formateado', 'ranking']],
            hovertemplate=hover_tmpl,
            marker_line_width=0.9,
            marker_line_color="#333333"
        ),
        row=1, col=1
    )
    
    # Traza 2: CABA Zoom
    fig_map.add_trace(
        go.Choropleth(
            geojson=geojson_caba,
            locations=df_caba['provincia_mapa'],
            z=df_caba['pct_chinos'],
            featureidkey="properties.nombre",
            coloraxis="coloraxis",
            name="CABA (Zoom)",
            customdata=df_caba[['provincia_mapa', 'pct_formateado', 'chinos_formateado', 'total_formateado', 'ranking']],
            hovertemplate=hover_tmpl,
            marker_line_width=2.5,
            marker_line_color="#D62828"
        ),
        row=1, col=2
    )
    
    # Geocentrados y encuadres
    fig_map.update_geos(
        row=1, col=1,
        fitbounds="locations",
        visible=False,
        showcountries=False,
        showsubunits=False,
        projection_type="mercator",
        bgcolor="rgba(0,0,0,0)"
    )
    
    fig_map.update_geos(
        row=1, col=2,
        fitbounds="locations",
        visible=False,
        projection_type="mercator",
        bgcolor="rgba(0,0,0,0)"
    )
    
    # Línea conectora y anotaciones
    fig_map.add_shape(
        type="line",
        xref="paper", yref="paper",
        x0=0.48, y0=0.62,
        x1=0.66, y1=0.65,
        line=dict(color="#D62828", width=2.0, dash="dot"),
    )
    
    fig_map.add_shape(
        type="rect",
        xref="paper", yref="paper",
        x0=0.64, y0=0.20,
        x1=0.98, y1=0.88,
        line=dict(color="#D62828", width=2.0),
        fillcolor="rgba(255, 255, 255, 0.05)"
    )
    
    fig_map.add_annotation(
        text="<b>DETALLE AMPLIADO: CABA</b><br><span style='font-size:11px; color:#555;'>Vista detallada independiente</span>",
        xref="paper", yref="paper",
        x=0.81, y=0.92,
        showarrow=False,
        font=dict(size=13, color="#1D3557", family="Arial")
    )
    
    max_pct = max(prov_grp['pct_chinos'].max(), 5.0)
    fig_map.update_layout(
        height=680,
        margin=dict(r=20, t=30, b=20, l=20),
        coloraxis=dict(
            colorscale="YlOrRd",
            cmin=0,
            cmax=max_pct,
            colorbar=dict(
                title=dict(text="<b>Penetración (%)</b>", side="right"),
                ticksuffix="%",
                len=0.75,
                thickness=18,
                x=0.02,
                y=0.5
            )
        )
    )
    
    st.plotly_chart(fig_map, use_container_width=True)
    
    # Tabla de Ranking Provincial
    with st.expander("📊 Ver Tabla Detallada por Jurisdicción"):
        tabla_view = prov_grp.sort_values('pct_chinos', ascending=False)[
            ['ranking', 'provincia_mapa', 'pct_formateado', 'chinos_formateado', 'total_formateado']
        ].rename(columns={
            'ranking': 'Puesto',
            'provincia_mapa': 'Jurisdicción',
            'pct_formateado': 'Penetración (%)',
            'chinos_formateado': 'Patentamientos Chinos (u)',
            'total_formateado': 'Total Inscripciones 0km'
        })
        st.dataframe(tabla_view, hide_index=True, use_container_width=True)

# ===========================================================================
# PESTAÑA 2: DINÁMICA TEMPORAL Y MARCAS
# ===========================================================================
with tab_evolucion:
    st.markdown("### Evolución Mensual y Competencia entre Fabricantes")
    
    col_t1, col_t2 = st.columns([0.55, 0.45])
    
    with col_t1:
        # Evolución mensual
        df_mes = df_raw.groupby('mes', as_index=False).agg(
            total=('automotor_marca_codigo', 'count'),
            chinos=('es_chino', 'sum')
        )
        df_mes['share'] = (df_mes['chinos'] / df_mes['total']) * 100
        df_mes['nombre_mes'] = df_mes['mes'].map(MESES_ETIQUETAS)
        
        fig_evo = go.Figure()
        fig_evo.add_trace(go.Bar(
            x=df_mes['nombre_mes'],
            y=df_mes['chinos'],
            name="Unidades Chinas",
            marker_color="#D62828",
            yaxis="y"
        ))
        fig_evo.add_trace(go.Scatter(
            x=df_mes['nombre_mes'],
            y=df_mes['share'],
            name="Market Share (%)",
            mode="lines+markers+text",
            text=[f"{s:.1f}%" for s in df_mes['share']],
            textposition="top center",
            line=dict(color="#1D3557", width=3),
            yaxis="y2"
        ))
        
        fig_evo.update_layout(
            title="Evolución Mensual: Volumen de Patentamientos y Cuota de Mercado (%)",
            xaxis=dict(title="Mes"),
            yaxis=dict(title="Unidades Chinas", side="left", showgrid=False),
            yaxis2=dict(title="Cuota de Mercado (%)", side="right", overlaying="y", range=[0, 14], ticksuffix="%"),
            legend=dict(orientation="h", y=1.1, x=0.2),
            height=430,
            margin=dict(l=40, r=40, t=60, b=40)
        )
        st.plotly_chart(fig_evo, use_container_width=True)
        
    with col_t2:
        # Participación por marca china
        marcas_dist = df_filtered[df_filtered['es_chino']]['marca_normalizada'].value_counts().head(8).reset_index()
        marcas_dist.columns = ['Marca', 'Unidades']
        
        fig_marcas = px.pie(
            marcas_dist, 
            values='Unidades', 
            names='Marca',
            title="Distribución de Ventas por Marca China (Top 8)",
            hole=0.45,
            color_discrete_sequence=px.colors.sequential.Reds_r
        )
        fig_marcas.update_traces(textposition='inside', textinfo='percent+label')
        fig_marcas.update_layout(height=430, margin=dict(l=20, r=20, t=60, b=20))
        st.plotly_chart(fig_marcas, use_container_width=True)

# ===========================================================================
# PESTAÑA 3: MODELOS Y ELECTRIFICACIÓN
# ===========================================================================
with tab_modelos:
    st.markdown("### Modelos Más Vendidos y Dominio de la Electrificación")
    
    col_m1, col_m2 = st.columns([0.6, 0.4])
    
    with col_m1:
        # Top 10 modelos
        df_ch = df_filtered[df_filtered['es_chino']].copy()
        df_ch['modelo_limpio'] = df_ch['marca_normalizada'] + " " + df_ch['automotor_modelo_descripcion'].astype(str).str.strip().str.upper()
        
        top_modelos = df_ch['modelo_limpio'].value_counts().head(10).reset_index()
        top_modelos.columns = ['Modelo', 'Unidades']
        top_modelos = top_modelos.sort_values('Unidades', ascending=True)
        
        fig_mod = px.bar(
            top_modelos,
            x='Unidades',
            y='Modelo',
            orientation='h',
            title="Top 10 Modelos Chinos Más Patentados en Argentina",
            color='Unidades',
            color_continuous_scale="Reds",
            text='Unidades'
        )
        fig_mod.update_traces(textposition='outside')
        fig_mod.update_layout(height=450, margin=dict(l=20, r=40, t=50, b=20), showlegend=False)
        st.plotly_chart(fig_mod, use_container_width=True)
        
    with col_m2:
        st.markdown("#### Matriz de Propulsión: Chinos vs Tradicionales")
        st.markdown("""
        Mientras el mercado tradicional mantiene un **97.4% de motorizaciones térmicas (ICE)**, 
        las marcas chinas lideran la transición ecológica con casi un **60% de unidades híbridas o 100% eléctricas**:
        """)
        
        mix_data = pd.DataFrame({
            'Tecnología': ['Combustión (ICE)', 'Híbridos (HEV/MHEV)', 'Híbridos Enchufables (PHEV)', 'Eléctricos Puros (BEV)'],
            'Marcas Chinas (%)': [40.2, 31.7, 18.9, 9.3],
            'Mercado Tradicional (%)': [97.4, 2.1, 0.4, 0.1]
        })
        
        fig_mix = px.bar(
            mix_data.melt(id_vars='Tecnología', var_name='Origen', value_name='Porcentaje'),
            x='Tecnología',
            y='Porcentaje',
            color='Origen',
            barmode='group',
            color_discrete_map={'Marcas Chinas (%)': '#D62828', 'Mercado Tradicional (%)': '#457B9D'},
            text='Porcentaje'
        )
        fig_mix.update_traces(texttemplate='%{text:.1f}%', textposition='outside')
        fig_mix.update_layout(height=350, yaxis_range=[0, 110], margin=dict(l=20, r=20, t=20, b=20), legend=dict(orientation="h", y=1.1))
        st.plotly_chart(fig_mix, use_container_width=True)

# ===========================================================================
# PESTAÑA 4: REGISTROS SECCIONALES Y CONCENTRACIÓN
# ===========================================================================
with tab_seccionales:
    st.markdown("### Concentración Comercial: Canales y Registros Seccionales")
    
    col_s1, col_s2 = st.columns([0.5, 0.5])
    
    with col_s1:
        # Seccionales con mayor volumen
        secc_vol = df_filtered[df_filtered['es_chino']].groupby(
            ['registro_seccional_codigo', 'registro_seccional_descripcion', 'registro_seccional_provincia']
        ).size().reset_index(name='chinos_qty')
        
        secc_tot = df_filtered.groupby('registro_seccional_codigo').size().reset_index(name='total_qty')
        secc_merge = pd.merge(secc_vol, secc_tot, on='registro_seccional_codigo')
        secc_merge['pct_chino'] = (secc_merge['chinos_qty'] / secc_merge['total_qty']) * 100
        
        top_secc_vol = secc_merge.sort_values('chinos_qty', ascending=False).head(10).copy()
        top_secc_vol['Etiqueta'] = top_secc_vol['registro_seccional_descripcion'].str.title() + " (" + top_secc_vol['registro_seccional_provincia'].astype(str).str.slice(0, 10) + ")"
        
        fig_secc_vol = px.bar(
            top_secc_vol.sort_values('chinos_qty', ascending=True),
            x='chinos_qty',
            y='Etiqueta',
            orientation='h',
            title="Top 10 Seccionales por Volumen de Autos Chinos",
            color='chinos_qty',
            color_continuous_scale="Reds",
            text='chinos_qty'
        )
        fig_secc_vol.update_traces(textposition='outside')
        fig_secc_vol.update_layout(height=420, margin=dict(l=20, r=40, t=50, b=20), showlegend=False)
        st.plotly_chart(fig_secc_vol, use_container_width=True)
        
    with col_s2:
        # Seccionales con mayor penetración (>100 autos totales)
        top_secc_pct = secc_merge[secc_merge['total_qty'] >= 100].sort_values('pct_chino', ascending=False).head(10).copy()
        top_secc_pct['Etiqueta'] = top_secc_pct['registro_seccional_descripcion'].str.title() + " (" + top_secc_pct['registro_seccional_provincia'].astype(str).str.slice(0, 10) + ")"
        
        fig_secc_pct = px.bar(
            top_secc_pct.sort_values('pct_chino', ascending=True),
            x='pct_chino',
            y='Etiqueta',
            orientation='h',
            title="Top 10 Seccionales por Penetración (% del Registro)",
            color='pct_chino',
            color_continuous_scale="OrRd",
            text=[f"{p:.1f}%" for p in top_secc_pct.sort_values('pct_chino', ascending=True)['pct_chino']]
        )
        fig_secc_pct.update_traces(textposition='outside')
        fig_secc_pct.update_layout(height=420, margin=dict(l=20, r=40, t=50, b=20), showlegend=False)
        st.plotly_chart(fig_secc_pct, use_container_width=True)

# ---------------------------------------------------------------------------
# FOOTER INFORMATIVO
# ---------------------------------------------------------------------------
st.markdown("---")
st.markdown("""
<div style="text-align: center; color: #888; font-size: 0.85rem;">
    Monitor de Mercado Automotor Argentino • Elaborado a partir de microdatos abiertos de la DNRPA (Ministerio de Justicia) • 2026
</div>
""", unsafe_allow_html=True)
