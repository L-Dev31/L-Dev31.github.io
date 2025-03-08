document.addEventListener('DOMContentLoaded', function() {
    const dropArea = document.getElementById('dropArea');
    const fileInput = document.getElementById('fileInput');
    const resultContainer = document.getElementById('resultContainer');
    const fileName = document.getElementById('fileName');
    const rawLog = document.getElementById('rawLog');
    const rawLogSection = document.getElementById('rawLogSection');
    const toggleRawBtn = document.getElementById('toggleRawBtn');
    const resetBtn = document.getElementById('resetBtn');
    const envInfo = document.getElementById('envInfo');
    const logDetails = document.getElementById('logDetails');

    const toggleUser = document.getElementById('toggleUser');
    const toggleTexture = document.getElementById('toggleTexture');
    const toggleModel = document.getElementById('toggleModel');
    const toggleOpenGL = document.getElementById('toggleOpenGL');
    const togglePython = document.getElementById('togglePython');

    const userSection = document.getElementById('userSection');
    const textureSection = document.getElementById('textureSection');
    const modelSection = document.getElementById('modelSection');
    const openglSection = document.getElementById('openglSection');
    const pythonSection = document.getElementById('pythonSection');

    let textureErrors = {}, modelErrors = {}, openglErrors = {}, pythonErrors = {};

    Promise.all([
        fetch('texture.json').then(r => r.json()),
        fetch('model.json').then(r => r.json()),
        fetch('opengl.json').then(r => r.json()),
        fetch('python.json').then(r => r.json())
    ]).then(([textureData, modelData, openglData, pythonData]) => {
        textureErrors = textureData;
        modelErrors = modelData;
        openglErrors = openglData;
        pythonErrors = pythonData;
        console.log("DB chargées");
    }).catch(error => console.error("Erreur DB:", error));

    toggleUser.addEventListener('change', function() { userSection.classList.toggle('visible', this.checked); });
    toggleTexture.addEventListener('change', function() { textureSection.classList.toggle('visible', this.checked); });
    toggleModel.addEventListener('change', function() { modelSection.classList.toggle('visible', this.checked); });
    toggleOpenGL.addEventListener('change', function() { openglSection.classList.toggle('visible', this.checked); });
    togglePython.addEventListener('change', function() { pythonSection.classList.toggle('visible', this.checked); });

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => dropArea.addEventListener(ev, preventDefaults, false));
    function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }
    ['dragenter', 'dragover'].forEach(ev => dropArea.addEventListener(ev, () => dropArea.classList.add('dragover'), false));
    ['dragleave', 'drop'].forEach(ev => dropArea.addEventListener(ev, () => dropArea.classList.remove('dragover'), false));

    dropArea.addEventListener('drop', handleDrop, false);
    function handleDrop(e) {
        const files = e.dataTransfer.files;
        handleFiles(files);
    }
    dropArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', function() { handleFiles(this.files); });
    function handleFiles(files) {
        if (files.length) {
            const file = files[0];
            fileName.textContent = file.name;
            const reader = new FileReader();
            reader.onload = function(e) {
                const content = e.target.result;
                analyzeLog(content);
                rawLog.textContent = content;
                resultContainer.style.display = 'block';
                dropArea.style.display = 'none';
            };
            reader.readAsText(file);
        }
    }

    toggleRawBtn.addEventListener('click', function() {
        if (rawLogSection.style.display === 'none') {
            rawLogSection.style.display = 'block';
            this.innerHTML = '<span class="icon">⚙️</span>Hide Raw Log';
        } else {
            rawLogSection.style.display = 'none';
            this.innerHTML = '<span class="icon">⚙️</span>Show Raw Log';
        }
    });

    resetBtn.addEventListener('click', function() {
        resultContainer.style.display = 'none';
        dropArea.style.display = 'flex';
        fileInput.value = '';
        rawLogSection.style.display = 'none';
        toggleRawBtn.innerHTML = '<span class="icon">⚙️</span>Show Raw Log';
        toggleUser.checked = true;
        toggleTexture.checked = false;
        toggleModel.checked = false;
        toggleOpenGL.checked = false;
        togglePython.checked = false;
        userSection.classList.add('visible');
        textureSection.classList.remove('visible');
        modelSection.classList.remove('visible');
        openglSection.classList.remove('visible');
        pythonSection.classList.remove('visible');
    });

    function extractEnvironmentInfo(content) {
        // Infos classiques
        let sys = content.match(/System:\s*(.+)/i)?.[1].trim() || "Unknown System";
        let gpu = content.match(/GPU:\s*(.+)/i)?.[1].trim() || "Unknown GPU";
        let driver = content.match(/Driver:\s*(.+)/i)?.[1].trim() || "Unknown Driver";
        let version = content.match(/J3DView\s*v?(\d+\.\d+\.\d+)/i)?.[1].trim() || "Unknown Version";
        // Infos OpenGL (viewer_widget)
        let glVendor = content.match(/OpenGL vendor:\s*(.+)/i)?.[1].trim() || "";
        let glRenderer = content.match(/OpenGL renderer:\s*(.+)/i)?.[1].trim() || "";
        let glVersion = content.match(/OpenGL version:\s*(.+)/i)?.[1].trim() || "";
        let glslVersion = content.match(/OpenGLSL version:\s*(.+)/i)?.[1].trim() || "";
        // Autres infos
        let py = content.match(/Python version:\s*(.+)/i)?.[1].trim() || "";
        let np = content.match(/NumPy version:\s*(.+)/i)?.[1].trim() || "";
        let qt = content.match(/Qt version:\s*(.+)/i)?.[1].trim() || "";
        let pyqt = content.match(/PyQt version:\s*(.+)/i)?.[1].trim() || "";
        let ogl = content.match(/PyOpenGL version:\s*(.+)/i)?.[1].trim() || "";

        let envHtml = ``;
        if (glRenderer) envHtml += `<div class="info-item"><span class="info-label">Graphics Card:</span><span>${glRenderer}</span></div>`;
        if (glVendor) envHtml += `<div class="info-item"><span class="info-label">GL Vendor:</span><span>${glVendor}</span></div>`;
        if (glVersion) envHtml += `<div class="info-item"><span class="info-label">GL Version:</span><span>${glVersion}</span></div>`;
        if (glslVersion) envHtml += `<div class="info-item"><span class="info-label">GLSL Version:</span><span>${glslVersion}</span></div>`;
        if (py) envHtml += `<div class="info-item"><span class="info-label">Python Version:</span><span>${py}</span></div>`;
        if (np) envHtml += `<div class="info-item"><span class="info-label">NumPy Version:</span><span>${np}</span></div>`;
        if (qt) envHtml += `<div class="info-item"><span class="info-label">Qt Version:</span><span>${qt}</span></div>`;
        if (pyqt) envHtml += `<div class="info-item"><span class="info-label">PyQt Version:</span><span>${pyqt}</span></div>`;
        if (ogl) envHtml += `<div class="info-item"><span class="info-label">PyOpenGL Version:</span><span>${ogl}</span></div>`;
        return envHtml;
    }

    function categorizeErrors(content) {
        const result = {
            hasTextureError: false,
            hasModelError: false,
            hasOpenGLError: false,
            hasPythonError: false,
            errorInfo: { id: null, title: null, message: null, description: null, solutions: [], frequency: null, type: null }
        };
        if (pythonErrors && pythonErrors.errors) {
            for (const error of pythonErrors.errors) {
                if (content.includes(error.message)) {
                    result.hasPythonError = true;
                    result.errorInfo = { ...error, type: 'python' };
                    break;
                }
            }
        }
        if (!result.errorInfo.id && textureErrors && textureErrors.errors) {
            for (const error of textureErrors.errors) {
                if (content.includes(error.message)) {
                    result.hasTextureError = true;
                    result.errorInfo = { ...error, type: 'texture' };
                    break;
                }
            }
        }
        if (!result.errorInfo.id && modelErrors && modelErrors.errors) {
            for (const error of modelErrors.errors) {
                if (content.includes(error.message)) {
                    result.hasModelError = true;
                    result.errorInfo = { ...error, type: 'model' };
                    break;
                }
            }
        }
        if (!result.errorInfo.id && openglErrors && openglErrors.errors) {
            for (const error of openglErrors.errors) {
                if (content.includes(error.message)) {
                    result.hasOpenGLError = true;
                    result.errorInfo = { ...error, type: 'opengl' };
                    break;
                }
            }
        }
        if (!result.errorInfo.id) {
            result.hasTextureError = /texture|texcoord|uv|material/i.test(content);
            result.hasModelError = /mesh|vertices|indices|polygon|geometry/i.test(content);
            result.hasOpenGLError = /opengl|shader|glsl|uniform|gl_error/i.test(content);
            result.hasPythonError = /importerror|attributeerror|typeerror|valueerror|keyerror/i.test(content);
        }
        return result;
    }

    function updateErrorSections(content, errorInfo) {
        if (errorInfo.type === 'texture') {
            document.getElementById("errorTextureTitle").textContent = errorInfo.title;
            document.getElementById("errorTextureExplanation").textContent = errorInfo.description;
            document.getElementById("errorTextureSolution").innerHTML = createSolutionsList(errorInfo.solutions);
        }
        if (errorInfo.type === 'model') {
            document.getElementById("errorModelTitle").textContent = errorInfo.title;
            document.getElementById("errorModelExplanation").textContent = errorInfo.description;
            document.getElementById("errorModelSolution").innerHTML = createSolutionsList(errorInfo.solutions);
        }
        if (errorInfo.type === 'opengl') {
            document.getElementById("errorOpenGLTitle").textContent = errorInfo.title;
            document.getElementById("errorOpenGLExplanation").textContent = errorInfo.description;
            document.getElementById("errorOpenGLSolution").innerHTML = createSolutionsList(errorInfo.solutions);
        }
        if (errorInfo.type === 'python') {
            document.getElementById("errorPythonTitle").textContent = errorInfo.title;
            document.getElementById("errorPythonExplanation").textContent = errorInfo.description;
            document.getElementById("errorPythonSolution").innerHTML = createSolutionsList(errorInfo.solutions);
        }
        updateUserFriendlyExplanation(errorInfo);
    }

    function createSolutionsList(solutions) {
        if (!solutions || !Array.isArray(solutions) || solutions.length === 0)
            return "<strong>Aucune solution spécifique.</strong>";
        return `<strong>Solutions techniques:</strong><ul>${solutions.map(s => `<li>${s}</li>`).join('')}</ul>`;
    }

    function updateUserFriendlyExplanation(errorInfo) {
        let title = "Model Cannot Be Displayed";
        let explanation = "J3DView n'a pu afficher votre modèle à cause d'un problème non identifié.";
        let solutions = [
            "Vérifiez que votre modèle est au bon format pour SMG (J3D/BMD/BDL)",
            "Essayez un autre modèle pour vérifier le bon fonctionnement de J3DView"
        ];
        if (errorInfo && errorInfo.id) {
            title = errorInfo.title || title;
            explanation = errorInfo.description || explanation;
            solutions = errorInfo.solutions || solutions;
        } else {
            if (errorInfo.type === 'texture') {
                title = "Problème de texture";
                explanation = "Problème de mappage des textures.";
                solutions = ["Vérifiez les fichiers de texture", "Ouvrez le modèle dans BrawlBox", "Revoyez les réglages de texture"];
            } else if (errorInfo.type === 'model') {
                title = "Problème de structure du modèle";
                explanation = "Le modèle semble endommagé ou mal exporté.";
                solutions = ["Vérifiez les paramètres d'export", "Testez avec un autre outil", "Assurez-vous que le modèle n'est pas corrompu"];
            } else if (errorInfo.type === 'opengl') {
                title = "Problème de rendu graphique";
                explanation = "Erreur lors du rendu via OpenGL.";
                solutions = ["Mettez à jour vos drivers", "Fermez les applis graphiques", "Vérifiez la compatibilité GPU"];
            } else if (errorInfo.type === 'python') {
                title = "Erreur d'exécution Python";
                explanation = "Erreur dans l'environnement Python.";
                solutions = ["Vérifiez les modules requis", "Utilisez Python 3.7+", "Réinstallez J3DView"];
            }
        }
        document.getElementById("userTitle").textContent = title;
        document.getElementById("userExplanation").textContent = explanation;
        document.getElementById("userSolution").innerHTML = `<strong>Essayez ces solutions:</strong><ul>${solutions.map(s => `<li>${s}</li>`).join('')}</ul>`;
    }

    function extractRawErrorSection(content, type) {
        let regex;
        if (type === 'texture') {
            regex = /.*(texture|texcoord|uv).*/gi;
        } else if (type === 'model') {
            regex = /.*(mesh|vertex|indices|polygon|geometry).*/gi;
        } else if (type === 'opengl') {
            regex = /.*(opengl|shader|glsl|uniform|gl_error).*/gi;
        } else if (type === 'python') {
            regex = /.*(Traceback|Error:|Exception:|ImportError|AttributeError|TypeError|ValueError|KeyError).*/gi;
        } else {
            return "";
        }
        const matches = content.match(regex);
        return matches ? matches.join('\n') : `Aucune info brute pour ${type}.`;
    }

    function createDetailedAnalysis(content, errorInfo) {
        let errorMessage = errorInfo.message || (content.match(/error:.*$/mi)?.[0].trim() || "Aucun message d'erreur trouvé");
        let stackTrace = "";
        const stackMatch = content.match(/at\s+[\w\.$]+\s*\([\w\/\.:]+\)/gmi);
        if (stackMatch) stackTrace = `<div class="stack-trace">${stackMatch.join('<br>')}</div>`;
        let frequencyInfo = "";
        if (errorInfo.frequency) {
            let freqClass = errorInfo.frequency === "high" ? "freq-high" : errorInfo.frequency === "low" ? "freq-low" : "freq-medium";
            frequencyInfo = `<div class="info-item"><span class="info-label">Frequency:</span><span class="${freqClass}">${errorInfo.frequency.toUpperCase()}</span><span class="freq-info">Occurence</span></div>`;
        }
        return `
            <div class="info-item"><span class="info-label">Error Type:</span><span>${errorInfo.type ? errorInfo.type.toUpperCase() + " ERROR" : "Unknown Error Type"}</span></div>
            <div class="info-item"><span class="info-label">Error Message:</span><span>${errorMessage}</span></div>
            ${frequencyInfo}
            <div class="info-item"><span class="info-label">Error ID:</span><span>${errorInfo.id || "unidentified_error"}</span></div>
            ${stackTrace ? `<div class="info-item"><span class="info-label">Call Stack:</span><span>Fonctions impliquées:</span>${stackTrace}</div>` : ''}
        `;
    }

    function analyzeLog(content) {
        envInfo.innerHTML = extractEnvironmentInfo(content);
        const { hasTextureError, hasModelError, hasOpenGLError, hasPythonError, errorInfo } = categorizeErrors(content);
        toggleTexture.checked = hasTextureError;
        textureSection.classList.toggle('visible', hasTextureError);
        toggleModel.checked = hasModelError;
        modelSection.classList.toggle('visible', hasModelError);
        toggleOpenGL.checked = hasOpenGLError;
        openglSection.classList.toggle('visible', hasOpenGLError);
        togglePython.checked = hasPythonError;
        pythonSection.classList.toggle('visible', hasPythonError);
        updateErrorSections(content, errorInfo);
        logDetails.innerHTML = createDetailedAnalysis(content, errorInfo);
        if (hasTextureError) document.getElementById('rawTextureError').textContent = extractRawErrorSection(content, 'texture');
        if (hasModelError) document.getElementById('rawModelError').textContent = extractRawErrorSection(content, 'model');
        if (hasOpenGLError) document.getElementById('rawOpenGLError').textContent = extractRawErrorSection(content, 'opengl');
        if (hasPythonError) document.getElementById('rawPythonError').textContent = extractRawErrorSection(content, 'python');
    }
});
