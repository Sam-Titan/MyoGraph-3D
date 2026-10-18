import { Color, type MeshPhysicalMaterial, Vector3 } from 'three'
import type { SupplyUniforms } from './rigs'

/** Strongest tint of the supply region (the surface keeps some of its own colour and shading). */
export const SUPPLY_MAX = 0.7

export function makeSupplyUniforms(): SupplyUniforms {
  return { mask: { value: new Vector3() }, color: { value: new Color() }, strength: { value: 0 } }
}

/**
 * Tints the heart surface with the selected vessel's risk colour, weighted by that vessel's
 * `territory` channel (vec3 vertex attribute baked into the GLB: nearest-artery weights).
 * Approximate illustration of the area an artery supplies, never a clinical map. A mesh without
 * the attribute reads zeros, i.e. no tint.
 */
export function injectSupply(material: MeshPhysicalMaterial, u: SupplyUniforms): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTerrMask = u.mask
    shader.uniforms.uTerrColor = u.color
    shader.uniforms.uTerrStrength = u.strength
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec3 territory;\nvarying vec3 vTerritory;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTerritory = territory;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vTerritory;\nuniform vec3 uTerrMask;\nuniform vec3 uTerrColor;\nuniform float uTerrStrength;',
      )
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uTerrColor, clamp(dot(vTerritory, uTerrMask), 0.0, 1.0) * uTerrStrength);',
      )
  }
  material.customProgramCacheKey = () => 'heart-supply'
}
