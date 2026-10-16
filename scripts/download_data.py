"""
Pipeline de Descarga y Carga Automática de Datos Oficiales de DNRPA (datos.gob.ar).
Permite sincronizar, descargar y procesar las inscripciones iniciales de automotores
desde 2018 hasta el presente directamente desde los servidores públicos de datos abiertos.
"""

import os
import re
import sys
import glob
import json
import zipfile
import argparse
import urllib.request
from typing import List, Dict, Optional
import pandas as pd

# Endpoint de la API CKAN oficial del portal de Datos Abiertos de la República Argentina
CKAN_PACKAGE_URL = "https://datos.gob.ar/api/3/action/package_show?id=inscripciones-iniciales-de-autos"

# URLs directas de respaldo (fallback) por si la API CKAN experimenta interrupciones temporales
FALLBACK_RESOURCES = {
    2026: "https://datos.jus.gob.ar/dataset/37c9ad39-f092-44be-9b7f-1201b3c4b7a8/resource/f854085c-73e9-447f-b725-6226b81a1caf/download/dnrpa-inscripciones-iniciales-autos-2026.zip",
    2025: "https://datos.jus.gob.ar/dataset/37c9ad39-f092-44be-9b7f-1201b3c4b7a8/resource/895a63ac-f180-4d2b-84c8-cd89fa18109d/download/dnrpa-inscripciones-iniciales-autos-2025.zip",
    2024: "https://datos.jus.gob.ar/dataset/37c9ad39-f092-44be-9b7f-1201b3c4b7a8/resource/0e0c2d72-e1e2-4579-888a-2d585de4a347/download/dnrpa-inscripciones-iniciales-autos-2024.zip",
    2023: "https://datos.jus.gob.ar/dataset/37c9ad39-f092-44be-9b7f-1201b3c4b7a8/resource/8a233080-7de9-4796-bfce-75464c26a37d/download/dnrpa-inscripciones-iniciales-autos-2023.zip",
    2022: "https://datos.jus.gob.ar/dataset/37c9ad39-f092-44be-9b7f-1201b3c4b7a8/resource/72ce3f59-564d-4cfc-8505-1058f1f940ea/download/dnrpa-inscripciones-iniciales-autos-2022.zip",
    2021: "https://datos.jus.gob.ar/dataset/37c9ad39-f092-44be-9b7f-1201b3c4b7a8/resource/8c2cd9f4-70e1-45b4-9638-bec3c6ac9cc7/download/dnrpa-inscripciones-iniciales-autos-2021.zip",
    2020: "https://datos.jus.gob.ar/dataset/37c9ad39-f092-44be-9b7f-1201b3c4b7a8/resource/ce8ae2db-bf61-48f7-a766-6c99ae967234/download/dnrpa-inscripciones-iniciales-autos-2020.zip",
    2019: "https://datos.jus.gob.ar/dataset/37c9ad39-f092-44be-9b7f-1201b3c4b7a8/resource/4a434f6a-8d2c-492b-93ea-d045f3d9961a/download/dnrpa-inscripciones-iniciales-autos-2019.zip",
    2018: "https://datos.jus.gob.ar/dataset/37c9ad39-f092-44be-9b7f-1201b3c4b7a8/resource/0648ef53-b00c-4446-8e73-cd24e8bad2a7/download/dnrpa-inscripciones-iniciales-autos-2018.zip",
}


def obtener_catalogo_recursos() -> Dict[int, str]:
    """
    Consulta en tiempo real la API de datos.gob.ar para obtener los enlaces de descarga
    actualizados de cada año (formato .zip con los 12 meses correspondientes).
    """
    try:
        req = urllib.request.Request(CKAN_PACKAGE_URL, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            if data.get('success'):
                catalog = {}
                for r in data['result'].get('resources', []):
                    url = r.get('url', '')
                    name = r.get('name', '')
                    # Filtrar por paquetes anuales en formato ZIP
                    match_year = re.search(r'20\d{2}', name)
                    if match_year and url.endswith('.zip'):
                        year = int(match_year.group(0))
                        catalog[year] = url
                if catalog:
                    return catalog
    except Exception as e:
        print(f"[!] Nota: No se pudo conectar a la API CKAN ({e}). Usando catálogo estático de respaldo.")
    
    return FALLBACK_RESOURCES.copy()


def descargar_anio(year: int, dest_dir: str = "data", force: bool = False) -> List[str]:
    """
    Descarga el archivo ZIP anual correspondiente, lo extrae en `dest_dir`
    y elimina el archivo temporal comprimido.
    """
    os.makedirs(dest_dir, exist_ok=True)
    
    # Verificar si ya existen archivos CSV para este año
    existing_csvs = sorted(glob.glob(os.path.join(dest_dir, f"dnrpa-inscripciones-iniciales-autos-{year}*.csv")))
    if existing_csvs and not force:
        print(f"-> [OK] Año {year}: Ya existen {len(existing_csvs)} archivos mensuales en '{dest_dir}'. Saltando descarga (usar --force para sobreescribir).")
        return existing_csvs
    
    catalog = obtener_catalogo_recursos()
    if year not in catalog:
        raise ValueError(f"El año {year} no está disponible en el catálogo de datos.gob.ar. Años válidos: {sorted(catalog.keys())}")
    
    zip_url = catalog[year]
    zip_dest = os.path.join(dest_dir, f"temp_{year}.zip")
    
    print(f"-> Descargando inscripciones del año {year} desde:")
    print(f"   {zip_url}")
    
    req = urllib.request.Request(zip_url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as response, open(zip_dest, 'wb') as out_file:
        total_length = response.headers.get('content-length')
        if total_length:
            total_length = int(total_length)
            downloaded = 0
            block_size = 1024 * 512
            while True:
                buffer = response.read(block_size)
                if not buffer:
                    break
                downloaded += len(buffer)
                out_file.write(buffer)
                pct = (downloaded / total_length) * 100
                sys.stdout.write(f"\r   Progreso: {pct:.1f}% ({downloaded / (1024*1024):.1f} MB de {total_length / (1024*1024):.1f} MB)")
                sys.stdout.flush()
            print()
        else:
            out_file.write(response.read())
            print(f"   Descarga completada ({os.path.getsize(zip_dest)/(1024*1024):.1f} MB).")
            
    # Extraer CSVs
    print(f"-> Descomprimiendo archivos en '{dest_dir}'...")
    extracted_files = []
    with zipfile.ZipFile(zip_dest, 'r') as zf:
        for file_info in zf.infolist():
            if file_info.filename.endswith('.csv'):
                # Extraer en dest_dir
                filename = os.path.basename(file_info.filename)
                target_path = os.path.join(dest_dir, filename)
                with zf.open(file_info) as source, open(target_path, 'wb') as target:
                    target.write(source.read())
                extracted_files.append(target_path)
                print(f"   + Extraído: {filename} ({file_info.file_size / (1024*1024):.1f} MB)")
                
    # Eliminar ZIP temporal
    if os.path.exists(zip_dest):
        os.remove(zip_dest)
        
    print(f"-> [Éxito] Año {year} listo: {len(extracted_files)} archivos CSV generados.\n")
    return sorted(extracted_files)


def sincronizar_datos(years: Optional[List[int]] = None, dest_dir: str = "data", force: bool = False) -> List[str]:
    """
    Sincroniza los años solicitados (por defecto 2026).
    """
    if years is None:
        years = [2026]
        
    all_files = []
    for y in sorted(years):
        files = descargar_anio(y, dest_dir=dest_dir, force=force)
        all_files.extend(files)
        
    return all_files


def cargar_dataframe_dnrpa(years: Optional[List[int]] = None, dest_dir: str = "data", auto_download: bool = True) -> pd.DataFrame:
    """
    Función de utilidad pensada para usar directamente en Jupyter Notebooks.
    Carga los CSVs locales de los años indicados. Si no existen y auto_download=True,
    los descarga automáticamente desde datos.gob.ar.
    """
    if years is None:
        years = [2026]
        
    # Verificar qué archivos existen
    target_files = []
    for y in years:
        found = sorted(glob.glob(os.path.join(dest_dir, f"dnrpa-inscripciones-iniciales-autos-{y}*.csv")))
        if not found and auto_download:
            print(f"[Aviso] No se encontraron archivos para {y} en '{dest_dir}'. Descargando automáticamente...")
            found = descargar_anio(y, dest_dir=dest_dir)
        target_files.extend(found)
        
    if not target_files:
        raise FileNotFoundError(f"No se encontraron archivos CSV para los años {years} en '{dest_dir}'.")
        
    print(f"Cargando {len(target_files)} archivos CSV en memoria...")
    df_list = [pd.read_csv(f, low_memory=False) for f in target_files]
    df = pd.concat(df_list, ignore_index=True)
    print(f"Total de registros cargados: {len(df):,}")
    return df


def main():
    parser = argparse.ArgumentParser(
        description="Pipeline oficial para descargar microdatos de patentamientos 0km de DNRPA (datos.gob.ar)."
    )
    parser.add_argument(
        "--years", "-y",
        nargs="+",
        type=int,
        default=[2026],
        help="Años a descargar (ej: --years 2024 2025 2026). Por defecto: 2026."
    )
    parser.add_argument(
        "--all", "-a",
        action="store_true",
        help="Descargar toda la serie histórica completa (2018 a 2026)."
    )
    parser.add_argument(
        "--dest", "-d",
        type=str,
        default="data",
        help="Directorio de destino donde se guardarán los archivos CSV (por defecto: data/)."
    )
    parser.add_argument(
        "--force", "-f",
        action="store_true",
        help="Forzar la descarga incluso si los archivos ya existen localmente."
    )
    parser.add_argument(
        "--list", "-l",
        action="store_true",
        help="Listar los años y recursos disponibles en datos.gob.ar y salir."
    )
    
    args = parser.parse_args()
    
    catalog = obtener_catalogo_recursos()
    
    if args.list:
        print("\n=== CATÁLOGO OFICIAL DE INSCRIPCIONES INICIALES (datos.gob.ar) ===")
        for y in sorted(catalog.keys()):
            existing = glob.glob(os.path.join(args.dest, f"dnrpa-inscripciones-iniciales-autos-{y}*.csv"))
            estado = f"Descargado ({len(existing)} archivos)" if existing else "Disponible online"
            print(f"• Año {y}: {estado}")
            print(f"  URL: {catalog[y]}")
        print()
        return
        
    if args.all:
        years_to_sync = sorted(catalog.keys())
    else:
        years_to_sync = args.years
        
    print("\n" + "="*60)
    print("PIPELINE DE DESCARGA: INSCRIPCIONES INICIALES DE AUTOS (DNRPA)")
    print("="*60)
    print(f"Años seleccionados: {years_to_sync}")
    print(f"Directorio destino: {os.path.abspath(args.dest)}")
    print("="*60 + "\n")
    
    sincronizar_datos(years_to_sync, dest_dir=args.dest, force=args.force)
    print("¡Sincronización finalizada exitosamente!")


if __name__ == "__main__":
    main()
