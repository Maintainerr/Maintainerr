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
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
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
      .mockResolvedValueOnce(null)
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
});
