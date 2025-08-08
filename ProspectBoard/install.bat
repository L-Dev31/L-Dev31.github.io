@echo off
echo ========================================
echo 🎯 ProspectBoard Personal Edition v2.0
echo ========================================
echo.

:: Vérifier si Node.js est installé
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js n'est pas installé !
    echo.
    echo 📥 Téléchargez Node.js depuis : https://nodejs.org/
    echo    Choisissez la version LTS ^(Long Term Support^)
    echo.
    pause
    exit /b 1
)

echo ✅ Node.js détecté
node --version

:: Vérifier si npm est disponible
npm --version >nul 2>&1
if errorlevel 1 (
    echo ❌ npm n'est pas disponible !
    echo    Réinstallez Node.js depuis https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ npm détecté
npm --version
echo.

echo 📦 Installation des dépendances...
echo.

:: Installation des dépendances du serveur
echo 🔧 Installation côté serveur...
call npm install
if errorlevel 1 (
    echo ❌ Erreur lors de l'installation côté serveur
    pause
    exit /b 1
)

:: Installation des dépendances du client
echo 🎨 Installation côté client...
cd client
call npm install
if errorlevel 1 (
    echo ❌ Erreur lors de l'installation côté client
    pause
    exit /b 1
)

:: Installation de @heroicons/react
echo 🎯 Installation des icônes Heroicons...
call npm install @heroicons/react
if errorlevel 1 (
    echo ⚠️ Attention : Erreur lors de l'installation d'Heroicons
    echo    L'application fonctionnera mais les icônes pourraient manquer
)

cd ..

echo.
echo ========================================
echo ✅ Installation terminée avec succès !
echo ========================================
echo.
echo 🚀 Pour lancer ProspectBoard :
echo.
echo    1. Ouvrir un terminal dans ce dossier
echo    2. Taper : npm run dev
echo    3. Ouvrir http://localhost:5173 dans votre navigateur
echo.
echo 📊 Serveur API : http://localhost:3001
echo 🌐 Interface : http://localhost:5173
echo.
echo 💡 Conseil : Gardez ce terminal ouvert pendant l'utilisation
echo.
pause
