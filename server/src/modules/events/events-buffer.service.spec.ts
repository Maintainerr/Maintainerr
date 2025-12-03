import { RawBodyRequest } from '@nestjs/common';
import { IncomingMessage } from 'http';
import { EventsBufferService } from './events-buffer.service';

const getPrivateStatic = (key: string) =>
  (EventsBufferService as unknown as Record<string, number>)[key];

const buildRequest = (
  headers: Record<string, string | string[]> = {},
): RawBodyRequest<IncomingMessage> =>
  ({ headers }) as unknown as RawBodyRequest<IncomingMessage>;

describe('EventsBufferService', () => {
  let service: EventsBufferService;

  beforeEach(() => {
    service = new EventsBufferService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('parseLastEventId', () => {
    it('returns undefined when header is missing', () => {
      expect(service.parseLastEventId(buildRequest())).toBeUndefined();
    });

    it('parses numeric header values', () => {
      expect(
        service.parseLastEventId(buildRequest({ 'last-event-id': '42' })),
      ).toBe(42);
    });

    it('uses the last entry when header is an array', () => {
      expect(
        service.parseLastEventId(
          buildRequest({ 'last-event-id': ['10', '12'] }),
        ),
      ).toBe(12);
    });

    it('returns undefined for non-numeric input', () => {
      expect(
        service.parseLastEventId(buildRequest({ 'last-event-id': 'abc' })),
      ).toBeUndefined();
    });
  });

  describe('buffering', () => {
    it('assigns incrementing ids when buffering events', () => {
      const first = service.buildBufferedEvent({
        type: 'foo',
        data: { id: 1 },
      });
      const second = service.buildBufferedEvent({
        type: 'bar',
        data: { id: 2 },
      });

      expect(first.id).toBe('1');
      expect(second.id).toBe('2');
    });

    it('returns buffered events newer than the given id', () => {
      const first = service.buildBufferedEvent({
        type: 'foo',
        data: { id: 1 },
      });
      const second = service.buildBufferedEvent({
        type: 'bar',
        data: { id: 2 },
      });
      const third = service.buildBufferedEvent({
        type: 'baz',
        data: { id: 3 },
      });

      expect(service.getEventsAfter(undefined)).toHaveLength(0);
      expect(service.getEventsAfter(Number(first.id))).toEqual([second, third]);
      expect(service.getEventsAfter(Number(third.id))).toHaveLength(0);
    });

    it('drops events that exceed the TTL window', () => {
      const ttl = getPrivateStatic('EVENT_BUFFER_TTL_MS');
      const nowSpy = jest.spyOn(Date, 'now');

      nowSpy.mockReturnValue(0);
      service.buildBufferedEvent({ type: 'foo', data: { id: 1 } });

      nowSpy.mockReturnValue(ttl + 1);
      expect(service.getEventsAfter(0)).toHaveLength(0);
    });

    it('enforces the maximum buffer size', () => {
      const maxSize = getPrivateStatic('EVENT_BUFFER_MAX_SIZE');

      for (let i = 0; i < maxSize + 5; i += 1) {
        service.buildBufferedEvent({ type: 'foo', data: { id: i } });
      }

      const events = service.getEventsAfter(0);
      expect(events).toHaveLength(maxSize);
      expect(events[0].id).toBe(String(6));
      expect(events[events.length - 1].id).toBe(String(maxSize + 5));
    });
  });
});
