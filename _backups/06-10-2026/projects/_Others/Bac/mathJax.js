window.MathJax = {
    tex: {
        inlineMath: [['$', '$'], ['\\(', '\\)']],
        displayMath: [['$$', '$$'], ['\\[', '\\]']],
        packages: {'[+]': ['ams', 'base', 'color']},
        macros: {
            frac: ["\\dfrac{#1}{#2}", 2],
            vec: ["\\overrightarrow{#1}", 1],
            R: "\\mathbb{R}",
            N: "\\mathbb{N}",
            Z: "\\mathbb{Z}",
            Q: "\\mathbb{Q}",
            C: "\\mathbb{C}"
        },
        tags: 'none',
        processEscapes: true,
        processEnvironments: true,
        formatError: (jax, err) => {
            console.warn('[MathJax] Erreur LaTeX ignorée:', err);
            jax.math = '\\text{[formule]}';
            return jax;
        }
    },
    svg: {
        fontCache: 'global',
        displayAlign: 'left',
        displayIndent: '0em'
    },
    chtml: {
        displayAlign: 'left',
        displayIndent: '0em'
    },
    options: {
        ignoreHtmlClass: 'tex2jax_ignore',
        processHtmlClass: 'tex2jax_process',
        renderActions: {
            forceInline: [200, function() {
                const displays = document.querySelectorAll('.MathJax_Display, .mjx-display');
                displays.forEach(function(element) {
                    element.style.display = 'inline';
                    element.style.textAlign = 'inherit';
                });
            }]
        }
    }
};
(function () {
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
    script.async = true;
    document.head.appendChild(script);
})();

function retypeMathJax() {
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise().then(function() {
            const displays = document.querySelectorAll('.MathJax_Display, .mjx-display');
            displays.forEach(function(element) {
                element.style.display = 'inline';
                element.style.textAlign = 'inherit';
                element.style.margin = '0';
                element.style.padding = '0 0.2em';
            });
        });
    }
}

window.retypeMathJax = retypeMathJax;

window.addEventListener('beforeprint', function() {
    document.querySelectorAll('.mjx-display').forEach(function(element) {
        element.style.display = 'inline';
    });
});

function cleanLatexErrors() {
    const errorElements = document.querySelectorAll('.mjx-merror, .MathJax_Error, [data-mjx-error]');
    errorElements.forEach(element => {
        if (element.textContent.includes('\\') || element.textContent.includes("'")) {
            element.style.color = 'inherit';
            element.style.backgroundColor = 'transparent';
            element.style.border = 'none';
            if (element.textContent.trim() === '\\' || element.textContent.trim() === "'") {
                element.textContent = '[formule]';
            }
        }
    });
    
    const redSpans = document.querySelectorAll('span[style*="color"][style*="red"], span[style*="color:#FF0000"], span[style*="color: red"]');    redSpans.forEach(span => {
        if (span.textContent.includes('\\') || span.textContent.includes("'") || span.textContent.includes('\u005C')) {
            span.style.color = 'inherit';
            span.style.backgroundColor = 'transparent';
            span.style.border = 'none';
            if (span.textContent.trim() === '\\' || span.textContent.trim() === "'") {
                span.textContent = '';
            }
        }
    });
    
    const errorChars = document.querySelectorAll('.mjx-char[style*="color: red"], .mjx-char[style*="color:#FF0000"]');
    errorChars.forEach(char => {
        char.style.color = 'inherit';
        char.style.backgroundColor = 'transparent';
    });
}

window.addEventListener('DOMContentLoaded', function() {
    const observer = new MutationObserver(function(mutations) {
        let mathJaxChanged = false;
        mutations.forEach(function(mutation) {
            if (mutation.addedNodes) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1 && (
                        node.classList.contains('MathJax') ||
                        node.classList.contains('mjx-container') ||
                        (node.querySelector && node.querySelector('.MathJax, .mjx-container'))
                    )) {
                        mathJaxChanged = true;
                    }
                });
            }
        });
        
        if (mathJaxChanged) {
            setTimeout(cleanLatexErrors, 100);
        }
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    setTimeout(cleanLatexErrors, 1000);
});

window.cleanLatexErrors = cleanLatexErrors;
