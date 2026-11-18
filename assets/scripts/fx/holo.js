const VERTEX_SOURCE = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SOURCE = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec2 u_pointer;
uniform float u_time;
varying vec2 v_uv;

float hash(vec2 point) {
    return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
    vec4 base = texture2D(u_texture, v_uv);
    if (base.a < 0.01) discard;

    float distanceToLight = distance(v_uv, u_pointer);
    float light = smoothstep(0.68, 0.0, distanceToLight);
    float sweep = sin((v_uv.x * 0.82 + v_uv.y * 1.18 + u_time * 0.035) * 18.0);
    float grain = hash(floor(v_uv * 240.0) + floor(u_time * 2.0)) - 0.5;
    vec3 spectrum = 0.5 + 0.5 * cos(
        6.2831853 * (v_uv.x * 0.72 + v_uv.y * 0.48 + u_time * 0.018)
        + vec3(0.0, 2.0943951, 4.1887902)
    );
    vec3 foil = spectrum * (0.035 + light * 0.19) * (0.68 + sweep * 0.32);
    vec3 chroma = vec3(
        light * 0.035 * (0.5 + spectrum.r),
        light * 0.025 * (0.5 + spectrum.g),
        light * 0.045 * (0.5 + spectrum.b)
    );
    vec3 color = base.rgb + foil + chroma + grain * (0.018 + light * 0.035);
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), base.a);
}
`;

function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    gl.deleteShader(shader);
    return null;
}

function createProgram(gl) {
    const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
    if (!vertex || !fragment) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
    gl.deleteProgram(program);
    return null;
}

function copySurfaceStyle(source, overlay) {
    const style = getComputedStyle(source);
    const bounds = source.getBoundingClientRect();
    overlay.style.position = 'fixed';
    overlay.style.top = `${bounds.top}px`;
    overlay.style.left = `${bounds.left}px`;
    overlay.style.width = `${bounds.width}px`;
    overlay.style.height = `${bounds.height}px`;
    overlay.style.margin = '0';
    overlay.style.transform = 'none';
    overlay.style.visibility = style.visibility;
    overlay.style.opacity = style.opacity;
    overlay.style.zIndex = String(parseInt(style.zIndex, 10) || 0);
}

export function createHoloSurface(source, pointer) {
    const overlay = document.createElement('canvas');
    overlay.className = 'pixel-holo';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.pointerEvents = 'none';
    source.after(overlay);

    const gl = overlay.getContext('webgl', {
        alpha: true,
        antialias: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
    });
    if (!gl) {
        overlay.remove();
        return null;
    }

    const program = createProgram(gl);
    if (!program) {
        overlay.remove();
        return null;
    }

    const position = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, position);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

    const positionLocation = gl.getAttribLocation(program, 'a_position');
    const pointerLocation = gl.getUniformLocation(program, 'u_pointer');
    const timeLocation = gl.getUniformLocation(program, 'u_time');
    let frame = 0;
    let lastStyleSync = -1;
    let lastSize = '';

    function render(now) {
        if (!source.isConnected) {
            cancelAnimationFrame(frame);
            overlay.remove();
            return;
        }
        const styleBeat = Math.floor(now / 120);
        if (styleBeat !== lastStyleSync) {
            lastStyleSync = styleBeat;
            copySurfaceStyle(source, overlay);
        }
        const size = `${source.width}x${source.height}`;
        if (size !== lastSize) {
            lastSize = size;
            overlay.width = source.width;
            overlay.height = source.height;
            gl.viewport(0, 0, overlay.width, overlay.height);
        }
        if (overlay.width && overlay.height) {
            const bounds = source.getBoundingClientRect();
            const pointerX = bounds.width ? (pointer.x - bounds.left) / bounds.width : 0.5;
            const pointerY = bounds.height ? 1 - (pointer.y - bounds.top) / bounds.height : 0.5;
            gl.useProgram(program);
            gl.bindBuffer(gl.ARRAY_BUFFER, position);
            gl.enableVertexAttribArray(positionLocation);
            gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
            gl.uniform2f(pointerLocation, pointerX, pointerY);
            gl.uniform1f(timeLocation, now / 1000);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        frame = requestAnimationFrame(render);
    }

    frame = requestAnimationFrame(render);
    return { overlay };
}
