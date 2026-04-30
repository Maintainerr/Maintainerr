import { FindOperator } from 'typeorm';
import { createMockLogger } from '../../../test/utils/data';
import { OverlayTemplateService } from './overlay-template.service';

describe('OverlayTemplateService', () => {
  it('prunes duplicate default templates on startup, keeping the most recently updated', async () => {
    type Row = {
      id: number;
      name: string;
      mode: 'poster' | 'titlecard';
      isDefault: boolean;
      updatedAt: Date;
    };

    const rows: Row[] = [
      {
        id: 9,
        name: 'Custom default',
        mode: 'poster',
        isDefault: true,
        updatedAt: new Date('2026-04-16T12:00:00.000Z'),
      },
      {
        id: 1,
        name: 'Poster preset',
        mode: 'poster',
        isDefault: true,
        updatedAt: new Date('2026-04-15T12:00:00.000Z'),
      },
    ];

    const repo = {
      find: jest.fn().mockImplementation(async ({ where }) =>
        rows
          .filter(
            (row) =>
              row.mode === where.mode && row.isDefault === where.isDefault,
          )
          .sort((a, b) => {
            const updatedAtDelta =
              b.updatedAt.getTime() - a.updatedAt.getTime();
            if (updatedAtDelta !== 0) {
              return updatedAtDelta;
            }

            return b.id - a.id;
          }),
      ),
      update: jest
        .fn()
        .mockImplementation(async (criteria, partial: Partial<Row>) => {
          const idCriteria = criteria.id;
          const matches = (row: Row) =>
            idCriteria instanceof FindOperator
              ? (idCriteria.value as number[]).includes(row.id)
              : row.id === idCriteria;
          for (const row of rows) {
            if (matches(row)) Object.assign(row, partial);
          }
        }),
      findOne: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(1),
      remove: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };

    const service = new OverlayTemplateService(repo as any, createMockLogger());

    await service.onModuleInit();

    const posterDefaults = rows.filter(
      (row) => row.mode === 'poster' && row.isDefault,
    );
    expect(posterDefaults).toHaveLength(1);
    expect(posterDefaults[0].id).toBe(9);
  });

  it('assigns a fallback default when deleting the current default template', async () => {
    const repo = {
      findOne: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockImplementation(async (entity) => entity),
      update: jest.fn(),
      create: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
    };

    repo.findOne
      .mockResolvedValueOnce({
        id: 7,
        name: 'Custom default',
        mode: 'poster',
        isPreset: false,
        isDefault: true,
      })
      .mockResolvedValueOnce({
        id: 1,
        name: 'Poster preset',
        mode: 'poster',
        isPreset: true,
        isDefault: false,
      });

    const service = new OverlayTemplateService(repo as any, createMockLogger());

    await expect(service.remove(7)).resolves.toBe(true);
    expect(repo.remove).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7 }),
    );
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, isDefault: true }),
    );
  });

  it('promotes a fallback default when no default exists for the mode', async () => {
    const repo = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 3,
          name: 'Poster preset',
          description: 'preset',
          mode: 'poster',
          canvasWidth: 1000,
          canvasHeight: 1500,
          elements: [],
          isPreset: true,
          isDefault: false,
          createdAt: new Date('2026-04-17T10:00:00.000Z'),
          updatedAt: new Date('2026-04-17T10:00:00.000Z'),
        }),
      save: jest.fn().mockImplementation(async (entity) => entity),
      find: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    };

    const service = new OverlayTemplateService(repo as any, createMockLogger());

    const result = await service.findDefault('poster');

    expect(repo.findOne).toHaveBeenNthCalledWith(1, {
      where: { mode: 'poster', isDefault: true },
      order: { updatedAt: 'DESC', id: 'DESC' },
    });
    expect(repo.findOne).toHaveBeenNthCalledWith(2, {
      where: { mode: 'poster' },
      order: { isPreset: 'DESC', id: 'ASC' },
    });
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 3, isDefault: true }),
    );
    expect(result).toEqual(
      expect.objectContaining({ id: 3, isDefault: true, mode: 'poster' }),
    );
  });

  it('returns the requested template when its mode matches the collection mode', async () => {
    const repo = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce({
          id: 7,
          name: 'Poster template',
          description: 'poster',
          mode: 'poster',
          canvasWidth: 1000,
          canvasHeight: 1500,
          elements: [],
          isPreset: false,
          isDefault: false,
          createdAt: new Date('2026-04-17T10:00:00.000Z'),
          updatedAt: new Date('2026-04-17T10:00:00.000Z'),
        }),
      save: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    };

    const service = new OverlayTemplateService(repo as any, createMockLogger());

    await expect(service.resolveForCollection(7, 'poster')).resolves.toEqual(
      expect.objectContaining({ id: 7, mode: 'poster' }),
    );
    expect(repo.findOne).toHaveBeenCalledTimes(1);
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 7 } });
  });

  it('falls back to the default template when the requested template mode does not match', async () => {
    const repo = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce({
          id: 8,
          name: 'Episode title card',
          description: 'titlecard',
          mode: 'titlecard',
          canvasWidth: 1920,
          canvasHeight: 1080,
          elements: [],
          isPreset: false,
          isDefault: false,
          createdAt: new Date('2026-04-17T10:00:00.000Z'),
          updatedAt: new Date('2026-04-17T10:00:00.000Z'),
        })
        .mockResolvedValueOnce({
          id: 1,
          name: 'Default poster',
          description: 'default',
          mode: 'poster',
          canvasWidth: 1000,
          canvasHeight: 1500,
          elements: [],
          isPreset: true,
          isDefault: true,
          createdAt: new Date('2026-04-17T10:00:00.000Z'),
          updatedAt: new Date('2026-04-17T10:00:00.000Z'),
        }),
      save: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    };

    const service = new OverlayTemplateService(repo as any, createMockLogger());

    await expect(service.resolveForCollection(8, 'poster')).resolves.toEqual(
      expect.objectContaining({ id: 1, mode: 'poster', isDefault: true }),
    );
    expect(repo.findOne).toHaveBeenNthCalledWith(1, { where: { id: 8 } });
    expect(repo.findOne).toHaveBeenNthCalledWith(2, {
      where: { mode: 'poster', isDefault: true },
      order: { updatedAt: 'DESC', id: 'DESC' },
    });
  });

  it('preserves isDefault flag when updating a template without explicitly changing it', async () => {
    const entity = {
      id: 5,
      name: 'Custom Default',
      description: 'Original description',
      mode: 'poster',
      canvasWidth: 1000,
      canvasHeight: 1500,
      elements: [],
      isDefault: true,
      isPreset: false,
      createdAt: new Date('2026-04-17T10:00:00.000Z'),
      updatedAt: new Date('2026-04-17T10:00:00.000Z'),
    };

    const repo = {
      findOne: jest.fn().mockResolvedValue(entity),
      save: jest.fn().mockImplementation(async (e) => e),
      find: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    };

    const service = new OverlayTemplateService(repo as any, createMockLogger());

    // Update only the description, without touching isDefault
    const result = await service.update(5, {
      description: 'Updated description',
    });

    // Verify isDefault was preserved as true
    expect(result).toEqual(
      expect.objectContaining({
        id: 5,
        description: 'Updated description',
        isDefault: true,
        name: 'Custom Default',
      }),
    );
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 5,
        isDefault: true,
        description: 'Updated description',
      }),
    );
  });

  it('respects explicit isDefault changes when updating a template', async () => {
    const entity = {
      id: 6,
      name: 'Another Template',
      description: 'Original description',
      mode: 'poster',
      canvasWidth: 1000,
      canvasHeight: 1500,
      elements: [],
      isDefault: false,
      isPreset: false,
      createdAt: new Date('2026-04-17T10:00:00.000Z'),
      updatedAt: new Date('2026-04-17T10:00:00.000Z'),
    };

    const repo = {
      findOne: jest.fn().mockResolvedValue(entity),
      save: jest.fn().mockImplementation(async (e) => e),
      update: jest.fn(),
      find: jest.fn(),
      remove: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    };

    const service = new OverlayTemplateService(repo as any, createMockLogger());

    // Update and explicitly set isDefault to true
    const result = await service.update(6, {
      description: 'Updated',
      isDefault: true,
    });

    // Verify unsetDefaults was called to clear other defaults
    expect(repo.update).toHaveBeenCalledWith(
      { mode: 'poster', isDefault: true },
      { isDefault: false },
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: 6,
        description: 'Updated',
        isDefault: true,
      }),
    );
  });
});
