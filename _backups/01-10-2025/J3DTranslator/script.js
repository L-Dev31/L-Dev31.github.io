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
        console.log("Databases loaded");
    }).catch(error => console.error("Database error:", error));

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
        let sys = content.match(/System:\s*(.+)/i)?.[1].trim() || "Unknown System";
        let gpu = content.match(/GPU:\s*(.+)/i)?.[1].trim() || "Unknown GPU";
        let driver = content.match(/Driver:\s*(.+)/i)?.[1].trim() || "Unknown Driver";
        let version = content.match(/J3DView\s*v?(\d+\.\d+\.\d+)/i)?.[1].trim() || "Unknown Version";
        let glVendor = content.match(/OpenGL vendor:\s*(.+)/i)?.[1].trim() || "";
        let glRenderer = content.match(/OpenGL renderer:\s*(.+)/i)?.[1].trim() || "";
        let glVersion = content.match(/OpenGL version:\s*(.+)/i)?.[1].trim() || "";
        let glslVersion = content.match(/OpenGLSL version:\s*(.+)/i)?.[1].trim() || "";
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
        if (pythonErrors?.errors) {
            for (const error of pythonErrors.errors) {
                if (content.includes(error.message)) {
                    result.hasPythonError = true;
                    result.errorInfo = { ...error, type: 'python' };
                    return result;
                }
            }
        }
        if (textureErrors?.errors) {
            for (const error of textureErrors.errors) {
                if (content.includes(error.message)) {
                    result.hasTextureError = true;
                    result.errorInfo = { ...error, type: 'texture' };
                    return result;
                }
            }
        }
        if (modelErrors?.errors) {
            for (const error of modelErrors.errors) {
                if (content.includes(error.message)) {
                    result.hasModelError = true;
                    result.errorInfo = { ...error, type: 'model' };
                    return result;
                }
            }
        }
        if (openglErrors?.errors) {
            for (const error of openglErrors.errors) {
                if (content.includes(error.message)) {
                    result.hasOpenGLError = true;
                    result.errorInfo = { ...error, type: 'opengl' };
                    return result;
                }
            }
        }
        result.hasTextureError = /texture|texcoord|uv|material/i.test(content);
        result.hasModelError = /mesh|vertices|indices|polygon|geometry/i.test(content);
        result.hasOpenGLError = /opengl|shader|glsl|uniform|gl_error/i.test(content);
        result.hasPythonError = /importerror|attributeerror|typeerror|valueerror|keyerror/i.test(content);
        if (result.hasPythonError) {
            result.errorInfo = getDefaultError(pythonErrors, 'python');
        } else if (result.hasTextureError) {
            result.errorInfo = getDefaultError(textureErrors, 'texture');
        } else if (result.hasModelError) {
            result.errorInfo = getDefaultError(modelErrors, 'model');
        } else if (result.hasOpenGLError) {
            result.errorInfo = getDefaultError(openglErrors, 'opengl');
        }
        return result;
    }

    function getDefaultError(errorData, type) {
        const defaultError = errorData.errors?.find(e => e.id === `default_${type}_error`);
        return defaultError ? 
            { ...defaultError, type } : 
            {
                id: `default_${type}_error`,
                title: `${type.charAt(0).toUpperCase() + type.slice(1)} Error`,
                description: "An error occurred.",
                solutions: ["Check relevant files or configurations."],
                type
            };
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
        if (!solutions?.length) return "";
        return `<strong>Suggested Solutions:</strong><ul>${solutions.map(s => `<li>${s}</li>`).join('')}</ul>`;
    }

    function updateUserFriendlyExplanation(errorInfo) {
        document.getElementById("userTitle").textContent = errorInfo.title || "Model Display Issue";
        document.getElementById("userExplanation").textContent = errorInfo.description || "The model couldn't be displayed due to an unknown issue.";
        document.getElementById("userSolution").innerHTML = createSolutionsList(errorInfo.solutions);
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
        return matches ? matches.join('\n') : `No raw error information available for ${type}.`;
    }

    function createDetailedAnalysis(content, errorInfo) {
        let errorMessage = errorInfo.message || (content.match(/error:.*$/mi)?.[0].trim() || "No error message found");
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
            ${stackTrace ? `<div class="info-item"><span class="info-label">Call Stack:</span><span>Functions involved:</span>${stackTrace}</div>` : ''}
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