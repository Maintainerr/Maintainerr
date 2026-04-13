import { createMockLogger } from '../../../test/utils/data';
import { OverlayTemplateService } from './overlay-template.service';

describe('OverlayTemplateService', () => {
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
