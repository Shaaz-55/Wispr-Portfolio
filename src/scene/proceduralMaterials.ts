import { DataTexture, MeshStandardMaterial, RepeatWrapping, RGBAFormat } from 'three'
import { seededRandom } from './choreography'

export function makeCharacterMaterials() {
  const size = 256, random = seededRandom(91823)
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const grain = random() * 28 + Math.sin(x * 0.9 + Math.sin(y * 0.03)) * 9
    const scratch = (x * 19 + y * 3) % 137 < 2 ? 25 : 0
    const n = Math.round(175 + grain + scratch)
    const i = (y * size + x) * 4
    data.set([n, n, n, 255], i)
  }
  const texture = new DataTexture(data, size, size, RGBAFormat)
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.repeat.set(3, 3)
  texture.needsUpdate = true
  const metal = (color: string, roughness = 0.56) => new MeshStandardMaterial({ color, metalness: 0.8, roughness, bumpMap: texture, bumpScale: 0.0035, roughnessMap: texture })
  const materials = {
    armor: metal('#45494a'),
    edge: metal('#777366', 0.48),
    bronze: metal('#75604a', 0.5),
    dark: new MeshStandardMaterial({ color: '#1c1c19', roughness: 0.92, bumpMap: texture, bumpScale: 0.025 }),
    leather: new MeshStandardMaterial({ color: '#352724', roughness: 0.86, bumpMap: texture, bumpScale: 0.015 }),
    cloth: new MeshStandardMaterial({ color: '#571d19', roughness: 1, bumpMap: texture, bumpScale: 0.012, side: 2 }),
    rope: new MeshStandardMaterial({ color: '#746250', roughness: 0.98, bumpMap: texture, bumpScale: 0.02 }),
    straw: new MeshStandardMaterial({ color: '#90836a', roughness: 0.9, bumpMap: texture, bumpScale: 0.035 }),
    strawRib: new MeshStandardMaterial({ color: '#544836', roughness: 0.92 }),
    skin: new MeshStandardMaterial({ color: '#49362b', roughness: 0.92, bumpMap: texture, bumpScale: 0.009 }),
    hair: new MeshStandardMaterial({ color: '#181713', roughness: 1 }),
    ember: new MeshStandardMaterial({ color: '#ec651c', emissive: '#ff5710', emissiveIntensity: 3.4, toneMapped: false }),
  }
  return { materials, dispose: () => { Object.values(materials).forEach(material => material.dispose()); texture.dispose() } }
}
