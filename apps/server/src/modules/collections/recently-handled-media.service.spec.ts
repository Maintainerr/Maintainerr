import { RecentlyHandledMediaService } from './recently-handled-media.service';

describe('RecentlyHandledMediaService', () => {
  let service: RecentlyHandledMediaService;

  beforeEach(() => {
    service = new RecentlyHandledMediaService();
  });

  it('reports unknown ids as not recently handled', () => {
    expect(service.wasRecentlyHandled(1, 'm1')).toBe(false);
  });

  it('records each handled item', () => {
    service.markHandled(1, 'm1');
    service.markHandled(1, 'm2');

    expect(service.wasRecentlyHandled(1, 'm1')).toBe(true);
    expect(service.wasRecentlyHandled(1, 'm2')).toBe(true);
    expect(service.wasRecentlyHandled(1, 'm3')).toBe(false);
  });

  it('keeps separate sets per collection', () => {
    service.markHandled(1, 'm1');
    service.markHandled(2, 'm2');

    expect(service.wasRecentlyHandled(1, 'm1')).toBe(true);
    expect(service.wasRecentlyHandled(1, 'm2')).toBe(false);
    expect(service.wasRecentlyHandled(2, 'm1')).toBe(false);
    expect(service.wasRecentlyHandled(2, 'm2')).toBe(true);
  });

  it('clears a collection on demand without affecting others', () => {
    service.markHandled(1, 'm1');
    service.markHandled(2, 'm2');

    service.clearForCollection(1);

    expect(service.wasRecentlyHandled(1, 'm1')).toBe(false);
    expect(service.wasRecentlyHandled(2, 'm2')).toBe(true);
  });

  it('clears the collection when the Collection_Deleted event fires', () => {
    service.markHandled(1, 'm1');
    service.markHandled(2, 'm2');

    (
      service as unknown as {
        onCollectionDeleted: (payload: { collection: { id: number } }) => void;
      }
    ).onCollectionDeleted({ collection: { id: 1 } });

    expect(service.wasRecentlyHandled(1, 'm1')).toBe(false);
    expect(service.wasRecentlyHandled(2, 'm2')).toBe(true);
  });
});
