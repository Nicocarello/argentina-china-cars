#!/usr/bin/env python3
"""
==============================================================================
ARGENTINA AUTO MONITOR - BUILD HISTORICAL DATA WITH VEHICLE SEGMENTATION
==============================================================================
Genera la base consolidada de 2018 a 2026 con segmentación vehicular completa:
1. 'TOTAL': Todo el mercado (autos, SUVs, pick-ups, camiones, acoplados, buses).
2. 'GENTE': "El auto de la gente" (Autos, SUVs y Pick-ups particulares y familiares).
3. 'SUVS_AUTOS': "Solo Autos y SUVs" (Hatchbacks, Sedanes y Crossovers familiares).
4. 'PICKUPS': "Pick-ups y Camionetas" (Cabina doble, simple y media).
==============================================================================
"""

import os
import io
import gc
import json
import glob
import zipfile
import urllib.request
import numpy as np
import pandas as pd

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

YEAR_ZIP_URLS = {
    2018: "https://datos.jus.gob.ar/dataset/37c9ad39-f092-44be-9b7f-1201b3c4b7a8/resource/0648ef53-b00c-4446-8e73-cd24e8bad2a7/download/dnrpa-inscripciones-iniciales-autos-2018.zip",
    2019: "https://datos.jus.gob.ar/dataset/37c9ad39-f092-44be-9b7f-1201b3c4b7a8/resource/4a434f6a-8d2c-492b-93ea-d045f3d9961a/download/dnrpa-inscripciones-iniciales-autos-2019.zip",
    2020: "https://datos.jus.gob.ar/dataset/37c9ad39-f092-44be-9b7f-1201b3c4b7a8/resource/ce8ae2db-bf61-48f7-a766-6c99ae967234/download/dnrpa-inscripciones-iniciales-autos-2020.zip",
    2021: "https://datos.jus.gob.ar/dataset/37c9ad39-f092-44be-9b7f-1201b3c4b7a8/resource/8c2cd9f4-70e1-45b4-9638-bec3c6ac9cc7/download/dnrpa-inscripciones-iniciales-autos-2021.zip",
    2022: "https://datos.jus.gob.ar/dataset/37c9ad39-f092-44be-9b7f-1201b3c4b7a8/resource/72ce3f59-564d-4cfc-8505-1058f1f940ea/download/dnrpa-inscripciones-iniciales-autos-2022.zip",
    2023: "https://datos.jus.gob.ar/dataset/37c9ad39-f092-44be-9b7f-1201b3c4b7a8/resource/8a233080-7de9-4796-bfce-75464c26a37d/download/dnrpa-inscripciones-iniciales-autos-2023.zip",
    2024: "https://datos.jus.gob.ar/dataset/37c9ad39-f092-44be-9b7f-1201b3c4b7a8/resource/0e0c2d72-e1e2-4579-888a-2d585de4a347/download/dnrpa-inscripciones-iniciales-autos-2024.zip",
    2025: "https://datos.jus.gob.ar/dataset/37c9ad39-f092-44be-9b7f-1201b3c4b7a8/resource/895a63ac-f180-4d2b-84c8-cd89fa18109d/download/dnrpa-inscripciones-iniciales-autos-2025.zip",
    2026: "https://datos.jus.gob.ar/dataset/37c9ad39-f092-44be-9b7f-1201b3c4b7a8/resource/f854085c-73e9-447f-b725-6226b81a1caf/download/dnrpa-inscripciones-iniciales-autos-2026.zip"
}

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


def process_year_df(df_year: pd.DataFrame, year: int) -> dict:
    """Procesa el dataframe de un año generando métricas para cada segmento."""
    df_year = df_year.copy()
    df_year['tramite_fecha'] = pd.to_datetime(df_year['tramite_fecha'], errors='coerce')
    df_year['mes'] = df_year['tramite_fecha'].dt.to_period('M').astype(str)
    
    marca_norm = df_year['automotor_marca_descripcion'].astype(str).str.strip().str.upper()
    df_year['marca_normalizada'] = marca_norm
    df_year['es_chino'] = marca_norm.isin(MARCAS_OBJETIVO)
    
    # Ponderación de titularidad
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


def main():
    years = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]
    
    full_output = {
        'available_years': years,
        'current_year': 2026,
        'available_segments': AVAILABLE_SEGMENTS,
        'macro_evolution': {},
        'years': {}
    }
    
    # 1. Cargar 2026 desde archivos locales
    print("-> Procesando Año 2026 desde archivos locales...")
    csv_2026 = sorted(glob.glob('data/dnrpa-inscripciones-iniciales-autos-2026*.csv'))
    df_2026 = pd.concat([pd.read_csv(f, low_memory=False) for f in csv_2026], ignore_index=True)
    full_output['years']['2026'] = process_year_df(df_2026, 2026)
    
    for seg in ['TOTAL', 'GENTE', 'SUVS_AUTOS', 'PICKUPS']:
        tot = full_output['years']['2026']['segmentos'][seg]['periodos']['ALL']['total_pat']
        chi = full_output['years']['2026']['segmentos'][seg]['periodos']['ALL']['chinos_pat']
        sh = full_output['years']['2026']['segmentos'][seg]['periodos']['ALL']['share_pct']
        print(f"   2026 [{seg}]: {tot:,} autos, {chi:,} chinos ({sh:.2f}% share)")
    del df_2026
    gc.collect()
    
    # 2. Descargar y procesar 2018 a 2025
    for y in [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]:
        print(f"\n-> Descargando y procesando Año {y}...")
        url = YEAR_ZIP_URLS[y]
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=35) as resp:
            zip_bytes = resp.read()
            
        print(f"   Descargado {y}.zip ({len(zip_bytes)/(1024*1024):.1f} MB). Extrayendo...")
        dfs = []
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            for name in sorted(zf.namelist()):
                if name.endswith('.csv'):
                    with zf.open(name) as f:
                        dfs.append(pd.read_csv(f, low_memory=False))
                        
        df_y = pd.concat(dfs, ignore_index=True)
        del zip_bytes, dfs
        gc.collect()
        
        full_output['years'][str(y)] = process_year_df(df_y, y)
        tot = full_output['years'][str(y)]['segmentos']['TOTAL']['periodos']['ALL']['total_pat']
        chi = full_output['years'][str(y)]['segmentos']['TOTAL']['periodos']['ALL']['chinos_pat']
        sh = full_output['years'][str(y)]['segmentos']['TOTAL']['periodos']['ALL']['share_pct']
        print(f"   {y} procesado: {tot:,} autos, {chi:,} chinos ({sh:.2f}% share)")
        del df_y
        gc.collect()
        
    # 3. Macro evolution por cada segmento
    for seg in ['TOTAL', 'GENTE', 'SUVS_AUTOS', 'PICKUPS']:
        full_output['macro_evolution'][seg] = []
        for y in years:
            p_all = full_output['years'][str(y)]['segmentos'][seg]['periodos']['ALL']
            full_output['macro_evolution'][seg].append({
                'year': y,
                'total': p_all['total_pat'],
                'chinos': p_all['chinos_pat'],
                'share': p_all['share_pct'],
                'lider': p_all['marca_lider']
            })
            
    out_file = 'data/dashboard_data.json'
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(full_output, f, ensure_ascii=False)
        
    print(f"\n[OK] Base historica consolidada con segmentacion generada con exito!")
    print(f"   Archivo guardado: {out_file} ({os.path.getsize(out_file)/(1024):.1f} KB)")


if __name__ == '__main__':
    main()
