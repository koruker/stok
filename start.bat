@echo off
title StokPro - Yerel Sunucu
echo.
echo  ╔══════════════════════════════════════╗
echo  ║   StokPro - Yerel Sunucu Baslatiliyor ║
echo  ╚══════════════════════════════════════╝
echo.
echo  Sunucu: http://localhost:8080
echo  Durdurmak icin: Ctrl+C
echo.

:: Python 3 var mı kontrol et
python --version >nul 2>&1
if %errorlevel% == 0 (
    echo  Python bulundu. Sunucu baslatiliyor...
    echo.
    start "" "http://localhost:8080"
    python -m http.server 8080
) else (
    :: Python 3 komutunu dene
    python3 --version >nul 2>&1
    if %errorlevel% == 0 (
        echo  Python3 bulundu. Sunucu baslatiliyor...
        echo.
        start "" "http://localhost:8080"
        python3 -m http.server 8080
    ) else (
        echo  HATA: Python bulunamadi!
        echo.
        echo  Lutfen Python yukleyin: https://www.python.org/downloads/
        echo.
        pause
    )
)
