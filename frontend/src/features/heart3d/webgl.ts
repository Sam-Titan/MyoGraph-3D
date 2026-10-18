/** WebGL support, and whether the context is a CPU rasteriser (SwiftShader, llvmpipe, ...), i.e. "no GPU". */
function probeWebgl(): { available: boolean; software: boolean } {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') ?? c.getContext('webgl')
    if (!gl) return { available: false, software: false }
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
    return { available: true, software: /swiftshader|llvmpipe|softpipe|software/i.test(renderer) }
  } catch {
    return { available: false, software: false }
  }
}
export const PROBE = probeWebgl()
/** CPU rendering: multisampling is the single biggest cost there, so the scene skips it (outlines define edges). */
export const SOFTWARE_GL = PROBE.software
