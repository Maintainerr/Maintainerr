import {
  type OverlayElement,
  type OverlayTemplate,
  type OverlayTemplateCreate,
  type OverlayTemplateExport,
  type OverlayTemplateMode,
  type OverlayTemplateUpdate,
  overlayTemplateCreateSchema,
  overlayTemplateExportSchema,
  overlayTemplateUpdateSchema,
  PRESET_TEMPLATES,
} from '@maintainerr/contracts';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaintainerrLogger } from '../logging/logs.service';
import { OverlayTemplateEntity } from './entities/overlay-template.entities';

@Injectable()
export class OverlayTemplateService implements OnModuleInit {
  constructor(
    @InjectRepository(OverlayTemplateEntity)
    private readonly repo: Repository<OverlayTemplateEntity>,
    private readonly logger: MaintainerrLogger,
  ) {
    this.logger.setContext(OverlayTemplateService.name);
  }

  async onModuleInit(): Promise<void> {
    await this.seedPresets();
  }

  // ── Preset seeding ──────────────────────────────────────────────────────

  async seedPresets(): Promise<void> {
    const count = await this.repo.count();
    if (count > 0) return; // Only seed into an empty table

    this.logger.log('Seeding preset overlay templates...');

    for (const preset of PRESET_TEMPLATES) {
      const entity = this.repo.create({
        name: preset.name,
        description: preset.description,
        mode: preset.mode,
        canvasWidth: preset.canvasWidth,
        canvasHeight: preset.canvasHeight,
        elements: preset.elements,
        isPreset: true,
        isDefault: false,
      });
      await this.repo.save(entity);
    }

    // Make the first poster preset the default poster template
    const firstPoster = await this.repo.findOne({
      where: { mode: 'poster', isPreset: true },
      order: { id: 'ASC' },
    });
    if (firstPoster) {
      firstPoster.isDefault = true;
      await this.repo.save(firstPoster);
    }

    // Make the first titlecard preset the default titlecard template
    const firstTitlecard = await this.repo.findOne({
      where: { mode: 'titlecard', isPreset: true },
      order: { id: 'ASC' },
    });
    if (firstTitlecard) {
      firstTitlecard.isDefault = true;
      await this.repo.save(firstTitlecard);
    }

    this.logger.log(`Seeded ${PRESET_TEMPLATES.length} preset templates`);
  }

  // ── CRUD ────────────────────────────────────────────────────────────────

  async findAll(): Promise<OverlayTemplate[]> {
    const entities = await this.repo.find({ order: { id: 'ASC' } });
    return entities.map((e) => this.toDto(e));
  }

  async findById(id: number): Promise<OverlayTemplate | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? this.toDto(entity) : null;
  }

  async findDefault(
    mode: OverlayTemplateMode,
  ): Promise<OverlayTemplate | null> {
    const entity = await this.repo.findOne({
      where: { mode, isDefault: true },
    });
    return entity ? this.toDto(entity) : null;
  }

  /**
   * Resolve the template for a collection.
   * Priority: collection.overlayTemplateId → default for mode → null
   */
  async resolveForCollection(
    overlayTemplateId: number | null,
    mode: OverlayTemplateMode,
  ): Promise<OverlayTemplate | null> {
    if (overlayTemplateId) {
      const specific = await this.findById(overlayTemplateId);
      if (specific) return specific;
    }
    return this.findDefault(mode);
  }

  async create(dto: OverlayTemplateCreate): Promise<OverlayTemplate> {
    const parsed = overlayTemplateCreateSchema.parse(dto);

    // If this is being set as default, unset other defaults for the same mode
    if (parsed.isDefault) {
      await this.unsetDefaults(parsed.mode);
    }

    const entity = this.repo.create({
      ...parsed,
      isPreset: false,
    });
    const saved = await this.repo.save(entity);
    this.logger.log(`Created template "${saved.name}" (id=${saved.id})`);
    return this.toDto(saved);
  }

  async update(
    id: number,
    dto: OverlayTemplateUpdate,
  ): Promise<OverlayTemplate | null> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) return null;

    if (entity.isPreset) {
      // Presets cannot be directly edited
      this.logger.warn(`Attempted to edit preset template id=${id}`);
      return null;
    }

    const parsed = overlayTemplateUpdateSchema.parse(dto);

    // If setting as default, unset others in the same mode
    if (parsed.isDefault) {
      const mode = parsed.mode ?? entity.mode;
      await this.unsetDefaults(mode);
    }

    Object.assign(entity, parsed);
    const saved = await this.repo.save(entity);
    this.logger.log(`Updated template "${saved.name}" (id=${saved.id})`);
    return this.toDto(saved);
  }

  async remove(id: number): Promise<boolean> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) return false;

    if (entity.isPreset) {
      this.logger.warn(`Attempted to delete preset template id=${id}`);
      return false;
    }

    await this.repo.remove(entity);
    this.logger.log(`Deleted template "${entity.name}" (id=${id})`);
    return true;
  }

  async duplicate(id: number): Promise<OverlayTemplate | null> {
    const source = await this.repo.findOne({ where: { id } });
    if (!source) return null;

    const clone = this.repo.create({
      name: `${source.name} (copy)`,
      description: source.description,
      mode: source.mode,
      canvasWidth: source.canvasWidth,
      canvasHeight: source.canvasHeight,
      elements: structuredClone(source.elements),
      isDefault: false,
      isPreset: false,
    });

    const saved = await this.repo.save(clone);
    this.logger.log(
      `Duplicated template "${source.name}" → "${saved.name}" (id=${saved.id})`,
    );
    return this.toDto(saved);
  }

  async setDefault(id: number): Promise<OverlayTemplate | null> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) return null;

    await this.unsetDefaults(entity.mode);
    entity.isDefault = true;
    const saved = await this.repo.save(entity);
    this.logger.log(
      `Set template "${saved.name}" as default for ${saved.mode}`,
    );
    return this.toDto(saved);
  }

  // ── Import / Export ─────────────────────────────────────────────────────

  exportTemplate(template: OverlayTemplate): OverlayTemplateExport {
    return {
      version: 1,
      name: template.name,
      mode: template.mode,
      canvasWidth: template.canvasWidth,
      canvasHeight: template.canvasHeight,
      elements: template.elements,
    };
  }

  async importTemplate(data: unknown): Promise<OverlayTemplate> {
    const parsed = overlayTemplateExportSchema.parse(data);

    const entity = this.repo.create({
      name: parsed.name,
      description: '',
      mode: parsed.mode,
      canvasWidth: parsed.canvasWidth,
      canvasHeight: parsed.canvasHeight,
      elements: parsed.elements,
      isDefault: false,
      isPreset: false,
    });

    const saved = await this.repo.save(entity);
    this.logger.log(`Imported template "${saved.name}" (id=${saved.id})`);
    return this.toDto(saved);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private async unsetDefaults(mode: OverlayTemplateMode): Promise<void> {
    await this.repo.update({ mode, isDefault: true }, { isDefault: false });
  }

  private toDto(entity: OverlayTemplateEntity): OverlayTemplate {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      mode: entity.mode as OverlayTemplateMode,
      canvasWidth: entity.canvasWidth,
      canvasHeight: entity.canvasHeight,
      elements: entity.elements as OverlayElement[],
      isDefault: entity.isDefault,
      isPreset: entity.isPreset,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
