#!/usr/bin/env python3
"""
==============================================================================
ARGENTINA AUTO MONITOR - MONTHLY UPDATE PIPELINE (DNRPA / datos.gob.ar)
==============================================================================
Pipeline autónomo para sincronizar y actualizar mensualmente el dashboard con
las nuevas inscripciones 0km publicadas por la DNRPA.

Características:
1. Detecta automáticamente si hay nuevos meses publicados (ej. 2026-10 en Noviembre).
2. Descarga directamente el recurso oficial actualizado desde datos.gob.ar / datos.jus.gob.ar.
3. También detecta si se agregaron archivos CSV locales en la carpeta `data/`.
4. Realiza procesamiento incremental: preserva los años cerrados (2018-2025) y
   actualiza de forma ultrarrápida el año corriente y la macro evolución.
5. Diseñado para ejecutarse de forma interactiva (CLI) o programada (GitHub Actions).
==============================================================================
"""

import os
import io
import re
import sys
import json
import glob
import zipfile
import argparse
import datetime
import urllib.request
from typing import Dict, List, Optional, Tuple
import numpy as np
import pandas as pd

# Soporte UTF-8 en consolas Windows
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Mapeo de Marcas Chinas (Autos, SUVs, Utilitarios y Pesados)
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

# Normalización estándar de provincias argentinas (matching GeoJSON)
MAPA_NOMBRES = {
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

CKAN_PACKAGE_URL = "https://datos.gob.ar/api/3/action/package_show?id=inscripciones-iniciales-de-autos"
DASHBOARD_FILE = "data/dashboard_data.json"

# URL de respaldo oficial del año en curso
CURRENT_YEAR_FALLBACK_URL = "https://datos.jus.gob.ar/dataset/37c9ad39-f092-44be-9b7f-1201b3c4b7a8/resource/f854085c-73e9-447f-b725-6226b81a1caf/download/dnrpa-inscripciones-iniciales-autos-2026.zip"


AVAILABLE_SEGMENTS = [
    {
        'id': 'TOTAL',
        'label': '🚗 Todo el Mercado',
        'desc': 'Totalidad de inscripciones (incluye pesados y comerciales)'
    },
    {
        'id': 'GENTE',
        'label': '👥 Autos de la Gente',
        'desc': 'Autos, SUVs y Pick-ups (excluye camiones y colectivos)'
    },
    {
        'id': 'SUVS_AUTOS',
        'label': '✨ Solo Autos y SUVs',
        'desc': 'Vehículos familiares de pasajeros (excluye pick-ups)'
    },
    {
        'id': 'PICKUPS',
        'label': '🛻 Pick-ups y Camionetas',
        'desc': 'Camionetas particulares y de trabajo liviano'
    }
]


def clasificar_powertrain(desc: str) -> str:
    d = str(desc).upper()
    if any(k in d for k in ['DOLPHIN', 'YUAN PLUS', 'HAN EV', 'TANG EV', 'ORCA', 'E-STAR', 'SEAL']):
        return 'BEV (100% Eléctrico)'
    if any(k in d for k in ['DM-I', 'SONG PLUS', 'ATTO', 'PHEV', 'TIGGO 8 PRO E+']):
        return 'PHEV (Híbrido Enchufable)'
    if any(k in d for k in ['BJ30', 'HYBRID', 'HEV', 'TIGGO 7 PRO HYBRID', 'HAVAL H6 HEV', 'JOLION HEV']):
        return 'HEV (Híbrido Convencional)'
    return 'ICE (Combustión)'


def clasificar_segmento_base(tipo_desc: str) -> str:
    """Clasifica el tipo de carrocería según la terminología de DNRPA."""
    t = str(tipo_desc).strip().upper()
    if any(k in t for k in ['RURAL', 'TODO TERRENO']):
        return 'SUVS'
    if any(k in t for k in ['SEDAN', 'COUPE', 'CABRIOLET', 'HATCH', 'BERLINA', 'LIMOUSINE']):
        return 'AUTOS'
    if any(k in t for k in ['PICK-UP', 'PICK UP']):
        return 'PICKUPS'
    return 'PESADOS_OTROS'


def process_segment_slice(sub_df: pd.DataFrame, periodos: list) -> dict:
    """Procesa un subconjunto de datos filtrado por segmento."""
    slice_output = {
        'periodos': {},
        'historico_mensual': []
    }
    
    if len(sub_df) == 0:
        return slice_output

    # Histórico mensual del segmento
    hist = sub_df.groupby('mes', as_index=False).agg(
        total=('unidad', 'sum'),
        chinos=('unidad_china', 'sum')
    ).sort_values('mes')
    hist['share'] = np.where(hist['total'] > 0, (hist['chinos'] / hist['total']) * 100, 0)
    for _, r in hist.iterrows():
        slice_output['historico_mensual'].append({
            'mes': r['mes'],
            'total': int(round(r['total'])),
            'chinos': int(round(r['chinos'])),
            'share': round(r['share'], 2)
        })

    for p in periodos:
        sub = sub_df if p == 'ALL' else sub_df[sub_df['mes'] == p]
        tot = int(round(sub['unidad'].sum()))
        chi = int(round(sub['unidad_china'].sum()))
        sh = round((chi / tot * 100), 2) if tot > 0 else 0
        
        # Desglose provincial
        prov_sub = sub.groupby('provincia_mapa', as_index=False).agg(
            total=('unidad', 'sum'),
            chinos=('unidad_china', 'sum')
        )
        prov_sub['total'] = prov_sub['total'].round().astype(int)
        prov_sub['chinos'] = prov_sub['chinos'].round().astype(int)
        prov_sub['share'] = np.where(prov_sub['total'] > 0, (prov_sub['chinos'] / prov_sub['total']) * 100, 0).round(2)
        prov_sub['ranking'] = prov_sub['share'].rank(ascending=False, method='min').astype(int)
        
        provincias_dict = {}
        for _, pr in prov_sub.iterrows():
            if pd.notnull(pr['provincia_mapa']):
                provincias_dict[pr['provincia_mapa']] = {
                    'total': int(pr['total']),
                    'chinos': int(pr['chinos']),
                    'share': float(pr['share']),
                    'ranking': int(pr['ranking'])
                }
                
        # Top Marcas
        marcas_sub = sub[sub['es_chino']]['marca_normalizada'].value_counts().head(8)
        top_marcas = [
            {
                'marca': m,
                'unidades': int(cnt),
                'share_bloque': round(cnt / chi * 100, 1) if chi > 0 else 0
            } 
            for m, cnt in marcas_sub.items()
        ]
        
        # Top Modelos
        modelos_sub = sub[sub['es_chino']].groupby(['modelo_completo', 'powertrain']).size().reset_index(name='unidades')
        modelos_sub = modelos_sub.sort_values('unidades', ascending=False).head(10)
        top_modelos = [
            {
                'modelo': r['modelo_completo'],
                'powertrain': r['powertrain'],
                'unidades': int(r['unidades'])
            } 
            for _, r in modelos_sub.iterrows()
        ]
        
        # Top Seccionales
        secc_sub = sub.groupby(['registro_seccional_codigo', 'registro_seccional_descripcion', 'registro_seccional_provincia']).agg(
            total=('unidad', 'sum'),
            chinos=('unidad_china', 'sum')
        ).reset_index()
        secc_sub['share'] = np.where(secc_sub['total'] > 0, (secc_sub['chinos'] / secc_sub['total']) * 100, 0)
        top_secc = secc_sub.sort_values('chinos', ascending=False).head(8)
        top_secc_list = [
            {
                'nombre': str(r['registro_seccional_descripcion']).title(),
                'provincia': str(r['registro_seccional_provincia'])[:12],
                'chinos': int(round(r['chinos'])),
                'share': round(r['share'], 1)
            }
            for _, r in top_secc.iterrows()
        ]
        
        slice_output['periodos'][p] = {
            'total_pat': tot,
            'chinos_pat': chi,
            'share_pct': sh,
            'marca_lider': top_marcas[0]['marca'] if top_marcas else 'N/A',
            'marca_lider_u': top_marcas[0]['unidades'] if top_marcas else 0,
            'provincias': provincias_dict,
            'top_marcas': top_marcas,
            'top_modelos': top_modelos,
            'top_seccionales': top_secc_list
        }
        
    return slice_output


def obtener_url_recurso_anio(year: int) -> str:
    """Consulta la API de datos.gob.ar para obtener el enlace de descarga del año."""
    try:
        req = urllib.request.Request(CKAN_PACKAGE_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            if data.get('success'):
                for r in data['result'].get('resources', []):
                    name = r.get('name', '')
                    url = r.get('url', '')
                    if str(year) in name and url.endswith('.zip'):
                        return url
    except Exception as e:
        print(f"[!] Nota API CKAN: {e}. Usando URL de respaldo.")
    
    return CURRENT_YEAR_FALLBACK_URL


def procesar_dataframe_anio(df_year: pd.DataFrame, year: int) -> dict:
    """Procesa el dataframe y calcula todas las métricas agregadas por segmento."""
    df_year = df_year.copy()
    df_year['tramite_fecha'] = pd.to_datetime(df_year['tramite_fecha'], errors='coerce')
    df_year['mes'] = df_year['tramite_fecha'].dt.to_period('M').astype(str)
    
    marca_norm = df_year['automotor_marca_descripcion'].astype(str).str.strip().str.upper()
    df_year['marca_normalizada'] = marca_norm
    df_year['es_chino'] = marca_norm.isin(MARCAS_OBJETIVO)
    
    if 'titular_porcentaje_titularidad' in df_year.columns:
        pct = pd.to_numeric(df_year['titular_porcentaje_titularidad'], errors='coerce').fillna(100)
        pct = np.where((pct <= 0) | (pct > 100), 100, pct)
        df_year['unidad'] = pct / 100.0
    else:
        df_year['unidad'] = 1.0
    df_year['unidad_china'] = df_year['unidad'] * df_year['es_chino']
    
    prov_norm = (
        df_year['registro_seccional_provincia'].astype(str).str.strip().str.upper()
        .str.normalize('NFKD').str.encode('ascii', errors='ignore').str.decode('utf-8')
    )
    df_year['provincia_mapa'] = prov_norm.map(MAPA_NOMBRES)
    
    df_year['modelo_completo'] = (
        df_year['marca_normalizada'] + ' ' + 
        df_year['automotor_modelo_descripcion'].astype(str).str.strip().str.upper()
    )
    df_year['powertrain'] = df_year['modelo_completo'].apply(clasificar_powertrain)
    df_year['seg_base'] = df_year['automotor_tipo_descripcion'].apply(clasificar_segmento_base)
    
    meses_presentes = sorted([m for m in df_year['mes'].dropna().unique() if m.startswith(str(year))])
    periodos = ['ALL'] + meses_presentes
    
    segment_slices = {
        'TOTAL': df_year,
        'GENTE': df_year[df_year['seg_base'].isin(['AUTOS', 'SUVS', 'PICKUPS'])],
        'SUVS_AUTOS': df_year[df_year['seg_base'].isin(['AUTOS', 'SUVS'])],
        'PICKUPS': df_year[df_year['seg_base'] == 'PICKUPS']
    }
    
    year_output = {
        'meses': meses_presentes,
        'segmentos': {}
    }
    
    for seg_id, seg_df in segment_slices.items():
        year_output['segmentos'][seg_id] = process_segment_slice(seg_df, periodos)
        
    # Compatibilidad directa
    year_output['periodos'] = year_output['segmentos']['TOTAL']['periodos']
    year_output['historico_mensual'] = year_output['segmentos']['TOTAL']['historico_mensual']
    
    return year_output


def ejecutar_pipeline_actualizacion(year: int = 2026, force: bool = False, local_only: bool = False) -> bool:
    """
    Ejecuta el ciclo de verificación y actualización incremental.
    Retorna True si hubo actualización, False si ya estaba al día.
    """
    print("=" * 70)
    print(">> PIPELINE DE ACTUALIZACION MENSUAL - MONITOR AUTOMOTOR DNRPA")
    print(f"   Fecha de ejecucion: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"   Ano objetivo: {year}")
    print("=" * 70)
    
    # 1. Cargar estado actual de dashboard_data.json
    if not os.path.exists(DASHBOARD_FILE):
        print(f"[!] Error: No se encontro '{DASHBOARD_FILE}'. Ejecute primero build_full_historical_data.py")
        return False
        
    with open(DASHBOARD_FILE, 'r', encoding='utf-8') as f:
        dashboard_data = json.load(f)
        
    year_str = str(year)
    meses_actuales = dashboard_data.get('years', {}).get(year_str, {}).get('meses', [])
    print(f"-> Meses actualmente cargados en dashboard para {year}: {meses_actuales}")
    
    # 2. Verificar archivos CSV locales en data/
    local_csvs = sorted(glob.glob(f"data/dnrpa-inscripciones-iniciales-autos-{year}*.csv"))
    local_months = []
    for f in local_csvs:
        m = re.search(rf'{year}(\d{{2}})', os.path.basename(f))
        if m:
            local_months.append(f"{year}-{m.group(1)}")
    local_months = sorted(list(set(local_months)))
    
    df_year = None
    nuevos_meses_detectados = []
    
    # Si hay meses locales que no estan en el json
    meses_faltantes_local = [m for m in local_months if m not in meses_actuales]
    if meses_faltantes_local:
        print(f"-> [LOCAL] Se detectaron {len(meses_faltantes_local)} meses nuevos en 'data/': {meses_faltantes_local}")
        nuevos_meses_detectados = meses_faltantes_local
        print("   Cargando CSVs locales...")
        dfs = [pd.read_csv(f, low_memory=False) for f in local_csvs]
        df_year = pd.concat(dfs, ignore_index=True)
    elif not local_only:
        # 3. Consultar online el archivo ZIP anual de DNRPA
        zip_url = obtener_url_recurso_anio(year)
        print(f"-> Consultando servidor oficial de DNRPA ({zip_url})...")
        
        try:
            req = urllib.request.Request(zip_url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=40) as resp:
                zip_bytes = resp.read()
                
            print(f"   Archivo ZIP descargado ({len(zip_bytes)/(1024*1024):.1f} MB). Inspeccionando meses...")
            
            with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
                csv_files = [n for n in zf.namelist() if n.endswith('.csv')]
                online_months = []
                for n in csv_files:
                    m = re.search(rf'{year}(\d{{2}})', n)
                    if m:
                        online_months.append(f"{year}-{m.group(1)}")
                online_months = sorted(list(set(online_months)))
                print(f"   Meses encontrados en el archivo online de DNRPA: {online_months}")
                
                meses_faltantes_online = [m for m in online_months if m not in meses_actuales]
                
                if meses_faltantes_online or force:
                    if meses_faltantes_online:
                        print(f"-> [NUEVO] Mes publicado por DNRPA detectado: {meses_faltantes_online}")
                        nuevos_meses_detectados = meses_faltantes_online
                    else:
                        print("-> Forzando reprocesamiento (--force)...")
                        
                    dfs = []
                    for n in csv_files:
                        with zf.open(n) as f_csv:
                            dfs.append(pd.read_csv(f_csv, low_memory=False))
                    df_year = pd.concat(dfs, ignore_index=True)
                else:
                    print("-> [OK] El dashboard ya tiene todos los meses publicados por DNRPA hasta el momento.")
                    print("   No hay meses nuevos para incorporar. Saliendo sin modificaciones.")
                    return False
        except Exception as e:
            print(f"[!] Error al consultar/descargar archivo online: {e}")
            if not force:
                return False
                
    if df_year is None:
        if force and local_csvs:
            print("-> Forzando reprocesamiento de archivos locales existentes...")
            dfs = [pd.read_csv(f, low_memory=False) for f in local_csvs]
            df_year = pd.concat(dfs, ignore_index=True)
        else:
            print("-> No hay datos nuevos para procesar.")
            return False
            
    # 4. Procesar metricas para el ano objetivo
    print(f"-> Procesando {len(df_year):,} filas del ano {year}...")
    year_processed = procesar_dataframe_anio(df_year, year)
    
    # 5. Actualizar la estructura global preservando anos historicos
    if 'years' not in dashboard_data:
        dashboard_data['years'] = {}
    dashboard_data['years'][year_str] = year_processed
    
    if year not in dashboard_data.get('available_years', []):
        dashboard_data['available_years'].append(year)
        dashboard_data['available_years'].sort()
        
    dashboard_data['current_year'] = year
    dashboard_data['last_updated'] = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    dashboard_data['latest_month'] = year_processed['meses'][-1] if year_processed['meses'] else f"{year}-01"
    
    # 6. Reconstruir la serie macroevolution por cada segmento
    dashboard_data['available_segments'] = AVAILABLE_SEGMENTS
    dashboard_data['macro_evolution'] = {}
    for seg in ['TOTAL', 'GENTE', 'SUVS_AUTOS', 'PICKUPS']:
        dashboard_data['macro_evolution'][seg] = []
        for y in dashboard_data['available_years']:
            y_key = str(y)
            if y_key in dashboard_data['years']:
                y_data = dashboard_data['years'][y_key]
                seg_slice = y_data.get('segmentos', {}).get(seg, y_data)
                if 'ALL' in seg_slice.get('periodos', {}):
                    p_all = seg_slice['periodos']['ALL']
                    dashboard_data['macro_evolution'][seg].append({
                        'year': y,
                        'total': p_all['total_pat'],
                        'chinos': p_all['chinos_pat'],
                        'share': p_all['share_pct'],
                        'lider': p_all['marca_lider']
                    })
            
    # 7. Guardar dashboard_data.json
    with open(DASHBOARD_FILE, 'w', encoding='utf-8') as f:
        json.dump(dashboard_data, f, ensure_ascii=False)
        
    print("\n" + "=" * 70)
    print("[EXITO] DASHBOARD ACTUALIZADO SATISFACTORIAMENTE")
    print(f"   Archivo guardado: {DASHBOARD_FILE} ({os.path.getsize(DASHBOARD_FILE)/1024:.1f} KB)")
    print(f"   Ultimo mes disponible: {dashboard_data['latest_month']}")

    
    p_all = year_processed['periodos']['ALL']
    print(f"   Acumulado {year}:")
    print(f"   • Total inscripciones: {p_all['total_pat']:,}")
    print(f"   • Marcas Chinas: {p_all['chinos_pat']:,} unidades")
    print(f"   • Cuota de mercado (Market Share): {p_all['share_pct']:.2f}%")
    print(f"   • Marca líder: {p_all['marca_lider']} ({p_all['marca_lider_u']:,} u.)")
    print("=" * 70)
    
    return True


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Pipeline de actualización mensual DNRPA")
    parser.add_argument('--year', type=int, default=2026, help="Año a sincronizar (default: 2026)")
    parser.add_argument('--force', action='store_true', help="Forzar reprocesamiento aunque no haya meses nuevos")
    parser.add_argument('--local-only', action='store_true', help="Solo verificar archivos locales en data/")
    args = parser.parse_args()
    
    updated = ejecutar_pipeline_actualizacion(year=args.year, force=args.force, local_only=args.local_only)
    sys.exit(0 if not updated else 0)
