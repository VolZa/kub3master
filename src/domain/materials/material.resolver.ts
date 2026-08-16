import { Material } from './material.model';
import { MaterialRepository } from './material.repository';
import { BuiltElement } from '../elements/built-element.model';
import { normalizeClassName } from '../../utils/normalize';

export class MaterialResolver {
  constructor(private materialRepo: MaterialRepository) {}

  resolve(built: BuiltElement): Material {
    switch (built.profileType) {
      case 'round':
        return this.resolveRebar(built);

      case 'plate':
        return this.resolvePlate(built);

      case 'angle':
        return this.resolveAngle(built);

      case 'pipe_round':
        return this.resolvePipeRound(built);

      default:
        throw new Error(
          `MaterialResolver: unsupported profileType ${built.profileType}`,
        );
    }
  }

  private resolveRebar(built: BuiltElement): Material {
    if (!built.diameter || !built.className) {
      throw new Error(`Invalid rebar specification: ${built.code}`);
    }

    const material = this.materialRepo.findBySpec({
      category: 'rebar',
      diameter: built.diameter,
      class: normalizeClassName(built.className),
    });

    if (!material) {
      throw new Error(`Material not found in 05_Materials for: ${built.code}`);
    }

    return material;
  }

  private resolvePlate(built: BuiltElement): Material {
    if (!built.width || !built.thickness) {
      throw new Error(`Invalid plate specification: ${built.code}`);
    }

    const material = this.materialRepo.findBySpec({
      category: 'steel',
      profileType: 'plate',
      width: built.width,
      thickness: built.thickness,
    });

    if (!material) {
      throw new Error(`Material not found in 05_Materials for: ${built.code}`);
    }

    return material;
  }

  private resolveAngle(built: BuiltElement): Material {
    if (!built.width || !built.height || !built.thickness) {
      throw new Error(`Invalid angle specification: ${built.code}`);
    }

    const material = this.materialRepo.findBySpec({
      category: 'steel',
      profileType: 'angle',
      width: built.width,
      height: built.height,
      thickness: built.thickness,
    });

    if (!material) {
      throw new Error(`Material not found in 05_Materials for: ${built.code}`);
    }

    return material;
  }

  private resolvePipeRound(built: BuiltElement): Material {
    if (!built.diameter || !built.thickness) {
      throw new Error(`Invalid pipe specification: ${built.code}`);
    }

    const material = this.materialRepo.findBySpec({
      category: 'steel',
      profileType: 'pipe_round',
      diameter: built.diameter,
      thickness: built.thickness,
    });

    if (!material) {
      throw new Error(`Material not found in 05_Materials for: ${built.code}`);
    }

    return material;
  }
}
