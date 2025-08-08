@echo off
title Seal the Deal v2.0

echo ========================================
echo 🎯 Seal the Deal v2.0
echo ========================================
echo.
echo 🚀 Démarrage de l'application...
echo.

:: Vérifier que les dépendances sont installées
if not exist "node_modules\" (
    echo ❌ Dépendances manquantes !
    echo.
    echo 📦 Lancez d'abord install.bat pour installer les dépendances
    echo.
    pause
    exit /b 1
)

if not exist "client\node_modules\" (
    echo ❌ Dépendances client manquantes !
    echo.
    echo 📦 Lancez d'abord install.bat pour installer les dépendances
    echo.
    pause
    exit /b 1
)

echo ✅ Toutes les dépendances sont installées.
echo.

:: Démarrer le serveur API en arrière-plan
echo 🔧 Démarrage du serveur API (port 3001)...
start /b "ProspectBoard-Server" cmd /c "npm start"

:: Attendre que le serveur démarre
timeout /t 3 /nobreak >nul

:: Démarrer le client React (Vite) en arrière-plan
echo 🎨 Démarrage de l'interface (port 5173)...
cd client
start /b "ProspectBoard-Client" cmd /c "npm run dev"

:: Attendre que le client démarre
timeout /t 5 /nobreak >nul
cd ..

echo.
echo ========================================
echo ✅ Seal the Deal démarré avec succès !
echo ========================================
echo.
echo 📊 Serveur API : http://localhost:3001
echo 🌐 Interface : http://localhost:5173 (Vite dev server)
echo.
echo 🎯 L'application va s'ouvrir automatiquement dans votre navigateur
echo.

:: Attendre que les services démarrent complètement
timeout /t 3 /nobreak >nul

:: Ouvrir le navigateur sur le bon port
start http://localhost:5173

echo 💡 Laissez cette fenêtre ouverte pendant l'utilisation
echo    Fermez-la pour arrêter Seal the Deal
echo.
echo ⭐ Amusez-vous bien avec la prospection !
echo.

:: Attendre la fermeture
pause
