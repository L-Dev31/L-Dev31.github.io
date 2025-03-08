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
    
    // Switches
    const toggleUser = document.getElementById('toggleUser');
    const toggleTexture = document.getElementById('toggleTexture');
    const toggleModel = document.getElementById('toggleModel');
    const toggleOpenGL = document.getElementById('toggleOpenGL');
    const togglePython = document.getElementById('togglePython');
    
    // Errors
    const userSection = document.getElementById('userSection');
    const textureSection = document.getElementById('textureSection');
    const modelSection = document.getElementById('modelSection');
    const openglSection = document.getElementById('openglSection');
    const pythonSection = document.getElementById('pythonSection');
    
    // Error data objects
    let textureErrors = {};
    let modelErrors = {};
    let openglErrors = {};
    let pythonErrors = {};
    
    // Load Error DB JSONs
    Promise.all([
        fetch('texture.json').then(response => response.json()),
        fetch('model.json').then(response => response.json()),
        fetch('opengl.json').then(response => response.json()),
        fetch('python.json').then(response => response.json())
    ]).then(([textureData, modelData, openglData, pythonData]) => {
        textureErrors = textureData;
        modelErrors = modelData;
        openglErrors = openglData;
        pythonErrors = pythonData;
        console.log("Error databases loaded successfully");
    }).catch(error => {
        console.error("Error loading error databases:", error);
    });
    
    // Handle switches
    toggleUser.addEventListener('change', function() {
        userSection.classList.toggle('visible', this.checked);
    });
    
    toggleTexture.addEventListener('change', function() {
        textureSection.classList.toggle('visible', this.checked);
    });
    
    toggleModel.addEventListener('change', function() {
        modelSection.classList.toggle('visible', this.checked);
    });
    
    toggleOpenGL.addEventListener('change', function() {
        openglSection.classList.toggle('visible', this.checked);
    });
    
    togglePython.addEventListener('change', function() {
        pythonSection.classList.toggle('visible', this.checked);
    });
    
    // Drag and drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });
    
    function highlight() {
        dropArea.classList.add('dragover');
    }
    
    function unhighlight() {
        dropArea.classList.remove('dragover');
    }
    
    // File drop
    dropArea.addEventListener('drop', handleDrop, false);
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }
    
    // Click to select file
    dropArea.addEventListener('click', () => {
        fileInput.click();
    });
    
    fileInput.addEventListener('change', function() {
        handleFiles(this.files);
    });
    
    // Process files
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
    
    // Raw log view
    toggleRawBtn.addEventListener('click', function() {
        if (rawLogSection.style.display === 'none') {
            rawLogSection.style.display = 'block';
            this.innerHTML = '<span class="icon">⚙️</span>Hide Raw Log';
        } else {
            rawLogSection.style.display = 'none';
            this.innerHTML = '<span class="icon">⚙️</span>Show Raw Log';
        }
    });
    
    // Reset button
    resetBtn.addEventListener('click', function() {
        resultContainer.style.display = 'none';
        dropArea.style.display = 'flex';
        fileInput.value = '';
        rawLogSection.style.display = 'none';
        toggleRawBtn.innerHTML = '<span class="icon">⚙️</span>Show Raw Log';
        
        // Reset switches
        toggleUser.checked = true;
        toggleTexture.checked = false;
        toggleModel.checked = false;
        toggleOpenGL.checked = false;
        togglePython.checked = false;
        
        // Reset visibility
        userSection.classList.add('visible');
        textureSection.classList.remove('visible');
        modelSection.classList.remove('visible');
        openglSection.classList.remove('visible');
        pythonSection.classList.remove('visible');
    });
    
    function analyzeLog(content) {
        const envInfoHTML = extractEnvironmentInfo(content);
        envInfo.innerHTML = envInfoHTML;
        
        // Analyze error types
        const { hasTextureError, hasModelError, hasOpenGLError, hasPythonError, errorInfo } = categorizeErrors(content);
        
        // Update toggle states based on detected errors
        toggleTexture.checked = hasTextureError;
        textureSection.classList.toggle('visible', hasTextureError);
        
        toggleModel.checked = hasModelError;
        modelSection.classList.toggle('visible', hasModelError);
        
        toggleOpenGL.checked = hasOpenGLError;
        openglSection.classList.toggle('visible', hasOpenGLError);
        
        togglePython.checked = hasPythonError;
        pythonSection.classList.toggle('visible', hasPythonError);
        
        // Update error details sections
        updateErrorSections(content, errorInfo);
        
        // Create detailed log analysis
        const detailedAnalysis = createDetailedAnalysis(content, errorInfo);
        logDetails.innerHTML = detailedAnalysis;
    }

    function extractEnvironmentInfo(content) {
        let systemInfo = 'Unknown System';
        let gpuInfo = 'Unknown GPU';
        let driverInfo = 'Unknown Driver';
        let j3dviewVersion = 'Unknown Version';
        
        // Extract system information
        const sysMatch = content.match(/System:\s*(.+)/i);
        if (sysMatch) systemInfo = sysMatch[1].trim();
        
        // Extract GPU information
        const gpuMatch = content.match(/GPU:\s*(.+)/i);
        if (gpuMatch) gpuInfo = gpuMatch[1].trim();
        
        // Extract driver information
        const driverMatch = content.match(/Driver:\s*(.+)/i);
        if (driverMatch) driverInfo = driverMatch[1].trim();
        
        // Extract J3DView version
        const versionMatch = content.match(/J3DView\s*v?(\d+\.\d+\.\d+)/i);
        if (versionMatch) j3dviewVersion = versionMatch[1].trim();
        
        return `
            <div class="info-item">
                <span class="info-label">System:</span>
                <span>${systemInfo}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Graphics Card:</span>
                <span>${gpuInfo}</span>
            </div>
            <div class="info-item">
                <span class="info-label">GPU Driver:</span>
                <span>${driverInfo}</span>
            </div>
            <div class="info-item">
                <span class="info-label">J3DView Version:</span>
                <span>${j3dviewVersion}</span>
            </div>
        `;
    }

    function categorizeErrors(content) {
        // Initialize result object
        const result = {
            hasTextureError: false,
            hasModelError: false,
            hasOpenGLError: false,
            hasPythonError: false,
            errorInfo: {
                id: null,
                title: null,
                message: null,
                description: null,
                solutions: [],
                frequency: null,
                type: null
            }
        };
        
        // Check for Python errors
        if (pythonErrors && pythonErrors.errors) {
            for (const error of pythonErrors.errors) {
                if (content.includes(error.message)) {
                    result.hasPythonError = true;
                    result.errorInfo = { ...error, type: 'python' };
                    break;
                }
            }
        }
        
        // Check for texture errors if no Python error was found
        if (!result.errorInfo.id && textureErrors && textureErrors.errors) {
            for (const error of textureErrors.errors) {
                if (content.includes(error.message)) {
                    result.hasTextureError = true;
                    result.errorInfo = { ...error, type: 'texture' };
                    break;
                }
            }
        }
        
        // Check for model errors if no error was found yet
        if (!result.errorInfo.id && modelErrors && modelErrors.errors) {
            for (const error of modelErrors.errors) {
                if (content.includes(error.message)) {
                    result.hasModelError = true;
                    result.errorInfo = { ...error, type: 'model' };
                    break;
                }
            }
        }
        
        // Check for OpenGL errors if no error was found yet
        if (!result.errorInfo.id && openglErrors && openglErrors.errors) {
            for (const error of openglErrors.errors) {
                if (content.includes(error.message)) {
                    result.hasOpenGLError = true;
                    result.errorInfo = { ...error, type: 'opengl' };
                    break;
                }
            }
        }
        
        // If no specific error was identified, do a more generic check
        if (!result.errorInfo.id) {
            // Generic checks for each type of error
            result.hasTextureError = /texture|texcoord|uv|material/i.test(content);
            result.hasModelError = /mesh|vertices|indices|polygon|geometry/i.test(content);
            result.hasOpenGLError = /opengl|shader|glsl|uniform|gl_error/i.test(content);
            result.hasPythonError = /importerror|attributeerror|typeerror|valueerror|keyerror/i.test(content);
        }
        
        return result;
    }

    function updateErrorSections(content, errorInfo) {
        // Update texture error section
        if (errorInfo.type === 'texture') {
            document.getElementById("errorTextureTitle").textContent = errorInfo.title;
            document.getElementById("errorTextureExplanation").textContent = errorInfo.description;
            document.getElementById("errorTextureSolution").innerHTML = createSolutionsList(errorInfo.solutions);
        }
        
        // Update model error section
        if (errorInfo.type === 'model') {
            document.getElementById("errorModelTitle").textContent = errorInfo.title;
            document.getElementById("errorModelExplanation").textContent = errorInfo.description;
            document.getElementById("errorModelSolution").innerHTML = createSolutionsList(errorInfo.solutions);
        }
        
        // Update OpenGL error section
        if (errorInfo.type === 'opengl') {
            document.getElementById("errorOpenGLTitle").textContent = errorInfo.title;
            document.getElementById("errorOpenGLExplanation").textContent = errorInfo.description;
            document.getElementById("errorOpenGLSolution").innerHTML = createSolutionsList(errorInfo.solutions);
        }
        
        // Update Python error section
        if (errorInfo.type === 'python') {
            document.getElementById("errorPythonTitle").textContent = errorInfo.title;
            document.getElementById("errorPythonExplanation").textContent = errorInfo.description;
            document.getElementById("errorPythonSolution").innerHTML = createSolutionsList(errorInfo.solutions);
        }
        
        // Update user-friendly explanation based on error info
        updateUserFriendlyExplanation(errorInfo);
    }
    
    function createSolutionsList(solutions) {
        if (!solutions || !Array.isArray(solutions) || solutions.length === 0) {
            return "<strong>No specific solutions available.</strong>";
        }
        
        return `
            <strong>Technical solutions:</strong>
            <ul>
                ${solutions.map(solution => `<li>${solution}</li>`).join('')}
            </ul>
        `;
    }

    function updateUserFriendlyExplanation(errorInfo) {
        let title = "Model Cannot Be Displayed";
        let explanation = "J3DView couldn't display your model because of an unidentified issue.";
        let solutions = ["Check if your model is in the correct format for SMG (J3D/BMD/BDL)", "Try a different model to check if J3DView is working correctly"];
        
        if (errorInfo && errorInfo.id) {
            title = errorInfo.title || title;
            explanation = errorInfo.description || explanation;
            solutions = errorInfo.solutions || solutions;
        } else {
            // Generic explanations if no specific error was identified
            if (errorInfo.type === 'texture') {
                title = "Texture Mapping Problem";
                explanation = "J3DView couldn't display your model because of a problem with how textures are mapped onto it. This is common with SMG models that use special texture effects.";
                solutions = [
                    "Check if your model has the correct texture files",
                    "Try opening your model in BrawlBox to see if it displays correctly there",
                    "If you created this model, review the texture settings in your 3D software"
                ];
            } else if (errorInfo.type === 'model') {
                title = "Model Structure Problem";
                explanation = "J3DView couldn't load your model because there's an issue with its structure. This might be due to incompatible export settings or a damaged model file.";
                solutions = [
                    "Verify that your model was exported with the correct settings for SMG",
                    "Check if the model file is corrupted or incomplete",
                    "Try using a different tool to convert your model to J3D format"
                ];
            } else if (errorInfo.type === 'opengl') {
                title = "Graphics Rendering Problem";
                explanation = "J3DView encountered a problem with your graphics card when trying to display the model. This might be due to driver issues or hardware limitations.";
                solutions = [
                    "Update your graphics drivers to the latest version",
                    "Close other graphics-intensive applications",
                    "Check if your GPU meets the minimum requirements for J3DView"
                ];
            } else if (errorInfo.type === 'python') {
                title = "Python Runtime Error";
                explanation = "J3DView encountered an error in the Python environment. This could be due to missing dependencies or an incorrect installation.";
                solutions = [
                    "Make sure all required Python modules are installed",
                    "Verify you're using Python 3.7 or newer",
                    "Try reinstalling J3DView following the official guide"
                ];
            }
        }
        
        document.getElementById("userTitle").textContent = title;
        document.getElementById("userExplanation").textContent = explanation;
        
        const solutionsList = solutions.map(solution => `<li>${solution}</li>`).join('');
        document.getElementById("userSolution").innerHTML = `
            <strong>Try these solutions:</strong>
            <ul>${solutionsList}</ul>
        `;
    }

    function createDetailedAnalysis(content, errorInfo) {
        // Extract the error message
        let errorMessage = "No specific error message found";
        if (errorInfo.message) {
            errorMessage = errorInfo.message;
        } else {
            const errorMatch = content.match(/error:.*$/mi);
            if (errorMatch) errorMessage = errorMatch[0].trim();
        }
        
        // Extract stack trace if present
        let stackTrace = "";
        const stackMatch = content.match(/at\s+[\w\.$]+\s*\([\w\/\.:]+\)/gmi);
        if (stackMatch) {
            stackTrace = `<div class="stack-trace">${stackMatch.join('<br>')}</div>`;
        }
        
        // Determine frequency/commonness
        let frequencyInfo = "";
        if (errorInfo.frequency) {
            let frequencyClass = "freq-medium";
            if (errorInfo.frequency === "high") frequencyClass = "freq-high";
            if (errorInfo.frequency === "low") frequencyClass = "freq-low";
            
            frequencyInfo = `
                <div class="info-item">
                    <span class="info-label">Frequency:</span>
                    <span class="${frequencyClass}">${errorInfo.frequency.toUpperCase()}</span>
                    <span class="freq-info">How often this error occurs among J3DView users</span>
                </div>
            `;
        }
        
        return `
            <div class="info-item">
                <span class="info-label">Error Type:</span>
                <span>${errorInfo.type ? errorInfo.type.toUpperCase() + " ERROR" : "Unknown Error Type"}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Error Message:</span>
                <span>${errorMessage}</span>
            </div>
            ${frequencyInfo}
            <div class="info-item">
                <span class="info-label">Error ID:</span>
                <span>${errorInfo.id || "unidentified_error"}</span>
            </div>
            ${stackTrace ? `
            <div class="info-item">
                <span class="info-label">Call Stack:</span>
                <span>The following function calls were involved:</span>
                ${stackTrace}
            </div>
            ` : ''}
        `;
    }
});